// Builds dist/bookmarklet.txt and dist/diagnostic.txt from src/, then rewrites the
// install page's links. Run with: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);

const harvest = read('src/harvest.js');
const wrapper = read('src/wrapper.js');

async function build(name, body) {
  const src = '(function(){' + body + '})();';
  const res = await minify(src, {
    compress: { passes: 2 },
    mangle: true,
    format: { quote_style: 1, comments: false, semicolons: true },
  });
  if (res.error) throw res.error;
  const code = res.code.trim();
  new Function(code); // syntax check
  if (code.includes('%')) throw new Error(name + ': a literal % would break as a bookmarklet URL');
  const bm = 'javascript:' + code;
  write('dist/' + name + '.txt', bm);
  console.log('dist/' + name + '.txt  ' + bm.length + ' chars');
  return bm;
}

const full = await build('bookmarklet', harvest + '\n' + wrapper);

const diagBody = harvest + `
var r = vgHarvest();
var lines = r.slice(0, 8).map(function (x, i) { return (i + 1) + '. ' + x.width + 'x' + x.height + '  ' + x.src; });
var ogEl = document.querySelector('meta[property="og:image"],meta[name="og:image"]');
var og = ogEl && ogEl.content ? ogEl.content : '(none)';
alert('Very Goods harvester found ' + r.length + ' image(s) on:\\n' + location.href +
  '\\n\\n' + lines.join('\\n') +
  '\\n\\nog:image tag (stale on some sites, so it is ranked last):\\n' + og);
console.log('[Very Goods] found', r.length, r, 'og:image:', og);
`;
const diag = await build('diagnostic', diagBody);

// Inject into the install page between the markers.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
let page = read('docs/index.html');
function inject(id, bm) {
  const re = new RegExp(`(<a id="${id}"[^>]*?href=")[^"]*(")`);
  if (!re.test(page)) throw new Error('docs/index.html: no <a id="' + id + '"> to inject into');
  page = page.replace(re, `$1${esc(bm)}$2`);
}
inject('install', full);
inject('diagnostic', diag);
write('docs/index.html', page);
console.log('docs/index.html  links updated');
