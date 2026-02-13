import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { defaultConfig, serializeConfig } from '../config/defaults.js';
import { ensureDependencies } from '../voiceover/voice-models.js';

export const initCommand = new Command('init')
  .description('Bootstrap config and download voice model')
  .option('--voice <model>', 'Voice model to use', 'en_US-amy-medium')
  .option('--skip-voice-download', 'Skip downloading the voice model')
  .action(async (opts) => {
    const configPath = resolve(process.cwd(), 'screenwright.config.ts');

    // Config file
    let configExists = false;
    try {
      await access(configPath);
      configExists = true;
    } catch {
      // doesn't exist
    }

    if (configExists) {
      console.log(chalk.dim('screenwright.config.ts already exists, skipping.'));
    } else {
      const config = { ...defaultConfig, voice: opts.voice };
      await writeFile(configPath, serializeConfig(config), 'utf-8');
      console.log(chalk.green('Created screenwright.config.ts'));
    }

    // Voice model
    if (!opts.skipVoiceDownload) {
      const spinner = ora('Downloading Piper TTS and voice model').start();
      try {
        await ensureDependencies(opts.voice);
        spinner.succeed('Piper TTS and voice model ready');
      } catch (err: any) {
        spinner.warn('Could not download voice model');
        console.error(chalk.dim(err.message));
        console.error(chalk.dim('Voiceover will be unavailable. Re-run "screenwright init" to retry.'));
        console.error(chalk.dim('Use --no-voiceover with compose to skip voiceover.'));
      }
    }

    console.log('');
    console.log(chalk.green('Screenwright initialized.'));
    console.log(chalk.dim('Next: screenwright generate --test <path>'));
  });
