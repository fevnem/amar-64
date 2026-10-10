/* আমার ৬৪ — js/map.js
   The map is the product: this file renders the 64 district paths from
   data/districts.json, owns their labels (one size from --t-micro, a strong
   halo, decluttered, revealed on hover/focus), the district interaction states
   (hover / focus / active), the roving-tabindex keyboard model (§11), and the
   legend-as-filter (§7). It keeps NO persisted state: js/app.js owns the marks
   and drives this module through mount() and refresh().

   Contract — window.A64M:
     mount({ svg, districts, state, onChange, legend, viewBox }) -> handle
        svg        the <svg> to draw into (element or selector)   [required]
        districts  the array from data/districts.json, or the parsed file object
        state      { visited, wish, mode } — visited/wish are Sets, arrays or maps
        onChange   fn({ slug, district, mode, current, next, event })
                   fired when a district is activated by pointer or by Enter/Space
        legend     the .legend element/selector; discovered from the svg otherwise
        viewBox    default "0 0 1000 1381"
     refresh(state)  repaint is-visited / is-wish / is-none from { visited, wish }
     Plus: node(slug) · labelNode(slug) · setFilter(layer) · clearFilter() ·
           setMode(mode) · setDim(predicate)/clearDim · relayout() · focus(slug) ·
           destroy(). A64M.districts / bySlug / viewBox / labelsPlaced are live.

   DOM-only, dependency-free, classic script. Load it BEFORE js/app.js. */
