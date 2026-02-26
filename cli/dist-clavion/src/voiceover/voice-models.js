import { mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const PIPER_GITHUB = 'https://github.com/rhasspy/piper/releases/download';
const PIPER_VERSION = '2023.11.14-2';
const VOICE_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';
export const DEFAULT_VOICE = {
    name: 'en_US-amy-medium',
    onnxUrl: `${VOICE_BASE_URL}/en/en_US/amy/medium/en_US-amy-medium.onnx`,
    configUrl: `${VOICE_BASE_URL}/en/en_US/amy/medium/en_US-amy-medium.onnx.json`,
};
export function getScreenwrightDir() {
    return join(homedir(), '.screenwright');
}
export function getPiperBinPath() {
    return join(getScreenwrightDir(), 'bin', 'piper');
}
export function getVoiceModelPath(modelName) {
    return join(getScreenwrightDir(), 'voices', `${modelName}.onnx`);
}
export function getVoiceConfigPath(modelName) {
    return join(getScreenwrightDir(), 'voices', `${modelName}.onnx.json`);
}
export async function exists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
// The official Piper aarch64 macOS release is mispackaged (ships x86_64 binary).
// On macOS ARM64, use the Python piper-tts package which has native onnxruntime.
function needsPythonFallback() {
    return process.platform === 'darwin' && process.arch === 'arm64';
}
function getNativePiperUrl() {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === 'linux') {
        return `${PIPER_GITHUB}/${PIPER_VERSION}/piper_linux_${arch === 'arm64' ? 'aarch64' : 'x86_64'}.tar.gz`;
    }
    if (platform === 'darwin') {
        return `${PIPER_GITHUB}/${PIPER_VERSION}/piper_macos_x64.tar.gz`;
    }
    throw new Error(`Unsupported platform: ${platform}`);
}
async function findPythonPiper() {
    for (const cmd of ['piper', `${homedir()}/Library/Python/3.9/bin/piper`]) {
        try {
            await execFileAsync(cmd, ['--help']);
            return cmd;
        }
        catch {
            // not found
        }
    }
    return null;
}
async function installPythonPiper() {
    const existing = await findPythonPiper();
    if (existing)
        return existing;
    console.log('Installing piper-tts via pip3...');
    await execFileAsync('pip3', ['install', 'piper-tts', 'pathvalidate']);
    const bin = await findPythonPiper();
    if (!bin) {
        throw new Error('pip3 install piper-tts succeeded but piper not found on PATH. ' +
            'Add your pip bin directory to PATH.');
    }
    return bin;
}
async function downloadNativePiper() {
    const binPath = getPiperBinPath();
    if (await exists(binPath))
        return binPath;
    const binDir = join(getScreenwrightDir(), 'bin');
    await mkdir(binDir, { recursive: true });
    const url = getNativePiperUrl();
    console.log(`Downloading Piper from ${url}...`);
    await execFileAsync('bash', ['-c', `curl -sL "${url}" | tar xz -C "${binDir}" --strip-components=1`]);
    await execFileAsync('chmod', ['+x', binPath]);
    console.log('Piper installed successfully.');
    return binPath;
}
export async function downloadPiper() {
    // If piper is already on PATH (e.g. pip install in CI), use it
    const existing = await findPythonPiper();
    if (existing)
        return existing;
    if (needsPythonFallback()) {
        return installPythonPiper();
    }
    return downloadNativePiper();
}
export async function downloadVoiceModel(model = DEFAULT_VOICE) {
    const modelPath = getVoiceModelPath(model.name);
    const configPath = getVoiceConfigPath(model.name);
    if (await exists(modelPath) && await exists(configPath))
        return modelPath;
    const voicesDir = join(getScreenwrightDir(), 'voices');
    await mkdir(voicesDir, { recursive: true });
    console.log(`Downloading voice model: ${model.name}...`);
    await execFileAsync('curl', ['-sL', '-o', modelPath, model.onnxUrl]);
    await execFileAsync('curl', ['-sL', '-o', configPath, model.configUrl]);
    console.log('Voice model downloaded.');
    return modelPath;
}
export async function ensureDependencies(modelName = 'en_US-amy-medium') {
    const piperBin = await downloadPiper();
    const model = modelName === DEFAULT_VOICE.name ? DEFAULT_VOICE : {
        name: modelName,
        onnxUrl: `${VOICE_BASE_URL}/en/en_US/${modelName.split('-')[1]}/${modelName.split('-')[2]}/${modelName}.onnx`,
        configUrl: `${VOICE_BASE_URL}/en/en_US/${modelName.split('-')[1]}/${modelName.split('-')[2]}/${modelName}.onnx.json`,
    };
    const modelPath = await downloadVoiceModel(model);
    return { piperBin, modelPath };
}
