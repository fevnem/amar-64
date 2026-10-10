/* js/share.js — the sharing flow (§10) and the profile privacy line (§8).
   Global: window.A64S
   Depends on window.A64 (state + the share code/URL), window.A64X (the poster
   exports — card(), story(), download()), window.BN (Bengali numerals) and,
   when present, window.A64C (copy). Optional companion: js/profile.js.
   No libraries, no build, no uploads: every byte stays on the device.
   Load order: bn.js -> content.js -> map.js -> profile.js -> app.js ->
   export-posters.js -> pdf.js -> share.js. */
(function (w, d) {
  "use strict";

  var CARD_NAME = "amar-64-card.png";
  var STORY_NAME = "amar-64-story.png";
  var TOAST_MS = 2600;

  /* ---------------------------------------------------------------- strings
     §10.5 — the one-line hint about what the link carries; §8 — the privacy
     line. Both live on A64S so the sheet/profile code can reuse them verbatim
     instead of re-writing Bengali copy. */
  var HINT = "লিংকটিতে আপনার দাগগুলো থাকে — বন্ধু খুললেই ঠিক এই ম্যাপটাই তার সামনে খুলবে।";
  var PRIVACY = "কিছুই আপনার ব্রাউজার ছাড়ে না — নাম ও ছবি শুধু আপনার ডিভাইসে থাকে।";

  function $sel(sel, root) { return (root || d).querySelector(sel); }

  /* ----------------------------------------------------------- app bridges */
  function appState() {
    var a = w.A64;
    if (a && a.state) { try { return a.state(); } catch (e) { /* ignore */ } }
    return { visited: [], wish: [], mode: "visited" };
  }

  function visitedCount() {
    var a = w.A64;
    if (a && a.stats) { try { return (a.stats().count || 0); } catch (e) { /* ignore */ } }
    var st = appState(), n = 0;
    if (st.visited && st.visited.forEach) { st.visited.forEach(function () { n++; }); }
    return st.visited && st.visited.size ? st.visited.size : n;
  }

  /* §10 — the link the friend opens. app.js owns the codec; we only ever ask
     it, and fall back to the bare page URL if the app changed underneath us.
     (The contract writes "?d=" but the shipped codec uses the hash "#d=", so
     that a static host never needs a rewrite — we follow the working codec.) */
  function shareURL() {
    var a = w.A64;
    if (a && a.shareURL) { try { return a.shareURL(); } catch (e) { /* ignore */ } }
    return w.location.origin + w.location.pathname;
  }

  function shareTitle() {
    var c = w.A64C;
    return (c && c.storyCopy && c.storyCopy.title) || "আমার ৬৪";
  }

  function shareText() {
    var n = w.BN ? w.BN.num(visitedCount()) : String(visitedCount());
    return "আমার ৬৪ — বাংলাদেশের ৬৪ জেলার ভ্রমণ খাতা। আমার " + n +
           " জেলার দাগ দেওয়া ম্যাপটি দেখুন।";
  }

  /* ------------------------------------------------------------ live region
     §11 — the toast is announced through a live region. The app already ships
     one (`#copied`, role="status" aria-live="polite"); if the redesign gives us
     a dedicated `#toast` (or anything tagged `[data-a64-live]`), that wins. */
  var liveEl = null, toastTimer = 0;

  function live() {
    if (liveEl && d.contains(liveEl)) { return liveEl; }
    liveEl = $sel("[data-a64-live]") || $sel("#toast") || $sel("#copied");
    if (!liveEl) {
      liveEl = d.createElement("p");
      liveEl.id = "toast";
      liveEl.setAttribute("role", "status");
      liveEl.setAttribute("aria-live", "polite");
      d.body.appendChild(liveEl);
    }
    return liveEl;
  }

  /* Writes into the live region and auto-clears. Returns the message so a
     caller can chain. Fires `a64:toast` so CSS/other hands can react. */
  function toast(msg, opts) {
    opts = opts || {};
    var el = opts.el || live();
    if (!el) { return msg; }
    el.textContent = msg;
    if (toastTimer) { w.clearTimeout(toastTimer); }
    toastTimer = w.setTimeout(function () {
      toastTimer = 0;
      el.textContent = "";
    }, opts.ms || TOAST_MS);
    try {
      w.dispatchEvent(new CustomEvent("a64:toast", { detail: { message: msg } }));
    } catch (e) { /* ignore */ }
    return msg;
  }

  /* --------------------------------------------------------------- copying */
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      try {
        var ta = d.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        d.body.appendChild(ta);
        ta.select();
        var ok = !!(d.execCommand && d.execCommand("copy"));
        d.body.removeChild(ta);
        ok ? resolve(text) : reject(new Error("copy blocked"));
      } catch (e) { reject(e); }
    });
  }

  function copyText(text) {
    if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) {
      return w.navigator.clipboard.writeText(text)
        .then(function () { return text; }, function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  /* --------------------------------------------------------------- download */
  function download(blob, name) {
    var X = w.A64X;
    if (X && X.download) { X.download(blob, name); return { name: name }; }
    if (!blob) { return null; }
    var url = URL.createObjectURL(blob);
    var a = d.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    d.body.appendChild(a);
    a.click();
    w.setTimeout(function () {
      try { d.body.removeChild(a); } catch (e) { /* gone */ }
      URL.revokeObjectURL(url);
    }, 1500);
    return { name: name };
  }

  /* ------------------------------------------------------- poster factories
     A64X builds a *fresh* canvas on every call, so the one we put in the
     preview is ours to keep; the blob is what we hand to a download/share. */
  function makeCard() {
    var X = w.A64X;
    if (!X || !X.card) { return Promise.reject(new Error("A64X.card unavailable")); }
    return Promise.resolve(X.card());
  }

  function makeStory() {
    var X = w.A64X;
    if (!X || !X.story) { return Promise.reject(new Error("A64X.story unavailable")); }
    return Promise.resolve(X.story());
  }

  /* ------------------------------------------------------------- the preview
     §10.1 — the big, live 1200×630 share card, re-rendered from A64X.card(). */
  var rowEl = null, previewEl = null, lastCard = null, building = null, queued = false;

  function renderPreview(card) {
    if (!previewEl || !card) { return; }
    previewEl.textContent = "";
    if (card.canvas) {
      var cv = card.canvas;
      cv.style.width = "100%";
      cv.style.height = "auto";
      cv.style.display = "block";
      previewEl.appendChild(cv);
      return;
    }
    if (card.blob) {
      var img = d.createElement("img");
      var url = URL.createObjectURL(card.blob);
      img.src = url;
      img.alt = "";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.display = "block";
      img.onload = function () { URL.revokeObjectURL(url); };
      previewEl.appendChild(img);
    }
  }

  /* Rebuilds the preview; coalesces bursts so rapid refreshes make one card. */
  function refresh() {
    if (!previewEl) { return Promise.resolve(null); }
    if (building) { queued = true; return building; }
    building = makeCard().then(function (card) {
      building = null;
      if (card) { lastCard = card; renderPreview(card); }
      if (queued) { queued = false; return refresh(); }
      return card;
    }, function (err) {
      building = null;
      queued = false;
      if (w.console && w.console.error) { w.console.error("amar64 share preview:", err); }
      return null;
    });
    return building;
  }

  /* The freshest card for a download/share; reuses the previewed one unless a
     fresh render is explicitly wanted. */
  function ensureCard(force) {
    if (lastCard && !force) { return Promise.resolve(lastCard); }
    return makeCard().then(function (card) { if (card) { lastCard = card; } return card; });
  }

  /* ------------------------------------------------------------- the actions */
  function busy(btn, msg) {
    if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
    if (msg) { toast(msg); }
  }

  function idle(btn) {
    if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); }
  }

  function pending(btn, msg, task) {
    busy(btn, msg);
    return Promise.resolve(task).then(function (res) {
      idle(btn);
      return res;
    }, function (err) {
      idle(btn);
      toast("সমস্যা হয়েছে — আবার চেষ্টা করুন।");
      if (w.console && w.console.error) { w.console.error("amar64 share:", err); }
      throw err;
    });
  }

  function actCard(btn) {
    return pending(btn, "কার্ড তৈরি হচ্ছে…", ensureCard(true)).then(function (card) {
      if (!card || !card.blob) { return toast("কার্ড তৈরি করা গেল না।"); }
      renderPreview(card);
      download(card.blob, CARD_NAME);
      return toast("কার্ড নামছে ✓");
    });
  }

  function actStory(btn) {
    return pending(btn, "স্টোরি কার্ড আঁকা হচ্ছে…", makeStory()).then(function (card) {
      if (!card || !card.blob) { return toast("স্টোরি কার্ড তৈরি করা গেল না।"); }
      download(card.blob, STORY_NAME);
      return toast("স্টোরি কার্ড নামছে ✓");
    });
  }

  function actCopy() {
    var url = shareURL();
    return copyText(url).then(function () {
      return toast("লিংক কপি হয়েছে ✓");
    }, function () {
      toast(url); /* last resort: show it so it can be copied by hand */
      return url;
    });
  }

  /* §10.4 — file sharing, feature-detected, never throwing. */
  function canShareFiles(files) {
    if (!(w.navigator && w.navigator.canShare && w.navigator.share)) { return false; }
    try { return !!w.navigator.canShare({ files: files }); } catch (e) { return false; }
  }

  function asFile(blob, name) {
    try { return new File([blob], name, { type: blob.type || "image/png" }); }
    catch (e) { return blob; } /* no File ctor — a Blob is the closest we get */
  }

  function isAbort(err) {
    return !!err && (err.name === "AbortError" || err.name === "NotAllowedError");
  }

  /* §10.4 fallback — copy the link *and* hand over the card. */
  function fallbackShare(card, url) {
    return copyText(url).then(function () {
      toast("শেয়ার সমর্থিত নয় — লিংক কপি হয়েছে ✓, কার্ডও নামছে");
    }, function () {
      toast("শেয়ার সমর্থিত নয় — কার্ড নামছে");
    }).then(function () {
      if (card && card.blob) { download(card.blob, CARD_NAME); }
    });
  }

  function actShare(btn) {
    return pending(btn, "কার্ড তৈরি হচ্ছে…", ensureCard(true)).then(function (card) {
      if (!card || !card.blob) { return toast("কার্ড তৈরি করা গেল না।"); }
      renderPreview(card);
      var url = shareURL();
      var file = asFile(card.blob, CARD_NAME);
      var payload = { files: [file], title: shareTitle(), text: shareText(), url: url };

      if (canShareFiles([file])) {
        return w.navigator.share(payload).then(function () {
          return toast("শেয়ার করা হয়েছে ✓");
        }, function (err) {
          if (isAbort(err)) { return null; }     /* user cancelled — say nothing */
          return fallbackShare(card, url);
        });
      }
      return fallbackShare(card, url);
    });
  }

  /* -------------------------------------------------------------- wiring */
  var ACTIONS = [
    { key: "card",  label: "কার্ড নামান", cls: "btn",              run: actCard },
    { key: "story", label: "স্টোরি কার্ড", cls: "btn",              run: actStory },
    { key: "link",  label: "লিংক কপি",    cls: "btn",              run: actCopy },
    { key: "share", label: "শেয়ার করুন",  cls: "btn btn-primary",  run: actShare }
  ];

  /* Reuses a button H5 already wrote (found by data-a64 or by its Bengali
     label); otherwise creates one with §7's classes. */
  function buttonFor(actionsEl, spec) {
    var btn = actionsEl.querySelector('[data-a64="' + spec.key + '"]');
    if (!btn) {
      var kids = actionsEl.querySelectorAll("button");
      for (var i = 0; i < kids.length; i++) {
        if ((kids[i].textContent || "").trim() === spec.label) { btn = kids[i]; break; }
      }
    }
    if (!btn) {
      btn = d.createElement("button");
      btn.type = "button";
      btn.className = spec.cls;
      btn.textContent = spec.label;
      actionsEl.appendChild(btn);
    }
    if (spec.key === "share" && btn.className.indexOf("btn-primary") < 0) {
      btn.classList.add("btn-primary");
    }
    btn.setAttribute("data-a64", spec.key);
    return btn;
  }

  function ensureChild(parent, sel, cls, before) {
    var el = parent.querySelector(sel);
    if (el) { return el; }
    el = d.createElement("div");
    el.className = cls;
    if (before && before.parentNode === parent) { parent.insertBefore(el, before); }
    else { parent.appendChild(el); }
    return el;
  }

  function wire(row) {
    rowEl = row;

    previewEl = ensureChild(row, ".card-preview", "card-preview", row.firstChild);
    previewEl.setAttribute("role", "img");
    previewEl.setAttribute("aria-label", "আপনার ভ্রমণ কার্ডের প্রিভিউ");

    var actionsEl = ensureChild(row, ".card-actions", "card-actions", null);

    ACTIONS.forEach(function (spec) {
      var btn = buttonFor(actionsEl, spec);
      if (btn.getAttribute("data-a64-wired")) { return; }
      btn.setAttribute("data-a64-wired", "1");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        try {
          var p = spec.run(btn);
          if (p && p.catch) { p.catch(function () { /* already toasted */ }); }
        } catch (err) {
          if (w.console && w.console.error) { w.console.error("amar64 share:", err); }
        }
      });
    });

    /* §10.5 hint + §8 privacy line, once. These reuse the existing footnote
       class `.exp-note` (already used in index.html for the same purpose). */
    if (!row.querySelector("[data-a64-hint]")) {
      var hint = d.createElement("p");
      hint.className = "exp-note";
      hint.setAttribute("data-a64-hint", "1");
      hint.textContent = HINT;
      row.appendChild(hint);

      var priv = d.createElement("p");
      priv.className = "exp-note";
      priv.setAttribute("data-a64-privacy", "1");
      priv.textContent = PRIVACY;
      row.appendChild(priv);
    }

    return row;
  }

  function buildRow(host) {
    var row = d.createElement("div");
    row.className = "share-row";
    (host || d.body).appendChild(row);
    return row;
  }

  /* Public entry point: mount(root). root may be the `.share-row` itself or any
     container that holds one; if none exists we build the row into `root`. */
  function mount(root) {
    root = root || d;
    var row = null;
    if (root.nodeType === 1 && root.classList && root.classList.contains("share-row")) {
      row = root;
    } else if (root.querySelector) {
      row = root.querySelector(".share-row");
    }
    if (!row) { row = buildRow(root); }
    wire(row);
    refresh();
    return row;
  }

  /* -------------------------------------------------------------- lifecycle */
  var mounted = false;

  function bindGlobals() {
    if (mounted) { return; }
    mounted = true;
    /* app.js dispatches a64:ready once the map data + rail are live; the
       profile hand (or the lead's app.js) can dispatch a64:profile / a64:change
       after a photo swap or a paint to keep the preview honest. */
    w.addEventListener("a64:ready", function () { if (rowEl) { refresh(); } else { autoMount(); } });
    w.addEventListener("a64:profile", function () { lastCard = null; if (rowEl) { refresh(); } });
    w.addEventListener("a64:change", function () { lastCard = null; if (rowEl) { refresh(); } });
  }

  /* Wire H5's markup automatically if it is already on the page; never build
     fallback markup unbidden (H5 owns index.html). */
  function autoMount() {
    if (rowEl) { return rowEl; }
    var row = $sel(".share-row");
    if (row) { return mount(row); }
    return null;
  }

  bindGlobals();
  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", autoMount); }
  else { autoMount(); }

  /* ------------------------------------------------------------ public API */
  w.A64S = {
    version: "1.0.0",
    mount: mount,
    refresh: refresh,
    toast: toast,
    copyLink: actCopy, /* same path the button takes (toast on success/failure) */
    shareURL: shareURL,
    shareText: shareText,
    canShareFiles: canShareFiles,
    downloadCard: actCard,
    downloadStory: actStory,
    shareNow: actShare,
    hint: HINT,
    privacy: PRIVACY,
    labels: { card: "কার্ড নামান", story: "স্টোরি কার্ড", link: "লিংক কপি", share: "শেয়ার করুন" }
  };
})(window, document);
