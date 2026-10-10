/* আমার ৬৪ — js/app.js  (v2 — the integration layer)
   Owns: the marks (state + localStorage + the share code), the summary card, the
   sheet, the search, undo/clear, the theme, the export wiring, and the profile/share
   mounts. Draws nothing: js/map.js owns the map and its labels, js/export-posters.js
   and js/pdf.js own the files, js/share.js the sharing, js/profile.js the traveller.

   window.A64 — the surface the other modules read (kept from v1, on purpose):
     districts · bySlug · viewBox {w,h} · divisions · labelsPlaced · palette()
     state() -> { visited:Set, wish:Set, mode }     (export-posters/pdf read .has())
     stats() -> { count, wish, areaKm2, areaPct, divDone, divTotal, left }
     shareURL() · bitmaps() · setRaw(v,w) · toggle(slug,mode) · doUndo() · clearAll()
   Emits on window AND document: a64:ready, a64:change, a64:theme
   0 dependencies. Load order: bn.js -> content.js -> map.js -> profile.js -> app.js
   -> export-posters.js -> pdf.js -> share.js                                          */
(function (w, d) {
  "use strict";

  var DATA_URL = "data/districts.json";
  var LS_KEY = "amar64.state.v1";
  var LS_THEME = "amar64.theme";
  var TOTAL_KM2 = 147572;

  var districts = [], bySlug = {}, viewBox = { w: 1000, h: 1381 };
  var visited = new Set(), wish = new Set();
  var undoStack = [];
  var mode = "visited";
  var map = null;

  var BN = w.BN || {};
  var $ = function (sel, root) { return (root || d).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
  function num(n) { return BN.num ? BN.num(n) : String(n); }
  function dec(n, p) { return BN.dec ? BN.dec(n, p) : String(n); }
  function emit(name, detail) {
    var ev;
    try { ev = new CustomEvent(name, { detail: detail || {} }); } catch (e) { ev = null; }
    if (!ev) return;
    try { w.dispatchEvent(ev); } catch (e2) { /* ignore */ }
    try { d.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e3) { /* ignore */ }
  }

  /* ------------------------------------------------------------------- toast */
  function toast(msg) {
    var el = $("#copied");
    if (!el) return;
    el.textContent = String(msg || "");
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; el.textContent = ""; }, 2600);
  }

  /* ------------------------------------------------------------------- state */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ v: Array.from(visited), w: Array.from(wish), mode: mode }));
    } catch (e) { /* private mode — the page still works */ }
  }

  /* the share code: two 64-bit bitmaps -> base64url (v1 format, so old links keep working) */
  function bitmaps() {
    var vb = new Uint8Array(8), wb = new Uint8Array(8);
    districts.forEach(function (r, i) {
      var byte = i >> 3, bit = 1 << (i & 7);
      if (visited.has(r.slug)) vb[byte] |= bit;
      if (wish.has(r.slug)) wb[byte] |= bit;
    });
    var all = new Uint8Array(16); all.set(vb, 0); all.set(wb, 8);
    var s = "";
    for (var i = 0; i < all.length; i++) s += String.fromCharCode(all[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBitmaps(code) {
    var b64 = String(code).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64), vb = [], wb = [];
    for (var i = 0; i < 16; i++) {
      var byte = i < bin.length ? bin.charCodeAt(i) : 0;
      for (var b = 0; b < 8; b++) {
        if (!(byte & (1 << b))) continue;
        if (i < 8) { if (districts[i * 8 + b]) vb.push(districts[i * 8 + b].slug); }
        else { if (districts[(i - 8) * 8 + b]) wb.push(districts[(i - 8) * 8 + b].slug); }
      }
    }
    return { v: vb, w: wb };
  }

  function decodeHash(hash) {
    var m = /(?:^|[#&?])d=([A-Za-z0-9_-]+)/.exec(hash || "");
    if (!m) return null;
    try { return fromBitmaps(m[1]); } catch (e) { return null; }
  }

  function shareURL() { return location.origin + location.pathname + "#d=" + bitmaps(); }

  function load() {
    var fromHash = decodeHash(location.hash) || decodeHash(location.search);
    if (fromHash) { visited = new Set(fromHash.v); wish = new Set(fromHash.w); return; }
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (raw) {
        visited = new Set((raw.v || []).filter(function (s) { return bySlug[s]; }));
        wish = new Set((raw.w || []).filter(function (s) { return bySlug[s]; }));
        if (raw.mode === "wish") mode = "wish";
      }
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------- stats */
  function stats() {
    var area = 0;
    districts.forEach(function (r) { if (visited.has(r.slug)) area += r.area_km2 || 0; });
    var done = 0;
    A64.divisions.forEach(function (dv) {
      if (dv.slugs.length && dv.slugs.every(function (s) { return visited.has(s); })) done++;
    });
    var n = visited.size;
    return {
      count: n,
      wish: wish.size,
      areaKm2: area,
      areaPct: Math.round((area / TOTAL_KM2) * 1000) / 10,
      divDone: done,
      divTotal: A64.divisions.length,
      left: districts.length - n
    };
  }

  /* ------------------------------------------------------------------ render */
  function setRing() {
    var ring = $("#ring");
    if (ring) ring.style.setProperty("--p", String(districts.length ? visited.size / districts.length : 0));
  }

  function fillCopy() {
    var C = w.A64C; if (!C) return;
    var about = $("#about-text");
    if (about && C.about) about.textContent = C.about;
    var tips = $("#tips");
    if (tips && C.tips) {
      tips.textContent = "";
      C.tips.forEach(function (t) { var li = d.createElement("li"); li.textContent = t; tips.appendChild(li); });
    }
    var empty = $("#stat-empty");
    if (empty && C.emptyState) empty.textContent = C.emptyState;
  }

  function updateStats() {
    var s = stats();
    var empty = $("#stat-empty");
    if (empty) empty.hidden = s.count > 0;
    var el;
    if ((el = $("#stat-count"))) el.textContent = num(s.count);
    if ((el = $("#progress-num"))) el.textContent = num(s.count);
    if ((el = $("#stat-area"))) el.textContent = dec(s.areaPct, s.areaPct < 10 ? 1 : 0);
    if ((el = $("#stat-div"))) el.textContent = num(s.divDone);
    if ((el = $("#stat-wish"))) el.textContent = num(s.wish);
    setRing();
  }

  function updateDivisions() {
    var grid = $("#div-grid");
    if (!grid) return;
    grid.textContent = "";
    A64.divisions.forEach(function (dv) {
      var n = dv.slugs.filter(function (s) { return visited.has(s); }).length;
      var li = d.createElement("li");
      li.className = "div-item";
      li.setAttribute("data-div", dv.en);
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.setAttribute("aria-pressed", n === dv.slugs.length && n > 0 ? "true" : (n ? "mixed" : "false"));
      if (n === dv.slugs.length && n > 0) li.classList.add("is-done");
      var note = (w.A64C && w.A64C.divisionNotes && w.A64C.divisionNotes[dv.en]) || "";
      if (note) li.title = note;
      /* one tap on a division marks the whole division (and a second tap clears it) */
      var bulk = function () { toggleDivision(dv); };
      li.addEventListener("click", bulk);
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bulk(); }
      });
      /* name · count · bar — text nodes only, never markup */
      var name = d.createElement("span"); name.className = "div-name"; name.textContent = dv.bn;
      var cnt = d.createElement("span"); cnt.className = "div-num"; cnt.textContent = num(n) + "/" + num(dv.slugs.length);
      var bar = d.createElement("span"); bar.className = "div-bar";
      var fill = d.createElement("i");
      fill.style.width = (dv.slugs.length ? (n / dv.slugs.length * 100) : 0) + "%";
      bar.appendChild(fill);
      li.appendChild(name); li.appendChild(cnt); li.appendChild(bar);
      grid.appendChild(li);
    });
  }

  var prevPaint = function () {};
  function paint() {
    updateStats();
    updateDivisions();
    prevPaint();
  }

  /* ------------------------------------------------------------------- edits */
  function setOne(slug, next) {
    if (next === "visited") { visited.add(slug); wish.delete(slug); }
    else if (next === "wish") { wish.add(slug); visited.delete(slug); }
    else { visited.delete(slug); wish.delete(slug); }
  }
  function snap() { return { v: Array.from(visited), w: Array.from(wish) }; }
  function pushUndo(entry) { undoStack.push(entry); if (undoStack.length > 60) undoStack.shift(); }

  function toggle(slug, forceMode) {
    if (!bySlug[slug]) return;
    var m = forceMode || mode;
    var wasV = visited.has(slug), wasW = wish.has(slug);
    pushUndo({ slug: slug, v: wasV, w: wasW });
    if (m === "wish") setOne(slug, wasW ? "none" : "wish");
    else setOne(slug, wasV ? "none" : "visited");
    paint(); save(); marksChanged();
  }

  function toggleDivision(dv) {
    if (!dv || !dv.slugs || !dv.slugs.length) return;
    var all = dv.slugs.every(function (s) { return visited.has(s); });
    pushUndo({ bulk: true, v: Array.from(visited), w: Array.from(wish) });
    dv.slugs.forEach(function (s) { setOne(s, all ? "none" : "visited"); });
    paint(); save(); marksChanged();
  }

  function doUndo() {
    var last = undoStack.pop();
    if (!last) { toast("ফেরানোর কিছু নেই"); return; }
    if (last.bulk) { visited = new Set(last.v); wish = new Set(last.w); }
    else setOne(last.slug, last.v ? "visited" : (last.w ? "wish" : "none"));
    paint(); save(); marksChanged();
    toast("শেষ কাজ ফেরানো হলো");
  }

  function clearAll() {
    pushUndo({ bulk: districts.map(function (r) { return r.slug; }), v: Array.from(visited), w: Array.from(wish) });
    visited = new Set(); wish = new Set();
    paint(); save(); marksChanged();
    toast("সব দাগ মুছে ফেলা হলো");
  }

  function setRaw(v, wl) {
    visited = new Set((v || []).filter(function (s) { return bySlug[s]; }));
    wish = new Set((wl || []).filter(function (s) { return bySlug[s] && !visited.has(s); }));
    paint(); save(); marksChanged();
  }

  function marksChanged() {
    emit("a64:change", { visited: Array.from(visited), wish: Array.from(wish), mode: mode, count: visited.size });
  }

  /* ------------------------------------------------------------------- theme */
  function applyTheme(night) {
    d.documentElement.classList.toggle("night", !!night);
    try { localStorage.setItem(LS_THEME, night ? "night" : "day"); } catch (e) { /* ignore */ }
    var sw = $("#theme-switch");
    if (sw) sw.checked = !!night;
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", night ? "#141a21" : "#f6efe1");
    if (A64.onThemeChange) A64.onThemeChange();
    emit("a64:theme", { night: !!night });
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(LS_THEME); } catch (e) { saved = null; }
    if (!saved && w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches) saved = "night";
    applyTheme(saved === "night");
  }

  /* ----------------------------------------------------------------- exports */
  function download(blob, name) {
    if (w.A64X && w.A64X.download) { w.A64X.download(blob, name); return; }
    var url = URL.createObjectURL(blob);
    var a = d.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    a.style.display = "none";
    d.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  function pngOpts() {
    var sc = $("#png-size .chip.is-on"), bg = $("#png-theme .chip.is-on");
    return {
      scale: sc ? +sc.getAttribute("data-png") : 2,
      bg: bg ? bg.getAttribute("data-pngbg") : "paper",
      labels: !!$("#png-extra .chip[data-pngopt='labels'].is-on"),
      stats: !!$("#png-extra .chip[data-pngopt='stats'].is-on")
    };
  }

  function busy(btn, work) {
    if (!btn) { work(); return; }
    var was = btn.textContent;
    btn.disabled = true; btn.textContent = "তৈরি হচ্ছে…";
    Promise.resolve(work()).then(function () {
      btn.disabled = false; btn.textContent = was;
    }, function (err) {
      btn.disabled = false; btn.textContent = was;
      toast("দুঃখিত — তৈরি করা গেল না");
      if (w.console) console.error("amar-64 export:", err);
    });
  }

  function wireExports() {
    var X = w.A64X, PDF = w.A64PDF;

    var png = $("#btn-png");
    if (png) png.addEventListener("click", function () {
      if (!X) { toast("ছবি তৈরির অংশ আসেনি"); return; }
      busy(this, function () {
        return X.png(pngOpts()).then(function (r) { download(r.blob, r.name); toast("ছবি নেমে গেছে ✓"); });
      });
    });

    var svg = $("#btn-svg");
    if (svg) svg.addEventListener("click", function () {
      if (!X) { toast("SVG তৈরির অংশ আসেনি"); return; }
      busy(this, function () {
        var o = pngOpts(); if (o.bg === "clear") o.bg = "paper";
        return X.svg(o).then(function (r) { download(r.blob, r.name); toast("SVG নেমে গেছে ✓"); });
      });
    });

    var pdf = $("#btn-pdf");
    if (pdf) pdf.addEventListener("click", function () {
      if (!PDF) { toast("PDF তৈরির অংশ আসেনি"); return; }
      var sz = $("#pdf-size .chip.is-on"), or = $("#pdf-orient .chip.is-on");
      busy(this, function () {
        return PDF.poster({
          size: sz ? sz.getAttribute("data-pdf") : "a4",
          orient: or ? or.getAttribute("data-pdfor") : "portrait"
        }).then(function (r) { download(r.blob, r.name); toast("পোস্টার নেমে গেছে ✓"); });
      });
    });

    var story = $("#btn-story");
    if (story) story.addEventListener("click", function () {
      if (!X) { toast("কার্ড তৈরির অংশ আসেনি"); return; }
      busy(this, function () { return X.story().then(function (r) { download(r.blob, r.name); toast("স্টোরি কার্ড নেমে গেছে ✓"); }); });
    });

    var card = $("#btn-card");
    if (card) card.addEventListener("click", function () {
      if (!X) { toast("কার্ড তৈরির অংশ আসেনি"); return; }
      busy(this, function () { return X.card().then(function (r) { download(r.blob, r.name); toast("কার্ড নেমে গেছে ✓"); }); });
    });

    /* one chip on per group */
    ["png-size", "png-theme", "pdf-size", "pdf-orient"].forEach(function (id) {
      $$("#" + id + " .chip").forEach(function (c) {
        c.addEventListener("click", function () {
          $$("#" + id + " .chip").forEach(function (o) { o.classList.remove("is-on"); o.setAttribute("aria-pressed", "false"); });
          c.classList.add("is-on"); c.setAttribute("aria-pressed", "true");
        });
      });
    });
    $$("#png-extra .chip").forEach(function (c) {
      c.setAttribute("aria-pressed", c.classList.contains("is-on") ? "true" : "false");
      c.addEventListener("click", function () {
        c.classList.toggle("is-on");
        c.setAttribute("aria-pressed", c.classList.contains("is-on") ? "true" : "false");
      });
    });

    /* JSON out / in — lives in the sheet, never on the main surface */
    var json = $("#btn-json");
    if (json) json.addEventListener("click", function () {
      var payload = {
        app: "আমার ৬৪", appId: "amar-64", version: 2,
        saved: new Date().toISOString(),
        visited: Array.from(visited), wish: Array.from(wish),
        stats: stats()
      };
      download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "amar-64-khata.json");
      toast("খাতা নেমে গেছে ✓");
    });
    var fin = $("#file-json");
    if (fin) fin.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var obj = null;
        try { obj = JSON.parse(String(fr.result)); } catch (err) { obj = null; }
        if (!obj) { toast("ফাইলটি পড়া গেল না"); return; }
        var v = obj.visited || obj.v || (Array.isArray(obj) ? obj : []);
        var wl = obj.wish || obj.w || [];
        setRaw(v, wl);
        toast("খাতা খোলা হলো ✓");
      };
      fr.readAsText(f);
      e.target.value = "";
    });
  }

  /* ------------------------------------------------------------------- sheet */
  function openSheet(target) {
    var sheet = $("#sheet");
    if (!sheet) return;
    if (typeof sheet.showModal === "function") { if (!sheet.open) sheet.showModal(); }
    else sheet.setAttribute("open", "");
    if (target) {
      var el = $(target);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
    }
  }
  function closeSheet() {
    var sheet = $("#sheet");
    if (!sheet) return;
    if (typeof sheet.close === "function" && sheet.open) sheet.close();
    else sheet.removeAttribute("open");
  }

  /* ------------------------------------------------------------------ search */
  function wireSearch() {
    var input = $("#search");
    if (!input) return;
    var list = $("#district-names");
    if (list) {
      list.textContent = "";
      districts.forEach(function (r) {
        var o1 = d.createElement("option"); o1.value = r.bn; o1.label = r.division_bn + " বিভাগ";
        list.appendChild(o1);
        var o2 = d.createElement("option"); o2.value = r.en;
        list.appendChild(o2);
      });
    }
    function hits(q) {
      return districts.filter(function (r) {
        return r.bn.indexOf(q) > -1 || r.en.toLowerCase().indexOf(q) > -1 || r.slug.indexOf(q) > -1;
      });
    }
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      if (!map) return;
      if (!q) { if (map.clearDim) map.clearDim(); return; }
      var hit = {}; hits(q).forEach(function (r) { hit[r.slug] = 1; });
      if (map.setDim) map.setDim(function (r) { return !!hit[r.slug]; });
      var first = hits(q)[0];
      if (first && map.focus) map.focus(first.slug);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); return; }
      if (e.key !== "Enter") return;
      var q = input.value.trim().toLowerCase();
      if (!q) return;
      var hit = hits(q)[0];
      if (hit) { toggle(hit.slug); input.value = ""; if (map && map.clearDim) map.clearDim(); }
    });
  }

  /* ----------------------------------------------------------------- controls */
  function bindControls() {
    $$(".chip[data-mode]").forEach(function (c) {
      if (c.getAttribute("data-mode") === mode) { c.classList.add("is-on"); c.setAttribute("aria-pressed", "true"); }
      c.addEventListener("click", function () {
        mode = c.getAttribute("data-mode");
        $$(".chip[data-mode]").forEach(function (o) {
          var on = o === c;
          o.classList.toggle("is-on", on);
          o.setAttribute("aria-pressed", on ? "true" : "false");
        });
        if (map && map.setMode) map.setMode(mode);
        save();
      });
    });

    $$("#btn-share, #btn-share-primary, #btn-share-bar").forEach(function (b) {
      b.addEventListener("click", function () { openSheet("#share-row"); });
    });
    $$("#btn-sheet, #btn-sheet-bar").forEach(function (b) {
      b.addEventListener("click", function () { openSheet(); });
    });
    var av = $("#avatar-masthead");
    if (av) av.addEventListener("click", function () { openSheet("#profile"); });

    var close = $("#sheet-close");
    if (close) close.addEventListener("click", closeSheet);

    var u = $("#btn-undo");
    if (u) u.addEventListener("click", doUndo);

    var th = $("#theme-switch");
    if (th) th.addEventListener("change", function () { applyTheme(th.checked); });

    var clr = $("#btn-clear"), conf = $("#confirm");
    if (clr) clr.addEventListener("click", function () {
      if (conf && typeof conf.showModal === "function") { if (!conf.open) conf.showModal(); }
      else if (w.confirm("সব দাগ মুছে ফেলবেন?")) clearAll();
    });
    var yes = $("#confirm-yes"), no = $("#confirm-no");
    if (yes) yes.addEventListener("click", function () { if (conf && conf.close) conf.close(); clearAll(); });
    if (no) no.addEventListener("click", function () { if (conf && conf.close) conf.close(); });

    d.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

    w.addEventListener("hashchange", function () {
      var fromHash = decodeHash(location.hash);
      if (fromHash) setRaw(fromHash.v, fromHash.w);
    });

    var rz; function relayout() { if (map && map.relayout) map.relayout(); }
    w.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(relayout, 150); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(relayout);
  }

  /* ------------------------------------------------------------------- API */
  var A64 = {
    version: "2.0",
    districts: districts,
    bySlug: bySlug,
    viewBox: viewBox,
    divisions: [],
    labelsPlaced: 0,
    TOTAL_KM2: TOTAL_KM2,
    state: function () { return { visited: visited, wish: wish, mode: mode }; },
    stats: stats,
    node: function (slug) { return map && map.node ? map.node(slug) : null; },
    labelNode: function (slug) { return map && map.labelNode ? map.labelNode(slug) : null; },
    toggle: toggle,
    doUndo: doUndo,
    clearAll: clearAll,
    shareURL: shareURL,
    bitmaps: bitmaps,
    setRaw: setRaw,
    toast: toast,
    openSheet: openSheet,
    palette: function () {
      var cs = getComputedStyle(d.documentElement), get = function (n) { return cs.getPropertyValue(n).trim(); };
      return {
        paper: get("--paper"), paper2: get("--paper-2"), paper3: get("--paper-3"),
        ink: get("--ink"), inkSoft: get("--ink-soft"), rule: get("--rule"),
        kantha: get("--kantha"), kanthaInk: get("--kantha-ink"), kanthaFill: get("--kantha-fill"),
        indigo: get("--indigo"), marigold: get("--marigold"), leaf: get("--leaf"),
        mapBg: get("--map-bg"), mapWater: get("--map-water"), mapBorder: get("--map-border"),
        seal: get("--seal")
      };
    },
    onThemeChange: null
  };
  w.A64 = A64;

  /* ------------------------------------------------------------------- boot */
  fetch(DATA_URL)
    .then(function (r) { if (!r.ok) throw new Error("data " + r.status); return r.json(); })
    .then(function (data) {
      districts = data.districts || [];
      A64.districts = districts;
      var vb = (data.viewBox || "0 0 1000 1381").split(/\s+/);
      viewBox.w = parseFloat(vb[2]) || 1000;
      viewBox.h = parseFloat(vb[3]) || 1381;
      A64.viewBox = viewBox;

      districts.forEach(function (r) {
        bySlug[r.slug] = r;
        if (!r.labelSize) r.labelSize = Math.max(9.5, Math.min(17, Math.round(Math.min(r.w, r.h) * 0.30 * 2) / 2));
      });

      var divs = {};
      districts.forEach(function (r) {
        var key = r.division_en;
        if (!divs[key]) divs[key] = { en: key, bn: r.division_bn, slugs: [] };
        divs[key].slugs.push(r.slug);
      });
      var C = w.A64C;
      A64.divisions = (C && C.divisionOrder)
        ? C.divisionOrder.map(function (k) { return divs[k]; }).filter(Boolean)
        : Object.keys(divs).map(function (k) { return divs[k]; });
      A64.divisions.forEach(function (dv) {
        if (!dv.bn) dv.bn = (divs[dv.en] && divs[dv.en].bn) || dv.en;
      });

      load();

      /* the map belongs to js/map.js now — this only hands it the data and the marks */
      var svg = $("#bd-map");
      if (svg && w.A64M) {
        map = w.A64M.mount({
          svg: svg,
          districts: districts,
          viewBox: "0 0 " + viewBox.w + " " + viewBox.h,
          state: { visited: visited, wish: wish, mode: mode },
          onChange: function (e) { toggle(e.slug, e.mode); }
        });
        if (map && map.setMode) map.setMode(mode);
        prevPaint = function () { if (map && map.refresh) map.refresh({ visited: visited, wish: wish }); };
      }

      fillCopy();

      /* a phone has no Tab key: the keyboard sentence is desktop-only advice */
      var hint = $(".map-hint");
      var touch = ("ontouchstart" in w) || (navigator.maxTouchPoints || 0) > 0 ||
        (w.matchMedia && w.matchMedia("(hover: none) and (pointer: coarse)").matches);
      if (hint && touch) hint.textContent = "চাপলে দাগ পড়ে, আবার চাপলে মুছে যায়।";
      paint();
      A64.labelsPlaced = (map && map.labelsPlaced) || 0;

      wireExports();
      wireSearch();
      bindControls();
      initTheme();

      /* the traveller + the sharing row (§8, §10) */
      if (w.A64P) {
        try { if ($("#profile")) w.A64P.mount($("#profile")); } catch (e) { /* degrade quietly */ }
        if (w.A64P.applyAvatar && $("#avatar-masthead")) w.A64P.applyAvatar($("#avatar-masthead"));
      }
      if (w.A64S && $("#share-row")) {
        try { w.A64S.mount($("#share-row")); } catch (e2) { /* degrade quietly */ }
      }

      emit("a64:ready", { districts: districts.length, count: visited.size });
    })
    .catch(function (err) {
      var hint = $(".map-hint");
      if (hint) hint.textContent = "ম্যাপের তথ্য আনা গেল না — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।";
      if (w.console) console.error("amar-64:", err);
    });
})(window, document);