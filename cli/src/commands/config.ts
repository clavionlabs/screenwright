import { Command } from 'commander';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { loadConfig } from '../config/load-config.js';
import { serializeConfig } from '../config/defaults.js';
import { openaiVoices, type ScreenwrightConfig } from '../config/config-schema.js';

function rl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(prompt: string): Promise<string> {
  const r = rl();
  try {
    return (await r.question(prompt)).trim();
  } finally {
    r.close();
  }
}

async function choose<T extends string>(label: string, options: T[], current: T): Promise<T> {
  console.log('');
  console.log(chalk.bold(label));
  for (let i = 0; i < options.length; i++) {
    const marker = options[i] === current ? chalk.green('*') : ' ';
    console.log(`  ${marker} ${i + 1}) ${options[i]}`);
  }
  const answer = await ask(`Choice [${options.indexOf(current) + 1}]: `);
  if (!answer) return current;
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) return options[idx];
  console.log(chalk.yellow(`Invalid choice, keeping "${current}".`));
  return current;
}

async function askString(label: string, current: string): Promise<string> {
  console.log('');
  const answer = await ask(`${chalk.bold(label)} [${current}]: `);
  return answer || current;
}

async function askResolution(current: { width: number; height: number }): Promise<{ width: number; height: number }> {
  const presets = ['1280x720', '1920x1080'];
  const currentStr = `${current.width}x${current.height}`;

  console.log('');
  console.log(chalk.bold('Resolution'));
  for (let i = 0; i < presets.length; i++) {
    const marker = presets[i] === currentStr ? chalk.green('*') : ' ';
    console.log(`  ${marker} ${i + 1}) ${presets[i]}`);
  }
  console.log(`    ${presets.includes(currentStr) ? ' ' : chalk.green('*')} 3) custom`);

  const answer = await ask(`Choice [${presets.includes(currentStr) ? presets.indexOf(currentStr) + 1 : 3}]: `);
  if (!answer) return current;

  if (answer === '3') {
    const custom = await ask(`Enter WIDTHxHEIGHT [${currentStr}]: `);
    if (!custom) return current;
    const [w, h] = custom.split('x').map(Number);
    if (w && h) return { width: w, height: h };
    console.log(chalk.yellow('Invalid format, keeping current.'));
    return current;
  }

  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < presets.length) {
    const [w, h] = presets[idx].split('x').map(Number);
    return { width: w, height: h };
  }
  return current;
}

export const configCommand = new Command('config')
  .description('Interactively configure Screenwright options')
  .action(async () => {
    const current = await loadConfig();
    console.log(chalk.bold.underline('Screenwright Configuration'));
    console.log(chalk.dim('Press Enter to keep current value.\n'));

    const config: ScreenwrightConfig = { ...current };

    config.pacing = await choose('Pacing', ['fast', 'normal', 'cinematic'], current.pacing);
    config.ttsProvider = await choose('TTS Provider', ['piper', 'openai'], current.ttsProvider);

    if (config.ttsProvider === 'piper') {
      config.voice = await askString('Piper voice model', current.voice);
    } else {
      config.openaiVoice = await choose('OpenAI Voice', [...openaiVoices], current.openaiVoice);
    }

    config.resolution = await askResolution(current.resolution);
    config.colorScheme = await choose('Color Scheme', ['light', 'dark'], current.colorScheme);
    config.locale = await askString('Locale', current.locale);
    config.timezoneId = await askString('Timezone', current.timezoneId);
    config.outputDir = await askString('Output directory', current.outputDir);

    const configPath = resolve(process.cwd(), 'screenwright.config.ts');
    await writeFile(configPath, serializeConfig(config), 'utf-8');

    console.log('');
    console.log(chalk.green(`Saved to ${configPath}`));
  });
