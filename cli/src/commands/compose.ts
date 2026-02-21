import { Command } from 'commander';
import { resolve, basename, join } from 'node:path';
import { access, mkdir, rm, stat, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ora from 'ora';
import chalk from 'chalk';
import { runScenario, type ScenarioFn } from '../runtime/instrumented-page.js';
import { extractNarrations, pregenerateNarrations, validateNarrationCount } from '../runtime/narration-preprocess.js';
import { ensureDependencies } from '../voiceover/voice-models.js';
import { renderDemoVideo } from '../composition/render.js';
import { loadConfig } from '../config/load-config.js';
import { expandedFrameCount } from '../composition/frame-resolve.js';

export const composeCommand = new Command('compose')
  .description('Record and compose final demo video')
  .argument('<scenario>', 'Path to demo scenario file')
  .option('--out <path>', 'Output path for final MP4')
  .option('--resolution <res>', 'Video resolution', '1280x720')
  .option('--no-voiceover', 'Disable voiceover')
  .option('--no-cursor', 'Disable cursor overlay')
  .option('--keep-temp', 'Keep temporary files')
  .action(async (scenario: string, opts) => {
    const config = await loadConfig();
    const scenarioPath = resolve(scenario);
    const [width, height] = opts.resolution.split('x').map(Number);

    if (!width || !height) {
      console.error(chalk.red('Invalid resolution format. Use WIDTHxHEIGHT (e.g., 1280x720)'));
      process.exit(1);
    }

    // Verify scenario file exists
    try {
      await access(scenarioPath);
    } catch {
      console.error(chalk.red(`Scenario file not found: ${scenarioPath}`));
      console.error(chalk.dim('Run "screenwright generate --test <path>" to create one.'));
      process.exit(1);
    }

    const outputDir = resolve(opts.out ? resolve(opts.out, '..') : './output');
    const outputPath = opts.out
      ? resolve(opts.out)
      : resolve(outputDir, `${basename(scenarioPath, '.ts')}.mp4`);

    await mkdir(outputDir, { recursive: true });

    // 1. Load scenario module
    let spinner = ora('Loading scenario').start();
    let scenarioFn: ScenarioFn;
    try {
      const mod = await import(pathToFileURL(scenarioPath).href);
      scenarioFn = mod.default;
      if (typeof scenarioFn !== 'function') {
        spinner.fail('Invalid scenario file');
        console.error(chalk.red('Scenario must export a default async function.'));
        console.error(chalk.dim('Example: export default async function scenario(sw) { ... }'));
        process.exit(1);
      }
      spinner.succeed('Scenario loaded');
    } catch (err: any) {
      spinner.fail('Failed to load scenario');
      console.error(chalk.red(err.message));
      if (err.message.includes('SyntaxError') || err.message.includes('Cannot find')) {
        console.error(chalk.dim('Make sure the scenario is valid TypeScript and has been compiled.'));
      }
      process.exit(1);
    }

    // 2. PREPROCESS: Extract narrations from scenario
    let pregenerated: { text: string; audioFile: string; durationMs: number }[] = [];
    if (opts.voiceover !== false) {
      spinner = ora('Extracting narrations').start();
      try {
        const texts = await extractNarrations(scenarioFn);
        spinner.succeed(`Found ${texts.length} narration segments`);

        if (texts.length > 0) {
          // Validate API key before starting TTS
          if (config.ttsProvider === 'openai' && !process.env.OPENAI_API_KEY) {
            console.error(chalk.red('OPENAI_API_KEY is required when ttsProvider is "openai".'));
            console.error(chalk.dim('Set it with: export OPENAI_API_KEY=sk-...'));
            process.exit(1);
          }

          // 3. TTS: Pre-generate all narration audio in parallel
          const tempNarrationDir = resolve(outputDir, '.narration-temp');
          await mkdir(tempNarrationDir, { recursive: true });

          spinner = ora(`Generating voiceover (${texts.length} segments via ${config.ttsProvider})`).start();
          try {
            const modelPath = config.ttsProvider === 'piper'
              ? (await ensureDependencies(config.piperVoice)).modelPath
              : undefined;
            pregenerated = await pregenerateNarrations(texts, {
              tempDir: tempNarrationDir,
              ttsProvider: config.ttsProvider,
              modelPath,
              openaiVoice: config.openaiVoice,
              openaiTtsInstructions: config.openaiTtsInstructions,
            });
            spinner.succeed(`Generated ${texts.length} voiceover segments`);
          } catch (err: any) {
            spinner.warn('Voiceover generation failed — continuing without audio');
            console.error(chalk.dim(err.message));
            pregenerated = [];
          }
        }
      } catch (err: any) {
        spinner.warn('Narration extraction failed — continuing without voiceover');
        console.error(chalk.dim(err.message));
      }
    }

    // 4. RECORD: Run scenario in Playwright with pre-generated narrations
    spinner = ora('Recording scenario').start();
    let timeline, tempDir: string;
    try {
      const result = await runScenario(scenarioFn, {
        scenarioFile: scenarioPath,
        testFile: scenarioPath,
        viewport: { width, height },
        pregenerated: pregenerated.length > 0 ? pregenerated : undefined,
        branding: config.branding,
      });
      timeline = result.timeline;
      tempDir = result.tempDir;

      // 5. VALIDATE: Assert narration count matches
      if (pregenerated.length > 0) {
        validateNarrationCount(pregenerated.length, result.narrationCount);
      }

      const frameCount = expandedFrameCount(timeline.metadata.frameManifest);
      spinner.succeed(`Recorded ${timeline.events.length} events, ${frameCount} frames`);
    } catch (err: any) {
      spinner.fail('Recording failed');
      console.error(chalk.red(err.message));
      if (err.message.includes('Executable doesn\'t exist') || err.message.includes('browserType.launch')) {
        console.error(chalk.dim('Run: npx playwright install chromium'));
      } else if (err.message.includes('net::ERR_CONNECTION_REFUSED')) {
        console.error(chalk.dim('Make sure your dev server is running.'));
      } else if (err.message.includes('Timeout') || err.message.includes('waiting for')) {
        console.error(chalk.dim('Check that selectors in the scenario match your app.'));
      }
      process.exit(1);
    }

    // Copy narration audio files into tempDir so Remotion can find them via staticFile()
    for (const n of pregenerated) {
      if (n.audioFile) {
        await copyFile(n.audioFile, join(tempDir, basename(n.audioFile)));
      }
    }

    // 6. COMPOSE: Render final video via Remotion
    spinner = ora('Composing final video').start();
    try {
      await renderDemoVideo({
        timeline,
        outputPath,
        publicDir: tempDir,
        branding: config.branding,
      });
      spinner.succeed('Video composed');
    } catch (err: any) {
      spinner.fail('Composition failed');
      if (err.message.includes('memory') || err.message.includes('OOM')) {
        console.error(chalk.red('Out of memory during rendering.'));
        console.error(chalk.dim('Try a lower resolution: --resolution 1280x720'));
      } else {
        console.error(chalk.red(err.message));
      }
      process.exit(1);
    }

    // 7. Cleanup
    if (!opts.keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    } else {
      console.log(chalk.dim(`Temp files kept at: ${tempDir}`));
    }

    // 8. Report
    const fileStats = await stat(outputPath);
    const sizeMB = (fileStats.size / (1024 * 1024)).toFixed(1);
    const totalFrames = expandedFrameCount(timeline.metadata.frameManifest);
    const durationSec = (totalFrames / 30).toFixed(0);
    const mins = Math.floor(Number(durationSec) / 60);
    const secs = Number(durationSec) % 60;

    console.log('');
    console.log(chalk.green(`  Demo video saved to: ${outputPath}`));
    console.log(chalk.dim(`  Duration: ${mins}:${String(secs).padStart(2, '0')}`));
    console.log(chalk.dim(`  Size: ${sizeMB} MB`));
    console.log(chalk.dim(`  Events: ${timeline.events.length}`));
  });
