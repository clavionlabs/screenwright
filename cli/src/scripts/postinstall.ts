import { access, readFile, mkdir, copyFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';

const SKILL_NAMES = ['SKILL.md', 'skill.md'];

const ASSISTANTS = [
  { name: 'Claude Code', dir: '.claude' },
  { name: 'Codex', dir: '.codex' },
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findSkillFile(skillDir: string): Promise<string | null> {
  for (const name of SKILL_NAMES) {
    const path = resolve(skillDir, name);
    if (await exists(path)) return path;
  }
  return null;
}

export interface UpgradeSkillsOptions {
  homeDir?: string;
  skillSourcePath?: string;
}

export async function upgradeSkills(opts?: UpgradeSkillsOptions): Promise<void> {
  const home = opts?.homeDir ?? homedir();
  const sourcePath = opts?.skillSourcePath ??
    resolve(import.meta.dirname, '..', '..', '..', 'skill', 'SKILL.md');

  if (!await exists(sourcePath)) return;

  const sourceContent = await readFile(sourcePath, 'utf-8');

  for (const { dir } of ASSISTANTS) {
    const skillDir = resolve(home, dir, 'skills', 'screenwright');
    const existingPath = await findSkillFile(skillDir);
    if (!existingPath) continue;

    const current = await readFile(existingPath, 'utf-8');
    if (current === sourceContent) continue;

    try {
      const canonicalPath = resolve(skillDir, 'SKILL.md');
      // Rename to canonical casing if needed
      if (existingPath !== canonicalPath) {
        await rename(existingPath, canonicalPath);
      }
      await copyFile(sourcePath, canonicalPath);
    } catch {
      // Silent — don't break npm install
    }
  }
}

upgradeSkills().catch(() => {});
