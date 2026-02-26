import { join, basename } from 'node:path';
import { readFile, writeFile, copyFile, access, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { synthesize as piperSynthesize } from '../voiceover/piper-engine.js';
import { synthesize as openaiSynthesize } from '../voiceover/openai-engine.js';
import { synthesize as geminiSynthesize } from '../voiceover/gemini-engine.js';
import { synthesize as pocketSynthesize } from '../voiceover/pocket-engine.js';
const execFileAsync = promisify(execFile);

/**
 * Recursive proxy that returns async no-ops for any property/method access.
 */
function noopPageProxy() {
    const handler = {
        get(_target, prop) {
            if (prop === 'then')
                return undefined;
            return new Proxy(function () { }, {
                apply() {
                    return Promise.resolve(new Proxy({}, handler));
                },
                get(_t, p) {
                    if (p === 'then')
                        return undefined;
                    return new Proxy(function () { }, this);
                },
            });
        },
    };
    return new Proxy({}, handler);
}

/**
 * Run the scenario with a stub sw that collects narration texts in order.
 */
export async function extractNarrations(scenarioFn) {
    const narrations = [];
    const stub = {
        page: noopPageProxy(),
        navigate: async (_url, opts) => { if (opts?.narration) narrations.push(opts.narration); },
        click: async (_sel, opts) => { if (opts?.narration) narrations.push(opts.narration); },
        dblclick: async (_sel, opts) => { if (opts?.narration) narrations.push(opts.narration); },
        fill: async (_sel, _v, opts) => { if (opts?.narration) narrations.push(opts.narration); },
        hover: async (_sel, opts) => { if (opts?.narration) narrations.push(opts.narration); },
        press: async (_key, opts) => { if (opts?.narration) narrations.push(opts.narration); },
        wait: async () => { },
        narrate: async (text) => { narrations.push(text); },
        scene: async (_title, descOrOpts) => {
            if (typeof descOrOpts === 'object' && descOrOpts?.slide?.narrate)
                narrations.push(descOrOpts.slide.narrate);
        },
        transition: async () => { },
    };
    await scenarioFn(stub);
    return narrations;
}

// ── Segment separator for combining texts into one script ──
const SEGMENT_SEPARATOR = '\n\n...\n\n';

/**
 * Combine all narration texts into a single script for unified TTS generation.
 * Uses "..." as a natural pause marker between segments.
 */
export function buildFullScript(texts) {
    return texts.join(SEGMENT_SEPARATOR);
}

/**
 * Measure WAV/MP3 duration via ffprobe.
 */
async function measureDurationMs(filePath) {
    try {
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
        ]);
        return Math.round(parseFloat(stdout.trim()) * 1000);
    } catch {
        const stats = await stat(filePath);
        const dataBytes = stats.size - 44;
        return Math.round((dataBytes / (24000 * 2)) * 1000);
    }
}

/**
 * Detect silence segments in an audio file using ffmpeg silencedetect.
 * Returns an array of { startMs, endMs } for each detected silence.
 */
async function detectSilences(audioPath, silenceThresholdDb = -30, minSilenceDurationSec = 0.3) {
    const { stderr } = await execFileAsync('ffmpeg', [
        '-i', audioPath,
        '-af', `silencedetect=noise=${silenceThresholdDb}dB:d=${minSilenceDurationSec}`,
        '-f', 'null', '-',
    ], { maxBuffer: 10 * 1024 * 1024 });

    const silences = [];
    const lines = stderr.split('\n');
    let currentStart = null;

    for (const line of lines) {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);

        if (startMatch) {
            currentStart = parseFloat(startMatch[1]) * 1000;
        }
        if (endMatch && currentStart !== null) {
            const endMs = parseFloat(endMatch[1]) * 1000;
            silences.push({ startMs: Math.round(currentStart), endMs: Math.round(endMs) });
            currentStart = null;
        }
    }

    return silences;
}

/**
 * Given N segment texts and detected silences, map the best N-1 silences
 * to segment boundaries. Returns timing beats for each segment.
 *
 * Strategy: pick the N-1 longest silences (most likely intentional pauses
 * between sections), sorted by their position in the audio.
 */
