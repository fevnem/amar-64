/* আমার ৬৪ — every download in the "নামিয়ে নিন" panel.

   Global: window.A64X (also binds the panel buttons itself).
   Depends only on window.A64 (state + districts), window.BN (Bengali numerals
   and dates) and window.A64C (optional copy). No libraries, no build, no
   network: every file is composed in the browser from a Blob + a temporary
   <a download> element.

   Exports, matching the ids already in index.html:
     btn-png + png-size(1|2|3) + png-theme(paper|night|clear) + png-extra(labels|stats)
     btn-svg
     btn-pdf + pdf-size(a4|a3) + pdf-orient(portrait|landscape)   (hand-written PDF 1.4)
     btn-story (1080x1920)      btn-card (1200x630)
     btn-json (download)        file-json (upload)  */
(function (w, d) {
  "use strict";

  if (!w.A64) { return; }              /* nothing to export without the app */

  var NS = "http://www.w3.org/2000/svg";
  var $ = function (sel, root) { return (root || d).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
  var VB = function () { return A64.viewBox || { w: 1000, h: 1381 }; };

  /* ------------------------------------------------------------------ palette
     Hard-wired copies of the CSS tokens, so a PNG/PDF looks the same no matter
     which theme happens to be active while it is made. */
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
  var themeFor = function (name) { return name === "night" ? NIGHT : LIGHT; };
  var isNight = function () { return d.documentElement.classList.contains("night"); };

  /* font lists used across canvas text */
  var SANS = '"Noto Sans Bengali", "Noto Sans", system-ui, sans-serif';
  var SERIF = '"Noto Serif Bengali", "Noto Sans Bengali", serif';

  /* ---------------------------------------------------------------- fonts
     Canvas renders Bengali as tofu unless the webfont is fully loaded, so every
     export awaits document.fonts first. We also record *when* that happened so
     the proof is inspectable (A64X.debug). */
  var fontsPromise = null, fontsResolved = false, fontsResolvedAt = 0;

  function ensureFonts() {
    if (fontsPromise) { return fontsPromise; }
    var have = d.fonts;
    var specs = [
      '400 16px "Noto Sans Bengali"',
      '700 16px "Noto Sans Bengali"',
      '700 24px "Noto Serif Bengali"'
    ];
    var sample = "আমার ৬৪ বাংলাদেশ জেলা";
    var loads = [];
    if (have && have.load) {
      specs.forEach(function (s) {
        try { loads.push(have.load(s, sample)); } catch (e) { /* ignore */ }
      });
    }
    fontsPromise = Promise.all(loads)
      .then(function () { return (have && have.ready) ? have.ready : null; })
      .then(function () { fontsResolved = true; fontsResolvedAt = now(); return true; })
      .catch(function () { fontsResolved = true; fontsResolvedAt = now(); return false; });
    return fontsPromise;
  }

  function now() { return (w.performance && w.performance.now) ? w.performance.now() : Date.now(); }

  /* Every place we are about to draw Bengali text records the proof. */
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
    if (A64.districts && A64.districts.length) { return Promise.resolve(); }
    return new Promise(function (res) {
      w.addEventListener("a64:ready", function () { res(); }, { once: true });
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

  function paintBackground(ctx, W, H, t, mode) {
    if (mode === "clear") { return; }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.mapWater || t.mapBg);
    g.addColorStop(0.42, t.mapBg);
    g.addColorStop(1, t.mapBg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* Districts, drawn in viewBox coordinates (caller has already applied the
     scale transform). visited = kantha thread over a light tint; wish = dashed
     indigo outline; everything else = paper-3 with a hairline. */
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
      /* the running stitch: a dashed thread around the district */
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
      ctx.font = "700 " + r.labelSize + "px " + SANS;
      var x = r.cx, y = r.cy + r.labelSize / 3;
      ctx.lineWidth = 2.6; ctx.strokeStyle = t.mapBg;
      ctx.strokeText(r.bn, x, y);
      ctx.fillStyle = t.ink;
      ctx.fillText(r.bn, x, y);
    });
  }

  /* a strip of numbers below the map (PNG export) */
  function drawStatsStrip(ctx, t, x, y, wid, hgt) {
    var s = A64.stats();
    ctx.save();
    ctx.fillStyle = t.paper2; ctx.fillRect(x, y, wid, hgt);
    ctx.strokeStyle = t.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + wid, y + 0.5); ctx.stroke();
    var cy = y + hgt / 2;
    ctx.textBaseline = "middle";

    ctx.textAlign = "left"; ctx.fillStyle = t.kantha;
    ctx.font = "700 46px " + SERIF;
    ctx.fillText(BN.num(s.count) + "/৬৪", x + 28, cy);

    ctx.textAlign = "center"; ctx.fillStyle = t.ink;
    ctx.font = "700 22px " + SANS;
    ctx.fillText("দেশের " + BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0) + "% আয়তন · " +
      BN.num(s.divDone) + "/৮ বিভাগ শেষ · যেতে চাই " + BN.num(s.wish) + " জেলা", x + wid / 2, cy);

    ctx.textAlign = "right"; ctx.fillStyle = t.inkSoft;
    ctx.font = "400 24px " + SANS;
    ctx.fillText(BN.date(), x + wid - 28, cy);
    ctx.restore();
  }

  /* ---------------------------------------------------- PNG of the bare map */
  function buildMapCanvas(opts) {
    var scale = opts.scale || 2;
    var bg = opts.bg || "paper";
    var strip = opts.stats ? 168 : 0;
    var vb = VB();
    var cw = vb.w, ch = vb.h + strip;
    var canvas = mkCanvas(cw * scale, ch * scale);
    var ctx = canvas.getContext("2d");
    var t = themeFor(bg === "night" ? "night" : "paper");

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    paintBackground(ctx, cw, ch, t, bg);
    markDraw("map-png");
    drawDistricts(ctx, t);
    if (opts.labels) { drawLabels(ctx, t); }
    if (opts.stats) { drawStatsStrip(ctx, t, 0, vb.h, cw, strip); }
    return canvas;
  }

  /* ---------------------------------------------------------- fitted poster */
  function drawMapFitted(ctx, box, t, labels) {
    var vb = VB();
    var sc = Math.min(box.w / vb.w, box.h / vb.h);
    var dw = vb.w * sc, dh = vb.h * sc;
    var dx = box.x + (box.w - dw) / 2, dy = box.y + (box.h - dh) / 2;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(sc, sc);
    ctx.fillStyle = t.mapBg;
    ctx.fillRect(0, 0, vb.w, vb.h);
    ctx.strokeStyle = t.mapBorder; ctx.lineWidth = Math.max(0.8, 1 / sc);
    ctx.strokeRect(0.5, 0.5, vb.w - 1, vb.h - 1);
    drawDistricts(ctx, t);
    if (labels) { drawLabels(ctx, t); }
    ctx.restore();
  }

  function drawPosterText(ctx, zone, t, s, opts, mode) {
    ctx.textBaseline = "alphabetic";

    if (mode === "left") {
      var titleSize = Math.round(Math.min(zone.w * 0.30, zone.h * 0.20));
      var subSize = Math.round(titleSize * 0.34);
      var bodySize = Math.round(titleSize * 0.30);
      var bigSize = Math.round(titleSize * 0.95);
      var y = zone.y + titleSize;
      ctx.textAlign = "left";

      ctx.fillStyle = t.ink;
      ctx.font = "700 " + titleSize + "px " + SERIF;
      ctx.fillText("আমার ৬৪", zone.x, y);

      y += subSize * 1.35;
      ctx.font = "700 " + subSize + "px " + SANS;
      ctx.fillStyle = t.inkSoft;
      ctx.fillText(opts.subtitle, zone.x, y);

      y += subSize * 0.9;
      ctx.strokeStyle = t.rule; ctx.lineWidth = Math.max(1, titleSize * 0.03);
      ctx.beginPath(); ctx.moveTo(zone.x, y); ctx.lineTo(zone.x + zone.w, y); ctx.stroke();

      y += bigSize * 1.35;
      ctx.font = "700 " + bigSize + "px " + SERIF;
      ctx.fillStyle = t.kantha;
      ctx.fillText(BN.num(s.count) + " / ৬৪", zone.x, y);

      y += bodySize * 1.7;
      ctx.font = "400 " + bodySize + "px " + SANS;
      ctx.fillStyle = t.ink;
      ctx.fillText("দেশের " + BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0) + "% আয়তন · " +
        BN.num(s.divDone) + "/৮ বিভাগ শেষ", zone.x, y);

      y += bodySize * 1.7;
      ctx.fillStyle = t.indigo;
      ctx.fillText("যেতে চাই " + BN.num(s.wish) + " জেলা", zone.x, y);

      ctx.fillStyle = t.inkSoft;
      var by = zone.y + zone.h;
      if (opts.credit) {
        ctx.font = "400 " + Math.round(bodySize * 0.72) + "px " + SANS;
        ctx.fillText("ম্যাপ: geoBoundaries (CC BY 3.0 IGO) · ফন্ট: Noto (OFL)", zone.x, by);
        by -= bodySize * 1.5;
      }
      ctx.font = "700 " + Math.round(bodySize * 0.92) + "px " + SANS;
      ctx.fillStyle = t.ink;
      ctx.fillText("তারিখ: " + BN.date(), zone.x, by);
      return;
    }

    ctx.textAlign = "center";
    var mid = zone.x + zone.w / 2;

    if (mode === "head") {
      var ts = Math.round(Math.min(zone.w * 0.22, zone.h * 0.62));
      var ss = Math.round(ts * 0.34);
      var hy = zone.y + zone.h * 0.44;
      ctx.fillStyle = t.ink;
      ctx.font = "700 " + ts + "px " + SERIF;
      ctx.fillText("আমার ৬৪", mid, hy);
      ctx.font = "700 " + ss + "px " + SANS;
      ctx.fillStyle = t.inkSoft;
      ctx.fillText(opts.subtitle, mid, hy + ss * 1.7);
      return;
    }

    /* foot */
    var bs = Math.round(Math.min(zone.w * 0.20, zone.h * 0.5));
    var bss = Math.round(bs * 0.26);
    var fy = zone.y + bs * 0.95;
    ctx.fillStyle = t.kantha;
    ctx.font = "700 " + bs + "px " + SERIF;
    ctx.fillText(BN.num(s.count) + " / ৬৪", mid, fy);

    fy += bss * 1.8;
    ctx.fillStyle = t.ink;
    ctx.font = "400 " + bss + "px " + SANS;
    ctx.fillText("দেশের " + BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0) + "% আয়তন · " +
      BN.num(s.divDone) + "/৮ বিভাগ · যেতে চাই " + BN.num(s.wish), mid, fy);

    fy += bss * 1.8;
    ctx.fillStyle = t.inkSoft;
    ctx.font = "400 " + Math.round(bss * 1.05) + "px " + SANS;
    ctx.fillText(BN.date(), mid, fy);

    if (opts.credit) {
      fy += bss * 1.6;
      ctx.font = "400 " + Math.round(bss * 0.82) + "px " + SANS;
      ctx.fillText("ম্যাপ: geoBoundaries (CC BY 3.0 IGO) · ফন্ট: Noto (OFL)", mid, fy);
    }
  }

  function drawPoster(ctx, W, H, opts) {
    opts = opts || {};
    var t = themeFor(opts.theme === "night" ? "night" : "paper");
    var wide = W > H;
    var s = A64.stats();

    ctx.fillStyle = t.paper; ctx.fillRect(0, 0, W, H);

    var fr = Math.round(Math.min(W, H) * 0.028);
    ctx.strokeStyle = t.rule; ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
    ctx.strokeRect(fr, fr, W - 2 * fr, H - 2 * fr);

    var m = Math.round(Math.min(W, H) * 0.075);
    var subtitle = opts.subtitle || "৬৪ জেলার ভ্রমণ খাতা";

    markDraw(wide ? "card-poster" : "story-poster");

    if (wide) {
      var mapH = H - 2 * m;
      var mapW = Math.round(mapH * (VB().w / VB().h));
      drawMapFitted(ctx, { x: m, y: m, w: mapW, h: mapH }, t, true);
      var tx = m + mapW + Math.round(W * 0.055);
      drawPosterText(ctx, { x: tx, y: m, w: W - tx - m, h: H - 2 * m }, t, s, { subtitle: subtitle, credit: opts.credit }, "left");
    } else {
      var headH = Math.round(H * 0.20);
      var footH = Math.round(H * (opts.credit ? 0.23 : 0.20));
      drawPosterText(ctx, { x: m, y: m, w: W - 2 * m, h: headH }, t, s, { subtitle: subtitle, credit: false }, "head");
      drawMapFitted(ctx, { x: m, y: m + headH, w: W - 2 * m, h: H - 2 * m - headH - footH }, t, true);
      drawPosterText(ctx, { x: m, y: H - m - footH, w: W - 2 * m, h: footH }, t, s, { subtitle: subtitle, credit: opts.credit }, "foot");
    }
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
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.style.display = "none";
    d.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { d.body.removeChild(a); } catch (e) { /* gone */ }
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function raf() {
    return new Promise(function (r) {
      var done = false;
      var fin = function () { if (done) { return; } done = true; r(); };
      if (w.requestAnimationFrame) { w.requestAnimationFrame(fin); }
      /* a frame may never arrive on a throttled/headless tab — never stall */
      setTimeout(fin, 120);
    });
  }

  /* --------------------------------------------------------------- the PNG */
  function buildPNG(opts) {
    opts = opts || {};
    if (!opts.scale) { opts.scale = 2; }
    return ensureFonts().then(function () {
      var canvas = buildMapCanvas(opts);
      return toBlob(canvas, "image/png").then(function (blob) {
        return { blob: blob, name: "amar-64-map-" + opts.scale + "x.png", canvas: canvas, w: canvas.width, h: canvas.height };
      });
    });
  }

  /* ---------------------------------------------------------------- the SVG */
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

  function buildSVG(opts) {
    opts = opts || {};
    var bg = opts.bg || "paper";
    var t = themeFor(bg === "night" ? "night" : "paper");
    var vb = VB();
    markDraw("svg");
    var ds = A64.districts, st = A64.state();
    var visited = st.visited, wish = st.wish;
    var strip = opts.stats ? 168 : 0;
    var height = vb.h + strip;

    var css = FONT_FACES +
      '.bg{fill:' + t.mapBg + '}' +
      '.district{fill:' + t.paper3 + ';stroke:' + t.mapBorder + ';stroke-width:0.9;stroke-linejoin:round}' +
      '.district.wish{fill:' + t.wishFill + ';stroke:' + t.indigo + ';stroke-width:1.5;stroke-dasharray:4 3}' +
      '.district.visited{fill:url(#stitch);stroke:' + t.kanthaInk + ';stroke-width:1.6;stroke-dasharray:3.2 2.4;stroke-linejoin:round}' +
      '.label{font-family:"Noto Sans Bengali",sans-serif;font-weight:700;fill:' + t.ink +
      ';paint-order:stroke;stroke:' + t.mapBg + ';stroke-width:2.6;stroke-linejoin:round;text-anchor:middle;dominant-baseline:middle}' +
      '.strip-bg{fill:' + t.paper2 + '}.strip-rule{stroke:' + t.rule + '}' +
      '.strip-num{font-family:"Noto Serif Bengali",serif;font-weight:700;fill:' + t.kantha + '}' +
      '.strip-txt{font-family:"Noto Sans Bengali",sans-serif;font-weight:700;fill:' + t.ink + '}' +
      '.strip-date{font-family:"Noto Sans Bengali",sans-serif;font-weight:400;fill:' + t.inkSoft + '}';

    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<svg xmlns="' + NS + '" width="' + vb.w + '" height="' + height +
      '" viewBox="0 0 ' + vb.w + ' ' + height + '" role="img" aria-label="আমার ৬৪ — বাংলাদেশের ৬৪ জেলার ম্যাপ">');
    out.push('<defs><style>' + esc(css) + '</style>');
    out.push('<pattern id="stitch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">' +
      '<rect width="7" height="7" fill="' + t.kanthaTint + '"/>' +
      '<line x1="0" y1="0" x2="0" y2="7" stroke="' + t.kanthaInk + '" stroke-width="1.6" stroke-dasharray="3.2 2.4" stroke-linecap="round"/>' +
      '</pattern></defs>');
    if (bg !== "clear") {
      out.push('<rect class="bg" width="' + vb.w + '" height="' + height + '"/>');
    }
    out.push('<g>');
    ds.forEach(function (r) {
      var cls = visited.has(r.slug) ? "district visited" : (wish.has(r.slug) ? "district wish" : "district");
      out.push('<path class="' + cls + '" d="' + r.path + '"><title>' + esc(r.bn) + "</title></path>");
    });
    out.push("</g>");
    if (opts.labels !== false) {
      out.push('<g class="labels">');
      ds.forEach(function (r) {
        out.push('<text class="label" x="' + r.cx + '" y="' + (r.cy + r.labelSize / 3) +
          '" font-size="' + r.labelSize + '">' + esc(r.bn) + "</text>");
      });
      out.push("</g>");
    }
    if (strip) {
      var s = A64.stats();
      out.push('<g>');
      out.push('<rect class="strip-bg" x="0" y="' + vb.h + '" width="' + vb.w + '" height="' + strip + '"/>');
      out.push('<line class="strip-rule" x1="0" y1="' + (vb.h + 0.5) + '" x2="' + vb.w + '" y2="' + (vb.h + 0.5) + '"/>');
      var cy = vb.h + strip / 2;
      out.push('<text class="strip-num" x="28" y="' + (cy + 16) + '" font-size="46">' + esc(BN.num(s.count) + "/৬৪") + "</text>");
      out.push('<text class="strip-txt" x="' + (vb.w / 2) + '" y="' + (cy + 8) + '" font-size="22" text-anchor="middle">' +
        esc("দেশের " + BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0) + "% আয়তন · " + BN.num(s.divDone) + "/৮ বিভাগ শেষ · যেতে চাই " + BN.num(s.wish) + " জেলা") + "</text>");
      out.push('<text class="strip-date" x="' + (vb.w - 28) + '" y="' + (cy + 8) + '" font-size="24" text-anchor="end">' + esc(BN.date()) + "</text>");
      out.push("</g>");
    }
    out.push("</svg>");
    return { svg: out.join(""), name: "amar-64-map.svg" };
  }

  /* ------------------------------------------------- hand-written PDF 1.4
     A single page holding one DCTDecode (JPEG) image XObject of the poster,
     with a real xref table and trailer. No library. */
  function asciiBytes(str) {
    var a = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) { a[i] = str.charCodeAt(i) & 0xff; }
    return a;
  }
  function pad10(n) { return ("0000000000" + n).slice(-10); }
  function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

  function buildPDF(jpeg, imgW, imgH, pageW, pageH) {
    var parts = [], pos = 0, off = [0, 0, 0, 0, 0, 0];
    function put(u8) { parts.push(u8); pos += u8.length; }
    function putStr(s) { put(asciiBytes(s)); }

    putStr("%PDF-1.4\n");
    put(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   /* binary marker */

    off[1] = pos;
    putStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    off[2] = pos;
    putStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    off[3] = pos;
    putStr("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + fmt(pageW) + " " + fmt(pageH) +
      "] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n");

    var content = "q\n" + fmt(pageW) + " 0 0 " + fmt(pageH) + " 0 0 cm\n/Im0 Do\nQ\n";
    off[4] = pos;
    putStr("4 0 obj\n<< /Length " + content.length + " >>\nstream\n" + content + "endstream\nendobj\n");

    off[5] = pos;
    putStr("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + imgW + " /Height " + imgH +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    put(jpeg);
    putStr("\nendstream\nendobj\n");

    var xrefPos = pos;
    var xref = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) { xref += pad10(off[i]) + " 00000 n \n"; }
    xref += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
    putStr(xref);

    var out = new Uint8Array(pos), at = 0;
    for (var k = 0; k < parts.length; k++) { out.set(parts[k], at); at += parts[k].length; }
    return out;
  }

  function buildPDFPoster(opts) {
    opts = opts || {};
    var size = opts.size === "a3" ? "a3" : "a4";
    var page = size === "a3" ? { w: 841.89, h: 1190.55 } : { w: 595.276, h: 841.89 };
    if (opts.orient === "landscape") { var t0 = page.w; page.w = page.h; page.h = t0; }
    var baseW = size === "a3" ? 1754 : 1240;
    var W = Math.round(baseW);
    var H = Math.round(baseW * page.h / page.w);

    var canvas = mkCanvas(W, H);
    return ensureFonts()
      .then(function () {
        var ctx2 = canvas.getContext("2d");
        drawPoster(ctx2, W, H, { credit: true, subtitle: "৬৪ জেলার ভ্রমণ খাতা" });
        return toBlob(canvas, "image/jpeg", 0.92);
      })
      .then(function (jb) { return jb.arrayBuffer(); })
      .then(function (buf) {
        var jpeg = new Uint8Array(buf);
        var pdf = buildPDF(jpeg, W, H, page.w, page.h);
        return {
          blob: new Blob([pdf], { type: "application/pdf" }),
          name: "amar-64-poster-" + size + ".pdf",
          pageW: page.w, pageH: page.h, pxW: W, pxH: H, jpegBytes: jpeg.length
        };
      });
  }

  /* ------------------------------------------------- story / card posters */
  function buildPosterPNG(W, H, opts) {
    var canvas = mkCanvas(W, H);
    return ensureFonts().then(function () {
      var ctx = canvas.getContext("2d");
      drawPoster(ctx, W, H, opts);
      return toBlob(canvas, "image/png").then(function (blob) {
        return { blob: blob, name: opts.name, canvas: canvas, w: W, h: H };
      });
    });
  }

  /* -------------------------------------------------------------- JSON I/O */
  function jsonPayload() {
    var st = A64.state();
    var visited = [], wish = [];
    A64.districts.forEach(function (r) {
      if (st.visited.has(r.slug)) { visited.push(r.slug); }
      else if (st.wish.has(r.slug)) { wish.push(r.slug); }
    });
    return {
      app: "আমার ৬৪",
      appId: "amar-64",
      saved: new Date().toISOString(),
      visited: visited,
      wish: wish
    };
  }

  function importText(text) {
    var data = JSON.parse(text);
    var v = [], wl = [];
    var asSlugs = function (arr) {
      return (arr || []).map(function (x) { return (x && typeof x === "object") ? (x.slug || x.id) : x; })
        .filter(function (s) { return typeof s === "string"; });
    };
    if (Object.prototype.toString.call(data) === "[object Array]") { v = asSlugs(data); }
    else if (data && typeof data === "object") {
      v = asSlugs(data.visited || data.v);
      wl = asSlugs(data.wish || data.w);
    }
    var known = {};
    A64.districts.forEach(function (r) { known[r.slug] = true; });
    v = v.filter(function (s) { return known[s]; });
    wl = wl.filter(function (s) { return known[s] && v.indexOf(s) < 0; });
    A64.setRaw(v, wl);
    return { visited: v, wish: wl };
  }

  /* ------------------------------------------------------------------ chips */
  function singleSelect(box) {
    var chips = $$(".chip", box);
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        chips.forEach(function (x) { x.classList.remove("is-on"); });
        c.classList.add("is-on");
      });
    });
  }
  function multiToggle(box) {
    $$(".chip", box).forEach(function (c) {
      c.addEventListener("click", function () { c.classList.toggle("is-on"); });
    });
  }
  function chipVal(box, attr) {
    var on = $(".chip.is-on", box);
    return on ? on.getAttribute(attr) : null;
  }
  function pngOptions() {
    var scale = parseInt(chipVal($("#png-size"), "data-png"), 10) || 2;
    var bg = chipVal($("#png-theme"), "data-pngbg") || "paper";
    var extra = $("#png-extra");
    return {
      scale: scale, bg: bg,
      labels: !!$('.chip.is-on[data-pngopt="labels"]', extra),
      stats: !!$('.chip.is-on[data-pngopt="stats"]', extra)
    };
  }
  function pdfOptions() {
    return {
      size: chipVal($("#pdf-size"), "data-pdf") || "a4",
      orient: chipVal($("#pdf-orient"), "data-pdfor") || "portrait"
    };
  }

  /* ---------------------------------------------------------------- busy UI */
  function busy(btn, text) {
    if (!btn) { return; }
    if (btn.dataset.a64label === undefined) { btn.dataset.a64label = btn.textContent; }
    btn.textContent = text;
    btn.setAttribute("aria-busy", "true");
    btn.disabled = true;
  }
  function idle(btn) {
    if (!btn) { return; }
    if (btn.dataset.a64label !== undefined) { btn.textContent = btn.dataset.a64label; delete btn.dataset.a64label; }
    btn.removeAttribute("aria-busy");
    btn.disabled = false;
  }

  function run(btn, steps) {
    /* steps: a string is progress text; a fn() runs one step and its return
       value (if any) becomes the run's result (last one wins). */
    var result;
    var p = whenReady();
    steps.forEach(function (step) {
      if (typeof step === "string") {
        p = p.then(function () { busy(btn, step); return raf(); }).then(function () { return raf(); });
      } else {
        p = p.then(function () { return step(); }).then(function (r) {
          if (r !== undefined) { result = r; }
          return r;
        });
      }
    });
    return p.then(function () {
      if (btn) {
        btn.textContent = "নামানো হয়েছে ✓";
        setTimeout(function () { idle(btn); }, 1400);
      }
      return result;
    }, function (err) {
      if (w.console && w.console.error) { console.error("আমার ৬৪ export failed:", err); }
      if (btn) { busy(btn, "সমস্যা হয়েছে"); setTimeout(function () { idle(btn); }, 2200); }
      throw err;
    });
  }

  /* ------------------------------------------------------------------ bind */
  function bind() {
    if ($("#png-size")) { singleSelect($("#png-size")); }
    if ($("#png-theme")) { singleSelect($("#png-theme")); }
    if ($("#pdf-size")) { singleSelect($("#pdf-size")); }
    if ($("#pdf-orient")) { singleSelect($("#pdf-orient")); }
    if ($("#png-extra")) { multiToggle($("#png-extra")); }

    var btnPng = $("#btn-png");
    if (btnPng) {
      btnPng.addEventListener("click", function () {
        var opts = pngOptions();
        run(btnPng, [
          "ফন্ট তৈরি হচ্ছে…",
          function () { return ensureFonts(); },
          "ম্যাপ আঁকা হচ্ছে…",
          function () { return buildPNG(opts); }
        ]).then(function (out) {
          if (out && out.blob) { download(out.blob, out.name); }
        });
      });
    }

    var btnSvg = $("#btn-svg");
    if (btnSvg) {
      btnSvg.addEventListener("click", function () {
        var opts = pngOptions();
        run(btnSvg, [
          "SVG তৈরি হচ্ছে…",
          function () {
            var svg = buildSVG({ bg: opts.bg, labels: opts.labels, stats: opts.stats });
            var blob = new Blob([svg.svg], { type: "image/svg+xml;charset=utf-8" });
            download(blob, svg.name);
            return { blob: blob, name: svg.name };
          }
        ]);
      });
    }

    var btnPdf = $("#btn-pdf");
    if (btnPdf) {
      btnPdf.addEventListener("click", function () {
        var opts = pdfOptions();
        run(btnPdf, [
          "পোস্টার আঁকা হচ্ছে…",
          function () { return ensureFonts(); },
          "PDF সাজানো হচ্ছে…",
          function () { return buildPDFPoster(opts); }
        ]).then(function (out) {
          if (out && out.blob) { download(out.blob, out.name); }
        });
      });
    }

    var btnStory = $("#btn-story");
    if (btnStory) {
      btnStory.addEventListener("click", function () {
        var copy = w.A64C && w.A64C.storyCopy;
        var s = A64.stats();
        var sub = copy ? copy.sub.replace("{n}", BN.num(s.count)) : (BN.num(s.count) + " জেলায় দাগ — আমার ভ্রমণের খাতা");
        run(btnStory, [
          "স্টোরি কার্ড আঁকা হচ্ছে…",
          function () { return buildPosterPNG(1080, 1920, { name: "amar-64-story.png", subtitle: sub, credit: false }); }
        ]).then(function (res) { if (res && res.blob) { download(res.blob, res.name); } });
      });
    }

    var btnCard = $("#btn-card");
    if (btnCard) {
      btnCard.addEventListener("click", function () {
        var copy = w.A64C && w.A64C.storyCopy;
        var s = A64.stats();
        var sub = copy ? copy.sub.replace("{n}", BN.num(s.count)) : (BN.num(s.count) + " জেলায় দাগ — আমার ভ্রমণের খাতা");
        run(btnCard, [
          "শেয়ার কার্ড আঁকা হচ্ছে…",
          function () { return buildPosterPNG(1200, 630, { name: "amar-64-card.png", subtitle: sub, credit: true }); }
        ]).then(function (res) { if (res && res.blob) { download(res.blob, res.name); } });
      });
    }

    var btnJson = $("#btn-json");
    if (btnJson) {
      btnJson.addEventListener("click", function () {
        var payload = jsonPayload();
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        download(blob, "amar-64-state.json");
        var msg = $("#copied");
        if (msg) { msg.textContent = "JSON নামানো হয়েছে — " + BN.num(payload.visited.length) + " জেলা দাগসহ।"; setTimeout(function () { msg.textContent = ""; }, 3500); }
      });
    }

    var fileJson = $("#file-json");
    if (fileJson) {
      fileJson.addEventListener("change", function () {
        var file = fileJson.files && fileJson.files[0];
        if (!file) { return; }
        var msg = $("#copied");
        if (msg) { msg.textContent = "JSON পড়া হচ্ছে…"; }
        file.text().then(function (txt) {
          var res = importText(txt);
          if (msg) {
            msg.textContent = "JSON পড়া হয়েছে — " + BN.num(res.visited.length) + " গেছি, " + BN.num(res.wish.length) + " যেতে চাই।";
            setTimeout(function () { msg.textContent = ""; }, 4000);
          }
        }).catch(function (err) {
          if (msg) { msg.textContent = "JSON পড়া গেল না — ফাইলটি ঠিক আছে কিনা দেখুন।"; setTimeout(function () { msg.textContent = ""; }, 5000); }
          if (w.console && w.console.error) { console.error(err); }
        }).then(function () {
          try { fileJson.value = ""; } catch (e) { /* ignore */ }
        });
      });
    }
  }

  /* ----------------------------------------------------------- public API */
  var A64X = {
    version: "1.0.0",
    fontsReady: ensureFonts,
    ready: whenReady,
    png: function (opts) { return whenReady().then(function () { return ensureFonts(); }).then(function () { return buildPNG(opts || {}); }); },
    svg: function (opts) { return whenReady().then(function () { return buildSVG(opts || {}); }); },
    pdf: function (opts) { return whenReady().then(function () { return buildPDFPoster(opts || {}); }); },
    story: function () { return whenReady().then(function () { return buildPosterPNG(1080, 1920, { name: "amar-64-story.png", subtitle: BN.num(A64.stats().count) + " জেলায় দাগ — আমার ভ্রমণের খাতা", credit: false }); }); },
    card: function () { return whenReady().then(function () { return buildPosterPNG(1200, 630, { name: "amar-64-card.png", subtitle: BN.num(A64.stats().count) + " জেলায় দাগ — আমার ভ্রমণের খাতা", credit: true }); }); },
    json: function () { return jsonPayload(); },
    importText: importText,
    download: download,
    buildPDF: buildPDF,
    debug: function () { return { fontsResolved: fontsResolved, fontsResolvedAt: fontsResolvedAt, draws: draws.slice() }; }
  };
  w.A64X = A64X;

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", bind); }
  else { bind(); }
})(window, document);
