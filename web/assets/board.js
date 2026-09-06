/* Mood board — a single canvas you arrange photos on.
   Vanilla JS, no build step, works from file:// or any static host. */

(function () {
  "use strict";

  var KEY = "moodboard.canvas.v1";
  var MIN = 40;          // smallest item edge, in page units
  var GRID = 8;          // move snap
  var MARGIN = 40, GUTTER = 16, COLS = 4;

  var page, stage, scroller, pagewrap, tray, trayList, actions, pagebar;
  var lib = window.LIBRARY.slice();
  var grounds = window.GROUNDS;
  var doc = null;        // { boards: [...], active: n } — one board per look
  var board = null;      // shorthand for doc.boards[doc.active]
  var zoom = 1, sel = null, uid = 0;
  var TRAY_MIN = 150, TRAY_MAX = 620, TRAY_DEFAULT = 300;
  var trayW = TRAY_DEFAULT, trayCollapsed = false;
  var fitOn = true, savedZoom = 0, sawSavedUi = false;
  var undoStack = [], redoStack = [];
  var downloads = null;
  var natural = {};      // key -> [w, h]

  /* ============================ boot ============================ */

  document.addEventListener("DOMContentLoaded", function () {
    page = document.getElementById("page");
    stage = document.getElementById("stage");
    scroller = document.getElementById("scroller");
    pagewrap = document.getElementById("pagewrap");
    tray = document.getElementById("tray");
    trayList = document.getElementById("tray-list");
    actions = document.getElementById("actions");
    pagebar = document.getElementById("pagebar");

    wireToolbar();
    wireStage();
    wireKeys();
    wireDrop();
    wireCropper();
    wireTrayGrip();
    wireStickers();
    wireViews();
    wireResponsive();

    load();
    // first visit on a phone: the board matters more than the tray
    if (!sawSavedUi && window.innerWidth <= NARROW) trayCollapsed = true;
    applyTray();
    setView(view);
    preloadAll().then(function () {
      if (!doc) {
        doc = { boards: [buildDefault()], active: 0 };
        board = doc.boards[0];
        arrange();
      }
      render();
      syncFit();
      if (fitOn || !savedZoom) fitZoom(); else setZoom(savedZoom);
    });

    if (window.claude && window.claude.use) {
      window.claude.use("downloads").then(function (d) { downloads = d; }).catch(function () {});
    }
  });

  function preloadAll() {
    return Promise.all(lib.map(function (p) {
      return new Promise(function (res) {
        if (natural[p.key]) return res();
        var im = new Image();
        im.onload = function () { natural[p.key] = [im.naturalWidth, im.naturalHeight]; res(); };
        im.onerror = function () { natural[p.key] = [943, 2048]; res(); };
        im.src = p.src;
      });
    }));
  }

  function libOf(key) {
    for (var i = 0; i < lib.length; i++) if (lib[i].key === key) return lib[i];
    return null;
  }

  /* photo aspect (height / width) after its crop is applied */
  function aspectOf(key, crop) {
    var n = natural[key] || [943, 2048];
    var c = crop || [0, 0, 100, 100];
    return (n[1] * c[3]) / (n[0] * c[2]);
  }

  /* ============================ state ============================ */

  /* Only the curated subset goes on the default board — the rest stay in the tray.
     Uploads are never auto-placed, which is what keeps Reset from touching them. */
  function buildDefault() {
    var d = window.DEFAULT_BOARD;
    var items = d.items.map(function (it) {
      return Object.assign({ id: ++uid, x: 0, y: 0, rot: 0, z: ++uid }, it);
    });
    (d.photos || []).forEach(function (key) {
      var p = libOf(key);
      if (!p) return;
      items.push({
        id: ++uid, kind: "photo", img: p.key, crop: p.crop.slice(),
        span: p.hero ? 2 : 1, x: 0, y: 0, w: 0, h: 0, rot: 0, z: ++uid
      });
    });
    (d.stickers || []).forEach(function (s) {
      items.push(Object.assign({ id: ++uid, kind: "sticker", x: 0, y: 0, z: ++uid }, s));
    });
    return { name: d.name || "Board", bg: d.bg, w: d.w, h: 1000, items: items };
  }

  function save() {
    if (!doc) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        doc: doc,
        uploads: lib.filter(function (p) { return p.local; }),
        ui: { trayW: trayW, trayCollapsed: trayCollapsed, view: view, report: report, zoom: zoom, fitOn: fitOn }
      }));
    } catch (e) {
      toast("Could not save — browser storage is full. Delete a photo from the tray, or export the board.");
    }
    // Always after the write: callers do render() then save(), so a meter drawn
    // during render() would be reporting the previous state.
    renderMeter();
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p.ui) {
        if (p.ui.trayW) trayW = clampTray(p.ui.trayW);
        trayCollapsed = !!p.ui.trayCollapsed;
        sawSavedUi = true;
        if (p.ui.view) view = p.ui.view;
        if (p.ui.report) report = p.ui.report;
        if (typeof p.ui.fitOn === "boolean") fitOn = p.ui.fitOn;
        if (p.ui.zoom) savedZoom = p.ui.zoom;
      }
      if (p.uploads && p.uploads.length) {
        p.uploads.forEach(function (u) { if (!libOf(u.key)) lib.push(u); });
      }
      var d = p.doc || (p.board && p.board.items ? { boards: [p.board], active: 0 } : null);
      if (d && d.boards && d.boards.length) adopt(d);
    } catch (e) { /* blocked or corrupt — start fresh */ }
  }

  /* Point the module at a document and re-derive the id counter. */
  function adopt(d) {
    doc = d;
    doc.active = Math.max(0, Math.min(doc.active || 0, doc.boards.length - 1));
    board = doc.boards[doc.active];
    doc.boards.forEach(function (b) {
      if (!b.name) b.name = "Board";
      b.items.forEach(function (it) { uid = Math.max(uid, it.id || 0, it.z || 0); });
    });
  }

  function snapshot() {
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    syncUndo();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    adopt(JSON.parse(undoStack.pop()));
    sel = null; render(); save(); syncUndo();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    adopt(JSON.parse(redoStack.pop()));
    sel = null; render(); save(); syncUndo();
  }

  /* ============================ boards (one per look) ============================ */

  function setActive(i) {
    if (i === doc.active) return;
    doc.active = i;
    board = doc.boards[i];
    sel = null;
    render(); refit(); save();
  }

  function addBoard(from) {
    snapshot();
    var b;
    if (from) {
      b = JSON.parse(JSON.stringify(from));
      b.name = from.name + " copy";
      b.items.forEach(function (it) { it.id = ++uid; });
    } else {
      b = { name: "New look", bg: board.bg, w: board.w, h: 700, items: [
        { id: ++uid, kind: "text", text: "LOOK NAME", font: "display", size: 60,
          color: readable(board.bg), x: 40, y: 40, w: 700, h: 76, rot: 0, z: ++uid },
        { id: ++uid, kind: "text", text: "DIRECTION — one sentence.\nKEYWORDS — three to five words.",
          font: "mono", size: 15, color: "#a3be71", x: 40, y: 132, w: 700, h: 60, rot: 0, z: ++uid }
      ] };
    }
    doc.boards.push(b);
    doc.active = doc.boards.length - 1;
    board = b;
    sel = null;
    render(); refit(); save();
  }

  function renameBoard() {
    var n = prompt("Name this board — use the look it briefs, e.g. “Skogsrå — dark nymph”.", board.name);
    if (n === null) return;
    snapshot();
    board.name = n.trim() || board.name;
    render(); save();
  }

  /* Closes any board, not just the active one — the tabs each carry their own ×. */
  function deleteBoard(i) {
    if (i == null) i = doc.active;
    if (doc.boards.length < 2) { toast("This is the only board — reset it instead of deleting it."); return; }
    if (!confirm("Delete the board “" + doc.boards[i].name + "”? Everything on it goes with it.")) return;
    snapshot();
    doc.boards.splice(i, 1);
    if (doc.active >= doc.boards.length) doc.active = doc.boards.length - 1;
    else if (i < doc.active) doc.active -= 1;
    board = doc.boards[doc.active];
    sel = null;
    render(); refit(); save();
  }

  function renderPages() {
    pagebar.innerHTML = "";
    var only = doc.boards.length < 2;
    doc.boards.forEach(function (b, i) {
      var t = document.createElement("button");
      t.className = "tab" + (i === doc.active ? " on" : "") + (only ? " only" : "");
      t.title = b.name + " — " +
        b.items.filter(function (x) { return x.kind === "photo"; }).length + " photos";

      var name = document.createElement("span");
      name.className = "name";
      name.textContent = b.name;
      t.appendChild(name);

      var x = document.createElement("span");
      x.className = "x";
      x.setAttribute("role", "button");
      x.setAttribute("aria-label", "Delete " + b.name);
      x.title = "Delete this board";
      x.textContent = "×";
      x.onclick = function (e) { e.stopPropagation(); deleteBoard(i); };
      t.appendChild(x);

      t.onclick = function () { i === doc.active ? renameBoard() : setActive(i); };
      pagebar.appendChild(t);
    });

    /* Drawn, not typed: a font's "+" is lighter than a 1.6 stroke and sat thin
       next to the icons beside it. Same weight and caps as the rest now. */
    var ADD_ICON =
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M8 3.4v9.2M3.4 8h9.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>';
    var DUP_ICON =
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<rect x="2.2" y="2.2" width="8.4" height="8.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M5.4 13.8h6.2a2.2 2.2 0 0 0 2.2-2.2V5.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>';
    pagebar.appendChild(mk(ADD_ICON, addBoard.bind(null, null), "New board", null, "Board"));
    pagebar.appendChild(mk(DUP_ICON, function () { addBoard(board); }, "Duplicate this board", null, "Duplicate"));

    /* A glyph, or drawn markup when the glyph is not the same shape on every
       platform — iOS renders the arrow characters as something else entirely. */
    function mk(sym, fn, title, cls, label) {
      var drawn = sym.charAt(0) === "<";
      var b = document.createElement("button");
      b.className = "ghost" + (cls ? " " + cls : "");
      b.innerHTML = '<i class="ico' + (drawn ? '' : ' sym') + '">' +
        (drawn ? sym : esc(sym)) + '</i>' +
        (label ? '<span class="lbl">' + esc(label) + "</span>" : "");
      b.title = title;
      b.setAttribute("aria-label", title);
      b.onclick = fn;
      return b;
    }
  }

  function syncUndo() {
    document.getElementById("undo").disabled = !undoStack.length;
    document.getElementById("redo").disabled = !redoStack.length;
    syncIdSlot();
  }

  /* On a narrow bar the name holds the space until there is history worth
     showing, then hands it over. Two dead buttons are worse than a wordmark —
     and in the research view they undo nothing you can see, so the name keeps
     the space there however deep the board history is. */
  function syncIdSlot() {
    document.getElementById("bar")
      .classList.toggle("showhistory", view === "board" && undoStack.length > 0);
  }

  function itemById(id) {
    for (var i = 0; i < board.items.length; i++) if (board.items[i].id === id) return board.items[i];
    return null;
  }

  function topZ() {
    return board.items.reduce(function (m, i) { return Math.max(m, i.z || 0); }, 0);
  }

  /* ============================ auto-arrange ============================ */
  /* Masonry with column spans: the hero photo takes two columns, so it reads
     as the most important thing on the board. */

  function arrange() {
    var colW = (board.w - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS;
    var tops = [];
    for (var i = 0; i < COLS; i++) tops.push(MARGIN);

    // Stickers float on top of the layout, so the masonry ignores them.
    var order = board.items.filter(function (it) { return it.kind !== "sticker"; })
      .sort(function (a, b) {
        var rank = { text: 0, photo: 1, swatch: 2 };
        return (rank[a.kind] - rank[b.kind]) || ((b.span || 1) - (a.span || 1));
      });

    order.forEach(function (it) {
      var span = Math.min(it.span || 1, COLS);
      var best = 0, bestTop = Infinity;
      for (var c = 0; c + span <= COLS; c++) {
        var t = Math.max.apply(null, tops.slice(c, c + span));
        if (t < bestTop - 0.5) { bestTop = t; best = c; }
      }
      var w = colW * span + GUTTER * (span - 1);
      var h = it.kind === "photo" ? w * aspectOf(it.img, it.crop) : (it.h || 100);
      if (it.kind !== "photo") w = colW * span + GUTTER * (span - 1);

      it.x = MARGIN + best * (colW + GUTTER);
      it.y = bestTop;
      it.w = w;
      it.h = h;
      it.rot = 0;
      for (var k = best; k < best + span; k++) tops[k] = bestTop + h + GUTTER;
    });

    board.h = Math.max.apply(null, tops) - GUTTER + MARGIN;
    if (board.fixedH) fitToHeight();
    placeFloats();
  }

  /* Stickers are laid over the finished board once the masonry is settled.
     `anchor` pins one to a photo's corner — the junction where up to four items
     meet — so it reads as resting on the layout instead of floating in a gap,
     and it covers corners rather than faces. `fx`/`fy` is the fallback for a
     plain fractional position. Dragging clears both. */
  function placeFloats() {
    board.items.forEach(function (it) {
      if (it.kind !== "sticker") return;

      if (it.anchor) {
        var host = null;
        board.items.forEach(function (o) {
          if (o.kind === "photo" && o.img === it.anchor.img) host = o;
        });
        if (host) {
          var c = it.anchor.corner || "se";
          var px = host.x + (c[1] === "e" ? host.w : 0);
          var py = host.y + (c[0] === "s" ? host.h : 0);
          it.x = Math.round(px - it.w / 2 + (it.anchor.dx || 0));
          it.y = Math.round(py - it.h / 2 + (it.anchor.dy || 0));
          return;
        }
      }
      if (it.fx != null) {
        it.x = Math.round(board.w * it.fx);
        it.y = Math.round(board.h * it.fy);
      }
    });
  }

  /* Presets with a fixed height (a 16:9 slide, a square) can't grow downward, so
     scale the arranged content uniformly until it fits inside the margins. */
  function fitToHeight() {
    var target = board.fixedH;
    var inner = target - MARGIN * 2;
    var content = board.h - MARGIN * 2;
    if (content <= 0) return;
    var k = inner / content;
    board.items.forEach(function (it) {
      it.x = Math.round(MARGIN + (it.x - MARGIN) * k);
      it.y = Math.round(MARGIN + (it.y - MARGIN) * k);
      it.w = Math.round(it.w * k);
      it.h = Math.round(it.h * k);
      if (it.size) it.size = Math.max(7, Math.round(it.size * k));
    });
    board.h = target;
  }

  var SIZES = [
    { key: "tall", label: "Tall", w: 1600, fixedH: 0, title: "Grows as you add — best for collecting" },
    { key: "slide", label: "16:9", w: 1920, fixedH: 1080, title: "Slide-ready, for a deck or a portfolio page" },
    { key: "square", label: "1:1", w: 1400, fixedH: 1400, title: "Square, for Instagram" },
    { key: "a4", label: "A4", w: 1240, fixedH: 1754, title: "A4 portrait, for printing" }
  ];

  function renderSizes() {
    var host = document.getElementById("sizes");
    host.innerHTML = "";
    SIZES.forEach(function (s) {
      var b = document.createElement("button");
      b.textContent = s.label;
      b.title = s.title;
      b.dataset.key = s.key;
      b.onclick = function () {
        snapshot();
        board.w = s.w;
        board.fixedH = s.fixedH;
        board.size = s.key;
        arrange();
        sel = null; render(); refit(); save();
      };
      host.appendChild(b);
    });
  }

  function syncSizes() {
    document.querySelectorAll("#sizes button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.key === (board.size || "tall"));
    });
  }

  /* ============================ render ============================ */

  function render() {
    page.style.width = board.w + "px";
    page.style.height = board.h + "px";
    page.style.background = board.bg;
    page.style.transformOrigin = "top left";
    page.style.transform = "scale(" + zoom + ")";
    pagewrap.style.width = board.w * zoom + "px";
    pagewrap.style.height = board.h * zoom + "px";

    page.innerHTML = "";
    board.items.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (it) {
      page.appendChild(nodeFor(it));
    });

    renderTray();
    renderMeter();
    renderPages();
    syncGrounds();
    syncSizes();
    placeActions();
  }

  function nodeFor(it) {
    var el = document.createElement("div");
    el.className = "item" + (sel === it.id ? " sel" : "");
    el.dataset.id = it.id;
    el.style.left = it.x + "px";
    el.style.top = it.y + "px";
    el.style.width = it.w + "px";
    el.style.height = it.h + "px";
    el.style.zIndex = it.z;
    var tf = (it.rot ? "rotate(" + it.rot + "deg) " : "") +
             (it.flipX ? "scaleX(-1) " : "") + (it.flipY ? "scaleY(-1)" : "");
    if (tf.trim()) el.style.transform = tf.trim();

    if (it.kind === "photo") {
      var p = libOf(it.img);
      var c = it.crop || [0, 0, 100, 100];
      var d = document.createElement("div");
      d.className = "photo" + (it.shape === "circle" ? " circle" : "") + (it.frame ? " f-" + it.frame : "");
      if (p) {
        d.style.backgroundImage = 'url("' + p.src + '")';
        d.style.backgroundSize = (10000 / c[2]) + "% " + (10000 / c[3]) + "%";
        d.style.backgroundPosition =
          (c[2] >= 100 ? 50 : 100 * c[0] / (100 - c[2])) + "% " +
          (c[3] >= 100 ? 50 : 100 * c[1] / (100 - c[3])) + "%";
      }
      el.appendChild(d);

    } else if (it.kind === "text") {
      var t = document.createElement("div");
      t.className = "txt";
      t.style.fontFamily = "var(--" + (it.font || "sans") + ")";
      t.style.fontSize = it.size + "px";
      t.style.lineHeight = 1.22;
      t.style.color = it.color;
      t.style.letterSpacing = it.font === "display" ? "0.01em" : "0.02em";
      t.textContent = it.text;
      t.addEventListener("dblclick", function (e) { e.stopPropagation(); editText(it, t); });
      el.appendChild(t);

    } else if (it.kind === "sticker") {
      var st = document.createElement("div");
      st.className = "sticker";
      st.innerHTML = '<img src="' + stickerOf(it.sticker).src + '" alt="" draggable="false">';
      el.appendChild(st);

    } else if (it.kind === "swatch") {
      var s = document.createElement("div");
      s.className = "swatch";
      s.style.color = readable(board.bg);
      s.innerHTML = '<div class="lbl"></div><div class="row">' +
        it.colors.map(function (c) {
          return '<span class="chip"><i style="background:' + c + '"></i><b>' + c.toUpperCase() + "</b></span>";
        }).join("") + "</div>";
      s.querySelector(".lbl").textContent = it.label || "";
      el.appendChild(s);
    }

    /* The name and id live on the photo, not in the floating bar — that bar is
       for controls only. Double-click the name to rename it. */
    if (sel === it.id && it.kind === "photo") {
      var p2 = libOf(it.img);
      var lab = document.createElement("div");
      lab.className = "idlabel";
      lab.innerHTML = '<span class="pid">' + esc(it.img) + '</span>' +
        '<span class="pname" title="Double-click to rename">' + esc(titleOf(it.img)) + "</span>";
      var nameEl = lab.querySelector(".pname");
      nameEl.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        editName(it.img, nameEl);
      });
      lab.addEventListener("pointerdown", function (e) {
        if (nameEl.getAttribute("contenteditable") === "true") e.stopPropagation();
      });
      el.appendChild(lab);
      if (!p2) nameEl.textContent = "(missing photo)";
    }

    if (sel === it.id) {
      ["nw", "ne", "sw", "se", "rot"].forEach(function (k) {
        var h = document.createElement("div");
        h.className = "handle " + k;
        if (k === "rot") h.title = "Drag to rotate · hold Shift to snap to 15°";
        h.dataset.handle = k;
        el.appendChild(h);
      });
    }
    return el;
  }

  function readable(hex) {
    var c = hex.replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? "#20241a" : "#ede8d9";
  }

  /* ============================ tray ============================ */

  /* Titles can be renamed; overrides are saved per board document so a photo
     downloaded as "791013238_1068024832702535" doesn't stay called that. */
  function titleOf(key) {
    if (doc && doc.titles && doc.titles[key]) return doc.titles[key];
    var p = libOf(key);
    return p ? p.title : key;
  }

  function editName(key, node) {
    node.setAttribute("contenteditable", "true");
    node.focus();
    var r = document.createRange();
    r.selectNodeContents(node);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);

    function done() {
      node.removeEventListener("blur", done);
      node.removeEventListener("keydown", key2);
      node.removeAttribute("contenteditable");
      var next = node.innerText.replace(/\s+/g, " ").trim();
      var p = libOf(key);
      if (next && next !== (p ? p.title : "")) {
        snapshot();
        if (!doc.titles) doc.titles = {};
        doc.titles[key] = next;
      } else if (!next && doc.titles) {
        delete doc.titles[key];
      }
      render(); save();
    }
    function key2(e) {
      if (e.key === "Enter") { e.preventDefault(); node.blur(); }
      if (e.key === "Escape") { e.preventDefault(); node.textContent = titleOf(key); node.blur(); }
    }
    node.addEventListener("blur", done);
    node.addEventListener("keydown", key2);
  }

  function renderTray() {
    var used = {};
    board.items.forEach(function (i) { if (i.kind === "photo") used[i.img] = true; });
    var selItem = sel != null ? itemById(sel) : null;
    var activeKey = selItem && selItem.kind === "photo" ? selItem.img : null;

    trayList.innerHTML = "";
    lib.forEach(function (p) {
      var wrap = document.createElement("div");
      wrap.className = "tile-wrap";

      var b = document.createElement("button");
      b.className = "tile" + (used[p.key] ? " used" : "") + (p.key === activeKey ? " active" : "");
      b.type = "button";
      b.dataset.key = p.key;
      b.title = titleOf(p.key) + (used[p.key] ? " — already on the board" : " — click to add");

      var c = p.crop || [0, 0, 100, 100];
      var f = document.createElement("div");
      f.className = "fill";
      f.style.backgroundImage = 'url("' + p.src + '")';
      f.style.backgroundSize = "cover";
      f.style.backgroundPosition = "center " + (c[3] >= 100 ? 50 : 100 * c[1] / (100 - c[3])) + "%";
      b.appendChild(f);

      var n = document.createElement("span");
      n.className = "n";
      n.textContent = p.key;
      b.appendChild(n);

      b.onclick = function () {
        addPhoto(p.key);
        if (isNarrow()) { trayCollapsed = true; applyTray(); refit(); save(); }
      };
      wrap.appendChild(b);

      if (p.local) {
        var kill = document.createElement("button");
        kill.className = "kill";
        kill.type = "button";
        kill.textContent = "✕";
        kill.title = "Delete this photo and free its storage";
        kill.setAttribute("aria-label", "Delete " + p.title + " from the tray");
        kill.onclick = function (e) { e.stopPropagation(); deleteUpload(p); };
        wrap.appendChild(kill);
      }

      trayList.appendChild(wrap);
    });

    if (activeKey) revealTile(activeKey);
  }

  /* Bring the selected photo's tile into view without yanking the whole page. */
  function revealTile(key) {
    var tile = trayList.querySelector('.tile[data-key="' + key + '"]');
    if (!tile) return;
    var t = tile.getBoundingClientRect(), l = trayList.getBoundingClientRect();
    if (t.top < l.top + 4 || t.bottom > l.bottom - 4) {
      trayList.scrollTo({
        top: trayList.scrollTop + (t.top - l.top) - (l.height / 2 - t.height / 2),
        behavior: "smooth"
      });
    }
  }

  /* Deleting an upload also has to take it off every board — otherwise the item
     survives pointing at a photo that no longer exists and renders as a blank box. */
  function deleteUpload(p) {
    var onBoards = doc.boards.filter(function (b) {
      return b.items.some(function (it) { return it.kind === "photo" && it.img === p.key; });
    });

    var msg = "Delete “" + p.title + "” and free its storage?";
    if (onBoards.length) {
      msg += "\n\nIt is used on " + onBoards.length + " board" + (onBoards.length > 1 ? "s" : "") +
             " (" + onBoards.map(function (b) { return b.name; }).join(", ") + ") and will be removed from " +
             (onBoards.length > 1 ? "those too" : "that too") + ".";
    }
    msg += "\n\nThis cannot be undone by Ctrl+Z — export the board first if you want it back.";
    if (!confirm(msg)) return;

    doc.boards.forEach(function (b) {
      b.items = b.items.filter(function (it) { return !(it.kind === "photo" && it.img === p.key); });
    });
    lib = lib.filter(function (x) { return x.key !== p.key; });
    delete natural[p.key];
    if (sel != null && !itemById(sel)) sel = null;

    undoStack.length = 0;
    redoStack.length = 0;
    syncUndo();

    render(); save();
    toast("Deleted “" + p.title + "”.");
  }

  /* Uploaded photos live in localStorage as base64 text, and that has a hard
     ceiling (~5 MB, counted as UTF-16). Show it rather than let it surprise anyone. */
  var QUOTA = 5 * 1024 * 1024;

  function renderMeter() {
    var fill = document.getElementById("meter-fill");
    var text = document.getElementById("meter-text");
    if (!fill) return;

    var used = 0;
    try {
      var raw = localStorage.getItem(KEY);
      used = raw ? raw.length * 2 : 0;
    } catch (e) { /* storage blocked — show nothing useful, but don't crash */ }

    var n = lib.filter(function (p) { return p.local; }).length;
    var pct = Math.min(100, Math.round(used / QUOTA * 100));
    fill.style.width = pct + "%";
    fill.parentNode.classList.toggle("warn", pct >= 80);
    text.textContent = n
      ? n + " uploaded · " + (used / 1048576).toFixed(1) + " MB of ~5 MB"
      : (used / 1048576).toFixed(1) + " MB of ~5 MB used";
  }

  function addPhoto(key) {
    var p = libOf(key);
    if (!p) return;
    snapshot();
    var w = 320;
    var it = {
      id: ++uid, kind: "photo", img: key, crop: p.crop.slice(),
      x: Math.round(board.w / 2 - w / 2 + (Math.random() * 60 - 30)),
      y: Math.round(scrollCenterY() - w * aspectOf(key, p.crop) / 2),
      w: w, h: Math.round(w * aspectOf(key, p.crop)),
      rot: 0, z: topZ() + 1
    };
    board.items.push(it);
    sel = it.id;
    render(); save();
  }

  function scrollCenterY() {
    var y = (stage.scrollTop + stage.clientHeight / 2 - 34) / zoom;
    return Math.max(MARGIN, Math.min(board.h - 100, y));
  }

  /* ============================ toolbar ============================ */

  /* ---- views: the board, and the research behind it ---- */

  var view = "board";
  var report = "fantasy";
  var SWAP_AT = 90;        // scroll depth at which ideas give way to sections

  function setView(v) {
    view = v;
    var research = v === "research";

    document.getElementById("body").hidden = research;
    document.getElementById("research").hidden = !research;
    document.getElementById("pagebar-wrap").hidden = research;
    document.getElementById("researchbar").hidden = !research;
    document.getElementById("board-tools").hidden = research;
    document.getElementById("totop").hidden = !research;

    document.getElementById("view-board-tab").classList.toggle("on", !research);
    document.getElementById("view-research-tab").classList.toggle("on", research);

    // setView also runs at boot, before the board is loaded — guard both calls.
    if (research) {
      // Drop the selection outright. Hiding the bar isn't enough: any later
      // placeActions() — a scroll, a resize — would put it back over the report.
      if (sel != null) { sel = null; if (board) render(); }
      actions.classList.add("away");
      setReport(report);
    } else if (board) {
      refit();
    }
    syncIdSlot();
    syncMore();
    if (doc) save();
  }

  /* ---- the reports ---- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ============================ stickers ============================ */
  /* Photographic cut-outs with a real alpha channel — see data.js for sources
     and licences. Each is a normal board item: move, resize, rotate, delete. */

  var STICKERS = window.STICKERS || [];

  function stickerOf(key) {
    for (var i = 0; i < STICKERS.length; i++) if (STICKERS[i].key === key) return STICKERS[i];
    return STICKERS[0];
  }

  function addSticker(key) {
    var s = stickerOf(key);
    snapshot();
    var it = {
      id: ++uid, kind: "sticker", sticker: key,
      x: Math.round(board.w / 2 - s.w / 2 + (Math.random() * 80 - 40)),
      y: Math.round(scrollCenterY()),
      w: s.w, h: s.h,
      rot: Math.round(Math.random() * 30 - 15),
      z: topZ() + 1
    };
    board.items.push(it);
    sel = it.id;
    growPage(); render(); save();
  }

  function wireStickers() {
    var pop = document.getElementById("stickers");
    STICKERS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.title = s.label;
      b.setAttribute("aria-label", "Add " + s.label);
      b.innerHTML = '<img src="' + s.src + '" alt="">';
      b.onclick = function () { pop.hidden = true; addSticker(s.key); };
      pop.appendChild(b);
    });

    var open = document.getElementById("add-sticker");
    open.onclick = function (e) {
      e.stopPropagation();
      if (!pop.hidden) { pop.hidden = true; return; }
      var r = open.getBoundingClientRect();
      pop.hidden = false;
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - pop.offsetWidth - 10)) + "px";
      pop.style.top = Math.round(r.bottom + 8) + "px";
    };
    document.addEventListener("pointerdown", function (e) {
      if (!pop.hidden && !pop.contains(e.target) && e.target !== open) pop.hidden = true;
    });
  }

  function reports() {
    return Array.prototype.slice.call(document.querySelectorAll("#research .report"));
  }

  function setReport(id) {
    report = id;
    var host = document.getElementById("research");

    reports().forEach(function (r) {
      r.hidden = r.id !== "report-" + id;
    });

    labelSections();
    buildIdeaBar();
    buildProgress();
    host.scrollTop = 0;
    onResearchScroll();
    if (doc) save();
  }

  /* Section ids and numbers are derived from the DOM, so a new report needs no
     extra wiring — drop in an <article class="report"> and it appears here. */
  function labelSections() {
    reports().forEach(function (r) {
      r.querySelectorAll("h2").forEach(function (h, i) {
        if (!h.id) h.id = r.id + "-s" + (i + 1);
      });
    });
  }

  function sectionsOf(id) {
    var r = document.getElementById("report-" + id);
    return r ? Array.prototype.slice.call(r.querySelectorAll("h2")) : [];
  }

  function buildIdeaBar() {
    var bar = document.getElementById("ideabar");
    bar.innerHTML = "";
    reports().forEach(function (r) {
      var id = r.id.replace("report-", "");
      var b = document.createElement("button");
      b.className = "idea" + (id === report ? " on" : "");
      var full = r.dataset.title || id;
      b.innerHTML = '<span class="long">' + esc(full) + "</span>" +
        '<span class="short">' + esc(r.dataset.short || full) + "</span>";
      b.title = full;
      b.onclick = function () { setReport(id); };
      bar.appendChild(b);
    });
  }

  /* Numbers, not names. The bar has room for one report title and a rail; the
     section names never survived that width, so they live in the tooltip. */
  function buildProgress() {
    var bar = document.getElementById("progress");
    bar.innerHTML = "";
    sectionsOf(report).forEach(function (h, i) {
      var name = h.dataset.toc || h.textContent.replace(/^d+/, "").trim();
      var b = document.createElement("button");
      b.className = "pnode";
      b.dataset.target = h.id;
      b.textContent = String(i + 1);
      b.title = name;
      b.setAttribute("aria-label", name);
      // no lingering focus ring: the scroll position is what lights a dot
      b.onclick = function () { b.blur(); scrollToSection(h); };
      bar.appendChild(b);
    });
  }

  function scrollToSection(h) {
    var host = document.getElementById("research");
    host.scrollTo({ top: h.offsetTop - 18, behavior: "smooth" });
  }

  var scrollQueued = false;
  function onResearchScroll() {
    var host = document.getElementById("research");
    var y = host.scrollTop;

    document.getElementById("researchbar").classList.toggle("deep", y > SWAP_AT);
    document.getElementById("totop").classList.toggle("away", y < 260);

    /* "Now" is the section you are looking at, so a heading claims the dot as
       it crosses into the upper part of the viewport — not when it leaves the
       top, which lit the next dot a whole screen too late. Measured off rects:
       these headings sit in a scrolling container whose offsetParent is BODY,
       so offsetTop and scrollTop are not in the same coordinate space. */
    var hr = host.getBoundingClientRect();
    var line = hr.top + hr.height * 0.4;
    var secs = sectionsOf(report), at = -1;
    secs.forEach(function (h, i) { if (h.getBoundingClientRect().top <= line) at = i; });

    var nodes = document.querySelectorAll("#progress .pnode");
    nodes.forEach(function (b, i) {
      b.classList.toggle("now", i === at);
      b.classList.toggle("past", i < at);
      b.setAttribute("aria-current", i === at ? "true" : "false");
    });

    if (y > SWAP_AT) centreActiveNode();
  }

  /* Keep the moving dot in view — on a phone the rail is wider than the bar.
     The width guard matters: this also runs on the scroll that first opens the
     rail, and a rail measured mid-transition is narrower than a single node,
     which turns the centring arithmetic inside out. */
  function centreActiveNode() {
    var bar = document.getElementById("progress");
    if (bar.clientWidth < 60) return;
    var on = bar.querySelector(".pnode.now");
    if (!on) return;
    var r = on.getBoundingClientRect(), br = bar.getBoundingClientRect();
    if (r.left >= br.left + 10 && r.right <= br.right - 10) return;
    var to = bar.scrollLeft + (r.left - br.left) - (br.width - r.width) / 2;
    to = Math.max(0, Math.min(to, bar.scrollWidth - bar.clientWidth));
    bar.scrollTo({ left: to, behavior: "smooth" });
  }

  function wireViews() {
    // …and once it has finished opening, when there is finally a width to centre into
    document.getElementById("progress").addEventListener("transitionend", function (e) {
      if (e.propertyName === "max-width") centreActiveNode();
    });

    document.getElementById("view-board-tab").onclick = function () { setView("board"); };
    document.getElementById("view-research-tab").onclick = function () { setView("research"); };

    document.getElementById("research").addEventListener("scroll", function () {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function () { scrollQueued = false; onResearchScroll(); });
    });

    document.getElementById("totop").onclick = function () {
      document.getElementById("research").scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  /* ---- narrow screens ---- */

  var NARROW = 820;
  /* Secondary tools. On a phone these move into one menu instead of wrapping the
     bar onto four rows; the nodes themselves move, so handlers stay attached. */
  var OVERFLOW = ["add-text", "add-swatch", "add-sticker", "arrange",
                  "grounds", "json", "import", "sizes"];
  var homes = null;     // where each overflow node lives on a wide screen
  var histHome = null;  // and where the undo/redo pair lives there
  var narrow = null;

  function isNarrow() { return window.innerWidth <= NARROW; }

  function rememberHomes() {
    var hist = document.getElementById("history");
    if (hist) histHome = { parent: hist.parentNode, next: hist.nextSibling };
    homes = OVERFLOW.map(function (id) {
      var el = document.getElementById(id);
      return el ? { el: el, parent: el.parentNode, next: el.nextSibling } : null;
    }).filter(Boolean);
  }

  function applyResponsive() {
    var n = isNarrow();
    if (n === narrow) return;
    narrow = n;

    var menu = document.getElementById("moremenu");
    syncMore();

    // full labels don't fit beside the tools once the bar stops wrapping
    document.getElementById("view-board-tab").textContent = n ? "Board" : "Mood board";
    document.getElementById("view-research-tab").textContent = n ? "Research" : "Market research";

    var hist = document.getElementById("history");

    if (n) {
      homes.forEach(function (h) { menu.appendChild(h.el); });
      var views = document.querySelector(".views");
      views.parentNode.insertBefore(hist, views.nextSibling);   // squeeze in beside the tabs
    } else {
      homes.forEach(function (h) { h.parent.insertBefore(h.el, h.next); });
      if (histHome) histHome.parent.insertBefore(hist, histHome.next);
      closeMenu();
    }
    syncIdSlot();
    applyTray();
    refit();
  }

  /* Everything in the overflow menu is a board tool — text blocks, palettes,
     canvas sizes, the board's own export. None of it acts on a report, so the
     button that opens it has no business in the research view. */
  function syncMore() {
    var more = document.getElementById("more");
    var show = isNarrow() && view === "board";
    more.hidden = !show;
    if (!show) closeMenu();
  }

  function closeMenu() {
    document.getElementById("moremenu").hidden = true;
    document.getElementById("more").setAttribute("aria-expanded", "false");
    syncScrim();
  }

  function syncScrim() {
    var menuOpen = !document.getElementById("moremenu").hidden;
    var trayOpen = isNarrow() && !trayCollapsed;
    document.getElementById("scrim").hidden = !(menuOpen || trayOpen);
  }

  function wireResponsive() {
    rememberHomes();

    var more = document.getElementById("more");
    var menu = document.getElementById("moremenu");

    more.onclick = function (e) {
      e.stopPropagation();
      if (!menu.hidden) { closeMenu(); return; }
      menu.hidden = false;
      more.setAttribute("aria-expanded", "true");
      var r = more.getBoundingClientRect();
      menu.style.top = Math.round(r.bottom + 8) + "px";
      // clamp: if the button is flush to the edge the offset goes negative
      menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + "px";
      menu.style.left = "auto";
      syncScrim();
    };
    menu.addEventListener("click", function (e) {
      // a tool that opens its own dialog should not leave the menu covering it
      if (e.target.closest("button")) closeMenu();
    });

    document.getElementById("scrim").onclick = function () {
      closeMenu();
      if (isNarrow() && !trayCollapsed) {
        trayCollapsed = true;
        applyTray(); refit(); save();
      }
    };

    window.addEventListener("resize", applyResponsive);
    applyResponsive();
  }

  /* ---- photo tray: collapse and resize ---- */

  function clampTray(w) { return Math.max(TRAY_MIN, Math.min(TRAY_MAX, Math.round(w))); }

  function applyTray() {
    tray.classList.toggle("collapsed", trayCollapsed);
    /* On a narrow screen the drawer's width is fixed in CSS and the collapse is a
       transform, so an inline width would only fight it. */
    if (isNarrow()) tray.style.removeProperty("width");
    else tray.style.width = (trayCollapsed ? 0 : trayW) + "px";
    var t = document.getElementById("toggle-tray");
    if (t) t.classList.toggle("on", !trayCollapsed);
    var h = document.getElementById("tray-handle");
    if (h) h.setAttribute("aria-expanded", trayCollapsed ? "false" : "true");
    syncScrim();
    placeActions();
  }

  function wireTrayGrip() {
    var grip = document.getElementById("tray-grip");

    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      var x0 = e.clientX, w0 = trayW;
      grip.classList.add("dragging");
      // capture is a nicety, not a requirement — never let it abort the drag
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}

      function move(e2) {
        trayW = clampTray(w0 + (e2.clientX - x0));
        applyTray();
      }
      function up() {
        grip.classList.remove("dragging");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        refit(); save();
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    grip.addEventListener("dblclick", function () {
      trayW = TRAY_DEFAULT;
      applyTray(); refit(); save();
    });

    grip.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0;
      if (!d) return;
      e.preventDefault();
      trayW = clampTray(trayW + d);
      applyTray(); refit(); save();
    });
  }

  function wireToolbar() {
    var toggleTray = function () {
      trayCollapsed = !trayCollapsed;
      applyTray(); refit(); save();
    };
    document.getElementById("toggle-tray").onclick = toggleTray;
    document.getElementById("tray-handle").onclick = toggleTray;

    document.getElementById("add-text").onclick = function () {
      snapshot();
      var it = {
        id: ++uid, kind: "text", text: "Double-click to edit",
        font: "display", size: 42, color: readable(board.bg),
        x: Math.round(board.w / 2 - 200), y: Math.round(scrollCenterY()),
        w: 400, h: 60, rot: 0, z: topZ() + 1
      };
      board.items.push(it); sel = it.id; render(); save();
    };

    document.getElementById("add-swatch").onclick = function () {
      snapshot();
      var it = {
        id: ++uid, kind: "swatch", label: "PALETTE",
        colors: ["#2f3a2c", "#5a6b4a", "#8ba86a", "#c8c3a8", "#e8e2d2"],
        x: Math.round(board.w / 2 - 184), y: Math.round(scrollCenterY()),
        w: 368, h: 118, rot: 0, z: topZ() + 1
      };
      board.items.push(it); sel = it.id; render(); save();
    };

    document.getElementById("arrange").onclick = function () {
      snapshot();
      board.items.forEach(function (it) {
        if (it.kind === "photo") it.span = libOf(it.img) && libOf(it.img).hero ? 2 : 1;
      });
      arrange(); sel = null; render(); refit(); save();
      toast("Tidied into a grid — drag anything back out of it.");
    };

    document.getElementById("undo").onclick = undo;
    document.getElementById("redo").onclick = redo;

    document.getElementById("zin").onclick = function () { setZoom(zoom * 1.25, true); };
    document.getElementById("zout").onclick = function () { setZoom(zoom / 1.25, true); };
    document.getElementById("zfit").onclick = function () { fitOn = true; syncFit(); fitZoom(); save(); };

    var g = document.getElementById("grounds");
    grounds.forEach(function (c) {
      var i = document.createElement("i");
      i.style.background = c;
      i.dataset.c = c;
      i.title = "Background " + c;
      i.onclick = function () {
        snapshot();
        board.bg = c;
        board.items.forEach(function (it) {
          if (it.kind === "text" && (it.color === "#ede8d9" || it.color === "#20241a")) it.color = readable(c);
        });
        render(); save();
      };
      g.appendChild(i);
    });

    renderSizes();
    document.getElementById("png").onclick = exportPNG;
    document.getElementById("json").onclick = exportJSON;
    document.getElementById("import").onclick = function () { document.getElementById("import-file").click(); };
    document.getElementById("import-file").onchange = function (e) {
      var f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var p = JSON.parse(r.result);
          if (!p.board || !p.board.items) throw 0;
          snapshot();
          // write into the slot, not just the local alias — otherwise the next
          // save serialises the board this replaced
          p.board.items.forEach(function (it) { uid = Math.max(uid, it.id || 0, it.z || 0); });
          doc.boards[doc.active] = p.board;
          board = p.board;
          (p.uploads || []).forEach(function (u) { if (!libOf(u.key)) lib.push(u); });
          sel = null; render(); refit(); save();
          toast("Board imported.");
        } catch (err) { toast("That file is not a board export."); }
      };
      r.readAsText(f);
    };

    document.getElementById("upload").onclick = function () { document.getElementById("upload-file").click(); };
    document.getElementById("upload-file").onchange = function (e) {
      addFiles(Array.prototype.slice.call(e.target.files));
      e.target.value = "";
    };

    /* Resets THIS board only. Other boards, and every photo in the tray including
       uploads, are left alone — uploads are deleted one at a time from the tray.
       No confirmation: it takes a snapshot, so undo puts the board back. A prompt
       to guard a reversible action is just friction. */
    document.getElementById("reset").onclick = function () {
      snapshot();
      var fresh = buildDefault();
      doc.boards[doc.active] = fresh;
      board = fresh;
      arrange(); sel = null; render(); refit(); save();
      toast("Board reset — undo to bring it back.");
    };

    syncUndo();
  }

  function syncGrounds() {
    document.querySelectorAll("#grounds i").forEach(function (i) {
      i.setAttribute("aria-current", i.dataset.c === board.bg ? "true" : "false");
    });
  }

  /* Zoom has two modes. Fit ON re-fits whenever the space changes — load, tray
     resize, window resize, switching board. Any manual zoom turns it OFF and the
     level is remembered; pressing Fit turns it back ON. */
  function setZoom(z, manual) {
    zoom = Math.min(3, Math.max(0.1, z));
    document.getElementById("zlabel").textContent = Math.round(zoom * 100) + "%";
    page.style.transform = "scale(" + zoom + ")";
    pagewrap.style.width = board.w * zoom + "px";
    pagewrap.style.height = board.h * zoom + "px";
    if (manual && fitOn) fitOn = false;
    syncFit();
    placeActions();
    if (manual) save();
  }

  function fitScale() {
    // a phone cannot spare 80px of margin around the board
    var avail = stage.clientWidth - (isNarrow() ? 20 : 80);
    return Math.min(1, avail / board.w);
  }

  function fitZoom() { setZoom(fitScale()); }

  /* Called wherever the available space changed. Respects the toggle.
     Guards `board` because layout code also runs during boot, before load. */
  function refit() {
    if (!board) return;
    if (fitOn) fitZoom(); else placeActions();
  }

  function syncFit() {
    var b = document.getElementById("zfit");
    if (b) {
      b.classList.toggle("on", fitOn);
      b.setAttribute("aria-pressed", fitOn ? "true" : "false");
      b.title = fitOn ? "Auto-fit is on — zoom manually to turn it off" : "Fit the board and keep it fitted";
    }
    /* On a narrow bar Fit only earns its space while the board isn't fitted:
       press it, the board fits, and it folds away again. */
    var off = board ? Math.abs(zoom - fitScale()) > 0.005 : false;
    document.getElementById("bar").classList.toggle("showfit", off);
  }
  /* The action bar is position:fixed, so it has to be re-placed whenever the
     board scrolls underneath it — otherwise it detaches from its item. */
  var placeQueued = false;
  function queuePlace() {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(function () { placeQueued = false; placeActions(); });
  }
  window.addEventListener("resize", queuePlace);
  window.addEventListener("scroll", queuePlace, true);

  /* ============================ interaction ============================ */

  function pagePoint(e) {
    var r = page.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }

  /* ==================== touch gestures ====================
     A finger is ambiguous in a way a mouse never is: the same contact can mean
     tap, drag, pan or the first half of a pinch, and you cannot know which until
     it has moved. So a touch starts as `pending` and commits to one meaning only
     once it passes the slop distance — after which nothing can change it.

       SLOP      8px, Android's touch slop. Under it, a contact is still a tap.
       HOLD      500ms, the long-press both platforms use.
       Selection gates dragging: an unselected item pans the canvas, because a
       finger landing on a photo usually means "scroll", not "move this".
       A second finger always wins — it cancels whatever one finger was doing
       and rewinds the item it had begun to move. */

  var SLOP = 8, HOLD = 500;
  var gestureBusy = false;

  /* While a finger is moving something, the floating bar is in the way and
     stale — it belongs to a position that is changing. Park it until the
     gesture ends. */
  function setGestureBusy(on) {
    if (gestureBusy === on) return;
    gestureBusy = on;
    if (on) actions.classList.add("away");
    else placeActions();
  }

  /* Once something is selected, a photo's tappable area shrinks to its middle.
     Tapping a photo's edge then means "I'm done with this selection" rather
     than "select that one instead" — which is the only intuitive way to
     dismiss a selection on a touchscreen, where there is often no empty canvas
     within reach. With nothing selected, the whole photo is tappable. */
  function inCore(item, x, y) {
    var node = page.querySelector('.item[data-id="' + item.id + '"]');
    if (!node) return true;
    var r = node.getBoundingClientRect();
    var inset = Math.max(10, Math.min(r.width, r.height) * 0.25);
    return x > r.left + inset && x < r.right - inset &&
           y > r.top + inset && y < r.bottom - inset;
  }

  function wireStage() {
    var touches = {};        // live touch points, by pointerId
    var g = null;            // the one-finger gesture in progress
    var pinch = null;
    var hold = null;

    function clearHold() { clearTimeout(hold); hold = null; }

    function endGesture() {
      clearHold();
      if (g && g.mode === "drag") { growPage(); render(); save(); }
      g = null;
    }

    /* A drag that turns out to be a pinch never happened. */
    function rewind() {
      clearHold();
      if (g && g.mode === "drag" && g.item) {
        g.item.x = g.x0; g.item.y = g.y0;
        undo();                       // drop the snapshot the drag pushed
      } else if (g && g.mode === "pan") {
        // nothing to undo; panning leaves no state
      }
      g = null;
      setGestureBusy(false);
      render();
    }

    function beginDrag() {
      g.mode = "drag";
      snapshot();
      delete g.item.fx; delete g.item.fy; delete g.item.anchor;
      g.x0 = g.item.x; g.y0 = g.item.y;
    }

    page.addEventListener("pointerdown", function (e) {
      var handle = e.target.closest(".handle");
      var node = e.target.closest(".item");

      if (handle && sel != null) {
        e.preventDefault();
        var it = itemById(sel);
        if (handle.dataset.handle === "rot") startRotate(e, it);
        else startResize(e, it, handle.dataset.handle);
        return;
      }

      if (e.target.getAttribute("contenteditable") === "true") return;

      // a tap on bare board is a deselect, but only once the finger lifts
      if (!node) {
        if (e.pointerType !== "touch") { select(null); return; }
        if (!g && Object.keys(touches).length < 2) {
          g = { id: e.pointerId, item: null, mode: "pending",
                sx: e.clientX, sy: e.clientY,
                scrollX: stage.scrollLeft, scrollY: stage.scrollTop };
        }
        return;
      }

      var item = itemById(+node.dataset.id);

      /* A mouse is unambiguous: press means grab. Leave desktop alone. */
      if (e.pointerType !== "touch") {
        e.preventDefault();
        select(item.id);
        startMove(e, item);
        return;
      }

      if (g || Object.keys(touches).length > 1) return;
      g = {
        id: e.pointerId, item: item, mode: "pending",
        sx: e.clientX, sy: e.clientY,
        x0: item.x, y0: item.y,
        scrollX: stage.scrollLeft, scrollY: stage.scrollTop,
        selected: sel === item.id
      };

      // long-press is the escape hatch: hold an unselected item to grab it now
      if (!g.selected) {
        hold = setTimeout(function () {
          if (!g || g.mode !== "pending") return;
          select(item.id);
          g.item = itemById(item.id);
          beginDrag();
        }, HOLD);
      }
    });

    window.addEventListener("pointermove", function (e) {
      if (!touches[e.pointerId] && !g) return;
      if (touches[e.pointerId]) touches[e.pointerId] = { x: e.clientX, y: e.clientY };

      if (pinch) {
        var ids = Object.keys(touches);
        if (ids.length < 2) return;
        e.preventDefault();
        var a = touches[ids[0]], b = touches[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.d0 > 10) setZoom(pinch.z0 * (d / pinch.d0), true);
        return;
      }

      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.sx, dy = e.clientY - g.sy;

      if (g.mode === "pending") {
        if (Math.hypot(dx, dy) < SLOP) return;
        clearHold();
        // the first real movement decides, and the decision is final
        if (g.item && g.selected) beginDrag();
        else g.mode = "pan";
        setGestureBusy(true);
      }

      if (g.mode === "pan") {
        e.preventDefault();
        stage.scrollLeft = g.scrollX - dx;
        stage.scrollTop = g.scrollY - dy;
        return;
      }

      if (g.mode === "drag") {
        e.preventDefault();
        var nx = g.x0 + dx / zoom, ny = g.y0 + dy / zoom;
        if (!e.altKey) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
        g.item.x = Math.round(nx); g.item.y = Math.round(ny);
        var n = page.querySelector('.item[data-id="' + g.item.id + '"]');
        if (n) { n.style.left = g.item.x + "px"; n.style.top = g.item.y + "px"; }
        placeActions();
      }
    }, { passive: false });

    /* Track every touch on the stage so a second finger can take over. */
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") {
        if (e.target === stage || e.target === scroller || e.target === pagewrap) select(null);
        return;
      }
      touches[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(touches);
      if (ids.length === 2) {
        rewind();                       // a pinch outranks whatever one finger began
        var a = touches[ids[0]], b = touches[ids[1]];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: zoom };
      }
    });

    ["pointerup", "pointercancel"].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        delete touches[e.pointerId];
        if (Object.keys(touches).length < 2) pinch = null;

        if (!g || e.pointerId !== g.id) return;

        if (g.mode === "pending") {
          // never moved far enough to mean anything else: it was a tap
          if (!g.item) select(null);                     // bare board
          else if (sel == null) select(g.item.id);       // nothing selected yet
          else if (sel === g.item.id) { /* keep it */ }
          else if (inCore(g.item, e.clientX, e.clientY)) select(g.item.id);
          else select(null);                             // edge tap dismisses
        }
        endGesture();
        setGestureBusy(false);
      });
    });

    stage.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), true);
    }, { passive: false });
  }

  function select(id) {
    if (sel === id) return;
    sel = id;
    render();
  }

  function drag(onMove, onDone) {
    function move(e) { onMove(e); }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (onDone) onDone();
      render(); save();
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startMove(e, it) {
    snapshot();
    delete it.fx; delete it.fy; delete it.anchor;   // moved by hand, so stop auto-placing it
    var p0 = pagePoint(e), x0 = it.x, y0 = it.y;
    var node = page.querySelector('.item[data-id="' + it.id + '"]');
    drag(function (e2) {
      var p = pagePoint(e2);
      var nx = x0 + (p.x - p0.x), ny = y0 + (p.y - p0.y);
      if (!e2.altKey) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
      it.x = Math.round(nx); it.y = Math.round(ny);
      if (node) { node.style.left = it.x + "px"; node.style.top = it.y + "px"; }
      placeActions();
    }, growPage);
  }

  function startResize(e, it, corner) {
    snapshot();
    var sx = corner[1] === "e" ? 1 : -1;
    var sy = corner[0] === "s" ? 1 : -1;
    var rad = (it.rot || 0) * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var w0 = it.w, h0 = it.h, size0 = it.size || 0;
    var cx = it.x + w0 / 2, cy = it.y + h0 / 2;

    // world position of the corner opposite the one being dragged — this stays put
    var fx = -sx * w0 / 2, fy = -sy * h0 / 2;
    var Fwx = cx + fx * cos - fy * sin;
    var Fwy = cy + fx * sin + fy * cos;

    var keepAspect = it.kind !== "swatch";
    var node = page.querySelector('.item[data-id="' + it.id + '"]');

    drag(function (e2) {
      var p = pagePoint(e2);
      var dx = p.x - Fwx, dy = p.y - Fwy;
      var lx = dx * cos + dy * sin;          // rotate world delta into the item's frame
      var ly = -dx * sin + dy * cos;

      var w = Math.max(MIN, sx * lx);
      var h = Math.max(MIN, sy * ly);
      if (keepAspect) h = w * (h0 / w0);

      var ncx = Fwx + (sx * w / 2) * cos - (sy * h / 2) * sin;
      var ncy = Fwy + (sx * w / 2) * sin + (sy * h / 2) * cos;

      it.w = Math.round(w); it.h = Math.round(h);
      it.x = Math.round(ncx - w / 2); it.y = Math.round(ncy - h / 2);
      if (it.kind === "text" && size0) it.size = Math.max(8, Math.round(size0 * (w / w0)));

      if (node) {
        node.style.left = it.x + "px"; node.style.top = it.y + "px";
        node.style.width = it.w + "px"; node.style.height = it.h + "px";
        var t = node.querySelector(".txt");
        if (t && it.size) t.style.fontSize = it.size + "px";
      }
      placeActions();
    }, growPage);
  }

  /* Rotate by the DELTA from where the pointer grabbed, not by the pointer's
     absolute angle. Deriving rot from the absolute angle needs a constant that
     depends on where the handle ends up under the item's flips — get it wrong
     and the item snaps to a new angle the instant you touch the handle. The
     delta is flip-independent: d(handle angle) always equals d(rot). */
  function startRotate(e, it) {
    snapshot();
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    var p0 = pagePoint(e);
    var a0 = Math.atan2(p0.y - cy, p0.x - cx) * 180 / Math.PI;
    var rot0 = it.rot || 0;
    var node = page.querySelector('.item[data-id="' + it.id + '"]');

    drag(function (e2) {
      var p = pagePoint(e2);
      var a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI;
      /* Free by default, Shift to snap. Snapping unconditionally meant grabbing
         the handle on a sticker sitting at -34° yanked it to -30° before the
         pointer had moved at all. */
      var next = rot0 + (a - a0);
      if (e2.shiftKey) next = Math.round(next / 15) * 15;
      it.rot = Math.round(next);
      if (node) node.style.transform = ("rotate(" + it.rot + "deg) ") +
        (it.flipX ? "scaleX(-1) " : "") + (it.flipY ? "scaleY(-1)" : "");
      placeActions();
    });
  }

  /* let the page grow if something is dragged past the bottom */
  function growPage() {
    var maxY = board.items.reduce(function (m, i) { return Math.max(m, i.y + i.h); }, 0);
    board.h = Math.max(600, Math.round(maxY + MARGIN));
  }

  /* ============================ selection actions ============================ */

  function placeActions() {
    // the raised photo tray owns the bottom of the screen; the floating bar waits
    var blocked = isNarrow() && !trayCollapsed;
    var it = view === "board" && !blocked && sel != null ? itemById(sel) : null;
    if (!it) { actions.classList.add("away"); return; }

    if (!gestureBusy) actions.classList.remove("away");
    buildActions(it);

    var r = page.getBoundingClientRect();
    var s = stage.getBoundingClientRect();
    var w = actions.offsetWidth || 260;
    var h = actions.offsetHeight || 36;

    var left = r.left + (it.x + it.w / 2) * zoom - w / 2;
    left = Math.max(s.left + 8, Math.min(s.right - w - 8, left));

    // above the item by preference; below it if that would leave the viewport;
    // pinned to the top of the stage if neither fits.
    var top = r.top + it.y * zoom - h - 12;
    if (top < s.top + 8) {
      var below = r.top + (it.y + it.h) * zoom + 12;
      top = (below + h < s.bottom - 8) ? below : s.top + 8;
    }

    actions.style.left = Math.round(left) + "px";
    actions.style.top = Math.round(top) + "px";
  }

  function buildActions(it) {
    if (actions.dataset.for === String(it.id) && actions.dataset.kind === it.kind) return;
    actions.dataset.for = it.id;
    actions.dataset.kind = it.kind;
    actions.innerHTML = "";

    /* Controls only — the photo's name and id are drawn on the photo itself. */
    if (it.kind === "sticker") {
      actions.appendChild(btn("↺", function () { nudgeRot(it, -15); }, "Rotate 15° left"));
      actions.appendChild(btn("↻", function () { nudgeRot(it, 15); }, "Rotate 15° right"));
      actions.appendChild(btn("⇄", function () {
        snapshot(); it.flipX = !it.flipX; render(); save();
      }, "Flip horizontally", !!it.flipX));
      actions.appendChild(btn("⇅", function () {
        snapshot(); it.flipY = !it.flipY; render(); save();
      }, "Flip vertically", !!it.flipY));
    }

    if (it.kind === "photo") {
      actions.appendChild(btn("Crop", function () { openCrop(it); }, "Crop this photo"));

      actions.appendChild(btn(it.shape === "circle" ? "◯" : "▢", function () {
        snapshot();
        it.shape = it.shape === "circle" ? "rect" : "circle";
        render(); save();
      }, "Rectangle or circle", it.shape === "circle"));

      var frames = [null, "white", "black", "hair"];
      actions.appendChild(btn("▣", function () {
        snapshot();
        it.frame = frames[(frames.indexOf(it.frame || null) + 1) % frames.length];
        render(); save();
      }, "Cycle the frame: none, white, black, hairline", !!it.frame));
    }

    if (it.kind === "text") {
      ["display", "sans", "mono"].forEach(function (f) {
        actions.appendChild(btn(f === "display" ? "Aa" : f === "sans" ? "Aa" : "Aa", function () {
          snapshot(); it.font = f; render(); save();
        }, f + " face", it.font === f));
      });
      var col = document.createElement("input");
      col.type = "color"; col.value = it.color; col.title = "Text colour";
      col.oninput = function () { it.color = col.value; render(); save(); };
      actions.appendChild(col);
    }

    actions.appendChild(btn("↑", function () { snapshot(); it.z = topZ() + 1; render(); save(); }, "Bring to front"));
    actions.appendChild(btn("↓", function () {
      snapshot();
      var min = board.items.reduce(function (m, i) { return Math.min(m, i.z); }, 0);
      it.z = min - 1; render(); save();
    }, "Send to back"));
    actions.appendChild(btn("⧉", function () { duplicate(it); }, "Duplicate (Ctrl+D)"));
    actions.appendChild(btn("✕", function () { remove(it); }, "Remove (Del)", false, "danger"));

    function btn(label, fn, title, on, cls) {
      var b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      if (on) b.className = "on";
      if (cls) b.className = (b.className + " " + cls).trim();
      b.onclick = fn;
      return b;
    }
  }

  function nudgeRot(it, by) {
    snapshot();
    it.rot = Math.round((((it.rot || 0) + by) % 360 + 360) % 360);
    render(); save();
  }

  function duplicate(it) {
    snapshot();
    var copy = JSON.parse(JSON.stringify(it));
    copy.id = ++uid; copy.z = topZ() + 1;
    copy.x += 24; copy.y += 24;
    board.items.push(copy);
    sel = copy.id;
    render(); save();
  }

  function remove(it) {
    snapshot();
    board.items = board.items.filter(function (i) { return i.id !== it.id; });
    sel = null;
    render(); save();
  }

  /* ============================ cropper ============================ */
  /* Crops are stored as [x, y, w, h] percentages of the SOURCE file, so nothing
     is ever re-encoded — the same numbers drive the card, the canvas and the PNG. */

  var CROP_RATIOS = [
    { label: "Free", r: 0 }, { label: "1:1", r: 1 }, { label: "4:5", r: 0.8 },
    { label: "5:4", r: 1.25 }, { label: "2:3", r: 2 / 3 }, { label: "3:2", r: 1.5 },
    { label: "16:9", r: 16 / 9 }, { label: "9:16", r: 9 / 16 }
  ];

  var crop = null;   // { item, disp:{x,y,w,h}, rect:{x,y,w,h}, ratio }

  function openCrop(it) {
    var p = libOf(it.img);
    if (!p) return;

    var wrap = document.getElementById("cropper");
    var img = document.getElementById("crop-img");
    document.getElementById("crop-title").textContent = p.title || "";

    wrap.hidden = false;
    actions.classList.add("away");

    img.onload = function () { layoutCrop(it, it.crop || [0, 0, 100, 100]); };
    img.src = p.src;
    if (img.complete && img.naturalWidth) layoutCrop(it, it.crop || [0, 0, 100, 100]);

    buildRatios();
  }

  function layoutCrop(it, c) {
    var stageEl = document.getElementById("crop-stage");
    var img = document.getElementById("crop-img");
    var box = stageEl.getBoundingClientRect();
    var pad = 56;

    var nw = img.naturalWidth, nh = img.naturalHeight;
    var k = Math.min((box.width - pad * 2) / nw, (box.height - pad * 2) / nh);
    var dw = nw * k, dh = nh * k;
    var dx = (box.width - dw) / 2, dy = (box.height - dh) / 2;

    img.style.left = dx + "px";
    img.style.top = dy + "px";
    img.style.width = dw + "px";
    img.style.height = dh + "px";

    crop = {
      item: it,
      disp: { x: dx, y: dy, w: dw, h: dh },
      rect: { x: dx + dw * c[0] / 100, y: dy + dh * c[1] / 100, w: dw * c[2] / 100, h: dh * c[3] / 100 },
      ratio: 0
    };
    paintCrop();
  }

  function paintCrop() {
    var r = document.getElementById("crop-rect");
    r.style.left = crop.rect.x + "px";
    r.style.top = crop.rect.y + "px";
    r.style.width = crop.rect.w + "px";
    r.style.height = crop.rect.h + "px";
  }

  function buildRatios() {
    var host = document.getElementById("crop-aspects");
    host.innerHTML = "";
    CROP_RATIOS.forEach(function (a) {
      var b = document.createElement("button");
      b.textContent = a.label;
      b.className = crop && crop.ratio === a.r ? "on" : "";
      b.onclick = function () {
        crop.ratio = a.r;
        if (a.r) applyRatio();
        buildRatios();
        paintCrop();
      };
      host.appendChild(b);
    });
  }

  function applyRatio() {
    var d = crop.disp, R = crop.rect;
    var w = R.w, h = w / crop.ratio;
    if (h > d.h) { h = d.h; w = h * crop.ratio; }
    if (w > d.w) { w = d.w; h = w / crop.ratio; }
    R.w = w; R.h = h;
    R.x = Math.max(d.x, Math.min(d.x + d.w - w, R.x));
    R.y = Math.max(d.y, Math.min(d.y + d.h - h, R.y));
  }

  function wireCropper() {
    var rect = document.getElementById("crop-rect");

    rect.addEventListener("pointerdown", function (e) {
      if (!crop) return;
      e.preventDefault();
      e.stopPropagation();
      var ch = e.target.dataset ? e.target.dataset.ch : null;
      var start = { x: e.clientX, y: e.clientY };
      var R0 = Object.assign({}, crop.rect);
      var d = crop.disp;

      function move(e2) {
        var dx = e2.clientX - start.x, dy = e2.clientY - start.y;
        var R = crop.rect;

        if (!ch) {
          R.x = Math.max(d.x, Math.min(d.x + d.w - R0.w, R0.x + dx));
          R.y = Math.max(d.y, Math.min(d.y + d.h - R0.h, R0.y + dy));
        } else {
          var east = ch[1] === "e", south = ch[0] === "s";
          var fx = east ? R0.x : R0.x + R0.w;         // the edge that stays put
          var fy = south ? R0.y : R0.y + R0.h;
          var px = Math.max(d.x, Math.min(d.x + d.w, e2.clientX));
          var py = Math.max(d.y, Math.min(d.y + d.h, e2.clientY));

          var w = Math.max(24, Math.abs(px - fx));
          var h = Math.max(24, Math.abs(py - fy));
          if (crop.ratio) {
            h = w / crop.ratio;
            if (south ? fy + h > d.y + d.h : fy - h < d.y) {
              h = south ? d.y + d.h - fy : fy - d.y;
              w = h * crop.ratio;
            }
            if (east ? fx + w > d.x + d.w : fx - w < d.x) {
              w = east ? d.x + d.w - fx : fx - d.x;
              h = w / crop.ratio;
            }
          }
          R.w = w; R.h = h;
          R.x = east ? fx : fx - w;
          R.y = south ? fy : fy - h;
        }
        paintCrop();
      }
      function up() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    document.getElementById("crop-reset").onclick = function () {
      if (!crop) return;
      crop.rect = { x: crop.disp.x, y: crop.disp.y, w: crop.disp.w, h: crop.disp.h };
      crop.ratio = 0;
      buildRatios(); paintCrop();
    };

    document.getElementById("crop-cancel").onclick = closeCrop;

    document.getElementById("crop-apply").onclick = function () {
      if (!crop) return;
      var d = crop.disp, R = crop.rect, it = crop.item;
      snapshot();
      it.crop = [
        Math.max(0, (R.x - d.x) / d.w * 100),
        Math.max(0, (R.y - d.y) / d.h * 100),
        Math.min(100, R.w / d.w * 100),
        Math.min(100, R.h / d.h * 100)
      ];
      it.h = Math.round(it.w * aspectOf(it.img, it.crop));   // keep width, follow the new shape
      closeCrop();
      growPage(); render(); save();
    };

    document.addEventListener("keydown", function (e) {
      if (document.getElementById("cropper").hidden) return;
      if (e.key === "Escape") { e.preventDefault(); closeCrop(); }
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("crop-apply").click(); }
    });
  }

  function closeCrop() {
    document.getElementById("cropper").hidden = true;
    crop = null;
    placeActions();
  }

  /* ============================ text editing ============================ */

  function editText(it, node) {
    node.setAttribute("contenteditable", "true");
    node.focus();
    var r = document.createRange();
    r.selectNodeContents(node);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);

    function done() {
      node.removeAttribute("contenteditable");
      node.removeEventListener("blur", done);
      var next = node.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n");
      if (next !== it.text) { snapshot(); it.text = next; }
      it.h = Math.max(MIN, Math.ceil(node.scrollHeight));
      render(); save();
    }
    node.addEventListener("blur", done);
  }

  /* ============================ keys ============================ */

  function wireKeys() {
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;

      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }

      if (sel == null) return;
      var it = itemById(sel);
      if (!it) return;

      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(it); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(it); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); nudgeRot(it, e.shiftKey ? -15 : 15); return; }
      if (e.key === "Escape") { select(null); return; }
      if (e.key === "]") { snapshot(); it.z = topZ() + 1; render(); save(); return; }
      if (e.key === "[") {
        snapshot();
        it.z = board.items.reduce(function (m, i) { return Math.min(m, i.z); }, 0) - 1;
        render(); save(); return;
      }

      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) {
        e.preventDefault();
        var step = e.shiftKey ? GRID : 1;
        snapshot();
        it.x += d[0] * step; it.y += d[1] * step;
        render(); save();
      }
    });
  }

  /* ============================ drop files ============================ */

  function wireDrop() {
    var veil = document.getElementById("drop");
    var depth = 0;
    window.addEventListener("dragenter", function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") < 0) return;
      depth++; veil.hidden = false;
    });
    window.addEventListener("dragover", function (e) { e.preventDefault(); });
    window.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; veil.hidden = true; } });
    window.addEventListener("drop", function (e) {
      e.preventDefault(); depth = 0; veil.hidden = true;
      var files = Array.prototype.slice.call(e.dataTransfer.files || [])
        .filter(function (f) { return /^image\//.test(f.type); });
      if (files.length) addFiles(files);
    });
  }

  /* Files off Facebook, Pinterest or a CDN arrive named things like
     "791013238_1068024832702535_n.jpg" or "IMG_4821". Those are not names, so
     don't pretend they are — call it Photo N and let it be renamed on the board. */
  var uploadCount = 0;
  function cleanName(filename) {
    var base = String(filename).replace(/\.[a-z0-9]+$/i, "");
    var words = base.replace(/[_\-+]+/g, " ").replace(/\s+/g, " ").trim();
    var letters = (words.match(/[a-zA-ZåäöÅÄÖ]/g) || []).length;
    var junk = letters < 4 ||
      /^(img|dsc|pxl|screenshot|photo|image|download|untitled)\b/i.test(words) ||
      /^[0-9a-f\s]+$/i.test(words);
    if (junk) return "Photo " + (++uploadCount);
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function addFiles(files) {
    if (!files.length) return;
    var left = files.length, added = [];
    files.forEach(function (f) {
      downscale(f, function (url, w, h) {
        if (url) {
          var key = "u" + (++uid);
          var p = {
            key: key, src: url, crop: [0, 0, 100, 100], local: true,
            title: cleanName(f.name), source: "Added by you", note: ""
          };
          natural[key] = [w, h];
          lib.push(p);
          added.push(key);
        }
        if (--left === 0) {
          if (added.length) {
            snapshot();
            added.forEach(function (k, i) {
              var wd = 300, p2 = libOf(k);
              board.items.push({
                id: ++uid, kind: "photo", img: k, crop: p2.crop.slice(),
                x: Math.round(board.w / 2 - wd / 2 + i * 26 - 40),
                y: Math.round(scrollCenterY() + i * 26),
                w: wd, h: Math.round(wd * aspectOf(k, p2.crop)),
                rot: 0, z: topZ() + 1
              });
            });
            sel = null;
            growPage(); render(); save();
            toast(added.length + " photo" + (added.length > 1 ? "s" : "") + " added. They live in this browser — export the board to share them.");
          }
        }
      });
    });
  }

  function downscale(file, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var s = Math.min(1, 1200 / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(c.toDataURL("image/jpeg", 0.82), c.width, c.height);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  /* ============================ export ============================ */

  function exportJSON() {
    var payload = { board: board, uploads: lib.filter(function (p) { return p.local; }) };
    saveFile("moodboard-" + stamp() + ".json", JSON.stringify(payload, null, 2), "application/json");
  }

  function exportPNG() {
    var btn = document.getElementById("png");
    btn.disabled = true;
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

    ready.then(function () {
      var S = 2;
      var c = document.createElement("canvas");
      c.width = board.w * S;
      c.height = board.h * S;
      var g = c.getContext("2d");
      g.fillStyle = board.bg;
      g.fillRect(0, 0, c.width, c.height);

      var ordered = board.items.slice().sort(function (a, b) { return a.z - b.z; });
      return Promise.all(ordered.map(function (it) {
        var src = null;
        if (it.kind === "photo") {
          var p = libOf(it.img);
          src = p ? p.src : null;
        } else if (it.kind === "sticker") {
          src = stickerOf(it.sticker).src;
        }
        if (!src) return null;
        return new Promise(function (res) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = function () { res(null); };
          im.src = src;
        });
      })).then(function (imgs) {
        ordered.forEach(function (it, i) {
          g.save();
          g.translate((it.x + it.w / 2) * S, (it.y + it.h / 2) * S);
          g.rotate((it.rot || 0) * Math.PI / 180);
          if (it.flipX || it.flipY) g.scale(it.flipX ? -1 : 1, it.flipY ? -1 : 1);
          g.translate(-it.w * S / 2, -it.h * S / 2);
          if (it.kind === "photo") drawPhoto(g, it, imgs[i], S);
          else if (it.kind === "sticker") { if (imgs[i]) g.drawImage(imgs[i], 0, 0, it.w * S, it.h * S); }
          else if (it.kind === "text") drawText(g, it, S);
          else drawSwatch(g, it, S);
          g.restore();
        });
        return new Promise(function (res) { c.toBlob(res, "image/png"); });
      });
    }).then(function (blob) {
      btn.disabled = false;
      if (blob) saveFile("moodboard-" + stamp() + ".png", blob, "image/png");
    }).catch(function () {
      btn.disabled = false;
      toast("Could not build the image.");
    });
  }

  var FRAME_W = { white: 6, black: 6, hair: 1.5 };
  var FRAME_C = { white: "#f4f1e6", black: "#14170f", hair: "rgba(237,232,217,.55)" };

  function drawPhoto(g, it, im, S) {
    if (!im) return;
    var W = it.w * S, H = it.h * S;
    var bw = it.frame ? FRAME_W[it.frame] * S : 0;

    g.save();
    if (it.shape === "circle") {
      g.beginPath();
      g.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    } else {
      round(g, 0, 0, W, H, 2 * S);
    }
    g.clip();

    var c = it.crop || [0, 0, 100, 100];
    g.drawImage(im,
      im.naturalWidth * c[0] / 100, im.naturalHeight * c[1] / 100,
      im.naturalWidth * c[2] / 100, im.naturalHeight * c[3] / 100,
      bw, bw, Math.max(1, W - bw * 2), Math.max(1, H - bw * 2));
    g.restore();

    if (bw) {
      g.save();
      g.strokeStyle = FRAME_C[it.frame];
      g.lineWidth = bw;
      if (it.shape === "circle") {
        g.beginPath();
        g.ellipse(W / 2, H / 2, Math.max(0, W / 2 - bw / 2), Math.max(0, H / 2 - bw / 2), 0, 0, Math.PI * 2);
      } else {
        round(g, bw / 2, bw / 2, W - bw, H - bw, 2 * S);
      }
      g.stroke();
      g.restore();
    }
  }

  var FACES = {
    display: '"Newsreader", Georgia, serif',
    sans: '"IBM Plex Sans", Helvetica, Arial, sans-serif',
    mono: '"IBM Plex Mono", Menlo, monospace'
  };

  function drawText(g, it, S) {
    var size = it.size * S;
    g.fillStyle = it.color;
    g.font = size + "px " + (FACES[it.font] || FACES.sans);
    g.textBaseline = "top";
    var lh = size * 1.22;
    var y = 0;
    String(it.text).split("\n").forEach(function (para) {
      wrap(g, para, it.w * S).forEach(function (line) {
        g.fillText(line, 0, y);
        y += lh;
      });
    });
  }

  function wrap(g, text, max) {
    if (!text) return [""];
    var words = text.split(" "), lines = [], line = "";
    words.forEach(function (w) {
      var next = line ? line + " " + w : w;
      if (g.measureText(next).width > max && line) { lines.push(line); line = w; }
      else line = next;
    });
    lines.push(line);
    return lines;
  }

  function drawSwatch(g, it, S) {
    var pad = 0;
    var labelH = it.label ? 16 * S : 0;
    if (it.label) {
      g.fillStyle = readable(board.bg);
      g.globalAlpha = 0.75;
      g.font = (10 * S) + "px " + FACES.mono;
      g.textBaseline = "top";
      g.fillText(it.label, 0, 0);
      g.globalAlpha = 1;
    }
    var top = labelH + (it.label ? 7 * S : 0);
    var hexH = 11 * S;
    var h = it.h * S - top - hexH;
    var gap = 5 * S;
    var n = it.colors.length;
    var w = (it.w * S - gap * (n - 1)) / n;

    g.font = (8 * S) + "px " + FACES.mono;
    g.textBaseline = "top";
    g.textAlign = "center";
    it.colors.forEach(function (col, i) {
      var x = pad + i * (w + gap);
      g.fillStyle = col;
      round(g, x, top, w, Math.max(1, h), 3 * S);
      g.fill();
      g.fillStyle = readable(board.bg);
      g.globalAlpha = 0.6;
      g.fillText(col.toUpperCase(), x + w / 2, top + h + 3 * S);
      g.globalAlpha = 1;
    });
    g.textAlign = "left";
  }

  function round(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* On a phone a plain download lands in Files, not the camera roll. The share
     sheet is the only route into the photo library from a web page, and it is
     what "Save Image" on iOS and "Save to Photos" on Android hang off. */
  function shareToPhotos(blob, name) {
    if (!isNarrow() || !/^image\//.test(blob.type) || !navigator.canShare) return false;
    try {
      var file = new File([blob], name, { type: blob.type });
      if (!navigator.canShare({ files: [file] })) return false;
      navigator.share({ files: [file], title: "Mood board" })
        .then(function () { toast("Choose Save Image to add it to your photos."); })
        .catch(function (err) {
          if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return;
          anchorSave(name, blob, blob.type);
        });
      return true;
    } catch (e) { return false; }
  }

  function saveFile(name, data, mime) {
    if (data instanceof Blob && shareToPhotos(data, name)) return;
    if (downloads) {
      downloads.save({ filename: name, data: data }).then(function () {
        toast("Saved " + name);
      }).catch(function (err) {
        if (err && err.code === "declined") return;
        anchorSave(name, data, mime);
      });
      return;
    }
    anchorSave(name, data, mime);
  }

  function anchorSave(name, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function stamp() { return new Date().toISOString().slice(0, 10); }

  /* ============================ toast ============================ */

  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) toastEl = document.getElementById("toast");
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.hidden = true; }, 4200);
  }
})();
