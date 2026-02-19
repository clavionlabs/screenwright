import { describe, it, expect, vi } from 'vitest';

// Mock both engines before importing narration-preprocess
vi.mock('../../src/voiceover/piper-engine.js', () => ({
  synthesize: vi.fn().mockImplementation(async (text: string, outputPath: string) => ({
    audioPath: outputPath,
    durationMs: text.split(/\s+/).length * 400,
  })),
}));

vi.mock('../../src/voiceover/openai-engine.js', () => ({
  synthesize: vi.fn().mockImplementation(async (text: string, outputPath: string) => ({
    audioPath: outputPath,
    durationMs: text.split(/\s+/).length * 350,
  })),
}));

import { pregenerateNarrations } from '../../src/runtime/narration-preprocess.js';
import { synthesize as openaiSynthesize } from '../../src/voiceover/openai-engine.js';

describe('pregenerateNarrations', () => {
  it('generates audio files for all texts', async () => {
    const result = await pregenerateNarrations(
      ['Hello world', 'This is a demo'],
      { tempDir: '/tmp' },
    );

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Hello world');
    expect(result[0].audioFile).toMatch(/narration-0\.wav$/);
    expect(result[0].durationMs).toBeGreaterThan(0);
    expect(result[1].text).toBe('This is a demo');
    expect(result[1].audioFile).toMatch(/narration-1\.wav$/);
  });

  it('returns empty array for no texts', async () => {
    const result = await pregenerateNarrations([], { tempDir: '/tmp' });
    expect(result).toEqual([]);
  });

  it('uses .wav extension for piper provider', async () => {
    const result = await pregenerateNarrations(
      ['Hello'],
      { tempDir: '/tmp', ttsProvider: 'piper' },
    );
    expect(result[0].audioFile).toMatch(/\.wav$/);
  });

  it('uses .mp3 extension for openai provider', async () => {
    const result = await pregenerateNarrations(
      ['Hello'],
      { tempDir: '/tmp', ttsProvider: 'openai' },
    );
    expect(result[0].audioFile).toMatch(/\.mp3$/);
  });

  it('passes openaiTtsInstructions to the openai engine', async () => {
    await pregenerateNarrations(
      ['Hello'],
      {
        tempDir: '/tmp',
        ttsProvider: 'openai',
        openaiVoice: 'coral',
        openaiTtsInstructions: 'Be upbeat and enthusiastic.',
      },
    );

    expect(openaiSynthesize).toHaveBeenCalledWith(
      'Hello',
      expect.stringMatching(/narration-0\.mp3$/),
      'coral',
      'Be upbeat and enthusiastic.',
    );
  });

  it('preserves text order in results', async () => {
    const texts = ['First', 'Second', 'Third'];
    const result = await pregenerateNarrations(texts, { tempDir: '/tmp' });
    expect(result.map(r => r.text)).toEqual(texts);
  });
});
