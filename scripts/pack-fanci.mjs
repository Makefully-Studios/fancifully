import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Pack a story folder (containing story.json) into a .fanci ZIP.
 * Usage: node scripts/pack-fanci.mjs <storyDir> [out.fanci]
 */
const storyDir = path.resolve(process.argv[2] ?? 'demo/public/stories/demo');
const outFile = path.resolve(
  process.argv[3] ?? path.join(path.dirname(storyDir), `${path.basename(storyDir)}.fanci`),
);

function walk(dir, prefix = '') {
  const entries = {};
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      Object.assign(entries, walk(full, rel.replace(/\\/g, '/')));
    } else {
      entries[rel.replace(/\\/g, '/')] = new Uint8Array(fs.readFileSync(full));
    }
  }
  return entries;
}

if (!fs.existsSync(path.join(storyDir, 'story.json'))) {
  console.error('Expected story.json in', storyDir);
  process.exit(1);
}

const zipped = zipSync(walk(storyDir), { level: 6 });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, zipped);
console.log(`Wrote ${outFile} (${zipped.length} bytes)`);
