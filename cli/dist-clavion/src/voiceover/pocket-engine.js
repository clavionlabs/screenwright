/**
 * Pocket TTS engine — Local TTS via Kyutai's Pocket TTS (MLX, Apple Silicon).
 *
 * Calls a Python bridge script that loads the pocket-tts-mlx model and
 * generates WAV audio. No API key needed, runs entirely on-device.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Find the pocket-tts-setup directory and its Python environment.
 * Checks common locations relative to the project.
 */
async function findPocketTtsSetup() {
    // Check POCKET_TTS_DIR env var first
    if (process.env.POCKET_TTS_DIR) {
        return process.env.POCKET_TTS_DIR;
    }

    // Search common locations
    const candidates = [
        resolve(process.cwd(), '../../pocket-tts-setup'),           // from projects/cppa/
        resolve(process.cwd(), '../pocket-tts-setup'),              // from screenwright-fork/
        resolve(process.env.HOME, 'Documents/Business/Clavion Labs/pocket-tts-setup'),
    ];

    for (const dir of candidates) {
        try {
            await access(resolve(dir, '.venv/bin/python'));
            return dir;
        } catch {}
    }
    return null;
}

/**
 * Synthesize text to a WAV file using Pocket TTS.
 *
 * @param {string} text - Text to synthesize
 * @param {string} outputPath - Output WAV file path
 * @param {object} [opts] - Options
 * @param {string} [opts.voice] - Voice name (default: from config or 'marius')
 * @param {number} [opts.temp] - Sampling temperature (default: 0.7)
 * @param {number} [opts.maxTokens] - Max tokens per chunk (default: 500)
 * @returns {Promise<{durationMs: number, sampleRate: number, timing: object}>}
 */
export async function synthesize(text, outputPath, opts = {}) {
    const setupDir = await findPocketTtsSetup();
    if (!setupDir) {
        throw new Error(
            'Pocket TTS setup not found. Set POCKET_TTS_DIR env var or install pocket-tts-setup alongside your project.'
        );
    }

    const pythonPath = resolve(setupDir, '.venv/bin/python');
    const scriptPath = resolve(setupDir, 'main.py');

    // Write text to a temp file to avoid shell escaping issues with long scripts
    const textFilePath = outputPath + '.txt';
    await writeFile(textFilePath, text, 'utf-8');

    const args = [
        scriptPath,
        '--text-file', textFilePath,
        '--output', outputPath,
    ];

    if (opts.voice) {
        args.push('--voice', opts.voice);
    }
    if (opts.temp !== undefined) {
        args.push('--temp', String(opts.temp));
    }
    if (opts.maxTokens !== undefined) {
        args.push('--max-tokens', String(opts.maxTokens));
    }

    try {
        const { stdout, stderr } = await execFileAsync(pythonPath, args, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 600000, // 10 min timeout for long texts
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        // Parse JSON result from stdout
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        let result;
        try {
            result = JSON.parse(lastLine);
        } catch {
            throw new Error(`Pocket TTS returned invalid JSON: ${lastLine}`);
        }

        return {
            durationMs: result.duration_ms,
            sampleRate: result.sample_rate,
            timing: result.timing,
        };
    } catch (err) {
        if (err.killed) {
            throw new Error('Pocket TTS generation timed out (10 min limit)');
        }
        throw new Error(`Pocket TTS failed: ${err.message}`);
    } finally {
        // Clean up temp text file
        import('node:fs/promises').then(fs => fs.unlink(textFilePath).catch(() => {}));
    }
}
