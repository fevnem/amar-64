/* আমার ৬৪ — hand-written PDF 1.4 poster export (contract §9).

   Global: window.A64PDF
     poster({ size:'a4'|'a3', orient:'portrait'|'landscape' })
       -> Promise<{ blob, name, page:{w,h}, px:{w,h}, bytes }>
       name = "amar-64-poster-a4.pdf" | "amar-64-poster-a3.pdf"

   No libraries, no build, no network. The whole poster is rasterised onto a
   canvas at 150 dpi, JPEG-encoded, and embedded as a single /DCTDecode image
   XObject inside a minimal PDF 1.4 file:

       %PDF-1.4
       1 catalog -> 2 pages -> 3 page (MediaBox in POINTS) -> 4 content -> 5 image
       xref table with a byte offset for every object, trailer /Size + /Root, %%EOF

   Depends on window.A64 (state + districts), window.BN (Bengali numerals/date)
   and, when present, window.A64P (§8 profile: name + photo). With no profile
   the header renders exactly as without one. */
(function (w, d) {
  "use strict";

  if (!w.A64) { return; }

  var DPI = 150;

  /* page size, in points, exactly as §9 demands */
  var PAGE = {
    a4: { w: 595.28, h: 841.89 },
    a3: { w: 841.89, h: 1190.55 }
  };

  /* ---------------------------------------------------------------- palette
     A frozen copy of the light (khata-paper) tokens, so the poster never
     changes with the on-screen theme. */
  var T = {
    paper: "#f6efe1", paper2: "#fffbf2", paper3: "#efe6d3",
    ink: "#1a2430", inkSoft: "#5b6673", rule: "#dbd0b8",
    mapBg: "#f9f4e8", mapWater: "#e7eef2", mapBorder: "#c9bda3",
    kantha: "#bb3a3a", kanthaInk: "#8d2626",
    kanthaTint: "rgba(187,58,58,.10)", kanthaFill: "rgba(187,58,58,.17)",
    wishFill: "rgba(29,78,115,.07)", indigo: "#1d4e73"
  };

  var SANS = '"Noto Sans Bengali","Noto Sans",system-ui,sans-serif';
  var SERIF = '"Noto Serif Bengali","Noto Sans Bengali",serif';
  var CREDIT = "ম্যাপ: geoBoundaries (CC BY 3.0 IGO) · ফন্ট: Noto (OFL)";

  /* ---------------------------------------------------------------- helpers */
  function now() { return (w.performance && w.performance.now) ? w.performance.now() : Date.now(); }

  function fmt(n) { return (Math.round(n * 100) / 100).toString(); }
  function pad10(n) { return ("0000000000" + n).slice(-10); }

  /* points -> canvas pixels at 150 dpi */
  function pxAt(pt) { return Math.round((pt / 72) * DPI); }

  function mkCanvas(W, H) {
    var c = d.createElement("canvas");
    c.width = Math.max(1, Math.round(W));
    c.height = Math.max(1, Math.round(H));
    return c;
  }

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

  /* ---------------------------------------------------------------- fonts
     Bengali renders as tofu on a canvas unless the faces are in, so every
     poster awaits document.fonts first. */
  var fontsPromise = null, fontsResolved = false, fontsResolvedAt = 0;

  function ensureFonts() {
    if (fontsPromise) { return fontsPromise; }
    var have = d.fonts, specs = [
      '400 16px "Noto Sans Bengali"',
      '700 16px "Noto Sans Bengali"',
      '400 16px "Noto Serif Bengali"',
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

  function whenReady() {
    if (w.A64.districts && w.A64.districts.length) { return Promise.resolve(); }
    return new Promise(function (res) {
      w.addEventListener("a64:ready", function () { res(); }, { once: true });
    });
  }

  /* ------------------------------------------------------------------- map */
  var pathCache = {};
  function pathOf(rec) {
    if (!pathCache[rec.slug]) { pathCache[rec.slug] = new Path2D(rec.path); }
    return pathCache[rec.slug];
  }

  function drawDistricts(ctx, t) {
    var ds = w.A64.districts, st = w.A64.state();
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
      /* the running stitch — the one place red is spent on surface area */
      ctx.setLineDash([3.2, 2.4]); ctx.lineWidth = 1.6; ctx.strokeStyle = t.kanthaInk; ctx.stroke(p);
      ctx.setLineDash([]);
    });
  }

  function drawLabels(ctx, t) {
    var ds = w.A64.districts;
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

  /* fit the districts viewBox into a pixel box, centred */
  function drawMapFitted(ctx, box, t) {
    var vb = w.A64.viewBox || { w: 1000, h: 1381 };
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
    drawLabels(ctx, t);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- profile
     §8 profile from window.A64P.load(); optional, never fatal. */
  function getProfile() {
    var P = w.A64P;
    if (!P || typeof P.load !== "function") { return Promise.resolve(null); }
    var out;
    try { out = P.load(); } catch (e) { out = null; }
    return Promise.resolve(out).then(function (p) {
      if (!p) { return null; }
      if (typeof p === "string") { p = { name: p }; }
      if (!p.name && !p.photo) { return null; }
      return { name: (p.name || "").slice(0, 24), photo: p.photo || null };
    }).catch(function () { return null; });
  }

  function loadImage(src) {
    return new Promise(function (res) {
      if (!src) { return res(null); }
      try {
        var im = new Image();
        im.onload = function () { res(im); };
        im.onerror = function () { res(null); };
        im.src = src;
      } catch (e) { res(null); }
    });
  }

  /* avatar + name in a row; returns the height consumed. align:'center'|'left' */
  function drawProfile(ctx, x, y, width, titleSize, prof, img, align) {
    if (!prof || (!prof.name && !img)) { return 0; }
    var d0 = Math.round(titleSize * 0.60);
    var nameSize = Math.round(titleSize * 0.34);
    var gap = Math.round(d0 * 0.34);

    ctx.font = "700 " + nameSize + "px " + SANS;
    var nameW = prof.name ? ctx.measureText(prof.name).width : 0;
    var totalW = (img ? d0 : 0) + (img && nameW ? gap : 0) + nameW;
    var startX = align === "left" ? x : (x + (width - totalW) / 2);
    var cyc = y + d0 / 2;

    if (img) {
      ctx.save();
      ctx.beginPath(); ctx.arc(startX + d0 / 2, cyc, d0 / 2, 0, Math.PI * 2); ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, startX, y, d0, d0);
      ctx.restore();
      ctx.beginPath(); ctx.arc(startX + d0 / 2, cyc, d0 / 2, 0, Math.PI * 2);
      ctx.strokeStyle = T.rule; ctx.lineWidth = Math.max(1, d0 * 0.035); ctx.stroke();
    }
    if (prof.name) {
      ctx.fillStyle = T.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = "700 " + nameSize + "px " + SANS;
      ctx.fillText(prof.name, startX + (img ? d0 + gap : 0), cyc + nameSize * 0.06);
    }
    return d0;
  }

  /* --------------------------------------------------------------- poster
     Draws the whole poster into the given 2d context at pixel size W x H.
     title (big) + profile (if set) + marked map + stats + date + credit. */
  function drawPoster(ctx, W, H, prof, img) {
    var t = T, s = w.A64.stats();
    var min = Math.min(W, H);
    var wide = W > H;

    ctx.fillStyle = t.paper; ctx.fillRect(0, 0, W, H);

    /* frame */
    var fr = Math.round(min * 0.028);
    ctx.strokeStyle = t.rule; ctx.lineWidth = Math.max(2, min * 0.004);
    ctx.strokeRect(fr, fr, W - 2 * fr, H - 2 * fr);

    var M = Math.round(min * 0.085);              /* content margin */
    var titleSize = Math.round(min * 0.145);
    var statSize = Math.round(min * 0.038);
    var dateSize = Math.round(min * 0.030);
    var creditSize = Math.round(min * 0.026);

    ctx.textBaseline = "alphabetic";

    if (wide) {
      /* left text column, map on the right */
      var colW = Math.round(W * 0.36);
      var x = M;
      ctx.textAlign = "left";
      ctx.fillStyle = t.ink;
      ctx.font = "700 " + titleSize + "px " + SERIF;
      ctx.fillText("আমার ৬৪", x, M + titleSize);

      var yy = M + titleSize + Math.round(titleSize * 0.42);
      var ph = drawProfile(ctx, x, yy, colW, titleSize, prof, img, "left");
      yy += (ph || 0) + Math.round(min * 0.02);

      /* rule under the header block */
      yy += Math.round(min * 0.02);
      ctx.strokeStyle = t.rule; ctx.lineWidth = Math.max(1, min * 0.0022);
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + colW, yy); ctx.stroke();

      /* stats / date / credit anchored to the bottom of the column */
      var bx = x, byTop = H - M - (statSize * 1.5 + dateSize * 1.9 + creditSize * 2.1);
      ctx.fillStyle = t.kantha;
      ctx.font = "700 " + statSize + "px " + SANS;
      ctx.fillText(BN.num(s.count) + " / ৬৪ জেলা", bx, byTop + statSize);
      var by = byTop + statSize * 1.9;
      ctx.fillStyle = t.ink;
      ctx.font = "400 " + statSize + "px " + SANS;
      ctx.fillText("দেশের " + BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0) + "% আয়তন · " +
        BN.num(s.divDone) + "/" + BN.num(s.divTotal) + " বিভাগ", bx, by);
      by += dateSize * 1.9;
      ctx.fillStyle = t.inkSoft;
      ctx.font = "400 " + dateSize + "px " + SANS;
      ctx.fillText("তারিখ: " + BN.date(), bx, by);
      by += creditSize * 2.1;
      ctx.font = "400 " + creditSize + "px " + SANS;
      ctx.fillText(CREDIT, bx, by);

      var mapX = M + colW + Math.round(W * 0.03);
      drawMapFitted(ctx, { x: mapX, y: M, w: W - M - mapX, h: H - 2 * M }, t);
      return;
    }

    /* portrait — centred header, map, footer */
    ctx.textAlign = "center";
    ctx.fillStyle = t.ink;
    ctx.font = "700 " + titleSize + "px " + SERIF;
    ctx.fillText("আমার ৬৪", W / 2, M + titleSize);

    var cur = M + titleSize + Math.round(titleSize * 0.38);
    var ph2 = drawProfile(ctx, M, cur, W - 2 * M, titleSize, prof, img, "center");
    var headerBottom = cur + (ph2 || 0) + Math.round(min * 0.035);

    var footNeed = statSize * 2 + dateSize * 1.9 + creditSize * 2.2;
    var mapBottom = H - M - footNeed;

    drawMapFitted(ctx, { x: M, y: headerBottom, w: W - 2 * M, h: Math.max(1, mapBottom - headerBottom) }, t);

    var fyc = mapBottom + Math.round(statSize * 1.6);
    ctx.fillStyle = t.ink;
    ctx.font = "700 " + statSize + "px " + SANS;
    ctx.fillText(BN.num(s.count) + "/৬৪ জেলা · দেশের " +
      BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0) + "% আয়তন · " +
      BN.num(s.divDone) + "/" + BN.num(s.divTotal) + " বিভাগ", W / 2, fyc);

    fyc += Math.round(dateSize * 1.9);
    ctx.fillStyle = t.inkSoft;
    ctx.font = "400 " + dateSize + "px " + SANS;
    ctx.fillText("তারিখ: " + BN.date(), W / 2, fyc);

    fyc += Math.round(creditSize * 2.1);
    ctx.font = "400 " + creditSize + "px " + SANS;
    ctx.fillText(CREDIT, W / 2, fyc);
  }

  /* ---------------------------------------------- hand-written PDF 1.4 core */
  function asciiBytes(str) {
    var a = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) { a[i] = str.charCodeAt(i) & 0xff; }
    return a;
  }

  /* Builds the whole file as a Uint8Array. Objects:
       1 /Catalog  2 /Pages  3 /Page  4 content stream  5 /XObject image */
  function buildPdf(jpeg, imgW, imgH, pageW, pageH) {
    var parts = [], pos = 0, off = [0, 0, 0, 0, 0, 0];
    function put(bytes) { parts.push(bytes); pos += bytes.length; }
    function putStr(s) { put(asciiBytes(s)); }

    putStr("%PDF-1.4\n");
    /* binary comment so the file is unambiguously binary */
    put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    off[1] = pos;
    putStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    off[2] = pos;
    putStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    off[3] = pos;
    putStr("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
      fmt(pageW) + " " + fmt(pageH) + "] /Resources << /XObject << /Im0 5 0 R >> >> " +
      "/Contents 4 0 R >>\nendobj\n");

    var content = "q\n" + fmt(pageW) + " 0 0 " + fmt(pageH) + " 0 0 cm\n/Im0 Do\nQ\n";
    off[4] = pos;
    putStr("4 0 obj\n<< /Length " + content.length + " >>\nstream\n" + content + "endstream\nendobj\n");

    off[5] = pos;
    putStr("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + imgW + " /Height " + imgH +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length +
      " >>\nstream\n");
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

  /* -------------------------------------------------------------- assembly */
  var BUDGET = 560000;  /* keep the finished PDF safely under ~600 KB */

  function encodeJpeg(canvas) {
    var qs = [0.92, 0.86, 0.80, 0.72, 0.62, 0.52], i = 0;
    function attempt() {
      return toBlob(canvas, "image/jpeg", qs[i])
        .then(function (b) { return b.arrayBuffer(); })
        .then(function (buf) {
          if (buf.byteLength <= BUDGET || i >= qs.length - 1) { return new Uint8Array(buf); }
          i++; return attempt();
        });
    }
    return attempt();
  }

  function poster(opts) {
    opts = opts || {};
    var size = opts.size === "a3" ? "a3" : "a4";
    var orient = opts.orient === "landscape" ? "landscape" : "portrait";
    var page = { w: PAGE[size].w, h: PAGE[size].h };
    if (orient === "landscape") { var tmp = page.w; page.w = page.h; page.h = tmp; }

    var pxW = pxAt(page.w), pxH = pxAt(page.h);

    return whenReady()
      .then(function () { return ensureFonts(); })
      .then(function () { return getProfile(); })
      .then(function (prof) { return loadImage(prof && prof.photo).then(function (im) { return { prof: prof, im: im }; }); })
      .then(function (p) {
        var canvas = mkCanvas(pxW, pxH);
        var ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in ctx) { ctx.imageSmoothingQuality = "high"; }
        drawPoster(ctx, pxW, pxH, p.prof, p.im);
        return encodeJpeg(canvas).then(function (jpeg) {
          var bytes = buildPdf(jpeg, pxW, pxH, page.w, page.h);
          return {
            blob: new Blob([bytes], { type: "application/pdf" }),
            name: "amar-64-poster-" + size + ".pdf",
            page: { w: page.w, h: page.h },
            px: { w: pxW, h: pxH },
            jpegBytes: jpeg.length,
            bytes: bytes.length
          };
        });
      });
  }

  /* ------------------------------------------------------------ public API */
  w.A64PDF = {
    version: "1.0.0",
    poster: poster,
    fontsReady: ensureFonts,
    buildPdf: buildPdf,
    credit: CREDIT,
    debug: function () { return { fontsResolved: fontsResolved, fontsResolvedAt: fontsResolvedAt }; }
  };
})(window, document);
