import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

/**
 * Convert raw PCM (audio/L16, 24kHz, 16-bit, mono) to WAV by prepending a header.
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);        // fmt chunk size
    header.writeUInt16LE(1, 20);          // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcmBuffer]);
}

export async function synthesize(text, outputPath, voice = 'Kore', instructions) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error(
            'GEMINI_API_KEY environment variable is required for Gemini TTS. ' +
            'Set it with: export GEMINI_API_KEY=...'
        );
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    // Only pass the actual text to speak — Gemini TTS will vocalize
    // everything in the content, so instructions must stay out of it.
    // Voice style is controlled purely by voice selection.
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: voice,
                    },
                },
            },
        },
    });

    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const data = part?.inlineData?.data;
    if (!data) {
        const debugInfo = JSON.stringify({
            hasCandidates: !!response.candidates,
            candidateCount: response.candidates?.length,
            hasContent: !!candidate?.content,
            partsCount: candidate?.content?.parts?.length,
            partKeys: part ? Object.keys(part) : null,
            hasInlineData: !!part?.inlineData,
        });
        throw new Error(`Gemini TTS returned no audio data. Debug: ${debugInfo}`);
    }

    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = pcmToWav(pcmBuffer);
    await writeFile(outputPath, wavBuffer);

    const durationMs = await measureDuration(outputPath);
    return { audioPath: outputPath, durationMs };
}

async function measureDuration(wavPath) {
    try {
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            wavPath,
        ]);
        return Math.round(parseFloat(stdout.trim()) * 1000);
    } catch {
        // Fallback: estimate from WAV file size (24kHz 16-bit mono)
        const { stat } = await import('node:fs/promises');
        const stats = await stat(wavPath);
        const dataBytes = stats.size - 44; // WAV header
        const samplesPerSec = 24000;
        const bytesPerSample = 2;
        return Math.round((dataBytes / (samplesPerSec * bytesPerSample)) * 1000);
    }
}
