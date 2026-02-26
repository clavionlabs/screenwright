import { Command } from 'commander';
import { resolve, basename, join } from 'node:path';
import { access, mkdir, rm, stat, copyFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { runScenario } from '../runtime/instrumented-page.js';
import { extractNarrations, generateFullNarration, validateNarrationCount } from '../runtime/narration-preprocess.js';
import { renderDemoVideo } from '../composition/render.js';
import { loadConfig } from '../config/load-config.js';
import { expandedFrameCount } from '../composition/frame-resolve.js';
import { createPipeline } from './progress.js';

/**
 * Find the next version number for a scenario's output directory.
 */
async function nextVersionDir(scenarioDir) {
    await mkdir(scenarioDir, { recursive: true });
    let maxVersion = 0;
    try {
        const entries = await readdir(scenarioDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const match = entry.name.match(/^v(\d+)$/);
                if (match) {
                    maxVersion = Math.max(maxVersion, parseInt(match[1]));
                }
            }
        }
    } catch { }
    return join(scenarioDir, `v${maxVersion + 1}`);
}

/**
 * Find the most recent version directory that contains audio files.
 */
async function findPreviousAudioDir(scenarioDir) {
    try {
        const entries = await readdir(scenarioDir, { withFileTypes: true });
        const versions = entries
            .filter(e => e.isDirectory() && /^v\d+$/.test(e.name))
            .map(e => ({ name: e.name, num: parseInt(e.name.slice(1)) }))
            .sort((a, b) => b.num - a.num);

        for (const ver of versions) {
            const audioDir = join(scenarioDir, ver.name, 'audio');
            try {
                await access(join(audioDir, 'narration-full.wav'));
                return audioDir;
            } catch { }
        }
    } catch { }
    return null;
}