(function (w, d) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var DEFAULT_VB = "0 0 1000 1381";
  var LABEL_PAD = 4;          /* user units of breathing room so a halo never kisses a neighbour */
  var LAYERS = ["visited", "wish", "none"];

  /* ------------------------------------------------------------------ helpers */
  function el(name) { return d.createElementNS(NS, name); }
  function setAttrs(node, attrs) { for (var k in attrs) node.setAttribute(k, attrs[k]); return node; }
  function cssVar(name, fallback) {
    var v = "";
    try { v = getComputedStyle(d.documentElement).getPropertyValue(name); } catch (e) { /* jsdom-ish */ }
    v = (v || "").trim();
    return v || fallback;
  }
  function toSet(x) {
    if (x instanceof Set) return x;
    var s = new Set();
    if (Array.isArray(x)) { x.forEach(function (k) { if (k) s.add(String(k)); }); }
    else if (x && typeof x === "object") { for (var k in x) if (x[k]) s.add(String(k)); }
    return s;
  }
  function pick(elOrSel) {
    if (!elOrSel) return null;
    if (typeof elOrSel === "string") { try { return d.querySelector(elOrSel); } catch (e) { return null; } }
    return elOrSel.nodeType ? elOrSel : null;
  }
  function reducedMotion() {
    try { return !!(w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ module state
     One map per page. `m` is null until mount(). Every method guards on it. */
  var m = null;

  /* ================================================================== build == */

  function buildDefs(svg) {
    if (svg.querySelector("#stitch")) return;                 /* id is referenced by CSS url(#stitch) */
    var defs = el("defs");
    var pat = setAttrs(el("pattern"), { id: "stitch", width: "7", height: "7",
      patternUnits: "userSpaceOnUse", patternTransform: "rotate(28)" });
    var rect = setAttrs(el("rect"), { width: "7", height: "7", "class": "stitch-bg" });
    var line = setAttrs(el("line"), { x1: "0", y1: "0", x2: "0", y2: "7", "class": "stitch-line" });
    pat.appendChild(rect); pat.appendChild(line); defs.appendChild(pat);
    svg.insertBefore(defs, svg.firstChild);
  }

  function group(svg, wanted, id, extraClass) {
    var g = svg.querySelector('[data-a64="' + wanted + '"]') ||
            svg.querySelector("#" + id) ||
            svg.querySelector("." + extraClass);
    if (!g) {
      g = el("g");
      svg.appendChild(g);
    }
    g.setAttribute("id", id);                                  /* the harness + CSS key on #districts / #labels */
    g.setAttribute("data-a64", wanted);
    if (extraClass) g.classList.add(extraClass);
    while (g.firstChild) g.removeChild(g.firstChild);           /* a re-mount never doubles the shapes */
    return g;
  }

  /* one label box, straight from the render — an estimate is never right for Bengali conjuncts */
  function labelBox(slug) {
    var t = m.labels[slug];
    if (!t || !t.getBBox) return null;
    var b;
    try { b = t.getBBox(); } catch (e) { return null; }
    return { x: b.x - LABEL_PAD, y: b.y - LABEL_PAD, w: b.width + 2 * LABEL_PAD, h: b.height + 2 * LABEL_PAD };
  }
  function intersects(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  /* Labels: one size (--t-micro), a strong halo so a name survives the red stitch,
     placed greedily biggest-district-first and shown only where they fit. Anything
     hidden reappears on hover/focus, so no name is ever truly lost. */
  function makeLabel(r, on) {
    var t = el("text");
    setAttrs(t, {
      x: r.cx, y: r.cy, "data-slug": r.slug,
      "text-anchor": "middle", "dominant-baseline": "central",
      "font-size": "12", "class": "map-label"
    });
    t.textContent = r.bn;
    /* Owned here (not in CSS) so the policy travels with the map. var() keeps it
       theme-reactive: the halo follows the paper/map colour when night mode flips. */
    var s = t.style;
    s.fontSize = "var(--t-micro, 12px)";
    s.fontFamily = "var(--font-ui, \"Noto Sans Bengali\", \"Noto Sans\", system-ui, sans-serif)";
    s.fontWeight = "700";
    s.fill = "var(--ink, #1a2430)";
    s.paintOrder = "stroke";
    s.stroke = "var(--label-halo, var(--map-bg, var(--paper, #f9f4e8)))";
    s.strokeWidth = "calc(var(--t-micro, 12px) * 0.3)";
    s.strokeLinejoin = "round";
    s.pointerEvents = "none";
    s.textAnchor = "middle";
    if (on) on.appendChild(t);
    return t;
  }

  function mount(opts) {
    opts = opts || {};
    var svg = pick(opts.svg);
    if (!svg || svg.namespaceURI !== NS) {
      if (w.console) console.warn("A64M.mount: no <svg> given");
      m = null;
      return A64M;
    }
    if (m) destroy();                                          /* idempotent re-mount */

    var source = opts.districts;
    if (source && !Array.isArray(source) && Array.isArray(source.districts)) {
      source = source.districts;      /* the whole parsed file was passed: { viewBox, districts } */
    }
    if (!Array.isArray(source) || !source.length) {
      if (w.console) console.warn("A64M.mount: districts[] is empty");
      m = null;
      return A64M;
    }

    var viewBox = opts.viewBox ||
      (opts.districts && typeof opts.districts.viewBox === "string" && opts.districts.viewBox) ||
      DEFAULT_VB;
    if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", viewBox);
    if (!svg.getAttribute("aria-label")) svg.setAttribute("aria-label", "বাংলাদেশের ৬৪ জেলার ম্যাপ");

    buildDefs(svg);
    var gd = group(svg, "districts", "districts", "districts");
    var gl = group(svg, "labels", "labels", "labels");
    gl.setAttribute("aria-hidden", "true");

    m = {
      svg: svg, districts: source, bySlug: {}, order: [],
      nodes: {}, labels: {},
      last: { visited: new Set(), wish: new Set(), mode: "visited" },
      onChange: typeof opts.onChange === "function" ? opts.onChange : null,
      active: null, hovered: null, filter: null,
      legend: [], tip: null, tipWrap: null,
      listeners: [], declutterScheduled: false
    };

    source.forEach(function (r) {
      m.bySlug[r.slug] = r;
      m.order.push(r.slug);

      var p = el("path");
      setAttrs(p, {
        d: r.path, "data-slug": r.slug, role: "button", tabindex: "-1",
        "aria-pressed": "false", "aria-label": r.bn + " জেলা, " + r.division_bn + " বিভাগ",
        "class": "district"
      });
      gd.appendChild(p);
      m.nodes[r.slug] = p;

      m.labels[r.slug] = makeLabel(r, gl);
    });

    A64M.districts = source;
    A64M.bySlug = m.bySlug;
    A64M.viewBox = viewBox;

    setActive(m.order[0]);
    bind();
    refresh(opts.state);                                        /* paint the first marks */
    findLegend(opts.legend);
    findTip();

    scheduleDeclutter();
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(scheduleDeclutter);

    return A64M;
  }

  /* =================================================================== paint == */

  function refresh(state) {
    if (!m) return A64M;
    if (state) {
      var p = toSet(state.visited), q = toSet(state.wish);
      m.last = { visited: p, wish: q, mode: state.mode === "wish" ? "wish" : "visited" };
    }
    var vis = m.last.visited, wsh = m.last.wish;
    m.order.forEach(function (slug) {
      var node = m.nodes[slug], isV = vis.has(slug), isW = wsh.has(slug);
      node.classList.toggle("is-visited", isV);
      node.classList.toggle("is-wish", !isV && isW);
      node.classList.toggle("is-none", !isV && !isW);
      node.setAttribute("aria-pressed", isV ? "true" : (isW ? "mixed" : "false"));
      node.setAttribute("data-state", isV ? "visited" : (isW ? "wish" : "none"));
    });
    if (m.filter) paintFilter();                                /* the emphasis layer tracks the marks */
    return A64M;
  }

  function setMode(mode) {
    if (m) m.last.mode = mode === "wish" ? "wish" : "visited";
    return A64M;
  }

  /* --------------------------------------------------- interaction states ---- */
  function setActive(slug) {
    if (!m || m.active === slug) return;
    m.active = slug;
    m.order.forEach(function (s) {
      var p = m.nodes[s];
      p.classList.toggle("is-active", s === slug);
      p.setAttribute("tabindex", s === slug ? "0" : "-1");       /* roving tabindex (§11) */
    });
  }
  function reveal(slug, on) {
    var t = m && m.labels[slug];
    if (t && on) t.classList.remove("is-hidden");
    if (!on) scheduleDeclutter();
  }
  function setHover(slug, on) {
    if (!m) return;
    var p = m.nodes[slug];
    if (p) p.classList.toggle("is-hover", !!on);
    m.hovered = on ? slug : (m.hovered === slug ? null : m.hovered);
    reveal(slug, on);
  }
  function setFocus(slug, on) {
    if (!m) return;
    var p = m.nodes[slug];
    if (p) p.classList.toggle("is-focus", !!on);
    if (on) { setActive(slug); reveal(slug, true); }
    else reveal(slug, false);
  }

  function activate(slug, ev) {
    if (!m || !m.bySlug[slug]) return;
    var wasV = m.last.visited.has(slug), wasW = m.last.wish.has(slug), mode = m.last.mode;
    var next = mode === "wish" ? (wasW ? "none" : "wish") : (wasV ? "none" : "visited");
    if (m.onChange) {
      m.onChange({
        slug: slug, district: m.bySlug[slug], mode: mode,
        current: { visited: wasV, wish: wasW }, next: next, event: ev || null
      });
    }
  }

  function focusDistrict(slug, doScroll) {
    if (!m || !m.nodes[slug]) return;
    setActive(slug);
    var p = m.nodes[slug];
    if (doScroll) {
      try { p.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); } catch (e) {}
    }
    try { p.focus({ preventScroll: true }); } catch (e) { try { p.focus(); } catch (e2) {} }
  }

  /* ------------------------------------------------------------- declutter --- */
  function scheduleDeclutter() {
    if (!m || m._pending) return;
    m._pending = true;
    var run = function () { m && (m._pending = false); declutter(); };
    (w.requestAnimationFrame || w.setTimeout)(run);
  }
  /* SVG text scales with the viewBox, so a flat 12 user units renders ~10px on a
     desktop map and ~4px on a phone — the §4 --t-micro was never what the eye saw.
     Size every label from the map's REAL render scale instead: 12px on screen,
     whatever the viewBox or the viewport does. (Manager patch: reported in the ledger.) */
  function sizeLabels() {
    if (!m || !m.svg.getBoundingClientRect) return;
    var box = m.svg.getBoundingClientRect();
    var vb = m.svg.viewBox && m.svg.viewBox.baseVal;
    var scale = (box.width && vb && vb.width) ? box.width / vb.width : 1;
    if (!scale || !isFinite(scale) || scale <= 0) scale = 1;
    /* on a narrow map a 12px name is unreadable once the hatching is under it:
       spend the space on fewer, larger names instead (`--t-label` on phones). */
    var target = box.width < 520 ? 14 : 12;
    var uu = Math.round(Math.max(9, Math.min(44, target / scale)) * 100) / 100;   /* ≈ --t-micro / --t-label on screen */
    if (m.labelUnits === uu && m.labelScale === scale) return false;           /* nothing to do */
    m.order.forEach(function (slug) {
      var t = m.labels[slug];
      if (!t) return;
      t.style.fontSize = uu.toFixed(2) + "px";
      t.style.strokeWidth = (uu * 0.45).toFixed(2) + "px";   /* a chunky halo: names stay readable over the red stitch */
    });
    m.labelUnits = uu;
    m.labelScale = scale;
    return true;                                                               /* sizes changed */
  }

  function declutter() {
    if (!m || !m.order.length) return;
    /* a style change invalidates the text metrics, and a getBBox in the same turn can
       still return the old width — so size first, then measure on the next frame */
    if (sizeLabels()) { scheduleDeclutter(); return; }
    var first = labelBox(m.order[0]);
    if (!first || first.w <= 2 * LABEL_PAD) return;              /* not laid out yet — every box would read 0 */
    var placed = [];
    m.districts.slice().sort(function (a, b) { return b.area_km2 - a.area_km2; }).forEach(function (r) {
      var t = m.labels[r.slug], box = labelBox(r.slug);
      if (!box) return;
      var ok = box.w < r.w + 2 * LABEL_PAD && box.h < r.h + 2 * LABEL_PAD;
      if (ok) { for (var i = 0; i < placed.length; i++) { if (intersects(box, placed[i])) { ok = false; break; } } }
      var focused = r.slug === m.active || r.slug === m.hovered;
      var forced = t.getAttribute("data-force") === "1" || focused;
      if (focused && ok === false && t.parentNode) {
        /* the keyboard is on this district: name it, on top of its neighbours */
        t.parentNode.appendChild(t);
        t.style.strokeWidth = ((m.labelUnits || 20) * 0.62).toFixed(2) + "px";
      }
      t.classList.toggle("is-hidden", !ok && !forced);
      if (ok || forced) placed.push(box);
    });
    A64M.labelsPlaced = placed.length;
  }

  /* --------------------------------------------------------------- legend ---- */
  function findLegend(opt) {
    if (!m) return;
    var legend = pick(opt);
    if (!legend && m.svg.closest) {
      var card = m.svg.closest(".map-card") || m.svg.closest(".map-wrap") || m.svg.closest("#map");
      legend = card ? card.querySelector(".legend") : null;
    }
    if (!legend) legend = d.querySelector(".legend");
    if (!legend) return;

    var items = legend.querySelectorAll(".lg");
    m.legend = [];
    Array.prototype.forEach.call(items, function (item, i) {
      var sw = item.querySelector(".sw-visited, .sw-wish, .sw-none");
      var layer = null;
      if (sw) {
        if (sw.classList.contains("sw-visited")) layer = "visited";
        else if (sw.classList.contains("sw-wish")) layer = "wish";
        else if (sw.classList.contains("sw-none")) layer = "none";
      }
      if (!layer && item.getAttribute("data-layer")) layer = item.getAttribute("data-layer");
      if (!layer) layer = LAYERS[i] || null;
      if (!layer) return;
      if (!item.matches("button, a, input, [role=button]")) {   /* reachable even if markup is a <span> */
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
      }
      item.setAttribute("aria-pressed", "false");
      var toggle = function (ev) { ev.preventDefault(); setFilter(m.filter === layer ? null : layer); };
      on(item, "click", toggle);
      on(item, "keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") toggle(ev);
      });
      m.legend.push({ el: item, layer: layer });
    });
  }

  function paintFilter() {
    var f = m.filter;
    if (f) m.svg.setAttribute("data-filter", f); else m.svg.removeAttribute("data-filter");
    m.svg.classList.toggle("is-filtering", !!f);
    m.order.forEach(function (slug) {
      var p = m.nodes[slug];
      var isV = m.last.visited.has(slug), isW = m.last.wish.has(slug) && !isV;
      var match = !f ? null : (f === "visited" ? isV : f === "wish" ? isW : (!isV && !isW));
      p.classList.toggle("is-emphasis", !!f && match);
      p.classList.toggle("is-dim", !!f && !match);
    });
    m.legend.forEach(function (L) {
      var on_ = f === L.layer;
      L.el.classList.toggle("is-on", on_);
      L.el.setAttribute("aria-pressed", on_ ? "true" : "false");
    });
  }
  function setFilter(layer) {
    if (!m) return A64M;
    if (layer && LAYERS.indexOf(layer) < 0) layer = null;
    m.filter = layer || null;
    paintFilter();
    return m.filter;
  }

  /* -------------------------------------------------------------- spotlight --- */
  /* Search lives in js/app.js; this is the hook it or an export can lean on. */
  function setDim(pred, force) {
    if (!m) return A64M;
    if (!pred) { clearDim(); return A64M; }
    m.order.forEach(function (slug) {
      var hit = !!pred(m.bySlug[slug], slug);
      var p = m.nodes[slug], t = m.labels[slug];
      p.classList.toggle("is-match", hit);
      p.classList.toggle("is-dim", !hit);
      if (hit) { t.classList.remove("is-hidden"); }             /* a match is always named */
      if (hit && force) t.setAttribute("data-force", "1"); else if (!force) t.removeAttribute("data-force");
    });
    declutter();
    return A64M;
  }
  function clearDim() {
    if (!m) return A64M;
    m.order.forEach(function (slug) {
      m.nodes[slug].classList.remove("is-match", "is-dim");
      m.labels[slug].removeAttribute("data-force");
    });
    declutter();
    return A64M;
  }
  function revealLabel(slug, on) {
    if (!m) return A64M;
    var t = m.labels[slug];
    if (!t) return A64M;
    /* A name revealed by hover/focus can land on a neighbour that is showing at
       rest (that is the point of revealing it). Raise it above its neighbours and
       thicken its halo so the pair reads as "this one, on top", not as a clash. */
    if (on && t.parentNode) {
      t.parentNode.appendChild(t);
      t.style.strokeWidth = ((m.labelUnits || 20) * 0.62).toFixed(2) + "px";
    }
    if (on) { t.setAttribute("data-force", "1"); t.classList.remove("is-hidden"); }
    else { t.removeAttribute("data-force"); scheduleDeclutter(); }
    return A64M;
  }

  /* ------------------------------------------------------------------ tip ---- */
  function findTip() {
    var card = m.svg.closest ? (m.svg.closest(".map-wrap") || m.svg.closest(".map-card") || m.svg.closest("#map")) : null;
    m.tip = (card && card.querySelector(".tip")) || d.querySelector(".tip");
    m.tipWrap = m.tip && m.tip.parentElement;
  }
  function showTip(r, box) {
    if (!m.tip || !m.tipWrap) return;
    var wrap = m.tipWrap.getBoundingClientRect();
    m.tip.hidden = false;
    m.tip.textContent = r.bn + " · " + r.division_bn + (w.BN && w.BN.group ? " · " + w.BN.group(r.area_km2) + " বর্গ কিমি" : "");
    m.tip.style.left = (box.left - wrap.left + box.width / 2) + "px";
    m.tip.style.top = (box.top - wrap.top + 6) + "px";
  }
  function hideTip() { if (m.tip) m.tip.hidden = true; }

  /* ---------------------------------------------------------------- events --- */
  var ARROWS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  function nearest(slug, dir) {
    var here = m.bySlug[slug], best = null, bestScore = Infinity;
    m.districts.forEach(function (r) {
      if (r.slug === slug) return;
      var dx = (r.cx - here.cx) * dir[0] + (r.cy - here.cy) * dir[1];
      if (dx <= 6) return;
      var off = Math.abs((r.cx - here.cx) * dir[1] - (r.cy - here.cy) * dir[0]);
      var score = dx + off * 1.7;
      if (score < bestScore) { bestScore = score; best = r; }
    });
    return best ? best.slug : null;
  }
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    if (m) m.listeners.push([target, type, fn, opts]);
  }

  function slugOf(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    var p = t.closest("path[data-slug]");
    return p ? p.getAttribute("data-slug") : null;
  }

  function bind() {
    var svg = m.svg;

    on(svg, "click", function (e) {
      var slug = slugOf(e);
      if (slug) { setActive(slug); activate(slug, e); }
    });

    on(svg, "keydown", function (e) {
      var slug = slugOf(e);
      if (!slug) return;
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); activate(slug, e); return; }
      if (e.key === "Escape") { setFilter(null); setActive(slug); return; }   /* Escape clears the filter, then the sheet takes over */
      if (e.key === "Home") { e.preventDefault(); focusDistrict(m.order[0]); return; }
      if (e.key === "End") { e.preventDefault(); focusDistrict(m.order[m.order.length - 1]); return; }
      var dir = ARROWS[e.key];
      if (!dir) return;
      e.preventDefault();
      var next = nearest(slug, dir);
      if (next) focusDistrict(next);
    });

    on(svg, "pointerover", function (e) {
      var slug = slugOf(e);
      if (!slug) return;
      var p = m.nodes[slug];
      setHover(slug, true);
      if (p) showTip(m.bySlug[slug], p.getBoundingClientRect());
    });
    on(svg, "pointerout", function (e) {
      var slug = slugOf(e);
      hideTip();
      if (slug) setHover(slug, false);
    });

    on(svg, "focusin", function (e) {
      var slug = slugOf(e);
      if (!slug) return;
      setFocus(slug, true);
      var p = m.nodes[slug];
      if (p) showTip(m.bySlug[slug], p.getBoundingClientRect());
    });
    on(svg, "focusout", function (e) {
      var slug = slugOf(e);
      hideTip();
      if (slug) setFocus(slug, false);
    });

    on(w, "resize", function () {
      clearTimeout(m._rz);
      m._rz = setTimeout(scheduleDeclutter, 150);
    });
  }

  /* ------------------------------------------------------------------ clean -- */
  function destroy() {
    if (!m) return A64M;
    (m.listeners || []).forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) {} });
    clearTimeout(m._rz);
    try {
      var gd = m.svg.querySelector("#districts");
      while (gd && gd.firstChild) gd.removeChild(gd.firstChild);
      var gl = m.svg.querySelector("#labels");
      while (gl && gl.firstChild) gl.removeChild(gl.firstChild);
    } catch (e) {}
    m = null;
    A64M.districts = []; A64M.bySlug = {}; A64M.labelsPlaced = 0;
    return A64M;
  }

  /* -------------------------------------------------------------------- API -- */
  var A64M = {
    version: 1,
    mount: mount,
    refresh: refresh,
    node: function (slug) { return m ? m.nodes[slug] : null; },
    labelNode: function (slug) { return m ? m.labels[slug] : null; },
    setMode: setMode,
    active: function () { return m ? m.active : null; },
    focus: function (slug) { focusDistrict(slug, true); return A64M; },
    labelsPlaced: 0,
    placedCount: function () { return m ? A64M.labelsPlaced : 0; },
    relayout: function () { scheduleDeclutter(); return A64M; },
    sizeLabels: sizeLabels,
    relayoutNow: function () { declutter(); return A64M; },

    /* legend-as-filter (§7): emphasis on one layer, the rest recede */
    setFilter: setFilter,
    clearFilter: function () { return setFilter(null); },
    filter: function () { return m ? m.filter : null; },

    /* search/spotlight hooks for js/app.js */
    setDim: setDim,
    clearDim: clearDim,
    revealLabel: revealLabel,

    /* a compact palette for the exporters (all values are live CSS variables) */
    palette: function () {
      var g = function (n) { return cssVar(n, ""); };
      return {
        paper: g("--paper"), paper2: g("--paper-2"), paper3: g("--paper-3"),
        ink: g("--ink"), inkSoft: g("--ink-soft"), rule: g("--rule"),
        kantha: g("--kantha"), kanthaInk: g("--kantha-ink"), kanthaFill: g("--kantha-fill"),
        indigo: g("--indigo"), marigold: g("--marigold"), leaf: g("--leaf"),
        mapBg: g("--map-bg"), mapWater: g("--map-water"), mapBorder: g("--map-border"), seal: g("--seal")
      };
    },
    destroy: destroy
  };

  w.A64M = A64M;
})(window, document);
