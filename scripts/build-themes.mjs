// Themes are plain stylesheets loaded at runtime from /themes/<name>.css (same origin, strict CSP).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';

const source = 'styles/themes';
const target = 'dist/widget/themes';
mkdirSync(target, { recursive: true });
const files = readdirSync(source).filter((file) => file.endsWith('.css'));
for (const file of files) {
  const result = await postcss([autoprefixer()]).process(readFileSync(`${source}/${file}`, 'utf8'), { from: `${source}/${file}`, to: `${target}/${file}` });
  writeFileSync(`${target}/${file}`, result.css);
}
console.log(`Built ${files.length} themes.`);
