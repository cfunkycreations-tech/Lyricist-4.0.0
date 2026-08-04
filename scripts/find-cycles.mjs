import fs from 'fs';
import path from 'path';

const seen = new Map();
const stack = [];
const cycles = [];

function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  let p = path.normalize(path.join(path.dirname(from), spec));
  for (const ext of ['', '.js', '.jsx', '.ts', '.tsx', '.json']) {
    if (fs.existsSync(p + ext) && fs.statSync(p + ext).isFile()) return p + ext;
  }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    for (const idx of ['index.js', 'index.jsx']) {
      const f = path.join(p, idx);
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

function walk(file) {
  if (seen.has(file)) return;
  seen.set(file, 'visiting');
  stack.push(file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    stack.pop();
    seen.set(file, 'done');
    return;
  }
  const re = /import\s+(?:[^'"]+from\s+)?['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const next = resolve(file, m[1]);
    if (!next) continue;
    if (seen.get(next) === 'visiting') {
      const i = stack.indexOf(next);
      cycles.push(
        [...stack.slice(i), next].map((f) => path.relative(process.cwd(), f)).join(' -> ')
      );
    } else if (seen.get(next) !== 'done') {
      walk(next);
    }
  }
  stack.pop();
  seen.set(file, 'done');
}

walk('src/main.jsx');
console.log('files', seen.size);
console.log('cycles', cycles.length);
cycles.forEach((c) => console.log('CYCLE:', c));
