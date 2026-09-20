# verygoods-bookmarklet (unofficial)

A rebuild of the [Very Goods](https://verygoods.co) "save a product" [bookmarklet](https://verygoods.co/bookmarklet) that works in more modern browsers. Not affiliated with verygoods.co in any way (but I do love their stuff).

**Install:** open the [install page](https://mrmartinotti.github.io/verygoods-bookmarklet/) and drag the link to your bookmarks bar. (GitHub strips `javascript:` links from READMEs, which is the only reason why the page exists.) Or copy the contents of [`dist/bookmarklet.txt`](dist/bookmarklet.txt) into a new bookmark's URL field.

**Use:** on a product page, scroll the photos into view, click the bookmark, pick an image and product settings in the popup. You will need to be signed in at verygoods.co in the same browser. If the popup comes up empty, click the bookmark again — it re-sends to the open popup.

## Why the original broke

If you see this from the official bookmarklet:

> **Third-Party Cookies Required** - It looks like you have disabled third-party cookies.

your browser settings are not the problem. The original works by injecting an `<iframe>` of `verygoods.co` into the shop's page. Inside that iframe, your verygoods.co login cookie is a *third-party* cookie, and every major browser now withholds those by default - Firefox partitions them, Brave blocks them, and Chrome drops any cookie that doesn't explicitly opt in. No series of setting on our side reliably gets around all three.

## How this version works

It opens the Very Goods page as a **popup** instead of an iframe. A popup is a top-level page, so the login cookie is first-party and always sent. The bookmarklet then collects the product photos from the shop page and hands them to the popup with `postMessage`, in the same `{src, width, height}` format the original iframe used, so the verygoods.co side needs no changes.

Two things had to be different from the original code:

- **The popup can't ask for the images.** The original iframe requested them from `window.parent`. In a popup, `window.parent` is the popup itself, so the request goes nowhere. This version delivers the list once, about 1.4 s after opening - and exactly once, because every delivery makes the Very Goods gallery reset to its first photo, which fights with the Previous/Next buttons.
- **Modern shop pages hide their photos.** The original read `img.src` and `img.width`, which on a lazy-loading page yields a 1x1 placeholder GIF and nothing else. This version reads `naturalWidth`/`currentSrc`, the largest `srcset` candidate, `<picture><source>`, the usual lazy-load attributes (`data-src`, `data-original`, `data-zoom-image`, etc.), and large CSS background images; it drops spacers, icons, banners and tracking pixels.

One notable choice: the `og:image` meta tag is ranked **last**, not first. On sites with client-side navigation it is frequently never updated, so it keeps pointing at the first listing you opened.

## Layout

```
src/harvest.js    finds product images on the page (readable, commented)
src/wrapper.js    opens the popup and delivers the list
build.mjs         minifies src/ into dist/ and updates docs/index.html
dist/             the finished one-liners, committed so nobody needs Node
docs/index.html   the install page (GitHub Pages, from the docs/ folder)
test/             Playwright tests against mock shop pages
```

## Developing

```
npm install
npx playwright install chromium   # once
npm run build
npm test
```

`test/pages/` holds mock shop pages covering the lazy-loading patterns the harvester handles. If some shop's photos don't show up, add a page reproducing its markup there - that's the documentation of what's supported. `verygoods.co` itself is intercepted in tests and replaced with a small stand-in that mimics the real popup.

## Limitations

- Photos inside a shadow DOM, a cross-origin iframe, or drawn on a `<canvas>` can't be reached.
- Delivery is on a fixed timer because there is no cross-origin way to know when the popup has loaded. On a slow connection the first delivery can be missed - clicking the bookmark again re-sends.
- The Very Goods gallery's own behaviour (what it shows while an image is still downloading, for instance) is outside this code.

## License

MIT
