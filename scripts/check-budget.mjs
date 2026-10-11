// Bundle budget (#24): the widget's JavaScript and client.js stay small; CI fails otherwise.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const gz = (file) => gzipSync(readFileSync(file)).length;
const assets = 'dist/widget/assets';
const entry = readdirSync(assets).filter((file) => /^index-.*\.js$/.test(file)).map((file) => `${assets}/${file}`);
const budgets = [
  ['widget JavaScript (entry)', entry.reduce((sum, file) => sum + gz(file), 0), 100 * 1024],
  ['client.js', gz('dist/widget/client.js'), 10 * 1024],
];
let failed = false;
for (const [name, size, limit] of budgets) {
  const ok = size <= limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${(size / 1024).toFixed(1)} KB gzip (budget ${limit / 1024} KB)`);
}
if (!entry.length) throw new Error('No widget entry bundle found; run the build first.');
process.exit(failed ? 1 : 0);
