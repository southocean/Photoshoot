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

    load();
    preloadAll().then(function () {
      if (!doc) {
        doc = { boards: [buildDefault()], active: 0 };
        board = doc.boards[0];
        arrange();
      }
      render();
      fitZoom();
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

  function buildDefault() {
    var d = window.DEFAULT_BOARD;
    var items = d.items.map(function (it) {
      return Object.assign({ id: ++uid, x: 0, y: 0, rot: 0, z: ++uid }, it);
    });
    lib.forEach(function (p) {
      var w = p.hero ? 2 : 1;
      items.push({
        id: ++uid, kind: "photo", img: p.key, crop: p.crop.slice(),
        span: w, x: 0, y: 0, w: 0, h: 0, rot: 0, z: ++uid
      });
    });
    return { name: d.name || "Board", bg: d.bg, w: d.w, h: 1000, items: items };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        doc: doc,
        uploads: lib.filter(function (p) { return p.local; })
      }));
    } catch (e) {
      toast("Could not save — browser storage is full. Export the board to keep it.");
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
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
    render(); fitZoom(); save();
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
    render(); fitZoom(); save();
  }

  function renameBoard() {
    var n = prompt("Name this board — use the look it briefs, e.g. “Skogsrå — dark nymph”.", board.name);
    if (n === null) return;
    snapshot();
    board.name = n.trim() || board.name;
    render(); save();
  }

  function deleteBoard() {
    if (doc.boards.length < 2) { toast("This is the only board — reset it instead of deleting it."); return; }
    if (!confirm("Delete the board “" + board.name + "”? Everything on it goes with it.")) return;
    snapshot();
    doc.boards.splice(doc.active, 1);
    doc.active = Math.max(0, doc.active - 1);
    board = doc.boards[doc.active];
    sel = null;
    render(); fitZoom(); save();
  }

  function renderPages() {
    pagebar.innerHTML = "";
    doc.boards.forEach(function (b, i) {
      var t = document.createElement("button");
      t.className = "tab" + (i === doc.active ? " on" : "");
      t.textContent = b.name;
      t.title = b.items.filter(function (x) { return x.kind === "photo"; }).length + " photos";
      t.onclick = function () { i === doc.active ? renameBoard() : setActive(i); };
      pagebar.appendChild(t);
    });

    pagebar.appendChild(mk("+ Board", addBoard.bind(null, null), "Start an empty board for another look"));
    pagebar.appendChild(mk("Duplicate", function () { addBoard(board); }, "Copy this board as a starting point"));
    pagebar.appendChild(mk("Delete", deleteBoard, "Delete this board", "danger"));

    function mk(label, fn, title, cls) {
      var b = document.createElement("button");
      b.className = "ghost" + (cls ? " " + cls : "");
      b.textContent = label;
      b.title = title;
      b.onclick = fn;
      return b;
    }
  }

  function syncUndo() {
    document.getElementById("undo").disabled = !undoStack.length;
    document.getElementById("redo").disabled = !redoStack.length;
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

    var order = board.items.slice().sort(function (a, b) {
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
        sel = null; render(); fitZoom(); save();
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
    if (it.rot) el.style.transform = "rotate(" + it.rot + "deg)";

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

    if (sel === it.id) {
      ["nw", "ne", "sw", "se", "rot"].forEach(function (k) {
        var h = document.createElement("div");
        h.className = "handle " + k;
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

  function renderTray() {
    var used = {};
    board.items.forEach(function (i) { if (i.kind === "photo") used[i.img] = true; });

    trayList.innerHTML = "";
    lib.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "tile" + (used[p.key] ? " used" : "");
      b.type = "button";
      b.title = p.title + (used[p.key] ? " — already on the board" : " — click to add");

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

      b.onclick = function () { addPhoto(p.key); };
      trayList.appendChild(b);
    });
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

  function wireToolbar() {
    document.getElementById("toggle-tray").onclick = function () {
      tray.classList.toggle("collapsed");
      this.classList.toggle("on", !tray.classList.contains("collapsed"));
    };

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
      arrange(); sel = null; render(); fitZoom(); save();
      toast("Tidied into a grid — drag anything back out of it.");
    };

    document.getElementById("undo").onclick = undo;
    document.getElementById("redo").onclick = redo;

    document.getElementById("zin").onclick = function () { setZoom(zoom * 1.25); };
    document.getElementById("zout").onclick = function () { setZoom(zoom / 1.25); };
    document.getElementById("zfit").onclick = fitZoom;

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
          board = p.board;
          (p.uploads || []).forEach(function (u) { if (!libOf(u.key)) lib.push(u); });
          sel = null; render(); fitZoom(); save();
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

    document.getElementById("reset").onclick = function () {
      if (!confirm("Start again from the default arrangement? Photos you uploaded are kept in the tray.")) return;
      snapshot();
      board = buildDefault(); arrange(); sel = null; render(); fitZoom(); save();
    };

    syncUndo();
  }

  function syncGrounds() {
    document.querySelectorAll("#grounds i").forEach(function (i) {
      i.setAttribute("aria-current", i.dataset.c === board.bg ? "true" : "false");
    });
  }

  function setZoom(z) {
    zoom = Math.min(3, Math.max(0.1, z));
    document.getElementById("zlabel").textContent = Math.round(zoom * 100) + "%";
    page.style.transform = "scale(" + zoom + ")";
    pagewrap.style.width = board.w * zoom + "px";
    pagewrap.style.height = board.h * zoom + "px";
    placeActions();
  }

  function fitZoom() {
    var avail = stage.clientWidth - 80;
    setZoom(Math.min(1, avail / board.w));
  }
  window.addEventListener("resize", function () { placeActions(); });

  /* ============================ interaction ============================ */

  function pagePoint(e) {
    var r = page.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }

  function wireStage() {
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

      if (!node) { select(null); return; }
      if (e.target.getAttribute("contenteditable") === "true") return;

      e.preventDefault();
      var item = itemById(+node.dataset.id);
      select(item.id);
      startMove(e, item);
    });

    stage.addEventListener("pointerdown", function (e) {
      if (e.target === stage || e.target === scroller || e.target === pagewrap) select(null);
    });

    stage.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
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

  function startRotate(e, it) {
    snapshot();
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    var node = page.querySelector('.item[data-id="' + it.id + '"]');
    drag(function (e2) {
      var p = pagePoint(e2);
      var a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
      if (!e2.altKey) a = Math.round(a / 15) * 15;
      it.rot = Math.round(a);
      if (node) node.style.transform = "rotate(" + it.rot + "deg)";
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
    var it = sel != null ? itemById(sel) : null;
    if (!it) { actions.hidden = true; return; }

    actions.hidden = false;
    buildActions(it);

    var r = page.getBoundingClientRect();
    var left = r.left + (it.x + it.w / 2) * zoom;
    var top = r.top + it.y * zoom - 52;
    var w = actions.offsetWidth || 260;
    left = Math.max(10, Math.min(window.innerWidth - w - 10, left - w / 2));
    if (top < 60) top = r.top + (it.y + it.h) * zoom + 12;
    actions.style.left = Math.round(left) + "px";
    actions.style.top = Math.round(top) + "px";
  }

  function buildActions(it) {
    if (actions.dataset.for === String(it.id) && actions.dataset.kind === it.kind) return;
    actions.dataset.for = it.id;
    actions.dataset.kind = it.kind;
    actions.innerHTML = "";

    var cap = document.createElement("span");
    cap.className = "cap";
    cap.textContent = it.kind === "photo"
      ? (libOf(it.img) ? libOf(it.img).title : "Photo")
      : it.kind === "text" ? "Text" : "Palette";
    actions.appendChild(cap);

    if (it.kind === "photo") {
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

  function addFiles(files) {
    if (!files.length) return;
    var left = files.length, added = [];
    files.forEach(function (f) {
      downscale(f, function (url, w, h) {
        if (url) {
          var key = "u" + (++uid);
          var p = {
            key: key, src: url, crop: [0, 0, 100, 100], local: true,
            title: f.name.replace(/\.[a-z0-9]+$/i, ""), source: "Added by you", note: ""
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
      var s = Math.min(1, 1600 / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(c.toDataURL("image/jpeg", 0.85), c.width, c.height);
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
        if (it.kind !== "photo") return null;
        var p = libOf(it.img);
        if (!p) return null;
        return new Promise(function (res) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = function () { res(null); };
          im.src = p.src;
        });
      })).then(function (imgs) {
        ordered.forEach(function (it, i) {
          g.save();
          g.translate((it.x + it.w / 2) * S, (it.y + it.h / 2) * S);
          g.rotate((it.rot || 0) * Math.PI / 180);
          g.translate(-it.w * S / 2, -it.h * S / 2);
          if (it.kind === "photo") drawPhoto(g, it, imgs[i], S);
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

  function saveFile(name, data, mime) {
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
