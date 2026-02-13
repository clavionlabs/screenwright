import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');
const validScenario = resolve(FIXTURES, 'sample-scenario.ts');
const invalidTest = resolve(FIXTURES, 'sample-test.spec.ts');

// We test the generate command by importing and exercising it via Commander's
// parseAsync. We mock process.exit and console.log to capture output.

describe('generate command', () => {
  let exitCode: number | undefined;
  let output: string[];

  beforeEach(() => {
    exitCode = undefined;
    output = [];
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      exitCode = Number(code ?? 0);
      throw new Error(`EXIT_${exitCode}`);
    });
    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      output.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
      output.push(args.map(String).join(' '));
    });
  });

  async function run(args: string[]) {
    // Re-import to get a fresh command each time (Commander mutates state)
    const mod = await import('../../src/commands/generate.js');
    try {
      await mod.generateCommand.parseAsync(args, { from: 'user' });
    } catch (e: any) {
      if (!e.message.startsWith('EXIT_')) throw e;
    }
  }

  it('--validate with valid scenario exits 0', async () => {
    await run(['--validate', validScenario]);
    expect(exitCode).toBe(0);
    const joined = output.join('\n');
    expect(joined).toContain('valid');
  });

  it('--validate with invalid file exits 1 and prints errors', async () => {
    await run(['--validate', invalidTest]);
    expect(exitCode).toBe(1);
    const joined = output.join('\n');
    expect(joined).toContain('ERROR');
  });

  it('--validate without --test does not error about missing test', async () => {
    await run(['--validate', validScenario]);
    const joined = output.join('\n');
    expect(joined).not.toContain('--test');
  });

  it('neither --validate nor --test → error with clear message', async () => {
    await run([]);
    expect(exitCode).toBe(1);
    const joined = output.join('\n');
    expect(joined).toContain('--test');
    expect(joined).toContain('--validate');
  });

  it('default mode with --test outputs system and user prompts', async () => {
    await run(['--test', invalidTest]);
    const joined = output.join('\n');
    expect(joined).toContain('System Prompt');
    expect(joined).toContain('User Prompt');
    expect(joined).toContain('Output path');
  });
});
