#!/usr/bin/env node

import { Command } from 'commander';
import { VERSION } from '../src/version.js';
import { initCommand } from '../src/commands/init.js';
import { generateCommand } from '../src/commands/generate.js';
import { composeCommand } from '../src/commands/compose.js';
import { previewCommand } from '../src/commands/preview.js';
import { configCommand } from '../src/commands/config.js';

const program = new Command();

program
  .name('screenwright')
  .description('Turn Playwright E2E tests into polished product demo videos')
  .version(VERSION);

program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(composeCommand);
program.addCommand(previewCommand);
program.addCommand(configCommand);

program.parse();
