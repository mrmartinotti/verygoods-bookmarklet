function vgHarvest() {
  var out = [], ogs = [], seen = {};

  function abs(u) {
    if (!u) return null;
    u = String(u).trim();
    if (!u) return null;
    if (u.indexOf('data:') === 0 || u.indexOf('blob:') === 0 || u.indexOf('javascript:') === 0) return null;
    try {
      var r = new URL(u, location.href).href;
      return /^https?:/.test(r) ? r : null;
    } catch (e) { return null; }
  }

  function add(u, w, h, dest) {
    u = abs(u);
    if (!u || seen[u]) return;
    w = Math.round(w || 0); h = Math.round(h || 0);
    if (w && h) {
      if (w < 300) return;
      if (w / h > 8 || h / w > 8) return;
    }
    seen[u] = 1;
    (dest || out).push({ src: u, width: w || 600, height: h || 600 });
  }

  // Largest candidate in a srcset. Matches "url <n>w" / "url <n>x" pairs rather than
  // splitting on commas, because CDN URLs (Cloudinary, Imgix) contain commas.
  function biggest(ss) {
    if (!ss) return null;
    var best = null, bw = -1, any = false, m;
    var re = /(\S+)\s+(\d*\.?\d+)[wx](?=\s*(?:,|$))/g;
    while ((m = re.exec(ss))) {
      any = true;
      var n = parseFloat(m[2]);
      if (n >= bw) { bw = n; best = m[1].replace(/^,+/, ''); }
    }
    if (!any) {
      // No descriptors at all ("a.jpg, b.jpg"): take the first URL.
      var first = ss.split(/\s*,\s*/)[0];
      best = first ? first.split(/\s+/)[0] : null;
    }
    return best;
  }

  // Best available dimensions for an <img>. naturalWidth is the intrinsic size of
  // whatever is CURRENTLY loaded, which for a lazy-loading placeholder is 1x1 --
  // so treat tiny intrinsic sizes as unknown and fall back to the layout box.
  function dims(el) {
    var nw = el.naturalWidth || 0, nh = el.naturalHeight || 0;
    if (nw < 50 || nh < 50) { nw = 0; nh = 0; }
    var lw = el.width || 0, lh = el.height || 0;
    if (!lw || !lh) {
      var r = el.getBoundingClientRect();
      lw = r.width; lh = r.height;
    }
    return (nw * nh) >= (lw * lh) ? [nw, nh] : [lw, lh];
  }

  // 1. og:image / twitter:image. Kept SEPARATE and appended last: on a site with
  // client-side navigation these tags are often never updated, so they can still
  // point at the first page you visited. Only trust them if the DOM yields nothing.
  var metas = document.querySelectorAll(
    'meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="og:image"],meta[name="twitter:image"],meta[name="twitter:image:src"]'
  );
  for (var i = 0; i < metas.length; i++) add(metas[i].content, 1200, 1200, ogs);

  // 2. <img> elements, including lazy-loaded and srcset variants.
  var im = document.images, LAZY = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-image', 'data-zoom-image', 'data-large-image', 'data-full-src'];
  var JUNK = /(blank|spacer|placeholder|transparent|pixel|1x1|loader|loading)\.(gif|png|svg|jpe?g)(\?|$)/i;
  for (var i = 0; i < im.length; i++) {
    var el = im[i], d = dims(el), w = d[0], h = d[1];

    // A loaded image with a tiny intrinsic size is a spacer or tracking pixel, never
    // the product photo -- skip it. Any lazy-load URL on the element is still added below.
    var nat = el.naturalWidth || 0;
    var placeholder = (nat > 0 && nat < 50) || JUNK.test(el.currentSrc || el.src || '');
    if (!placeholder) add(el.currentSrc || el.src, w, h);

    for (var j = 0; j < LAZY.length; j++) add(el.getAttribute(LAZY[j]), w, h);
    add(biggest(el.getAttribute('srcset')), w, h);
    add(biggest(el.getAttribute('data-srcset')), w, h);
  }

  // 3. <picture><source srcset>
  var srcs = document.querySelectorAll('source[srcset],source[data-srcset]');
  for (var i = 0; i < srcs.length; i++) {
    add(biggest(srcs[i].getAttribute('srcset') || srcs[i].getAttribute('data-srcset')), 0, 0);
  }

  // 4. CSS background images on reasonably large boxes.
  var all = document.querySelectorAll('div,span,a,li,figure,section,header');
  var cap = Math.min(all.length, 2500);
  for (var i = 0; i < cap; i++) {
    var rr = all[i].getBoundingClientRect();
    if (rr.width < 300 || rr.height < 100) continue;
    var bg = '';
    try { bg = getComputedStyle(all[i]).backgroundImage; } catch (e) { continue; }
    if (!bg || bg === 'none') continue;
    var mm = /url\((['"]?)(.*?)\1\)/.exec(bg);
    if (mm) add(mm[2], rr.width, rr.height);
  }

  out.sort(function (a, b) { return (b.width * b.height) - (a.width * a.height); });
  return out.concat(ogs).slice(0, 40);
}
