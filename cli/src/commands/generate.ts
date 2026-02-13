import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { prepareGeneration, validateScenarioCode } from '../generator/scenario-generator.js';

export const generateCommand = new Command('generate')
  .description('Generate demo scenario from a Playwright test')
  .option('--test <path>', 'Path to Playwright test file')
  .option('--validate <path>', 'Validate an existing scenario file')
  .option('--out <path>', 'Output path for generated scenario')
  .option('--narration-style <style>', 'Narration style: brief or detailed', 'detailed')
  .option('--app-description <desc>', 'Brief description of the app for context')
  .action(async (opts) => {
    if (opts.validate) {
      await runValidation(resolve(opts.validate));
      return;
    }

    if (!opts.test) {
      console.error(chalk.red('Error: either --test or --validate is required'));
      process.exit(1);
    }

    const testPath = resolve(opts.test);
    const outDir = resolve(opts.out ? resolve(opts.out, '..') : './demos');
    const outPath = opts.out
      ? resolve(opts.out)
      : resolve(outDir, `${basename(testPath, '.spec.ts')}-demo.ts`);

    await mkdir(outDir, { recursive: true });

    const spinner = ora('Reading test file...').start();
    const { systemPrompt, userPrompt } = await prepareGeneration({
      testPath,
      narrationStyle: opts.narrationStyle,
      appDescription: opts.appDescription,
    });
    spinner.succeed('Test file loaded');

    console.log('\n=== System Prompt ===');
    console.log(systemPrompt);
    console.log('\n=== User Prompt ===');
    console.log(userPrompt);
    console.log(`\n${chalk.cyan('Output path:')} ${outPath}`);
    console.log('Pipe the above prompts to an LLM, then save the response to the output path.');
    console.log('Or use the /screenwright skill in Claude Code for automatic generation.');
  });

async function runValidation(scenarioPath: string): Promise<void> {
  const spinner = ora('Reading scenario file...').start();
  let code: string;
  try {
    code = await readFile(scenarioPath, 'utf-8');
  } catch (err: any) {
    spinner.fail(`Cannot read ${scenarioPath}: ${err.message}`);
    process.exit(1);
  }
  spinner.succeed('Scenario file loaded');

  const result = validateScenarioCode(code);

  for (const e of result.errors) {
    console.log(chalk.red(`  ERROR [${e.code}]: ${e.message}`));
  }
  for (const w of result.warnings) {
    console.log(chalk.yellow(`  WARN  [${w.code}]: ${w.message}`));
  }

  if (result.valid) {
    console.log(chalk.green('  Scenario is valid.'));
    process.exit(0);
  } else {
    process.exit(1);
  }
}