export const composeCommand = new Command('compose')
    .description('Record and compose final demo video')
    .argument('<scenario>', 'Path to demo scenario file')
    .option('--out <path>', 'Output path for final MP4')
    .option('--resolution <res>', 'Video resolution', '1280x720')
    .option('--no-voiceover', 'Disable voiceover')
    .option('--no-cursor', 'Disable cursor overlay')
    .option('--reuse-audio [dir]', 'Reuse narration audio (from previous version or specified directory)')
    .action(async (scenario, opts) => {
    const config = await loadConfig();
    const scenarioPath = resolve(scenario);
    const resStr = opts.resolution === '1280x720' && config.resolution
        ? `${config.resolution.width}x${config.resolution.height}`
        : opts.resolution;
    const [width, height] = resStr.split('x').map(Number);
    if (!width || !height) {
        console.error(chalk.red('Invalid resolution format. Use WIDTHxHEIGHT (e.g., 1280x720)'));
        process.exit(1);
    }
    try {
        await access(scenarioPath);
    }
    catch {
        console.error(chalk.red(`Scenario file not found: ${scenarioPath}`));
        process.exit(1);
    }

    // Versioned output: output/<scenario-name>/v1/
    const outputRoot = resolve(opts.out ? resolve(opts.out, '..') : './output');
    const scenarioName = basename(scenarioPath, '.js').replace(/\.ts$/, '');
    const scenarioDir = join(outputRoot, scenarioName);
    const versionDir = await nextVersionDir(scenarioDir);
    const versionLabel = basename(versionDir);
    const audioDir = join(versionDir, 'audio');
    const recordDir = versionDir;
    const outputPath = opts.out ? resolve(opts.out) : join(versionDir, 'render.mp4');

    await mkdir(audioDir, { recursive: true });
    await mkdir(recordDir, { recursive: true });

    // Resolve --reuse-audio
    let reuseAudioDir = null;
    if (opts.reuseAudio === true) {
        reuseAudioDir = await findPreviousAudioDir(scenarioDir);
        if (!reuseAudioDir) {
            console.error(chalk.yellow('No previous audio found to reuse — will generate fresh audio.'));
        }
    } else if (typeof opts.reuseAudio === 'string') {
        reuseAudioDir = resolve(opts.reuseAudio);
    }

    // Build pipeline steps
    const pipelineSteps = [
        { id: 'load', label: 'Load scenario' },
    ];
    if (opts.voiceover !== false) {
        pipelineSteps.push({ id: 'extract', label: 'Extract narrations' });
        pipelineSteps.push({ id: 'tts', label: 'Generate voiceover' });
    }
    pipelineSteps.push(
        { id: 'record', label: 'Record scenario' },
        { id: 'bundle', label: 'Bundle composition' },
        { id: 'render', label: 'Render video' },
    );

    const pipe = createPipeline(pipelineSteps);

    // 1. Load scenario
    pipe.start('load');
    let scenarioFn;
    try {
        const mod = await import(pathToFileURL(scenarioPath).href);
        scenarioFn = mod.default;
        if (typeof scenarioFn !== 'function') {
            pipe.fail('load', 'must export default async function');
            process.exit(1);
        }
        pipe.complete('load', `${scenarioName} → ${versionLabel}`);
    }
    catch (err) {
        pipe.fail('load', err.message.substring(0, 60));
        process.exit(1);
    }

    // 2. Extract narrations & generate unified voiceover
    let narrationResult = null; // { audioFile, totalDurationMs, segments }
    if (opts.voiceover !== false) {
        pipe.start('extract');
        try {
            const texts = await extractNarrations(scenarioFn);

            // Save narration script as markdown
            const ttsInstructions = config.geminiTtsInstructions
                ?? config.openaiTtsInstructions
                ?? 'Speak in an upbeat, enthusiastic tone. This is a tech product demo video. Be energetic and professional, like a friendly product evangelist.';
            const voiceName = config.ttsProvider === 'gemini' ? config.geminiVoice
                : config.ttsProvider === 'openai' ? config.openaiVoice
                : config.piperVoice;

            const scriptMd = [
                `# ${scenarioName} — Narration Script`,
                '',
                `**Voice:** ${voiceName}  `,
                `**Provider:** ${config.ttsProvider}  `,
                `**Generated:** ${new Date().toISOString()}`,
                '',
                '## Voice Prompt',
                '',
                `> ${ttsInstructions}`,
                '',
                '## Script',
                '',
                ...texts.flatMap((text, i) => [
                    `### ${i + 1}. Segment ${i + 1}`,
                    '',
                    text,
                    '',
                ]),
            ].join('\n');
            await writeFile(join(versionDir, 'script.md'), scriptMd, 'utf-8');

            pipe.complete('extract', `${texts.length} segments`);

            if (texts.length > 0) {
                // Validate API key (skip if reusing audio)
                if (!reuseAudioDir) {
                    if (config.ttsProvider === 'gemini' && !process.env.GEMINI_API_KEY) {
                        pipe.fail('tts', 'GEMINI_API_KEY required');
                        process.exit(1);
                    }
                }

                // 3. Generate single unified audio file
                pipe.start('tts');
                try {
                    narrationResult = await generateFullNarration(texts, {
                        audioDir,
                        geminiVoice: config.geminiVoice,
                        geminiTtsInstructions: config.geminiTtsInstructions,
                        reuseAudioDir: reuseAudioDir ?? undefined,
                    });

                    if (narrationResult.reused) {
                        const sourceLabel = reuseAudioDir ? basename(resolve(reuseAudioDir, '..')) : 'cache';
                        pipe.complete('tts', `${texts.length} segments reused from ${sourceLabel}`);
                    } else {
                        const totalSec = (narrationResult.totalDurationMs / 1000).toFixed(1);
                        pipe.complete('tts', `${texts.length} segments, ${totalSec}s total via ${config.ttsProvider}`);
                    }

                    // Save segment timing to script for reference
                    const timingLines = narrationResult.segments.map((s, i) =>
                        `| ${i + 1} | ${(s.startMs / 1000).toFixed(1)}s | ${(s.endMs / 1000).toFixed(1)}s | ${(s.durationMs / 1000).toFixed(1)}s | ${s.text.substring(0, 50)}${s.text.length > 50 ? '…' : ''} |`
                    );
                    const timingMd = [
                        '',
                        '## Segment Timing',
                        '',
                        `Total duration: ${(narrationResult.totalDurationMs / 1000).toFixed(1)}s`,
                        '',
                        '| # | Start | End | Duration | Text |',
                        '|---|-------|-----|----------|------|',
                        ...timingLines,
                        '',
                    ].join('\n');
                    const existingScript = await import('node:fs/promises').then(fs => fs.readFile(join(versionDir, 'script.md'), 'utf-8'));
                    await writeFile(join(versionDir, 'script.md'), existingScript + timingMd, 'utf-8');
                }
                catch (err) {
                    pipe.fail('tts', err.message.substring(0, 80));
                    console.error(chalk.dim(err.message));
                    narrationResult = null;
                }
            } else {
                pipe.skip('tts', 'no narrations found');
            }
        }
        catch (err) {
            pipe.fail('extract', err.message.substring(0, 60));
            console.error(chalk.dim(err.message));
        }
    }

    // 4. RECORD: Build pregenerated array from unified audio segments
    //    The first segment carries the audioFile; all others get null
    //    (NarrationTrack renders a single <Audio> at the first segment's timestamp)
    let pregenerated = [];
    if (narrationResult) {
        pregenerated = narrationResult.segments.map((seg, i) => ({
            text: seg.text,
            durationMs: seg.durationMs,
            audioFile: i === 0 ? narrationResult.audioFile : null,
        }));
    }

    pipe.start('record');
    let timeline;
    try {
        const result = await runScenario(scenarioFn, {
            scenarioFile: scenarioPath,
            testFile: scenarioPath,
            viewport: { width, height },
            pregenerated: pregenerated.length > 0 ? pregenerated : undefined,
            branding: config.branding,
            fps: config.fps,
            outputDir: recordDir,
        });
        timeline = result.timeline;
        if (pregenerated.length > 0) {
            validateNarrationCount(pregenerated.length, result.narrationCount);
        }
        const frameCount = expandedFrameCount(timeline.metadata.frameManifest);
        const dedupInfo = result.dedupedFrames > 0
            ? ` (${result.uniqueFrames} unique, ${result.dedupedFrames} deduped)`
            : '';
        pipe.complete('record', `${frameCount} frames${dedupInfo}, ${result.timeline.events.length} events`);
    }
    catch (err) {
        pipe.fail('record', err.message.substring(0, 80));
        if (err.message.includes('Executable doesn\'t exist') || err.message.includes('browserType.launch')) {
            console.error(chalk.dim('Run: npx playwright install chromium'));
        }
        else if (err.message.includes('net::ERR_CONNECTION_REFUSED')) {
            console.error(chalk.dim('Make sure your dev server is running.'));
        }
        else if (err.message.includes('Timeout') || err.message.includes('waiting for')) {
            console.error(chalk.dim('Check that selectors in the scenario match your app.'));
        }
        process.exit(1);
    }

    // Copy the full narration audio into recordDir so Remotion can find it via staticFile()
    if (narrationResult) {
        const dest = join(recordDir, basename(narrationResult.audioFile));
        if (resolve(narrationResult.audioFile) !== resolve(dest)) {
            await copyFile(narrationResult.audioFile, dest);
        }
    }

    // 6. COMPOSE: Render final video via Remotion
    pipe.start('bundle');
    try {
        const totalFrames = expandedFrameCount(timeline.metadata.frameManifest);
        await renderDemoVideo({
            timeline,
            outputPath,
            publicDir: recordDir,
            branding: config.branding,
            onPhase: (phase) => {
                if (phase === 'bundling') {
                    pipe.detail('bundle', 'webpack bundling…');
                } else if (phase === 'selecting') {
                    pipe.detail('bundle', 'selecting composition…');
                } else if (phase === 'rendering') {
                    pipe.complete('bundle');
                    pipe.start('render');
                    pipe.update('render', 0, `0/${totalFrames} frames`);
                }
            },
            onProgress: (p) => {
                const fraction = p.progress;
                const rendered = p.renderedFrames;
                const encoded = p.encodedFrames;
                let detail = `${rendered}/${totalFrames} rendered`;
                if (encoded > 0 && encoded < totalFrames) {
                    detail += `, ${encoded} encoded`;
                }
                if (p.renderEstimatedTime > 0 && fraction < 1) {
                    const remainMs = p.renderEstimatedTime * (1 - fraction);
                    const remainSec = Math.round(remainMs / 1000);
                    if (remainSec > 0) detail += ` — ~${remainSec}s left`;
                }
                pipe.update('render', fraction, detail);
            },
        });
        pipe.complete('render');
    }
    catch (err) {
        pipe.fail('render', err.message.substring(0, 80));
        if (err.message.includes('memory') || err.message.includes('OOM')) {
            console.error(chalk.dim('Try a lower resolution: --resolution 1280x720'));
        }
        else {
            console.error(chalk.dim(err.message));
        }
        process.exit(1);
    }

    // 7. Report
    const fileStats = await stat(outputPath);
    const sizeMB = (fileStats.size / (1024 * 1024)).toFixed(1);
    const totalFrames = expandedFrameCount(timeline.metadata.frameManifest);
    const durationSec = (totalFrames / (config.fps ?? 16)).toFixed(0);
    const mins = Math.floor(Number(durationSec) / 60);
    const secs = Number(durationSec) % 60;
    const durationStr = `${mins}:${String(secs).padStart(2, '0')}`;

    pipe.summary(outputPath, sizeMB, durationStr, timeline.events.length);
});
