import { Command } from 'commander';
import { writeFile, access, readFile, mkdir, copyFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { confirm, select, input } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { defaultConfig, serializeConfig } from '../config/defaults.js';
import { openaiVoices } from '../config/config-schema.js';
import { ensureDependencies } from '../voiceover/voice-models.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function askYesNo(question: string): Promise<boolean> {
  return confirm({ message: question, default: false });
}

function getSkillSourcePath(): string {
  return resolve(import.meta.dirname, '..', '..', '..', 'skill', 'SKILL.md');
}

const SKILL_NAMES = ['SKILL.md', 'skill.md'];

interface AssistantTarget {
  name: string;
  homeDir: string;
  skillDir: string;
}

function getAssistantTargets(home: string): AssistantTarget[] {
  return [
    {
      name: 'Claude Code',
      homeDir: resolve(home, '.claude'),
      skillDir: resolve(home, '.claude', 'skills', 'screenwright'),
    },
    {
      name: 'Codex',
      homeDir: resolve(home, '.codex'),
      skillDir: resolve(home, '.codex', 'skills', 'screenwright'),
    },
  ];
}

async function findSkillFile(skillDir: string): Promise<string | null> {
  for (const name of SKILL_NAMES) {
    const path = resolve(skillDir, name);
    if (await exists(path)) return path;
  }
  return null;
}

export interface InstallSkillsOptions {
  askFn?: (question: string) => Promise<boolean>;
  homeDir?: string;
  skillSourcePath?: string;
}

export async function installSkills(opts?: InstallSkillsOptions): Promise<void> {
  const ask = opts?.askFn ?? askYesNo;
  const home = opts?.homeDir ?? homedir();
  const sourcePath = opts?.skillSourcePath ?? getSkillSourcePath();

  if (!await exists(sourcePath)) {
    console.log(chalk.dim('Bundled skill not found, skipping skill install.'));
    return;
  }

  const sourceContent = await readFile(sourcePath, 'utf-8');
  const targets = getAssistantTargets(home);
  const detected = [];
  for (const t of targets) {
    if (await exists(t.homeDir)) detected.push(t);
  }

  if (detected.length === 0) {
    console.log(chalk.dim('No coding assistants detected, skipping skill install.'));
    return;
  }

  for (const t of detected) {
    const existingPath = await findSkillFile(t.skillDir);
    const canonicalPath = resolve(t.skillDir, 'SKILL.md');

    if (existingPath) {
      const current = await readFile(existingPath, 'utf-8');
      if (current === sourceContent) {
        console.log(chalk.dim(`${t.name} skill already up to date.`));
        continue;
      }
      const ok = await ask(`${t.name} skill exists but differs. Overwrite?`);
      if (!ok) continue;
    } else {
      const ok = await ask(`Install skill for ${t.name}?`);
      if (!ok) continue;
    }

    try {
      await mkdir(t.skillDir, { recursive: true });
      // Rename to canonical casing if needed
      if (existingPath && existingPath !== canonicalPath) {
        await rename(existingPath, canonicalPath);
      }
      await copyFile(sourcePath, canonicalPath);
      console.log(chalk.green(`Installed skill for ${t.name}.`));
    } catch (err: any) {
      console.warn(chalk.yellow(`Could not install skill for ${t.name}: ${err.message}`));
    }
  }
}

export const initCommand = new Command('init')
  .description('Bootstrap config and download voice model')
  .option('--piper-voice <model>', 'Piper voice model to use')
  .option('--tts <provider>', 'TTS provider: piper or openai')
  .option('--openai-voice <voice>', 'OpenAI voice name')
  .option('--skip-voice-download', 'Skip downloading the voice model')
  .option('--skip-skill-install', 'Skip coding assistant skill installation')
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
      // Interactive prompts for options not provided via CLI flags
      const ttsProvider = opts.tts ?? await select({
        message: 'TTS Provider',
        choices: [
          { value: 'piper', description: 'Local, offline, free' },
          { value: 'openai', description: 'Cloud, higher quality, requires API key' },
        ],
        default: 'piper',
      });

      let piperVoice = opts.piperVoice;
      let openaiVoice = opts.openaiVoice;

      if (ttsProvider === 'piper' && !piperVoice) {
        piperVoice = await input({
          message: 'Piper voice model',
          default: defaultConfig.piperVoice,
        });
      } else if (ttsProvider === 'openai' && !openaiVoice) {
        openaiVoice = await select({
          message: 'OpenAI Voice',
          choices: openaiVoices.map(v => ({ value: v })),
          default: defaultConfig.openaiVoice,
        });
      }

      const config = {
        ...defaultConfig,
        piperVoice: piperVoice ?? defaultConfig.piperVoice,
        ttsProvider: ttsProvider as 'piper' | 'openai',
        openaiVoice: (openaiVoice ?? defaultConfig.openaiVoice) as typeof defaultConfig.openaiVoice,
      };
      await writeFile(configPath, serializeConfig(config), 'utf-8');
      console.log(chalk.green('Created screenwright.config.ts'));

      // Update opts so downstream steps use the chosen values
      opts.tts = ttsProvider;
      opts.piperVoice = config.piperVoice;
      opts.openaiVoice = config.openaiVoice;
    }

    // Voice model (skip for OpenAI)
    if (!opts.skipVoiceDownload && opts.tts !== 'openai') {
      const spinner = ora('Downloading Piper TTS and voice model').start();
      try {
        await ensureDependencies(opts.piperVoice ?? defaultConfig.piperVoice);
        spinner.succeed('Piper TTS and voice model ready');
      } catch (err: any) {
        spinner.warn('Could not download voice model');
        console.error(chalk.dim(err.message));
        console.error(chalk.dim('Voiceover will be unavailable. Re-run "screenwright init" to retry.'));
        console.error(chalk.dim('Use --no-voiceover with compose to skip voiceover.'));
      }
    }

    // Validate OpenAI API key
    if (opts.tts === 'openai' && !process.env.OPENAI_API_KEY) {
      console.warn(chalk.yellow('Warning: OPENAI_API_KEY not set. OpenAI TTS will fail at compose time.'));
      console.log(chalk.dim('Set it with: export OPENAI_API_KEY=sk-...'));
    }

    // Coding assistant skills
    if (!opts.skipSkillInstall) {
      await installSkills();
    }

    console.log('');
    console.log(chalk.green('Screenwright initialized.'));
    console.log(chalk.dim('Next: screenwright generate --test <path>'));
  });
