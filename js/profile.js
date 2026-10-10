/* আমার ৬৪ — the traveller's profile: a name and a square photo, kept on the
   device and never uploaded anywhere.
   Global: window.A64P  (read by the sheet UI, the masthead and js/export*.js).
   Spec: redesign contract §8. No dependencies; any script order works. */
(function (w, d) {
  "use strict";

  /* ------------------------------------------------------------------ consts */
  var KEY = "amar64.profile.v1";        // §8: the one storage key
  var MAX_NAME = 24;                     // §8: name is ≤ 24 chars
  var MAX_BYTES = 12 * 1024 * 1024;      // §8: reject > 12 MB before decoding
  var SIDE = 256;                        // §8: square, 256×256
  var QUALITY = 0.86;                    // §8: toDataURL("image/jpeg", .86)

  /* Live mount() controllers, so a save/clear from anywhere re-renders them. */
  var mounts = [];

  function el(tag, cls) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /* ------------------------------------------------------------- validation */

  /* A stored photo must be a base64 image data URL and nothing else. */
  function isDataImage(v) {
    return typeof v === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(v);
  }

  /* A dropped/picked file is an image if the browser tags it image/*, or if the
     type is missing but the extension is a known image one. */
  function isImageFile(f) {
    if (!f || typeof f !== "object" || typeof f.size !== "number" || f.size <= 0) return false;
    if (typeof f.type === "string" && /^image\//i.test(f.type)) return true;
    if ((!f.type || f.type === "") && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name || "")) return true;
    return false;
  }

  /* Everything read back from storage passes through here, so a hand-edited or
     truncated value can never render. Unknown fields are dropped. */
  function clean(obj) {
    if (!obj || typeof obj !== "object") return { name: "", photo: null };
    var name = typeof obj.name === "string" ? obj.name.trim().slice(0, MAX_NAME) : "";
    var photo = isDataImage(obj.photo) ? obj.photo : null;
    return { name: name, photo: photo };
  }

  /* ------------------------------------------------------------------ store */

  /* Read amar64.profile.v1, validate it, return {name, photo}. Never throws;
     a missing/corrupt record reads as the empty profile. */
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return { name: "", photo: null }; }
    if (!raw) return { name: "", photo: null };
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return { name: "", photo: null }; }
    return clean(obj);
  }

  /* True once a name or a photo is set (the profile is optional, §8). */
  function has() {
    var p = load();
    return !!(p.name || p.photo);
  }

  /* save({name, photo}) — both optional. An omitted key keeps its old value;
     photo:null clears it; an unusable photo is ignored so the previous one
     stays (§8). Returns the {name, photo} now in effect. */
  function save(input) {
    input = input || {};
    var prev = load();

    var name = prev.name;
    if (hasOwn(input, "name")) {
      name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME) : prev.name;
    }

    var photo = prev.photo;
    if (hasOwn(input, "photo")) {
      if (input.photo === null || input.photo === "") photo = null;   // explicit clear
      else if (isDataImage(input.photo)) photo = input.photo;         // a valid image
      else photo = prev.photo;                                        // keep the previous photo
    }

    return persist(name, photo);
  }

  /* Forget the profile entirely. */
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    renderAll({ name: "", photo: null });
    emit({ name: "", photo: null });
    return { name: "", photo: null };
  }

  function persist(name, photo) {
    /* §8 shape: { name, photo, saved }. `saved` is the write time, matching
       the JSON bundle convention in js/app.js. */
    var record = { name: name, photo: photo, saved: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(record)); } catch (e) { /* private mode / quota */ }
    renderAll({ name: name, photo: photo });
    emit({ name: name, photo: photo });
    return { name: name, photo: photo };
  }

  function emit(detail) {
    try { w.dispatchEvent(new CustomEvent("a64:profile", { detail: detail })); } catch (e) {}
  }

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* -------------------------------------------------------------- rendering */

  /* Paint one avatar element from a photo data URL (or clear it). Inline styles
     make the circle look right even before the stylesheet lands; the empty
     state carries a `data-empty` attribute and a "+" (§8). */
  function applyAvatar(node, photo) {
    if (!node || !node.style) return;
    node.style.backgroundSize = "cover";
    node.style.backgroundPosition = "center";
    node.style.backgroundRepeat = "no-repeat";
    if (photo) {
      node.style.backgroundImage = 'url("' + photo + '")';
      node.removeAttribute("data-empty");
      node.setAttribute("data-photo", "");
      if (node.textContent === "+") node.textContent = "";
    } else {
      node.style.backgroundImage = "";
      node.removeAttribute("data-photo");
      node.setAttribute("data-empty", "");
      if (!node.textContent.trim() && !node.children.length) node.textContent = "+";
    }
  }

  /* Every `.profile-avatar` in the document (masthead 32px + the sheet preview)
     plus each mounted editor reflects the given profile. */
  function renderAll(profile) {
    var p = profile || { name: "", photo: null };
    var avs = d.querySelectorAll(".profile-avatar");
    for (var i = 0; i < avs.length; i++) applyAvatar(avs[i], p.photo);
    for (var j = 0; j < mounts.length; j++) {
      try { mounts[j].sync(p); } catch (e) {}
    }
  }

  /* ------------------------------------------------------------ photo crop */

  /* File -> bitmap, without ever leaking an object URL. createImageBitmap is
     the §8 path; the object-URL <img> is a fallback and is revoked either way. */
  function bitmap(file) {
    if (w.createImageBitmap) return w.createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new w.Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  /* Center-crop the source to a square, draw it into a 256×256 canvas with a
     cover fit, and return a JPEG data URL. Transparent areas go white: JPEG
     has no alpha, and near-black is a worse default (§8). */
  function squareJpeg(src) {
    var bw = src.width || src.naturalWidth;
    var bh = src.height || src.naturalHeight;
    if (!bw || !bh) return null;
    var cnv = d.createElement("canvas");
    cnv.width = SIDE;
    cnv.height = SIDE;
    var ctx = cnv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIDE, SIDE);
    var side = Math.min(bw, bh);
    var sx = (bw - side) / 2;
    var sy = (bh - side) / 2;
    ctx.drawImage(src, sx, sy, side, side, 0, 0, SIDE, SIDE);
    return cnv.toDataURL("image/jpeg", QUALITY);
  }

  function renderPhoto(file) {
    return bitmap(file).then(function (bmp) {
      var out = null;
      try { out = squareJpeg(bmp); } catch (e) { out = null; }
      if (bmp && bmp.close) { try { bmp.close(); } catch (e) {} }
      return out;
    });
  }

  /* Best-effort feedback hook: if the app exposes a toast, use it; otherwise
     stay silent (§8 only demands the previous photo survives the failure). */
  function notify(msg) {
    if (typeof w.A64Toast === "function") { try { w.A64Toast(msg); return; } catch (e) {} }
  }

  /* ---------------------------------------------------------------- get/set */

  function getName(node) {
    if (!node) return "";
    if ("value" in node) return node.value;
    return node.textContent || "";
  }

  function setName(node, v) {
    if (!node) return;
    if ("value" in node) node.value = v;
    else node.textContent = v;
  }

  /* ----------------------------------------------------------------- mount */

  /* Wire an editor into `root`: a click/drop avatar picker (`.avatar-drop`)
     and a name field (`.profile-name`), plus a live `.profile-avatar` circle.
     Existing markup is reused; missing controls are created with the §7 class
     names. Returns a small controller. */
  function mount(root) {
    if (!root) return null;
    if (root.__a64p) return root.__a64p;

    /* --- name field --- */
    var nameEl = root.querySelector(".profile-name");
    if (!nameEl) {
      nameEl = el("input", "profile-name");
      nameEl.setAttribute("type", "text");
      root.appendChild(nameEl);
    }
    var isFormField = (nameEl.tagName === "INPUT" || nameEl.tagName === "TEXTAREA");
    if (isFormField) {
      nameEl.setAttribute("maxlength", String(MAX_NAME));
      nameEl.setAttribute("autocomplete", "off");
    }
    if (!nameEl.getAttribute("aria-label")) nameEl.setAttribute("aria-label", "আপনার নাম");

    /* --- avatar circle --- */
    var avatar = root.querySelector(".profile-avatar");
    if (!avatar) {
      avatar = el("span", "profile-avatar");
      avatar.setAttribute("aria-hidden", "true");
      root.appendChild(avatar);
    }

    /* --- drop zone (defaults to the avatar itself) --- */
    var drop = root.querySelector(".avatar-drop") || avatar;
    drop.setAttribute("role", "button");
    drop.setAttribute("tabindex", "0");
    if (!drop.getAttribute("aria-label")) drop.setAttribute("aria-label", "ছবি বাছুন বা টেনে ছাড়ুন");
    if (!drop.getAttribute("title")) drop.setAttribute("title", "ছবি বাছুন");

    /* --- hidden file picker (scoped to images, so the sheet's JSON import
           input is never touched) --- */
    var fileEl = root.querySelector('input[type="file"][accept*="image"]');
    if (!fileEl) {
      fileEl = el("input");
      fileEl.type = "file";
      fileEl.setAttribute("accept", "image/*");
      fileEl.hidden = true;
      fileEl.setAttribute("aria-hidden", "true");
      root.appendChild(fileEl);
    }

    var saveTimer = 0;

    function busy(on) { drop.toggleAttribute("data-busy", !!on); }

    /* Process one picked/dropped file: validate, crop, save. The previous
       photo is untouched until a replacement is decoded successfully. */
    function onFiles(files) {
      var file = files && files[0];
      if (!file) return;
      if (!isImageFile(file)) { notify("এটি ছবি নয় — একটি ছবি ফাইল বাছুন।"); return; }
      if (file.size > MAX_BYTES) { notify("ছবিটি ১২ MB-র চেয়ে বড়।"); return; }
      busy(true);
      renderPhoto(file).then(function (dataURL) {
        busy(false);
        if (!dataURL) { notify("ছবিটি পড়া যায়নি — আগের ছবিটিই থাকল।"); return; }
        save({ name: getName(nameEl), photo: dataURL });
      }, function () {
        busy(false);
        notify("ছবিটি পড়া যায়নি — আগের ছবিটিই থাকল।");
      });
    }

    /* --- picker wiring --- */
    fileEl.addEventListener("change", function () {
      onFiles(fileEl.files);
      fileEl.value = "";                 // let the same file be picked again
    });
    drop.addEventListener("click", function (e) {
      e.preventDefault();
      fileEl.click();
    });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        fileEl.click();
      }
    });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.toggleAttribute("data-over", true); });
    drop.addEventListener("dragenter", function (e) { e.preventDefault(); drop.toggleAttribute("data-over", true); });
    drop.addEventListener("dragleave", function () { drop.removeAttribute("data-over"); });
    drop.addEventListener("dragend", function () { drop.removeAttribute("data-over"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.removeAttribute("data-over");
      if (e.dataTransfer && e.dataTransfer.files) onFiles(e.dataTransfer.files);
    });

    /* --- name wiring: enforce ≤24 as you type, save once you pause or leave --- */
    function commitName() {
      clearTimeout(saveTimer);
      saveTimer = 0;
      save({ name: getName(nameEl) });
    }
    nameEl.addEventListener("input", function () {
      var v = getName(nameEl);
      if (v.length > MAX_NAME) { v = v.slice(0, MAX_NAME); setName(nameEl, v); }
      clearTimeout(saveTimer);
      saveTimer = w.setTimeout(function () { save({ name: getName(nameEl) }); }, 350);
    });
    nameEl.addEventListener("change", commitName);
    nameEl.addEventListener("blur", commitName);

    /* --- the controller --- */
    function sync(p) {
      p = p || { name: "", photo: null };
      /* don't clobber what the user is typing right now */
      if (d.activeElement !== nameEl && getName(nameEl) !== p.name) setName(nameEl, p.name);
      applyAvatar(avatar, p.photo);
    }

    var instance = {
      root: root,
      nameEl: nameEl,
      avatar: avatar,
      drop: drop,
      fileEl: fileEl,
      sync: sync,
      destroy: function () {
        clearTimeout(saveTimer);
        var i = mounts.indexOf(instance);
        if (i >= 0) mounts.splice(i, 1);
        try { delete root.__a64p; } catch (e) { root.__a64p = null; }
      }
    };
    root.__a64p = instance;
    mounts.push(instance);

    /* Reflect what is already stored (also repaints the masthead avatar). */
    renderAll(load());
    return instance;
  }

  /* ------------------------------------------------------------------- API */
  w.A64P = {
    KEY: KEY,
    MAX_NAME: MAX_NAME,
    MAX_BYTES: MAX_BYTES,
    SIZE: SIDE,
    load: load,
    has: has,
    save: save,
    clear: clear,
    mount: mount,
    applyAvatar: applyAvatar
  };
})(window, document);
