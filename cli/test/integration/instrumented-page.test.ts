import { describe, it, expect, afterEach } from 'vitest';
import { stat, rm, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runScenario, type ScenarioFn } from '../../src/runtime/instrumented-page.js';
import { timelineSchema } from '../../src/timeline/schema.js';

const FIXTURE_PAGE = `file://${resolve(import.meta.dirname, '../fixtures/test-page.html')}`;

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.length = 0;
});

describe('runScenario — real Playwright', () => {
  it('produces valid timeline JSON and frame manifest', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.scene('Test scene');
      await sw.navigate(FIXTURE_PAGE);
      await sw.click('[data-testid="product-laptop"]');
      await sw.fill('[data-testid="email"]', 'hi@test.com');
      await sw.click('[data-testid="checkout"]');
    };

    const result = await runScenario(scenario, {
      scenarioFile: 'test-scenario.ts',
      testFile: 'test.spec.ts',
      viewport: { width: 1280, height: 720 },
    });

    tempDirs.push(result.tempDir);

    // --- Timeline validity ---
    const parsed = timelineSchema.safeParse(result.timeline);
    expect(parsed.success).toBe(true);

    // Metadata
    expect(result.timeline.version).toBe(2);
    expect(result.timeline.metadata.scenarioFile).toBe('test-scenario.ts');
    expect(result.timeline.metadata.viewport).toEqual({ width: 1280, height: 720 });

    // Frame manifest is populated
    const manifest = result.timeline.metadata.frameManifest;
    expect(manifest.length).toBeGreaterThan(0);

    // Events — at least one of each type we emitted
    const types = result.timeline.events.map((e) => e.type);
    expect(types).toContain('scene');
    expect(types).toContain('action');
    expect(types).toContain('cursor_target');

    // Action events include our actions
    const actions = result.timeline.events
      .filter((e) => e.type === 'action')
      .map((e) => (e as { action: string }).action);
    expect(actions).toContain('navigate');
    expect(actions).toContain('click');
    expect(actions).toContain('fill');

    // Click events should have bounding boxes resolved
    const clicks = result.timeline.events.filter(
      (e) => e.type === 'action' && (e as { action: string }).action === 'click',
    );
    for (const click of clicks) {
      const bb = (click as { boundingBox: unknown }).boundingBox;
      expect(bb).not.toBeNull();
    }

    // --- Frame files on disk ---
    for (const entry of manifest) {
      const frameStat = await stat(join(result.tempDir, entry.file));
      expect(frameStat.size).toBeGreaterThan(0);
    }

    // --- Timeline JSON on disk ---
    const timelineOnDisk = JSON.parse(
      await readFile(resolve(result.tempDir, 'timeline.json'), 'utf-8'),
    );
    expect(timelineSchema.safeParse(timelineOnDisk).success).toBe(true);
  }, 30_000);

  it('handles a minimal single-action scenario', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.navigate(FIXTURE_PAGE);
    };

    const result = await runScenario(scenario, {
      scenarioFile: 'minimal.ts',
      testFile: 'minimal.spec.ts',
    });

    tempDirs.push(result.tempDir);

    const parsed = timelineSchema.safeParse(result.timeline);
    expect(parsed.success).toBe(true);

    const actions = result.timeline.events.filter((e) => e.type === 'action');
    expect(actions.length).toBe(1);
    expect((actions[0] as { action: string }).action).toBe('navigate');

    // Frame manifest exists
    expect(result.timeline.metadata.frameManifest.length).toBeGreaterThan(0);
  }, 30_000);

  it('frame capture produces JPEG screenshots', async () => {
    const scenario: ScenarioFn = async (sw) => {
      await sw.scene('Frame capture test');
      await sw.navigate(FIXTURE_PAGE);
      await sw.click('[data-testid="product-laptop"]');
    };

    const result = await runScenario(scenario, {
      scenarioFile: 'frames.ts',
      testFile: 'frames.spec.ts',
      viewport: { width: 1280, height: 720 },
    });

    tempDirs.push(result.tempDir);

    const parsed = timelineSchema.safeParse(result.timeline);
    expect(parsed.success).toBe(true);

    const manifest = result.timeline.metadata.frameManifest;
    expect(manifest.length).toBeGreaterThan(0);

    // Each frame file exists on disk
    for (const entry of manifest) {
      if (entry.type === 'frame') {
        const frameStat = await stat(join(result.tempDir, entry.file));
        expect(frameStat.size).toBeGreaterThan(0);
        expect(entry.file).toMatch(/\.jpg$/);
      }
    }

    // Frames directory exists
    const framesDir = join(result.tempDir, 'frames');
    const files = await readdir(framesDir);
    expect(files.length).toBeGreaterThan(0);
  }, 30_000);
});
