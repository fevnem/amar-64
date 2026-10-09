/* আমার ৬৪ — the app: state, the map, the arithmetic.
   Global: window.A64 (read by js/export.js). No dependencies. */
(function (w, d) {
  "use strict";

  var DATA_URL = "data/districts.json";
  var LS_KEY = "amar64.state.v1";
  var TOTAL_KM2 = 147570;

  var districts = [], bySlug = {}, viewBox = { w: 1000, h: 1381 };
  var nodes = {};           // slug -> path element
  var labelNodes = {};      // slug -> text element
  var visited = new Set(), wish = new Set();
  var undo = [];
  var mode = "visited";

  var $ = function (sel, root) { return (root || d).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
  var NS = "http://www.w3.org/2000/svg";

  /* ------------------------------------------------------------------ state */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ v: Array.from(visited), w: Array.from(wish) }));
    } catch (e) { /* private mode — the page still works */ }
  }

  function load() {
    var fromHash = decodeHash(location.hash);
    if (fromHash) { visited = new Set(fromHash.v); wish = new Set(fromHash.w); return; }
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (raw) { visited = new Set(raw.v || []); wish = new Set(raw.w || []); }
    } catch (e) { /* ignore */ }
  }

  /* --- share code: two 64-bit bitmaps -> base64url ------------------------- */
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
    var b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64), vb = [], wb = [];
    for (var i = 0; i < 16; i++) {
      var byte = i < bin.length ? bin.charCodeAt(i) : 0;
      for (var b = 0; b < 8; b++) {
        var on = !!(byte & (1 << b));
        if (i < 8) { if (on) vb.push(districts[i * 8 + b].slug); }
        else { if (on) wb.push(districts[(i - 8) * 8 + b].slug); }
      }
    }
    return { v: vb, w: wb };
  }

  function decodeHash(hash) {
    var m = /(?:^|[#&])d=([A-Za-z0-9_-]+)/.exec(hash || "");
    if (!m) return null;
    try { return fromBitmaps(m[1]); } catch (e) { return null; }
  }

  function shareURL() { return location.origin + location.pathname + "#d=" + bitmaps(); }

  /* ------------------------------------------------------------------ stats */
  function stats() {
    var area = 0, done = 0;
    districts.forEach(function (r) { if (visited.has(r.slug)) area += r.area_km2; });
    A64.divisions.forEach(function (dv) {
      if (dv.slugs.every(function (s) { return visited.has(s); })) done++;
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
  function buildDefs(svg) {
    var defs = d.createElementNS(NS, "defs");
    var pat = d.createElementNS(NS, "pattern");
    pat.setAttribute("id", "stitch");
    pat.setAttribute("width", "7"); pat.setAttribute("height", "7");
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    pat.setAttribute("patternTransform", "rotate(28)");
    var rect = d.createElementNS(NS, "rect");
    rect.setAttribute("width", "7"); rect.setAttribute("height", "7");
    rect.setAttribute("class", "stitch-bg");
    var line = d.createElementNS(NS, "line");
    line.setAttribute("x1", "0"); line.setAttribute("y1", "0");
    line.setAttribute("x2", "0"); line.setAttribute("y2", "7");
    line.setAttribute("class", "stitch-line");
    pat.appendChild(rect); pat.appendChild(line); defs.appendChild(pat);
    svg.insertBefore(defs, svg.firstChild);
    return defs;
  }

  function buildMap() {
    var svg = $("#bd-map");
    var g = $("#districts");
    var gl = $("#labels");
    viewBox.w = A64.viewBox.w; viewBox.h = A64.viewBox.h;
    svg.setAttribute("viewBox", "0 0 " + viewBox.w + " " + viewBox.h);
    buildDefs(svg);

    districts.forEach(function (r) {
      var p = d.createElementNS(NS, "path");
      p.setAttribute("d", r.path);
      p.setAttribute("data-slug", r.slug);
      p.setAttribute("role", "button");
      p.setAttribute("tabindex", "0");
      p.setAttribute("aria-pressed", "false");
      p.setAttribute("aria-label", r.bn + " জেলা, " + r.division_bn + " বিভাগ");
      p.setAttribute("class", "district");
      g.appendChild(p);
      nodes[r.slug] = p;

      var t = d.createElementNS(NS, "text");
      t.setAttribute("x", r.cx); t.setAttribute("y", r.cy + r.labelSize / 3);
      t.setAttribute("font-size", r.labelSize);
      t.setAttribute("data-slug", r.slug);
      t.textContent = r.bn;
      gl.appendChild(t);
      labelNodes[r.slug] = t;
    });
  }

  /* Labels are placed greedily, biggest district first: a name is shown at rest only when
     it fits inside its own shape and does not collide with one already placed. Anything
     hidden appears on hover/focus, so no name is ever lost. */
  var LABEL_PAD = 2;          /* user units — keeps the stitched halo from touching */
  /* the real rendered box, straight from the SVG: an estimate is never right for Bengali
     conjuncts, and the baseline offset differs from the geometric centre */
  function labelBox(r) {
    var t = labelNodes[r.slug];
    if (!t || !t.getBBox) return null;
    var b = t.getBBox();
    return { x: b.x - LABEL_PAD, y: b.y - LABEL_PAD, w: b.width + 2 * LABEL_PAD, h: b.height + 2 * LABEL_PAD };
  }
  function intersects(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }
  function declutterLabels() {
    /* no layout yet? every box would measure 0 and everything would look like it fits */
    var first = labelBox(districts[0]);
    if (!first || first.w <= 2 * LABEL_PAD) return;
    var placed = [];
    districts.slice().sort(function (a, b) { return b.area_km2 - a.area_km2; }).forEach(function (r) {
      var t = labelNodes[r.slug], box = labelBox(r);
      if (!box) return;
      var ok = box.w < r.w + 2 * LABEL_PAD && box.h < r.h + 2 * LABEL_PAD;
      if (ok) for (var i = 0; i < placed.length; i++) if (intersects(box, placed[i])) { ok = false; break; }
      var forced = t.getAttribute("data-force") === "1";
      t.classList.toggle("is-hidden", !ok && !forced);
      if (ok || forced) placed.push(box);
    });
    A64.labelsPlaced = placed.length;
  }
  function revealLabel(slug, on) {
    var t = labelNodes[slug];
    if (!t) return;
    if (on) t.classList.remove("is-hidden");
  }

  function paint() {
    districts.forEach(function (r) {
      var p = nodes[r.slug], isV = visited.has(r.slug), isW = wish.has(r.slug);
      p.classList.toggle("is-visited", isV);
      p.classList.toggle("is-wish", !isV && isW);
      p.setAttribute("aria-pressed", isV ? "true" : (isW ? "mixed" : "false"));
    });
    updateStats();
    updateDivisions();
    updateSeals();
  }

  /* Bengali copy from js/content.js is data, never markup */
  function fillCopy() {
    var C = w.A64C; if (!C) return;
    var about = $("#about-text");
    if (about && C.about) about.textContent = C.about;
    var tips = $("#tips");
    if (tips && C.tips) C.tips.forEach(function (t) {
      var li = d.createElement("li"); li.textContent = t; tips.appendChild(li);
    });
    if (C.divisionNotes) A64.divisions.forEach(function (dv) {
      var note = C.divisionNotes[dv.en];
      var row = $("#div-list li[data-div='" + dv.en + "'] .div-btn");
      if (note && row) row.setAttribute("title", note);
    });
    var empty = $("#stat-empty");
    if (empty && C.emptyState) empty.textContent = C.emptyState;
  }

  function updateStats() {
    var s = stats();
    var empty = $("#stat-empty");
    if (empty) empty.hidden = s.count > 0;
    $("#stat-count").textContent = BN.num(s.count);
    $("#stat-area").textContent = BN.dec(s.areaPct, s.areaPct < 10 ? 1 : 0);
    $("#stat-div").textContent = BN.num(s.divDone);
    $("#stat-wish").textContent = BN.num(s.wish);
    var rank = (w.A64C && w.A64C.rankFor) ? w.A64C.rankFor(s.count) : { bn: "" };
    $("#stat-rank").textContent = rank.bn || "";
    document.documentElement.style.setProperty("--progress", s.count / districts.length);
  }

  function updateDivisions() {
    A64.divisions.forEach(function (dv) {
      var n = dv.slugs.filter(function (s) { return visited.has(s); }).length;
      var row = $("#div-list li[data-div='" + dv.en + "']");
      if (!row) return;
      $(".cnt", row).textContent = BN.num(n) + "/" + BN.num(dv.slugs.length);
      $(".bar > i", row).style.width = (n / dv.slugs.length * 100) + "%";
      $(".div-btn", row).setAttribute("aria-pressed", n === dv.slugs.length ? "true" : (n ? "mixed" : "false"));
    });
  }

  function updateSeals() {
    A64.divisions.forEach(function (dv) {
      var el = $(".seal[data-div='" + dv.en + "']");
      if (!el) return;
      var n = dv.slugs.filter(function (s) { return visited.has(s); }).length;
      el.classList.toggle("is-done", n === dv.slugs.length);
      el.classList.toggle("is-part", n > 0 && n < dv.slugs.length);
      el.setAttribute("title", dv.bn + " — " + BN.num(n) + "/" + BN.num(dv.slugs.length));
    });
  }

  function buildRail() {
    var list = $("#div-list");
    A64.divisions.forEach(function (dv) {
      var li = d.createElement("li");
      li.setAttribute("data-div", dv.en);
      var b = d.createElement("button");
      b.type = "button"; b.className = "div-btn";
      b.setAttribute("aria-pressed", "false");
      var nameEl = d.createElement("span"); nameEl.textContent = dv.bn;
      var barEl = d.createElement("span"); barEl.className = "bar";
      barEl.appendChild(d.createElement("i"));
      var cntEl = d.createElement("span"); cntEl.className = "cnt"; cntEl.textContent = "০/০";
      b.appendChild(nameEl); b.appendChild(barEl); b.appendChild(cntEl);
      b.addEventListener("click", function () { toggleDivision(dv); });
      li.appendChild(b); list.appendChild(li);
    });

    var seals = $("#seals");
    A64.divisions.forEach(function (dv) {
      var el = d.createElement("div");
      el.className = "seal"; el.setAttribute("data-div", dv.en);
      el.textContent = dv.bn;
      seals.appendChild(el);
    });

    var names = $("#district-names");
    districts.forEach(function (r) {
      var o1 = d.createElement("option"); o1.value = r.bn; o1.label = r.division_bn + " বিভাগ"; names.appendChild(o1);
      var o2 = d.createElement("option"); o2.value = r.en; names.appendChild(o2);
    });
  }

  /* ------------------------------------------------------------------ edits */
  function setOne(slug, next) {
    if (next === "visited") { visited.add(slug); wish.delete(slug); }
    else if (next === "wish") { wish.add(slug); visited.delete(slug); }
    else { visited.delete(slug); wish.delete(slug); }
  }

  function toggle(slug, forceMode) {
    var m = forceMode || mode;
    var wasV = visited.has(slug), wasW = wish.has(slug);
    undo.push({ slug: slug, v: wasV, w: wasW });
    if (undo.length > 60) undo.shift();
    if (m === "wish") {
      if (wasW) setOne(slug, "none"); else setOne(slug, "wish");
    } else {
      if (wasV) setOne(slug, "none"); else setOne(slug, "visited");
    }
    paint(); save();
  }

  function toggleDivision(dv) {
    var all = dv.slugs.every(function (s) { return visited.has(s); });
    undo.push({ bulk: dv.slugs.slice(), v: Array.from(visited), w: Array.from(wish) });
    if (undo.length > 60) undo.shift();
    dv.slugs.forEach(function (s) { if (all) setOne(s, "none"); else setOne(s, "visited"); });
    paint(); save();
  }

  function doUndo() {
    var last = undo.pop();
    if (!last) return;
    if (last.bulk) { visited = new Set(last.v); wish = new Set(last.w); }
    else { setOne(last.slug, last.v ? "visited" : (last.w ? "wish" : "none")); }
    paint(); save();
  }

  function clearAll() {
    undo.push({ bulk: districts.map(function (r) { return r.slug; }), v: Array.from(visited), w: Array.from(wish) });
    visited = new Set(); wish = new Set();
    paint(); save();
  }

  /* ------------------------------------------------------------------ events */
  function bindMap() {
    var svg = $("#bd-map"), tip = $("#tip");

    svg.addEventListener("click", function (e) {
      var p = e.target.closest("path[data-slug]");
      if (p) toggle(p.getAttribute("data-slug"));
    });

    svg.addEventListener("keydown", function (e) {
      var p = e.target.closest("path[data-slug]");
      if (!p) return;
      var slug = p.getAttribute("data-slug");
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(slug); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); undo.push({ slug: slug, v: visited.has(slug), w: wish.has(slug) }); setOne(slug, "none"); paint(); save(); return; }
      var dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
      var dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();
      var here = bySlug[slug], best = null, bestScore = Infinity;
      districts.forEach(function (r) {
        if (r.slug === slug) return;
        var dx = (r.cx - here.cx) * dir[0] + (r.cy - here.cy) * dir[1];
        if (dx <= 6) return;
        var off = Math.abs((r.cx - here.cx) * dir[1] - (r.cy - here.cy) * dir[0]);
        var score = dx + off * 1.7;
        if (score < bestScore) { bestScore = score; best = r; }
      });
      if (best) nodes[best.slug].focus();
    });

    function showTip(r, x, y) {
      /* text only — never markup, so the tooltip can never carry anything executable */
      tip.hidden = false;
      tip.textContent = r.bn + " · " + r.division_bn + " · " + BN.group(r.area_km2) + " বর্গ কিমি";
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    }
    svg.addEventListener("pointerover", function (e) {
      var p = e.target.closest("path[data-slug]");
      if (!p) { tip.hidden = true; return; }
      var r = bySlug[p.getAttribute("data-slug")];
      var box = p.getBoundingClientRect(), wrap = $("#map").getBoundingClientRect();
      showTip(r, box.left - wrap.left + box.width / 2, box.top - wrap.top + 6);
      revealLabel(r.slug, true);
    });
    svg.addEventListener("pointerout", function (e) {
      tip.hidden = true;
      if (e.target.closest && e.target.closest("path[data-slug]") && A64.declutterOn) declutterLabels();
    });
    svg.addEventListener("focusin", function (e) {
      var p = e.target.closest("path[data-slug]");
      if (!p) return;
      var r = bySlug[p.getAttribute("data-slug")];
      var box = p.getBoundingClientRect(), wrap = $("#map").getBoundingClientRect();
      showTip(r, box.left - wrap.left + box.width / 2, box.top - wrap.top + 6);
      revealLabel(r.slug, true);
    });
    svg.addEventListener("focusout", function () { tip.hidden = true; if (A64.declutterOn) declutterLabels(); });
  }

  function bindControls() {
    $$('input[name="mode"]').forEach(function (el) {
      el.addEventListener("change", function () { mode = el.value; });
    });

    $("#btn-undo").addEventListener("click", doUndo);

    var clearBtn = $("#btn-clear"), armed = false;
    clearBtn.addEventListener("click", function () {
      if (!armed) {
        armed = true; clearBtn.textContent = "নিশ্চিত? আবার চাপুন";
        setTimeout(function () { armed = false; clearBtn.textContent = "সব মুছুন"; }, 4000);
        return;
      }
      armed = false; clearBtn.textContent = "সব মুছুন"; clearAll();
    });

    $("#btn-share").addEventListener("click", function () {
      var url = shareURL();
      history.replaceState(null, "", "#d=" + bitmaps());
      var msg = $("#copied");
      var done = function () { msg.textContent = "লিংক কপি হয়েছে — শেয়ার করলে দাগও যাবে।"; setTimeout(function () { msg.textContent = ""; }, 3500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { msg.textContent = url; });
      } else { msg.textContent = url; }
    });

    var search = $("#search");
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      districts.forEach(function (r) {
        var p = nodes[r.slug];
        var hit = !q || r.bn.includes(q) || r.en.toLowerCase().includes(q) || r.slug.includes(q);
        p.classList.toggle("is-dim", !!q && !hit);
        p.classList.toggle("is-match", !!q && hit);
        labelNodes[r.slug].classList.toggle("is-hidden", !!q && !hit);
        /* while a search is active, a matching name is forced visible; clearing the search
           hands the decision back to the declutter pass */
        if (q && hit) labelNodes[r.slug].setAttribute("data-force", "1");
        else labelNodes[r.slug].removeAttribute("data-force");
      });
      if (A64.declutterOn) declutterLabels();
    });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { search.value = ""; search.dispatchEvent(new Event("input")); return; }
      if (e.key !== "Enter") return;
      var q = search.value.trim().toLowerCase();
      if (!q) return;
      var hit = districts.filter(function (r) { return r.bn.includes(q) || r.en.toLowerCase().includes(q) || r.slug.includes(q); })[0];
      if (hit) { nodes[hit.slug].focus(); nodes[hit.slug].scrollIntoView({ block: "center", behavior: "smooth" }); }
    });

    var themeBtn = $("#theme-toggle");
    function applyTheme(night) {
      d.documentElement.classList.toggle("night", night);
      themeBtn.textContent = night ? "দিনের ম্যাপ" : "রাতের ম্যাপ";
      try { localStorage.setItem("amar64.theme", night ? "night" : "day"); } catch (e) {}
      if (A64.onThemeChange) A64.onThemeChange();
    }
    themeBtn.addEventListener("click", function () { applyTheme(!d.documentElement.classList.contains("night")); });
    var savedTheme = null;
    try { savedTheme = localStorage.getItem("amar64.theme"); } catch (e) {}
    if (savedTheme) applyTheme(savedTheme === "night");
    else if (w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme(true);
    else themeBtn.textContent = "রাতের ম্যাপ";
  }

  /* ------------------------------------------------------------------ API */
  var A64 = {
    districts: districts, bySlug: bySlug, viewBox: viewBox, TOTAL_KM2: TOTAL_KM2,
    divisions: [],
    state: function () { return { visited: visited, wish: wish, mode: mode }; },
    stats: stats,
    node: function (slug) { return nodes[slug]; },
    labelNode: function (slug) { return labelNodes[slug]; },
    toggle: toggle, doUndo: doUndo, clearAll: clearAll,
    shareURL: shareURL, bitmaps: bitmaps,
    setRaw: function (v, w) { visited = new Set(v || []); wish = new Set(w || []); paint(); save(); },
    declutter: declutterLabels,
    labelsPlaced: 0,
    declutterOn: false,
    labelMode: function (mode) {
      districts.forEach(function (r) {
        var t = labelNodes[r.slug];
        if (mode === "none") t.classList.add("is-hidden");
        else if (mode === "all") t.classList.remove("is-hidden");
        else t.classList.toggle("is-hidden", !visited.has(r.slug));
      });
      if (A64.declutterOn && mode !== "all") declutterLabels();
    },
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

  /* ------------------------------------------------------------------ boot */
  fetch(DATA_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      districts = data.districts;
      A64.districts = districts;
      viewBox.w = data.viewBox ? parseFloat(data.viewBox.split(" ")[2]) : 1000;
      viewBox.h = data.viewBox ? parseFloat(data.viewBox.split(" ")[3]) : 1381;
      A64.viewBox = viewBox;
      /* one flat size spills out of the little districts; scale each name to its own shape */
      districts.forEach(function (r) {
        bySlug[r.slug] = r;
        r.labelSize = Math.max(9.5, Math.min(17, Math.round(Math.min(r.w, r.h) * 0.30 * 2) / 2));
      });

      var divs = {};
      districts.forEach(function (r) {
        var key = r.division_en;
        if (!divs[key]) divs[key] = { en: key, bn: r.division_bn, slugs: [] };
        divs[key].slugs.push(r.slug);
      });
      var C = w.A64C;
      A64.divisions = C && C.divisionOrder
        ? C.divisionOrder.map(function (k) { return divs[k]; }).filter(Boolean)
        : Object.keys(divs).map(function (k) { return divs[k]; });

      load();
      buildMap();
      buildRail();
      fillCopy();
      paint();
      A64.declutterOn = true;
      /* text can only be measured once it is laid out AND the Bengali faces are in —
         both change the width, so the declutter waits for them and repeats on resize */
      var relayout = function () { w.requestAnimationFrame(declutterLabels); };
      relayout();
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(relayout);
      var rz;
      w.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(relayout, 150); });
      bindMap();
      bindControls();
      w.dispatchEvent(new CustomEvent("a64:ready", { detail: { districts: districts.length } }));
    })
    .catch(function (err) {
      var box = $("#map");
      if (box) box.innerHTML = '<p class="map-hint">ম্যাপের তথ্য আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।</p>';
      if (w.console) console.error(err);
    });
})(window, document);
