/* আমার ৬৪ — the poster-grade exports (redesign §9).
   Owner: H8. Global: window.A64X (merged, never clobbered).

   Every export is composed in the browser from a canvas (raster) or a string
   (vector) — no libraries, no build step, no network. Depends only on:
     window.A64   — districts (slug/path/cx/cy/w/h/bn/labelSize), state(), stats(), viewBox
     window.BN    — Bengali numerals and dates
     window.A64P  — optional traveller profile: load() -> {name, photo}
   (the profile is read straight from localStorage when A64P is absent)

   Public API on window.A64X:
     png(opts)   -> { blob, name:'amar-64-map-<scale>x.png', canvas, w, h }
                    opts: {scale:1|2|3, bg:'paper'|'night'|'clear', labels, stats}
     svg(opts)   -> { blob, name:'amar-64-map.svg', canvas?no, w, h, svg }
                    opts: {bg:'paper'|'night'|'clear', labels, stats}
     story()     -> { blob, name:'amar-64-story.png', canvas, w:1080, h:1920 }
     card()      -> { blob, name:'amar-64-card.png', canvas, w:1200, h:630 }

   The Bengali faces are always resolved (document.fonts) BEFORE the first
   Bengali draw — a canvas renders Bengali as tofu otherwise. The proof is
   inspectable at A64X.debug(). */
