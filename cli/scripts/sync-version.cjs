const fs = require('fs');
const path = require('path');
const os = require('os');

const version = require('../package.json').version;
const [major, minor] = version.split('.');
const range = major + '.' + minor;

// 1. Generate src/version.ts
fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'version.ts'),
  'export const VERSION = ' + JSON.stringify(version) + ';\n',
);

// 2. Sync source skill/SKILL.md to local Claude Code install (for dev)
const skillSource = path.join(__dirname, '..', '..', 'skill', 'SKILL.md');
const localSkill = path.join(
  os.homedir(), '.claude', 'skills', 'screenwright', 'SKILL.md',
);
if (fs.existsSync(skillSource) && fs.existsSync(path.dirname(localSkill))) {
  // Patch version in the copy, not the source
  let content = fs.readFileSync(skillSource, 'utf-8');
  content = content.replace(/^version:\s*.+$/m, 'version: ' + version);
  content = content.replace(/CLI version \*\*\d+\.\d+\.x\*\*/, 'CLI version **' + range + '.x**');
  content = content.replace(/screenwright@\d+\.\d+/, 'screenwright@' + range);
  fs.writeFileSync(localSkill, content);
}
