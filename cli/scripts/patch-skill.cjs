const fs = require('fs');
const path = require('path');

const version = require('../package.json').version;
const [major, minor] = version.split('.');
const range = major + '.' + minor;

const src = path.join(__dirname, '..', '..', 'skill', 'SKILL.md');
const dst = path.join(__dirname, '..', 'skill', 'SKILL.md');

let content = fs.readFileSync(src, 'utf-8');
content = content.replace(/^version:\s*.+$/m, 'version: ' + version);
content = content.replace(/CLI version \*\*\d+\.\d+\.x\*\*/, 'CLI version **' + range + '.x**');
content = content.replace(/screenwright@\d+\.\d+/, 'screenwright@' + range);
fs.writeFileSync(dst, content);