(function (w, d) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  /* ------------------------------------------------------------------ palette
     Hard-wired copies of the khata tokens so an export looks the same no matter
     which theme is active while it is made. Live tokens from A64.palette()
     override these when the design system is present (same names, §3). */
  var LIGHT = {
    paper: "#f6efe1", paper2: "#fffbf2", paper3: "#efe6d3",
    ink: "#1a2430", inkSoft: "#5b6673", rule: "#dbd0b8",
    mapBg: "#f9f4e8", mapWater: "#e7eef2", mapBorder: "#c9bda3",
    kantha: "#bb3a3a", kanthaInk: "#8d2626",
    kanthaTint: "rgba(187,58,58,.10)", kanthaFill: "rgba(187,58,58,.17)",
    wishFill: "rgba(29,78,115,.07)", indigo: "#1d4e73",
    marigold: "#dfa032", seal: "#a93a24", sealInk: "#fdf6e6"
  };
  var NIGHT = {
    paper: "#131a21", paper2: "#18222b", paper3: "#1e2a34",
    ink: "#ece3d2", inkSoft: "#a3b0bc", rule: "#2b3945",
    mapBg: "#16202a", mapWater: "#101820", mapBorder: "#3a4b59",
    kantha: "#e2775f", kanthaInk: "#f0a48f",
    kanthaTint: "rgba(226,119,95,.14)", kanthaFill: "rgba(226,119,95,.22)",
    wishFill: "rgba(127,178,214,.10)", indigo: "#7fb2d6",
    marigold: "#e8b757", seal: "#c9502f", sealInk: "#18222b"
  };

  function palette(name) {
    var t = name === "night" ? NIGHT : LIGHT;
    var out = {}, k;
    for (k in t) { if (t.hasOwnProperty(k)) { out[k] = t[k]; } }
    try {
      if (w.A64 && A64.palette) {
        var live = A64.palette();
        for (k in live) { if (live.hasOwnProperty(k) && live[k]) { out[k] = live[k]; } }
      }
    } catch (e) { /* the design system is optional */ }
    return out;
  }

  var SANS = '400 16px "Noto Sans Bengali", "Noto Sans", system-ui, sans-serif';
  var SANS_F = '"Noto Sans Bengali", "Noto Sans", system-ui, sans-serif';
  var SERIF_F = '"Noto Serif Bengali", "Noto Sans Bengali", serif';
  var CREDIT = "ম্যাপ: geoBoundaries (CC BY 3.0 IGO) · ফন্ট: Noto (OFL)";

  /* ---------------------------------------------------------------- fonts
     document.fonts must be resolved before the first Bengali draw. We record
     when that happened so the harness can prove it (A64X.debug()). */
  var fontsPromise = null, fontsResolved = false, fontsResolvedAt = 0;

  function now() { return (w.performance && w.performance.now) ? w.performance.now() : Date.now(); }

  function ensureFonts() {
    if (fontsPromise) { return fontsPromise; }
    var have = d.fonts;
    var specs = [
      '400 16px "Noto Sans Bengali"',
      '700 16px "Noto Sans Bengali"',
      '700 16px "Noto Serif Bengali"'
    ];
    var sample = "আমার ৬৪ বাংলাদেশ জেলা";
    var loads = [];
    if (have && have.load) {
      specs.forEach(function (s) { try { loads.push(have.load(s, sample)); } catch (e) { /* ignore */ } });
    }
    fontsPromise = Promise.all(loads)
      .then(function () { return (have && have.ready) ? have.ready : null; })
      .then(function () { fontsResolved = true; fontsResolvedAt = now(); return true; })
      .catch(function () { fontsResolved = true; fontsResolvedAt = now(); return false; });
    return fontsPromise;
  }

  var draws = [];
  function markDraw(kind) {
    var have = d.fonts;
    draws.push({
      kind: kind,
      at: Math.round(now()),
      fontsReadyResolved: fontsResolved,
      fontsStatus: have ? have.status : "n/a",
      sansReady: have && have.check ? have.check('700 16px "Noto Sans Bengali"', "আমার ৬৪") : false,
      serifReady: have && have.check ? have.check('700 16px "Noto Serif Bengali"', "আমার") : false
    });
    if (draws.length > 40) { draws.shift(); }
  }

  function whenReady() {
    if (w.A64 && A64.districts && A64.districts.length) { return Promise.resolve(); }
    return new Promise(function (res) {
      var done = false;
      var fin = function () { if (done) { return; } done = true; res(); };
      w.addEventListener("a64:ready", fin, { once: true });
      setTimeout(fin, 8000);   /* never hang the caller if the app never boots */
    });
  }

  /* ---------------------------------------------------------------- canvas */
  function mkCanvas(W, H) {
    var c = d.createElement("canvas");
    c.width = Math.max(1, Math.round(W));
    c.height = Math.max(1, Math.round(H));
    return c;
  }

  var pathCache = {};
  function pathOf(rec) {
    if (!pathCache[rec.slug]) { pathCache[rec.slug] = new Path2D(rec.path); }
    return pathCache[rec.slug];
  }

  function VB() { return (w.A64 && A64.viewBox) ? A64.viewBox : { w: 1000, h: 1381 }; }

  function pctStr(s) { return BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0); }

  function progressLine(s) {
    return BN.num(s.count) + "/৬৪ জেলা · দেশের " + pctStr(s) + "% আয়তন · " +
      BN.num(s.divDone) + "/৮ বিভাগ";
  }

  /* --------------------------------------------------------------- profile
     §8: the profile is optional and never leaves the device. Preferred source
     is A64P.load(); we fall back to the documented localStorage key so a raster
     export still carries the identity if profile.js is not loaded yet. */
  function profileData(opts) {
    if (opts && opts.profile) { return opts.profile; }
    try {
      if (w.A64P && w.A64P.load) { return w.A64P.load(); }
    } catch (e) { /* ignore */ }
    try { return JSON.parse(localStorage.getItem("amar64.profile.v1") || "null"); }
    catch (e) { return null; }
  }

  /* -> Promise<{ name:string|null, img:HTMLImageElement|null, photo:string|null }> */
  function loadProfile(opts) {
    var p = profileData(opts);
    if (!p || typeof p !== "object") { return Promise.resolve({ name: null, img: null, photo: null }); }
    var name = (typeof p.name === "string" && p.name.trim()) ? p.name.trim().slice(0, 24) : null;
    var src = (typeof p.photo === "string" && /^data:image\//.test(p.photo)) ? p.photo : null;
    if (!src) { return Promise.resolve({ name: name, img: null, photo: null }); }
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res({ name: name, img: img, photo: src }); };
      img.onerror = function () { res({ name: name, img: null, photo: null }); };
      img.src = src;
    });
  }

  /* --------------------------------------------------------------- drawing */
  var HEADER_H = 104;      /* the export header band, in viewBox units */
  var STRIP_H = 168;       /* the optional stats strip */

  function paintBackground(ctx, W, H, t, mode) {
    if (mode === "clear") { return; }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.mapWater || t.mapBg);
    g.addColorStop(0.42, t.mapBg);
    g.addColorStop(1, t.mapBg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* Manager patch: with no photo the card used to show an empty dashed circle and
     a "+", which made a finished share card look like an unfinished template. A
     name now becomes a filled seal carrying its first letter. */
  /* where this card came from, without the scheme — a shared card that names its
     source is a share card; one that does not is a dead end. */
  function SITE_URL() {
    try {
      if (w.__a64SiteURL) { return String(w.__a64SiteURL); }   /* set when generating the repo's own og.png */
      var u = (w.location.origin + w.location.pathname).replace(/^https?:\/\//, "");
      return u.replace(/\/$/, "") || "fevnem.github.io/amar-64";
    } catch (e) { return "fevnem.github.io/amar-64"; }
  }

  function drawAvatar(ctx, x, y, r, img, t, initial) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (img) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
      ctx.restore();
    } else {
      ctx.fillStyle = initial ? t.ink : t.paper2;
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    if (img) { ctx.strokeStyle = t.rule; ctx.stroke(); }
    else if (initial) {
      ctx.strokeStyle = t.ink; ctx.stroke();
      ctx.fillStyle = t.paper2;
      ctx.font = "700 " + Math.round(r * 1.15) + "px " + SANS_F;
      var mAlign = ctx.textAlign, mBase = ctx.textBaseline;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initial, x, y + r * 0.06);
      ctx.textAlign = mAlign; ctx.textBaseline = mBase;
    } else {
      ctx.strokeStyle = t.inkSoft; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
      ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* the first letter of a name, for the seal above */
  function initialOf(prof) {
    var n = prof && prof.name ? String(prof.name).trim() : "";
    return n ? Array.from(n)[0] : "";
  }

  /* Header: profile avatar + name (if set), then "আমার ৬৪" and the progress
     line; the date sits on the right; a hairline closes the band. */
  function drawHeader(ctx, t, s, vb, prof) {
    var pad = 26, W = vb.w, H = HEADER_H;
    var hasP = !!(prof && (prof.name || prof.img));
    var tx = pad;
    ctx.textBaseline = "alphabetic";

    if (hasP) {
      var cx0 = pad + 28, cy0 = H / 2;
      drawAvatar(ctx, cx0, cy0, 28, prof.img, t, initialOf(prof));
      tx = cx0 + 42;
    }
    ctx.textAlign = "left";
    ctx.fillStyle = t.ink; ctx.font = "700 40px " + SERIF_F;
    ctx.fillText("আমার ৬৪", tx, hasP ? 52 : 50);
    ctx.fillStyle = t.inkSoft; ctx.font = "400 21px " + SANS_F;
    ctx.fillText(progressLine(s), tx, hasP ? 86 : 84);

    ctx.textAlign = "right";
    var rx = W - pad, yTop = hasP ? 52 : 50;
    if (prof && prof.name) {
      ctx.fillStyle = t.ink; ctx.font = "700 24px " + SANS_F;
      ctx.fillText(prof.name, rx, yTop);
    }
    ctx.fillStyle = t.inkSoft; ctx.font = "400 19px " + SANS_F;
    ctx.fillText(BN.date(), rx, hasP ? 86 : 84);

    ctx.strokeStyle = t.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, H - 0.5); ctx.lineTo(W - pad, H - 0.5); ctx.stroke();
  }

  /* Districts in viewBox coordinates (caller applied the scale transform).
     visited = kantha thread over a light tint; wish = dashed indigo outline;
     everything else = paper-3 with a hairline. */
  function drawDistricts(ctx, t) {
    var ds = A64.districts, st = A64.state();
    var visited = st.visited, wish = st.wish;

    ds.forEach(function (r) {
      if (visited.has(r.slug) || wish.has(r.slug)) { return; }
      var p = pathOf(r);
      ctx.fillStyle = t.paper3; ctx.fill(p);
      ctx.lineWidth = 0.9; ctx.strokeStyle = t.mapBorder; ctx.stroke(p);
    });
    ds.forEach(function (r) {
      if (!wish.has(r.slug) || visited.has(r.slug)) { return; }
      var p = pathOf(r);
      ctx.fillStyle = t.wishFill; ctx.fill(p);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = t.indigo; ctx.stroke(p);
      ctx.setLineDash([]);
    });
    ds.forEach(function (r) {
      if (!visited.has(r.slug)) { return; }
      var p = pathOf(r);
      ctx.fillStyle = t.kanthaTint; ctx.fill(p);
      ctx.fillStyle = t.kanthaFill; ctx.fill(p);
      ctx.setLineDash([3.2, 2.4]); ctx.lineWidth = 1.6; ctx.strokeStyle = t.kanthaInk; ctx.stroke(p);
      ctx.setLineDash([]);
    });
  }

  function drawLabels(ctx, t) {
    var ds = A64.districts;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ds.forEach(function (r) {
      ctx.font = "700 " + r.labelSize + "px " + SANS_F;
      var x = r.cx, y = r.cy + r.labelSize / 3;
      ctx.lineWidth = 2.6; ctx.strokeStyle = t.mapBg;
      ctx.strokeText(r.bn, x, y);
      ctx.fillStyle = t.ink;
      ctx.fillText(r.bn, x, y);
    });
  }

  /* Fit the whole map inside a box, in viewBox coordinates. */
  function drawMapFitted(ctx, box, t, labels, opts) {
    opts = opts || {};
    var vb = VB();
    var sc = Math.min(box.w / vb.w, box.h / vb.h);
    var dw = vb.w * sc, dh = vb.h * sc;
    var dx = box.x + (box.w - dw) / 2, dy = box.y + (box.h - dh) / 2;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(sc, sc);
    if (opts.bgFill !== false) {
      ctx.fillStyle = t.mapBg; ctx.fillRect(0, 0, vb.w, vb.h);
      ctx.strokeStyle = t.mapBorder; ctx.lineWidth = Math.max(0.8, 1 / sc);
      ctx.strokeRect(0.5, 0.5, vb.w - 1, vb.h - 1);
    }
    drawDistricts(ctx, t);
    if (labels) { drawLabels(ctx, t); }
    ctx.restore();
  }

  function drawStatsStrip(ctx, t, x, y, wid, hgt, bgFill) {
    var s = A64.stats();
    ctx.save();
    if (bgFill !== false) {
      ctx.fillStyle = t.paper2; ctx.fillRect(x, y, wid, hgt);
    }
    ctx.strokeStyle = t.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + wid, y + 0.5); ctx.stroke();
    var cy = y + hgt / 2;
    ctx.textBaseline = "middle";

    ctx.textAlign = "left"; ctx.fillStyle = t.kantha;
    ctx.font = "700 46px " + SERIF_F;
    ctx.fillText(BN.num(s.count) + "/৬৪", x + 28, cy);

    ctx.textAlign = "center"; ctx.fillStyle = t.ink;
    ctx.font = "700 22px " + SANS_F;
    ctx.fillText("দেশের " + pctStr(s) + "% আয়তন · " + BN.num(s.divDone) + "/৮ বিভাগ শেষ · যেতে চাই " +
      BN.num(s.wish) + " জেলা", x + wid / 2, cy);

    ctx.textAlign = "right"; ctx.fillStyle = t.inkSoft;
    ctx.font = "400 24px " + SANS_F;
    ctx.fillText(BN.date(), x + wid - 28, cy);
    ctx.restore();
  }

  /* ------------------------------------------------------------- Blob bits */
  function toBlob(canvas, type, q) {
    return new Promise(function (res, rej) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { b ? res(b) : rej(new Error("toBlob failed")); }, type, q);
        return;
      }
      try {
        var du = canvas.toDataURL(type, q);
        var bin = atob(du.split(",")[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
        res(new Blob([arr], { type: type }));
      } catch (e) { rej(e); }
    });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = d.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    d.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { d.body.removeChild(a); } catch (e) { /* gone */ }
      URL.revokeObjectURL(url);
    }, 1500);
  }

  /* ------------------------------------------------------------------ PNG */
  function buildMapCanvas(opts, prof) {
    var scale = opts.scale || 2;
    var bg = opts.bg || "paper";
    var labels = (opts.labels === undefined) ? true : !!opts.labels;
    var stats = (opts.stats === undefined) ? true : !!opts.stats;
    var vb = VB();
    var strip = stats ? STRIP_H : 0;
    var W = vb.w, H = HEADER_H + vb.h + strip;
    var canvas = mkCanvas(W * scale, H * scale);
    var ctx = canvas.getContext("2d");
    var t = palette(bg === "night" ? "night" : "paper");

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    paintBackground(ctx, W, H, t, bg);
    markDraw("map-png");
    drawHeader(ctx, t, A64.stats(), vb, prof);
    drawMapFitted(ctx, { x: 0, y: HEADER_H, w: vb.w, h: vb.h }, t, labels, { bgFill: bg !== "clear" });
    if (stats) { drawStatsStrip(ctx, t, 0, HEADER_H + vb.h, vb.w, strip, bg !== "clear"); }
    return canvas;
  }

  function buildPNG(opts) {
    opts = opts || {};
    if (!opts.scale) { opts.scale = 2; }
    return whenReady()
      .then(function () { return ensureFonts(); })
      .then(function () { return loadProfile(opts); })
      .then(function (prof) {
        var canvas = buildMapCanvas(opts, prof);
        return toBlob(canvas, "image/png").then(function (blob) {
          return { blob: blob, name: "amar-64-map-" + opts.scale + "x.png", canvas: canvas, w: canvas.width, h: canvas.height };
        });
      });
  }

  /* ------------------------------------------------------------------ SVG */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var FONT_FACES =
    '@font-face{font-family:"Noto Sans Bengali";font-style:normal;font-weight:400;font-display:swap;' +
    'src:url("../fonts/noto-sans-bengali-bengali-400.woff2") format("woff2");}' +
    '@font-face{font-family:"Noto Sans Bengali";font-style:normal;font-weight:700;font-display:swap;' +
    'src:url("../fonts/noto-sans-bengali-bengali-700.woff2") format("woff2");}' +
    '@font-face{font-family:"Noto Sans Bengali";font-style:normal;font-weight:400;font-display:swap;' +
    'src:url("../fonts/noto-sans-bengali-latin-400.woff2") format("woff2");}' +
    '@font-face{font-family:"Noto Sans Bengali";font-style:normal;font-weight:700;font-display:swap;' +
    'src:url("../fonts/noto-sans-bengali-latin-700.woff2") format("woff2");}' +
    '@font-face{font-family:"Noto Serif Bengali";font-style:normal;font-weight:700;font-display:swap;' +
    'src:url("../fonts/noto-serif-bengali-bengali-700.woff2") format("woff2");}' +
    '@font-face{font-family:"Noto Serif Bengali";font-style:normal;font-weight:700;font-display:swap;' +
    'src:url("../fonts/noto-serif-bengali-latin-700.woff2") format("woff2");}';

  function buildSVG(opts, prof) {
    opts = opts || {};
    var bg = opts.bg || "paper";
    var labels = (opts.labels === undefined) ? true : !!opts.labels;
    var stats = (opts.stats === undefined) ? true : !!opts.stats;
    var vb = VB();
    var strip = stats ? STRIP_H : 0;
    var H = HEADER_H + vb.h + strip;
    var t = palette(bg === "night" ? "night" : "paper");
    var s = A64.stats();
    var ds = A64.districts, st = A64.state();
    var visited = st.visited, wish = st.wish;
    var hasP = !!(prof && (prof.name || prof.img));

    var css = FONT_FACES +
      '.bg{fill:' + t.mapBg + '}' +
      '.district{fill:' + t.paper3 + ';stroke:' + t.mapBorder + ';stroke-width:0.9;stroke-linejoin:round}' +
      '.district.wish{fill:' + t.wishFill + ';stroke:' + t.indigo + ';stroke-width:1.5;stroke-dasharray:4 3}' +
      '.district.visited{fill:url(#stitch);stroke:' + t.kanthaInk + ';stroke-width:1.6;stroke-dasharray:3.2 2.4;stroke-linejoin:round}' +
      '.label{font-family:"Noto Sans Bengali",sans-serif;font-weight:700;fill:' + t.ink +
      ';paint-order:stroke;stroke:' + t.mapBg + ';stroke-width:2.6;stroke-linejoin:round;text-anchor:middle;dominant-baseline:middle}' +
      '.h-title{font-family:"Noto Serif Bengali",serif;font-weight:700;font-size:40px;fill:' + t.ink + '}' +
      '.h-line{font-family:"Noto Sans Bengali",sans-serif;font-weight:400;font-size:21px;fill:' + t.inkSoft + '}' +
      '.h-name{font-family:"Noto Sans Bengali",sans-serif;font-weight:700;font-size:24px;fill:' + t.ink + '}' +
      '.h-date{font-family:"Noto Sans Bengali",sans-serif;font-weight:400;font-size:19px;fill:' + t.inkSoft + '}' +
      '.h-rule{stroke:' + t.rule + ';stroke-width:1}' +
      '.ava-ring{fill:none;stroke:' + t.rule + ';stroke-width:2}' +
      '.ava-empty{fill:' + t.paper2 + ';stroke:' + t.inkSoft + ';stroke-width:2;stroke-dasharray:5 4}' +
      '.strip-bg{fill:' + t.paper2 + '}.strip-rule{stroke:' + t.rule + '}' +
      '.strip-num{font-family:"Noto Serif Bengali",serif;font-weight:700;fill:' + t.kantha + '}' +
      '.strip-txt{font-family:"Noto Sans Bengali",sans-serif;font-weight:700;fill:' + t.ink + '}' +
      '.strip-date{font-family:"Noto Sans Bengali",sans-serif;font-weight:400;fill:' + t.inkSoft + '}';

    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<svg xmlns="' + NS + '" width="' + vb.w + '" height="' + H +
      '" viewBox="0 0 ' + vb.w + ' ' + H + '" role="img" aria-label="আমার ৬৪ — বাংলাদেশের ৬৪ জেলার ম্যাপ">');
    out.push('<defs><style>' + esc(css) + '</style>');
    out.push('<pattern id="stitch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">' +
      '<rect width="7" height="7" fill="' + t.kanthaTint + '"/>' +
      '<line x1="0" y1="0" x2="0" y2="7" stroke="' + t.kanthaInk + '" stroke-width="1.6" stroke-dasharray="3.2 2.4" stroke-linecap="round"/>' +
      '</pattern>');
    if (hasP) { out.push('<clipPath id="ava-clip"><circle cx="54" cy="52" r="28"/></clipPath>'); }
    out.push('</defs>');

    if (bg !== "clear") { out.push('<rect class="bg" width="' + vb.w + '" height="' + H + '"/>'); }

    /* header band */
    out.push('<g class="header">');
    var tx = 26;
    if (hasP) {
      tx = 96;
      if (prof.photo) {
        out.push('<image href="' + esc(prof.photo) + '" x="26" y="24" width="56" height="56" ' +
          'preserveAspectRatio="xMidYMid slice" clip-path="url(#ava-clip)"/>');
      } else {
        out.push('<circle class="ava-empty" cx="54" cy="52" r="28"/>');
      }
      out.push('<circle class="ava-ring" cx="54" cy="52" r="28"/>');
    }
    out.push('<text class="h-title" x="' + tx + '" y="52">আমার ৬৪</text>');
    out.push('<text class="h-line" x="' + tx + '" y="86">' + esc(progressLine(s)) + '</text>');
    if (prof && prof.name) { out.push('<text class="h-name" x="' + (vb.w - 26) + '" y="52" text-anchor="end">' + esc(prof.name) + '</text>'); }
    out.push('<text class="h-date" x="' + (vb.w - 26) + '" y="86" text-anchor="end">' + esc(BN.date()) + '</text>');
    out.push('<line class="h-rule" x1="26" y1="' + (HEADER_H - 0.5) + '" x2="' + (vb.w - 26) + '" y2="' + (HEADER_H - 0.5) + '"/>');
    out.push('</g>');

    /* map */
    out.push('<g transform="translate(0,' + HEADER_H + ')">');
    if (bg !== "clear") { out.push('<rect class="bg" width="' + vb.w + '" height="' + vb.h + '"/>'); }
    ds.forEach(function (r) {
      var cls = visited.has(r.slug) ? "district visited" : (wish.has(r.slug) ? "district wish" : "district");
      out.push('<path class="' + cls + '" d="' + r.path + '"><title>' + esc(r.bn) + "</title></path>");
    });
    if (labels) {
      out.push('<g class="labels">');
      ds.forEach(function (r) {
        out.push('<text class="label" x="' + r.cx + '" y="' + (r.cy + r.labelSize / 3) +
          '" font-size="' + r.labelSize + '">' + esc(r.bn) + "</text>");
      });
      out.push("</g>");
    }
    out.push('</g>');

    /* stats strip */
    if (stats) {
      var cy = vb.h + strip / 2;
      out.push('<g transform="translate(0,' + HEADER_H + ')">');
      out.push('<rect class="strip-bg" x="0" y="' + vb.h + '" width="' + vb.w + '" height="' + strip + '"/>');
      out.push('<line class="strip-rule" x1="0" y1="' + (vb.h + 0.5) + '" x2="' + vb.w + '" y2="' + (vb.h + 0.5) + '"/>');
      out.push('<text class="strip-num" x="28" y="' + (cy + 16) + '" font-size="46">' + esc(BN.num(s.count) + "/৬৪") + "</text>");
      out.push('<text class="strip-txt" x="' + (vb.w / 2) + '" y="' + (cy + 8) + '" font-size="22" text-anchor="middle">' +
        esc("দেশের " + pctStr(s) + "% আয়তন · " + BN.num(s.divDone) + "/৮ বিভাগ শেষ · যেতে চাই " + BN.num(s.wish) + " জেলা") + "</text>");
      out.push('<text class="strip-date" x="' + (vb.w - 28) + '" y="' + (cy + 8) + '" font-size="24" text-anchor="end">' + esc(BN.date()) + "</text>");
      out.push("</g>");
    }
    out.push("</svg>");
    var str = out.join("");
    return { blob: new Blob([str], { type: "image/svg+xml;charset=utf-8" }), name: "amar-64-map.svg", svg: str, w: vb.w, h: H };
  }

  /* --------------------------------------------------- story / share posters
     Designed posters (background, title, map, numbers, date, profile) — never
     a raw map dump. Story is 1080x1920, the share card 1200x630. */
  function drawPoster(ctx, W, H, opts, prof) {
    opts = opts || {};
    var t = palette(opts.bg === "night" ? "night" : "paper");
    var wide = W > H;
    var s = A64.stats();
    var vb = VB();

    ctx.fillStyle = t.paper; ctx.fillRect(0, 0, W, H);
    var fr = Math.round(Math.min(W, H) * 0.028);
    ctx.strokeStyle = t.rule; ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
    ctx.strokeRect(fr, fr, W - 2 * fr, H - 2 * fr);
    var m = Math.round(Math.min(W, H) * 0.075);

    markDraw(wide ? "card-poster" : "story-poster");

    if (wide) {
      var mapH = H - 2 * m;
      var mapW = Math.round(mapH * (vb.w / vb.h));
      drawMapFitted(ctx, { x: m, y: m, w: mapW, h: mapH }, t, false, {});   /* names are 6px at this fit — off */
      var tx = m + mapW + Math.round(W * 0.055);
      drawPosterText(ctx, { x: tx, y: m, w: W - tx - m, h: H - 2 * m }, t, s, opts, "left", prof);
    } else {
      var headH = Math.round(H * 0.22);
      var footH = Math.round(H * (opts.credit ? 0.22 : 0.19));
      drawPosterText(ctx, { x: m, y: m, w: W - 2 * m, h: headH }, t, s, { subtitle: opts.subtitle, credit: false }, "head", prof);
      drawMapFitted(ctx, { x: m, y: m + headH, w: W - 2 * m, h: H - 2 * m - headH - footH }, t, false, {});
      drawPosterText(ctx, { x: m, y: H - m - footH, w: W - 2 * m, h: footH }, t, s, opts, "foot", prof);
    }
  }

  function drawPosterText(ctx, zone, t, s, opts, mode, prof) {
    ctx.textBaseline = "alphabetic";
    var hasName = !!(prof && prof.name);
    var hasImg = !!(prof && prof.img);

    if (mode === "left") {
      /* sized from the zone HEIGHT too: at 0.24·H the six stacked lines plus the
         date/url/credit block needed ~624px inside a 536px zone, so the date was
         painted through the wishlist line — the "strikethrough" on the card. */
      var titleSize = Math.round(Math.min(zone.w * 0.30, zone.h * 0.195));
      var subSize = Math.round(titleSize * 0.30);
      var bodySize = Math.round(titleSize * 0.28);
      var bigSize = Math.round(titleSize * 0.82);
      var y = zone.y + titleSize;
      ctx.textAlign = "left";

      ctx.fillStyle = t.ink; ctx.font = "700 " + titleSize + "px " + SERIF_F;
      ctx.fillText("আমার ৬৪", zone.x, y);

      if (hasName || hasImg) {
        var ar = Math.round(titleSize * 0.34);
        y += ar * 1.5;
        drawAvatar(ctx, zone.x + ar, y - ar * 0.7, ar, prof.img, t, initialOf(prof));   /* the card's own avatar */
        if (prof.name) {
          ctx.fillStyle = t.ink; ctx.font = "700 " + subSize + "px " + SANS_F;
          ctx.fillText(prof.name, zone.x + ar * 2 + subSize * 0.5, y);
        }
      }

      y += subSize * 1.1;
      ctx.strokeStyle = t.rule; ctx.lineWidth = Math.max(1, titleSize * 0.03);
      ctx.beginPath(); ctx.moveTo(zone.x, y); ctx.lineTo(zone.x + zone.w, y); ctx.stroke();

      y += bigSize * 1.2;
      ctx.font = "700 " + bigSize + "px " + SERIF_F; ctx.fillStyle = t.kantha;
      ctx.fillText(BN.num(s.count) + " / ৬৪", zone.x, y);

      y += bodySize * 1.7;
      ctx.font = "400 " + bodySize + "px " + SANS_F; ctx.fillStyle = t.ink;
      ctx.fillText("দেশের " + pctStr(s) + "% আয়তন · " + BN.num(s.divDone) + "/৮ বিভাগ শেষ", zone.x, y);

      /* "যেতে চাই ০ জেলা" is noise on a card — the wishlist only earns a line
         when there is something on it. */
      if (s.wish > 0) {
        y += bodySize * 1.6;
        ctx.fillStyle = t.indigo;
        ctx.fillText("যেতে চাই " + BN.num(s.wish) + " জেলা", zone.x, y);
      }

      /* The bottom block is anchored to the zone, but the last content line can
         reach it — the date used to be drawn straight through the wishlist line
         (that was the "strikethrough" on the card). Clear it, always. */
      ctx.fillStyle = t.inkSoft;
      var by = zone.y + zone.h;
      if (opts.credit) {
        ctx.font = "400 " + Math.round(bodySize * 0.72) + "px " + SANS_F;
        ctx.fillText(CREDIT, zone.x, by);
        by -= bodySize * 1.5;
      }
      /* a share card with no address is a dead end: say where the card came from */
      ctx.font = "700 " + Math.round(bodySize * 0.82) + "px " + SANS_F; ctx.fillStyle = t.inkSoft;
      ctx.fillText(SITE_URL(), zone.x, by);
      by -= bodySize * 1.4;
      ctx.font = "700 " + Math.round(bodySize * 0.92) + "px " + SANS_F; ctx.fillStyle = t.ink;
      ctx.fillText("তারিখ: " + BN.date(), zone.x, by);
      return;
    }

    ctx.textAlign = "center";
    var mid = zone.x + zone.w / 2;

    if (mode === "head") {
      var ts = Math.round(Math.min(zone.w * 0.22, zone.h * 0.42));
      var ss = Math.round(ts * 0.30);
      var hy = zone.y + ts;
      ctx.fillStyle = t.ink; ctx.font = "700 " + ts + "px " + SERIF_F;
      ctx.fillText("আমার ৬৪", mid, hy);

      if (hasName || hasImg) {
        var ar2 = Math.round(ts * 0.40);
        var nm = prof.name || "";
        ctx.font = "700 " + ss + "px " + SANS_F;
        var nw = nm ? ctx.measureText(nm).width : 0;
        var gap = (hasImg && nw) ? ss * 0.7 : 0;
        var total = (hasImg ? 2 * ar2 : 0) + gap + nw;
        var cur = mid - total / 2;
        var cyy = hy + ar2 * 1.7;
        if (hasImg) { drawAvatar(ctx, cur + ar2, cyy, ar2, prof.img, t, initialOf(prof)); cur += 2 * ar2 + gap; }
        if (nw) {
          ctx.textAlign = "left"; ctx.fillStyle = t.ink;
          ctx.font = "700 " + ss + "px " + SANS_F;
          ctx.fillText(nm, cur, cyy + ss * 0.35);
          ctx.textAlign = "center";
        }
        hy = cyy + ar2;
      }

      ctx.fillStyle = t.inkSoft; ctx.font = "400 " + Math.round(ss * 1.15) + "px " + SANS_F;
      ctx.fillText("দেশের " + pctStr(s) + "% আয়তন · " + BN.num(s.divDone) + "/৮ বিভাগ শেষ", mid, hy + ss * 2.4);
      return;
    }

    /* foot */
    var bs = Math.round(Math.min(zone.w * 0.20, zone.h * 0.42));
    var bss = Math.round(bs * 0.26);
    var fy = zone.y + bs * 0.95;
    ctx.fillStyle = t.kantha; ctx.font = "700 " + bs + "px " + SERIF_F;
    ctx.fillText(BN.num(s.count) + " / ৬৪", mid, fy);

    fy += bss * 1.8;
    ctx.fillStyle = t.ink; ctx.font = "400 " + bss + "px " + SANS_F;
    ctx.fillText("দেশের " + pctStr(s) + "% আয়তন · " + BN.num(s.divDone) + "/৮ বিভাগ · যেতে চাই " + BN.num(s.wish), mid, fy);

    fy += bss * 1.8;
    ctx.fillStyle = t.inkSoft; ctx.font = "400 " + Math.round(bss * 1.05) + "px " + SANS_F;
    ctx.fillText(BN.date(), mid, fy);

    if (opts.credit) {
      fy += bss * 1.6;
      ctx.font = "400 " + Math.round(bss * 0.82) + "px " + SANS_F;
      ctx.fillText(CREDIT, mid, fy);
    }
  }

  function buildPosterPNG(W, H, name, opts) {
    var canvas = mkCanvas(W, H);
    return whenReady()
      .then(function () { return ensureFonts(); })
      .then(function () { return loadProfile(opts); })
      .then(function (prof) {
        var ctx = canvas.getContext("2d");
        drawPoster(ctx, W, H, opts, prof);
        return toBlob(canvas, "image/png").then(function (blob) {
          return { blob: blob, name: name, canvas: canvas, w: W, h: H };
        });
      });
  }

  function subtitle() {
    var s = A64.stats();
    var copy = w.A64C && w.A64C.storyCopy;
    return copy && copy.sub
      ? copy.sub.replace("{n}", BN.num(s.count))
      : (BN.num(s.count) + " জেলায় দাগ — আমার ভ্রমণের খাতা");
  }

  /* ----------------------------------------------------------- public API
     Merge into any existing A64X so a sibling module (pdf, json, share)
     keeps its surface. */
  var A64X = w.A64X || {};

  A64X.version = A64X.version || "2.0.0";
  A64X.fontsReady = ensureFonts;
  A64X.ready = whenReady;

  A64X.png = function (opts) { return buildPNG(opts || {}); };
  A64X.svg = function (opts) {
    opts = opts || {};
    return whenReady()
      .then(function () { return ensureFonts(); })
      .then(function () { return loadProfile(opts); })
      .then(function (prof) { return buildSVG(opts, prof); });
  };
  A64X.story = function () {
    return buildPosterPNG(1080, 1920, "amar-64-story.png",
      { bg: "paper", subtitle: subtitle(), credit: false });
  };
  A64X.card = function () {
    return buildPosterPNG(1200, 630, "amar-64-card.png",
      { bg: "paper", subtitle: subtitle(), credit: true });
  };

  A64X.download = download;
  A64X.debug = function () {
    return { version: A64X.version, fontsResolved: fontsResolved, fontsResolvedAt: fontsResolvedAt, draws: draws.slice() };
  };

  w.A64X = A64X;
})(window, document);