export function mapSilencesToSegments(texts, silences, totalDurationMs) {
    const numBoundaries = texts.length - 1;

    if (silences.length < numBoundaries) {
        // Not enough silences detected — fall back to proportional splitting
        console.warn(`Expected ${numBoundaries} silences but found ${silences.length}. Using proportional timing.`);
        const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
        const segments = [];
        let cursor = 0;
        for (let i = 0; i < texts.length; i++) {
            const proportion = texts[i].length / totalChars;
            const durationMs = Math.round(proportion * totalDurationMs);
            segments.push({
                index: i,
                text: texts[i],
                startMs: cursor,
                endMs: cursor + durationMs,
                durationMs,
            });
            cursor += durationMs;
        }
        // Adjust last segment to cover any rounding error
        segments[segments.length - 1].endMs = totalDurationMs;
        segments[segments.length - 1].durationMs = totalDurationMs - segments[segments.length - 1].startMs;
        return segments;
    }

    // Pick the N-1 longest silences as boundaries
    const ranked = [...silences]
        .map((s, idx) => ({ ...s, duration: s.endMs - s.startMs, idx }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, numBoundaries)
        .sort((a, b) => a.startMs - b.startMs); // re-sort by position

    // Build segments from the boundaries
    // Each boundary's midpoint is the split point
    const splitPoints = ranked.map(s => Math.round((s.startMs + s.endMs) / 2));

    const segments = [];
    let cursor = 0;
    for (let i = 0; i < texts.length; i++) {
        const endMs = i < splitPoints.length ? splitPoints[i] : totalDurationMs;
        segments.push({
            index: i,
            text: texts[i],
            startMs: cursor,
            endMs,
            durationMs: endMs - cursor,
        });
        cursor = endMs;
    }

    return segments;
}

/**
 * Generate a single audio file from all narration texts combined.
 * Returns { audioFile, totalDurationMs, segments: [{ text, startMs, endMs, durationMs }] }
 */
export async function generateFullNarration(texts, opts) {
    const fullScript = buildFullScript(texts);
    const audioPath = join(opts.audioDir, 'narration-full.wav');

    // Check for existing audio + manifest (reuse if texts match)
    const manifestPath = join(opts.audioDir, 'narration-manifest.json');
    try {
        await access(manifestPath);
        await access(audioPath);
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        if (manifest.fullScript === fullScript && manifest.segments?.length === texts.length) {
            // Audio and manifest match — reuse
            return {
                audioFile: audioPath,
                totalDurationMs: manifest.totalDurationMs,
                segments: manifest.segments,
                reused: true,
            };
        }
    } catch {
        // No existing manifest or audio — generate fresh
    }

    // Also check --reuse-audio directory
    if (opts.reuseAudioDir) {
        const reuseManifestPath = join(opts.reuseAudioDir, 'narration-manifest.json');
        const reuseAudioPath = join(opts.reuseAudioDir, 'narration-full.wav');
        try {
            await access(reuseManifestPath);
            await access(reuseAudioPath);
            const manifest = JSON.parse(await readFile(reuseManifestPath, 'utf-8'));
            if (manifest.fullScript === fullScript && manifest.segments?.length === texts.length) {
                // Copy audio from previous version
                await copyFile(reuseAudioPath, audioPath);
                await copyFile(reuseManifestPath, manifestPath);
                return {
                    audioFile: audioPath,
                    totalDurationMs: manifest.totalDurationMs,
                    segments: manifest.segments,
                    reused: true,
                };
            }
        } catch {
            // Reuse dir doesn't have matching audio
        }
    }

    // Generate the full audio via TTS (provider routing)
    const provider = opts.ttsProvider ?? 'gemini';
    let totalDurationMs;

    if (provider === 'pocket') {
        const result = await pocketSynthesize(fullScript, audioPath, {
            voice: opts.pocketVoice ?? 'marius',
            temp: opts.pocketTemp,
            maxTokens: opts.pocketMaxTokens,
        });
        totalDurationMs = result.durationMs;
    } else if (provider === 'gemini') {
        const result = await geminiSynthesize(fullScript, audioPath, opts.geminiVoice, opts.geminiTtsInstructions);
        totalDurationMs = result.durationMs;
    } else if (provider === 'openai') {
        const result = await openaiSynthesize(fullScript, audioPath, opts.openaiVoice, opts.openaiTtsInstructions);
        totalDurationMs = result.durationMs;
    } else {
        throw new Error(`Unknown TTS provider: ${provider}`);
    }

    // Detect silences to find segment boundaries
    const silences = await detectSilences(audioPath);

    // Map silences to segment timing beats
    const segments = mapSilencesToSegments(texts, silences, totalDurationMs);

    // Save manifest for reuse
    const voiceName = provider === 'pocket' ? (opts.pocketVoice ?? 'marius')
        : provider === 'gemini' ? opts.geminiVoice
        : opts.openaiVoice;
    const manifest = {
        provider,
        voice: voiceName,
        fullScript,
        totalDurationMs,
        silencesDetected: silences.length,
        createdAt: new Date().toISOString(),
        segments,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    return {
        audioFile: audioPath,
        totalDurationMs,
        segments,
        reused: false,
    };
}

/**
 * Validate that the number of narrations consumed during recording matches
 * the number pre-generated during preprocessing.
 */
export function validateNarrationCount(pregenerated, consumed) {
    if (pregenerated !== consumed) {
        throw new Error(
            `Scenario produced ${pregenerated} narrations during preprocessing but ${consumed} during recording. ` +
            `Conditional narration is not supported.`
        );
    }
}
