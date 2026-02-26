import { Command } from 'commander';
import { resolve, basename, join } from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ora from 'ora';
import chalk from 'chalk';
import { runScenario } from '../runtime/instrumented-page.js';
export const previewCommand = new Command('preview')
    .description('Quick preview without cursor overlay or voiceover')
    .argument('<scenario>', 'Path to demo scenario file')
    .option('--out <path>', 'Output path for preview timeline')
    .action(async (scenario, opts) => {
    const scenarioPath = resolve(scenario);
    try {
        await access(scenarioPath);
    }
    catch {
        console.error(chalk.red(`Scenario file not found: ${scenarioPath}`));
        console.error(chalk.dim('Run "screenwright generate --test <path>" to create one.'));
        process.exit(1);
    }
    const outputDir = resolve(opts.out ? resolve(opts.out, '..') : './output');
    const outputPath = opts.out
        ? resolve(opts.out)
        : resolve(outputDir, `${basename(scenarioPath, '.ts')}-preview.json`);
    await mkdir(outputDir, { recursive: true });
    // 1. Load scenario module
    let spinner = ora('Loading scenario').start();
    let scenarioFn;
    try {
        const mod = await import(pathToFileURL(scenarioPath).href);
        scenarioFn = mod.default;
        if (typeof scenarioFn !== 'function') {
            spinner.fail('Invalid scenario file');
            console.error(chalk.red('Scenario must export a default async function.'));
            process.exit(1);
        }
        spinner.succeed('Scenario loaded');
    }
    catch (err) {
        spinner.fail('Failed to load scenario');
        console.error(chalk.red(err.message));
        process.exit(1);
    }
    // 2. Run scenario (frame-based recording)
    spinner = ora('Recording preview').start();
    try {
        const result = await runScenario(scenarioFn, {
            scenarioFile: scenarioPath,
            testFile: scenarioPath,
        });
        const { timeline } = result;
        await writeFile(outputPath, JSON.stringify(timeline, null, 2));
        spinner.succeed(`Preview timeline saved to: ${outputPath}`);
        console.log(chalk.dim(`  ${timeline.events.length} events recorded`));
        console.log(chalk.dim(`  ${timeline.metadata.frameManifest.length} manifest entries`));
        console.log(chalk.dim(`  Frames at: ${join(result.tempDir, 'frames')}`));
    }
    catch (err) {
        spinner.fail('Recording failed');
        console.error(chalk.red(err.message));
        process.exit(1);
    }
});
