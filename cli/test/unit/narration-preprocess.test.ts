import { describe, it, expect, vi } from 'vitest';
import { extractNarrations, validateNarrationCount } from '../../src/runtime/narration-preprocess.js';
import type { ScreenwrightHelpers } from '../../src/runtime/action-helpers.js';

type ScenarioFn = (sw: ScreenwrightHelpers) => Promise<void>;

describe('extractNarrations', () => {
  it('collects narrations from sw.narrate()', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.narrate('First narration');
      await sw.narrate('Second narration');
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual(['First narration', 'Second narration']);
  });

  it('collects narrations from action options', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.navigate('http://example.com', { narration: 'Navigate narration' });
      await sw.click('.btn', { narration: 'Click narration' });
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual(['Navigate narration', 'Click narration']);
  });

  it('collects from mixed sources in order', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.navigate('http://example.com', { narration: 'First' });
      await sw.narrate('Second');
      await sw.click('.btn', { narration: 'Third' });
      await sw.fill('.input', 'value', { narration: 'Fourth' });
      await sw.hover('.menu', { narration: 'Fifth' });
      await sw.press('Enter', { narration: 'Sixth' });
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']);
  });

  it('returns empty array when scenario has no narrations', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.scene('Test');
      await sw.navigate('http://example.com');
      await sw.click('.btn');
      await sw.wait(1000);
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual([]);
  });

  it('handles page property access without throwing', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.page.evaluate(() => 42);
      await sw.page.waitForSelector('.foo');
      await sw.narrate('After page calls');
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual(['After page calls']);
  });

  it('ignores actions without narration option', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.click('.btn');
      await sw.narrate('Only this');
      await sw.click('.other');
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual(['Only this']);
  });

  it('handles transition() calls without throwing', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.transition();
      await sw.narrate('After transition');
    };
    const result = await extractNarrations(scenario);
    expect(result).toEqual(['After transition']);
  });
});

describe('validateNarrationCount', () => {
  it('does not throw when counts match', () => {
    expect(() => validateNarrationCount(3, 3)).not.toThrow();
  });

  it('throws when counts diverge', () => {
    expect(() => validateNarrationCount(3, 2)).toThrow('3 narrations during preprocessing but 2 during recording');
  });

  it('throws when recording has more', () => {
    expect(() => validateNarrationCount(2, 4)).toThrow('2 narrations during preprocessing but 4 during recording');
  });

  it('does not throw for zero-zero', () => {
    expect(() => validateNarrationCount(0, 0)).not.toThrow();
  });
});
