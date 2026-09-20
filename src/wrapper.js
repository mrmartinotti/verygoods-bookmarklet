var ORIGIN = 'https://verygoods.co';

// If a popup from a previous click on this SAME page is still open, just re-send to
// it and focus it. This is the manual retry if the first delivery was missed. The URL
// check matters on sites with client-side navigation: after browsing to a different
// listing in the same tab, a click must open a fresh popup, not re-send the old one.
if (window.__vg && window.__vg.w && !window.__vg.w.closed && window.__vg.href === location.href) {
  window.__vg.send();
  try { window.__vg.w.focus(); } catch (e) {}
  return;
}
if (window.__vg && window.__vg.stop) window.__vg.stop();

// A UNIQUE window name per click. With a shared name, a second click on a
// different tab would reuse the first popup, and the first page's pusher would
// then overwrite the new page's images with its own.
var w = window.open(
  ORIGIN + '/bookmarklet/1?title=' + encodeURIComponent(document.title),
  'verygoods_' + Date.now(),
  'width=560,height=780'
);
if (!w) { alert('Very Goods: the popup was blocked. Allow popups for this site and try again.'); return; }

// Harvest ONCE and freeze it, so the ranking cannot shift as lazy images load.
var frozen = null;
function payload() {
  if (frozen) return frozen;
  var r = vgHarvest();
  if (r.length) frozen = JSON.stringify(r);
  return frozen || '[]';
}

function send() { try { w.postMessage(payload(), ORIGIN); } catch (e) {} }

function onMessage(m) {
  if (m.origin !== ORIGIN) return;
  if (m.data === 'get-images') {
    // Their page asked directly: answer it, and cancel the timed send so the
    // gallery is not delivered twice (each delivery resets it to the first photo).
    clearTimeout(timer);
    try { m.source.postMessage(payload(), ORIGIN); } catch (e) {}
  } else if (m.data === 'close') {
    stop();
    try { w.close(); } catch (e) {}
  }
}

// Deliver the list EXACTLY ONCE. Every payload makes their gallery reload and jump
// back to the first image, so repeated deliveries fought with the Previous/Next
// buttons -- a click would appear to do nothing until the pushes stopped.
var timer = setTimeout(send, 1400);

function stop() {
  clearTimeout(timer);
  window.removeEventListener('message', onMessage);
  window.__vg = null;
}

window.addEventListener('message', onMessage);
window.__vg = { stop: stop, send: send, w: w, href: location.href, harvest: vgHarvest };
