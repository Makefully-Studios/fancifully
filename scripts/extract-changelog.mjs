import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(root, 'CHANGELOG.md');

if (!version) {
  console.error('Usage: node scripts/extract-changelog.mjs <version>');
  process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
const header = `## [${version}]`;
const start = changelog.indexOf(header);

if (start === -1) {
  console.error(`No CHANGELOG.md section found for version ${version}.`);
  process.exit(1);
}

const afterHeader = changelog.indexOf('\n', start);
const bodyStart = afterHeader === -1 ? changelog.length : afterHeader + 1;
const next = changelog.indexOf('\n## [', bodyStart);
const body = changelog.slice(bodyStart, next === -1 ? undefined : next).trim();

if (!body) {
  console.error(`CHANGELOG.md section for version ${version} is empty.`);
  process.exit(1);
}

process.stdout.write(`## ${version}\n\n${body}\n`);
