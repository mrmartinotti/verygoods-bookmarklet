// End-to-end tests. Run with: npm test   (needs `npx playwright install chromium` once)
//
// verygoods.co is intercepted and replaced with small stand-in pages that mimic the
// real popup's behaviour (it posts 'get-images' to window.parent, then renders any
// image list it is handed). Everything else is real browser behaviour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8899';
const harvest = fs.readFileSync(path.join(root, 'src/harvest.js'), 'utf8');
const bookmarklet = fs.readFileSync(path.join(root, 'dist/bookmarklet.txt'), 'utf8').replace(/^javascript:/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(label, ok) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  ok ? pass++ : fail++;
}
const harvestOn = (page) => page.evaluate('(function(){' + harvest + '; return vgHarvest(); })()');
const names = (list) => list.map((r) => r.src.replace(BASE, ''));

// Stand-in for the Very Goods popup. Records every payload; resets its pager on each.
const RECEIVER = `<!doctype html><html><head><title>Very Goods</title></head><body><div id="out"></div><script>
window.__all = []; window.__list = []; window.__idx = 0; window.__loopback = false;
window.vgNext = function () { if (window.__idx < window.__list.length - 1) window.__idx++; };
window.addEventListener('message', function (m) {
  if (typeof m.data !== 'string') return;
  if (m.data === 'get-images') { window.__loopback = true; return; }
  try { var a = JSON.parse(m.data); if (Array.isArray(a)) {
    window.__all.push(a); window.__list = a; window.__idx = 0;
  } } catch (e) {}
});
try { window.parent.postMessage('get-images', '*'); } catch (e) {}
</script></body></html>`;

// Variant that asks the opener directly (a hypothetical future version of their page).
const REQUESTER = RECEIVER.replace("window.parent.postMessage('get-images', '*')", "window.opener && window.opener.postMessage('get-images', '*')");

const server = await serve(8899);
const browser = await chromium.launch();

async function context(receiver = RECEIVER) {
  const ctx = await browser.newContext();
  await ctx.route('**://verygoods.co/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: receiver }));
  return ctx;
}
async function open(ctx, file) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/' + file);
  await page.waitForLoadState('networkidle');
  return page;
}
async function click(page) {
  const p = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
  await page.evaluate(bookmarklet);
  const popup = await p;
  if (popup) await popup.waitForLoadState('domcontentloaded');
  return popup;
}

// ---------------------------------------------------------------- harvesting
console.log('\nharvesting (listing-a)');
{
  const ctx = await context();
  const page = await open(ctx, 'listing-a.html');
  const old = await page.evaluate(() => {
    var out = [], im = document.querySelectorAll('img');
    for (var i = 0; i < im.length; i++) if (im[i].width >= 300 && im[i].width / im[i].height <= 8) out.push(im[i].src);
    return out;
  });
  check('2015 shim leads with a data: placeholder (the original bug)', old[0].startsWith('data:'));
  const n = names(await harvestOn(page));
  check('no data: URIs', !n.some((x) => x.startsWith('data:')));
  check('lazy data-src picked up', n.includes('/img/product-main-1600.jpg'));
  check('lazy data-original picked up', n.includes('/img/product-alt-view.jpg'));
  check('largest srcset candidate picked up', n.includes('/img/gal-1200.jpg'));
  check('<picture><source> picked up', n.includes('/img/pic-1400.webp'));
  check('CSS background picked up', n.includes('/img/bg-hero.jpg'));
  check('og:image present but last', n[n.length - 1] === '/img/og-product-hero.jpg');
  check('tiny icon excluded', !n.includes('/img/cart-icon.png'));
  check('wide banner excluded', !n.includes('/img/wide-banner.jpg'));
  check('spacer gif excluded', !n.includes('/img/blank.gif'));
  await ctx.close();
}

console.log('\nharvesting (listing-d: CDN srcset, tracking pixel)');
{
  const ctx = await context();
  const page = await open(ctx, 'listing-d.html');
  const n = names(await harvestOn(page));
  check('comma-containing srcset URL kept whole', n.includes('/img/c_fill,w_1200/gal-1200.jpg'));
  check('no shredded fragments', !n.some((x) => /\/w_\d+\/gal|c_fill$|listing-d/.test(x)));
  check('descriptor-less srcset handled', n.includes('/img/mid-1200.jpg'));
  check('hidden tracking pixel excluded', !n.some((x) => x.includes('blank.gif')));
  await ctx.close();
}

// ---------------------------------------------------------------- delivery
console.log('\ndelivery');
{
  const ctx = await context();
  const page = await open(ctx, 'listing-a.html');
  const popup = await click(page);
  check('popup opened at verygoods.co with the page title', !!popup && /verygoods\.co\/bookmarklet\/1\?title=5%20Panel/.test(popup.url()));
  await sleep(2500);
  const all = await popup.evaluate(() => window.__all);
  check("their 'get-images' request loops back to the popup itself (why we push)", await popup.evaluate(() => window.__loopback));
  check('delivered exactly once', all.length === 1);
  check('payload has src/width/height', all[0].every((x) => typeof x.src === 'string' && typeof x.width === 'number' && typeof x.height === 'number'));

  // Pager must not be yanked back after the user starts clicking.
  await popup.evaluate(() => { window.vgNext(); window.vgNext(); });
  await sleep(4000);
  check('pager index untouched by late deliveries', (await popup.evaluate(() => window.__idx)) === 2);

  // Re-click on the same page re-sends to the same popup instead of opening another.
  const again = await click(page);
  check('same-page re-click does not open a second popup', again === null);
  check('same-page re-click re-sends to the open popup', (await popup.evaluate(() => window.__all.length)) === 2);

  // Client-side navigation: a click must open a NEW popup for the new listing.
  await page.evaluate(() => { history.pushState({}, '', '/listing-b.html'); document.title = 'Second Listing'; });
  const fresh = await click(page);
  check('after pushState, click opens a new popup', !!fresh);
  check('new popup carries the new title', !!fresh && /Second%20Listing/.test(fresh.url()));
  await ctx.close();
}

console.log('\ndelivery (their page asks the opener directly)');
{
  const ctx = await context(REQUESTER);
  const page = await open(ctx, 'listing-a.html');
  const popup = await click(page);
  await sleep(3000);
  check('answered once, timed send cancelled', (await popup.evaluate(() => window.__all.length)) === 1);
  await ctx.close();
}

// ---------------------------------------------------------------- stale og:image
console.log('\nstale og:image (listing-b points og:image at listing-a\'s photo)');
{
  const ctx = await context();
  const a = await open(ctx, 'listing-a.html');
  const pa = await click(a);
  await sleep(300);
  const b = await open(ctx, 'listing-b.html');
  const pb = await click(b);
  await sleep(2500);
  const gotA = names((await pa.evaluate(() => window.__all))[0]);
  const gotB = names((await pb.evaluate(() => window.__all))[0]);
  check("listing-b's popup leads with one of its own photos", /b-product-main|b-gal-1000/.test(gotB[0]));
  check("listing-b's stale og:image ranked last", gotB[gotB.length - 1] === '/img/og-product-hero.jpg');
  check('no cross-talk between the two popups', !gotA.some((x) => x.startsWith('/img/b-')) && !gotB.some((x) => x === '/img/gal-1200.jpg'));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
