import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { configSchema } from './config-schema.js';
import { defaultConfig } from './defaults.js';
/**
 * Load screenwright.config.ts from project root.
 * Falls back to defaults if file is missing.
 */
export async function loadConfig(cwd) {
    const root = cwd ?? process.cwd();
    let configPath;
    // Try .js first (ESM projects), then .ts
    for (const ext of ['.js', '.ts']) {
        const candidate = resolve(root, `screenwright.config${ext}`);
        try {
            await access(candidate);
            configPath = candidate;
            break;
        } catch { /* try next */ }
    }
    if (!configPath) {
        return { ...defaultConfig };
    }
    let mod;
    try {
        mod = await import(pathToFileURL(configPath).href);
    }
    catch (err) {
        throw new Error(`Failed to load ${configPath}: ${err.message}`);
    }
    const raw = mod.default;
    if (raw === undefined) {
        throw new Error('screenwright.config.ts must have a default export');
    }
    return configSchema.parse(raw);
}
