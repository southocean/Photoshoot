/* Mood board — vanilla JS, no build step, works from file:// or any static host. */

(function () {
  'use strict';

  var KEY = 'moodboard.v1';
  var GAP = 16;      // must match the column-gap in board.css
  var ROW = 8;       // must match grid-auto-rows

  var B = window.BOARD;
  var conceptById = {};
  B.concepts.forEach(function (c) { conceptById[c.key] = c; });

  /* ---------------- state ---------------- */

  var state = load();

  function load() {
    var s = { order: [], stars: {}, notes: {}, added: [], grouped: true, filter: null, starredOnly: false, collab: '' };
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        Object.keys(s).forEach(function (k) { if (p[k] !== undefined) s[k] = p[k]; });
      }
    } catch (e) { /* private mode, cleared storage — carry on with defaults */ }
    return s;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save — browser storage is full or blocked. Export your board to keep it.'); }
  }

  /* All items = the built-in reference pull plus anything dropped in locally. */
  function allItems() {
    var base = B.items.concat(state.added || []);
    var byId = {};
    base.forEach(function (it) { byId[it.id] = it; });

    var seen = {}, out = [];
    (state.order || []).forEach(function (id) {
      if (byId[id] && !seen[id]) { out.push(byId[id]); seen[id] = 1; }
    });
    base.forEach(function (it) { if (!seen[it.id]) { out.push(it); seen[it.id] = 1; } });

    state.order = out.map(function (it) { return it.id; });
    return out;
  }

  function visibleItems() {
    return allItems().filter(function (it) {
      if (state.starredOnly && !state.stars[it.id]) return false;
      if (state.filter && it.concept !== state.filter) return false;
      return true;
    });
  }

  /* ---------------- chrome ---------------- */

  var elBoard = document.getElementById('board');
  var elChips = document.getElementById('chips');
  var elPalettes = document.getElementById('palettes');

  document.getElementById('title').textContent = B.title;
  document.getElementById('subtitle').textContent = B.subtitle;

  function buildChips() {
    elChips.innerHTML = '';
    var counts = {};
    allItems().forEach(function (it) { counts[it.concept] = (counts[it.concept] || 0) + 1; });

    var all = chip('All', null, '#b9c98f', allItems().length);
    elChips.appendChild(all);
    B.concepts.forEach(function (c) {
      elChips.appendChild(chip(c.label, c.key, c.color, counts[c.key] || 0));
    });

    function chip(label, key, color, n) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.filter === key ? ' on' : '');
      b.style.setProperty('--c', color);
      b.innerHTML = '<span class="dot"></span>' + esc(label) + ' <span class="count">' + n + '</span>';
      b.onclick = function () { state.filter = key; save(); buildChips(); render(); };
      return b;
    }
  }

  function buildPalettes() {
    elPalettes.innerHTML = '';
    B.palettes.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'palette';
      d.innerHTML = '<b>' + esc(p.name) + '</b><span class="swatches">' +
        p.colors.map(function (c) {
          return '<i style="background:' + c + '" title="' + c + ' — click to copy"></i>';
        }).join('') + '</span>';
      d.querySelectorAll('i').forEach(function (i, idx) {
        i.onclick = function () { copy(p.colors[idx]); toast('Copied ' + p.colors[idx]); };
      });
      elPalettes.appendChild(d);
    });
  }

  /* ---------------- board render ---------------- */

  function render() {
    elBoard.innerHTML = '';
    var items = visibleItems();

    if (!items.length) {
      elBoard.innerHTML = '<p class="empty">Nothing matches that filter.</p>';
      return;
    }

    if (state.grouped && !state.filter) {
      B.concepts.forEach(function (c) {
        var group = items.filter(function (it) { return it.concept === c.key; });
        if (!group.length) return;
        var h = document.createElement('h2');
        h.className = 'group-title';
        h.style.setProperty('--c', c.color);
        h.innerHTML = '<span class="bar"></span>' + esc(c.label);
        elBoard.appendChild(h);
        var n = document.createElement('p');
        n.className = 'group-note';
        n.textContent = c.note;
        elBoard.appendChild(n);
        elBoard.appendChild(gridOf(group));
      });
      var loose = items.filter(function (it) { return !conceptById[it.concept]; });
      if (loose.length) {
        var h2 = document.createElement('h2');
        h2.className = 'group-title';
        h2.style.setProperty('--c', '#e5c07b');
        h2.innerHTML = '<span class="bar"></span>Added locally';
        elBoard.appendChild(h2);
        elBoard.appendChild(gridOf(loose));
      }
    } else {
      elBoard.appendChild(gridOf(items));
    }
  }

  function gridOf(items) {
    var g = document.createElement('div');
    g.className = 'grid';
    items.forEach(function (it) { g.appendChild(cardOf(it)); });
    return g;
  }

  function cardOf(it) {
    var el = document.createElement('article');
    el.className = 'card';
    if (state.stars[it.id]) el.className += ' starred';
    if (state.notes[it.id]) el.className += ' has-note';
    if (it.local) el.className += ' added';
    el.dataset.id = it.id;
    el.draggable = true;

    var thumb = document.createElement('div');
    thumb.className = 'thumb';
    applyCrop(thumb, it);
    el.appendChild(thumb);

    var flags = '';
    if (it.local) flags += '<span class="flag local">added locally</span>';
    else if (state.notes[it.id]) flags += '<span class="flag note">note</span>';
    if (flags) el.insertAdjacentHTML('beforeend', flags);

    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<h3>' + esc(it.title) + '</h3>' +
      (it.source ? '<div class="src">' + esc(it.source) + '</div>' : '');
    el.appendChild(meta);

    var star = document.createElement('button');
    star.className = 'star';
    star.title = 'Shortlist (S)';
    star.textContent = state.stars[it.id] ? '★' : '☆';
    star.onclick = function (e) { e.stopPropagation(); toggleStar(it.id); };
    el.appendChild(star);

    el.onclick = function () { openLightbox(it.id); };
    wireDrag(el);
    return el;
  }

  /* Non-destructive crop: scale the background so the crop rect fills the card. */
  function applyCrop(thumb, it) {
    var c = it.crop || { x: 0, y: 0, w: 100, h: 100 };
    thumb.style.backgroundImage = 'url("' + it.src + '")';
    thumb.style.backgroundSize = (10000 / c.w) + '% ' + (10000 / c.h) + '%';
    thumb.style.backgroundPosition =
      (c.w >= 100 ? 50 : 100 * c.x / (100 - c.w)) + '% ' +
      (c.h >= 100 ? 50 : 100 * c.y / (100 - c.h)) + '%';

    // Height comes from the natural size of the source, cropped.
    naturalSize(it.src, function (w, h) {
      var aspect = (h * c.h) / (w * c.w);
      thumb.style.paddingTop = (aspect * 100) + '%';
      var card = thumb.parentNode;
      if (card) { card.dataset.aspect = aspect; fitSpan(card); }
    });
  }

  var sizeCache = {};
  function naturalSize(src, cb) {
    if (sizeCache[src]) return cb(sizeCache[src][0], sizeCache[src][1]);
    var img = new Image();
    img.onload = function () {
      sizeCache[src] = [img.naturalWidth, img.naturalHeight];
      cb(img.naturalWidth, img.naturalHeight);
    };
    img.onerror = function () { cb(3, 4); };
    img.src = src;
  }

  /* Derive the row span from the card's WIDTH times the image aspect. Measuring the
     card's height instead would be circular — the span is what constrains that height. */
  function fitSpan(card) {
    if (!card || !card.parentNode) return;
    var aspect = parseFloat(card.dataset.aspect);
    if (!aspect) return;
    var h = card.getBoundingClientRect().width * aspect;
    card.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + GAP) / ROW));
  }

  function relayout() {
    document.querySelectorAll('.card').forEach(fitSpan);
  }
  window.addEventListener('resize', debounce(relayout, 120));

  /* ---------------- drag to rearrange ---------------- */

  var dragId = null;

  function wireDrag(el) {
    el.addEventListener('dragstart', function (e) {
      dragId = el.dataset.id;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
    });
    el.addEventListener('dragend', function () {
      dragId = null;
      el.classList.remove('dragging');
      document.querySelectorAll('.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
    });
    el.addEventListener('dragover', function (e) {
      if (!dragId || dragId === el.dataset.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', function () { el.classList.remove('drop-target'); });
    el.addEventListener('drop', function (e) {
      if (!dragId || dragId === el.dataset.id) return;
      e.preventDefault();
      e.stopPropagation();
      moveBefore(dragId, el.dataset.id);
      save();
      render();
      requestAnimationFrame(relayout);
    });
  }

  function moveBefore(id, targetId) {
    var o = state.order.slice();
    var from = o.indexOf(id);
    if (from > -1) o.splice(from, 1);
    var to = o.indexOf(targetId);
    o.splice(to < 0 ? o.length : to, 0, id);
    state.order = o;
  }

  /* ---------------- lightbox ---------------- */

  var lb = document.getElementById('lb');
  var lbImg = document.getElementById('lb-img');
  var lbStage = document.getElementById('lb-stage');
  var lbZoomLabel = document.getElementById('lb-zoom-label');
  var current = null;
  var zoom = 1, panX = 0, panY = 0;

  function openLightbox(id) {
    current = id;
    var it = byId(id);
    if (!it) return;

    lbImg.src = it.src;
    resetZoom();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';

    document.getElementById('lb-title').textContent = it.title;
    document.getElementById('lb-src').textContent =
      (conceptById[it.concept] ? conceptById[it.concept].label + ' · ' : '') + (it.source || 'Added locally');

    fill('lb-steal', it.steal);
    fill('lb-change', it.change);

    var tags = document.getElementById('lb-tags');
    tags.innerHTML = (it.tags || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    tags.previousElementSibling.hidden = !(it.tags || []).length;

    var note = document.getElementById('lb-note');
    note.value = state.notes[id] || '';
    note.oninput = function () {
      if (note.value.trim()) state.notes[id] = note.value; else delete state.notes[id];
      save();
    };

    syncStarBtn();
  }

  function fill(elId, text) {
    var el = document.getElementById(elId);
    el.textContent = text || '—';
    el.previousElementSibling.hidden = !text;
    el.hidden = !text;
  }

  function byId(id) {
    var all = allItems();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function closeLightbox() {
    lb.hidden = true;
    current = null;
    document.body.style.overflow = '';
    render();
    requestAnimationFrame(relayout);
  }

  function step(dir) {
    var list = visibleItems();
    var i = list.findIndex(function (it) { return it.id === current; });
    if (i < 0) return;
    openLightbox(list[(i + dir + list.length) % list.length].id);
  }

  function resetZoom() { zoom = 1; panX = 0; panY = 0; applyZoom(); }

  function applyZoom() {
    lbImg.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    lbZoomLabel.textContent = Math.round(zoom * 100) + '%';
  }

  function setZoom(z, cx, cy) {
    var old = zoom;
    zoom = Math.min(8, Math.max(1, z));
    if (cx !== undefined && old !== 0) {
      var r = lbStage.getBoundingClientRect();
      var dx = cx - (r.left + r.width / 2);
      var dy = cy - (r.top + r.height / 2);
      panX = dx - (dx - panX) * (zoom / old);
      panY = dy - (dy - panY) * (zoom / old);
    }
    if (zoom === 1) { panX = 0; panY = 0; }
    applyZoom();
  }

  lbStage.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  }, { passive: false });

  lbStage.addEventListener('dblclick', function (e) {
    if (zoom > 1) resetZoom(); else setZoom(2.5, e.clientX, e.clientY);
  });

  var panning = null;
  lbStage.addEventListener('pointerdown', function (e) {
    if (zoom <= 1) return;
    panning = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    lbStage.classList.add('panning');
    lbStage.setPointerCapture(e.pointerId);
  });
  lbStage.addEventListener('pointermove', function (e) {
    if (!panning) return;
    panX = panning.px + (e.clientX - panning.x);
    panY = panning.py + (e.clientY - panning.y);
    applyZoom();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    lbStage.addEventListener(ev, function () { panning = null; lbStage.classList.remove('panning'); });
  });

  document.getElementById('lb-in').onclick = function () { setZoom(zoom * 1.4); };
  document.getElementById('lb-out').onclick = function () { setZoom(zoom / 1.4); };
  document.getElementById('lb-reset').onclick = resetZoom;
  document.getElementById('lb-close').onclick = closeLightbox;
  document.getElementById('lb-prev').onclick = function () { step(-1); };
  document.getElementById('lb-next').onclick = function () { step(1); };
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

  function toggleStar(id) {
    if (state.stars[id]) delete state.stars[id]; else state.stars[id] = true;
    save();
    if (lb.hidden) { render(); requestAnimationFrame(relayout); } else { syncStarBtn(); }
  }

  function syncStarBtn() {
    var b = document.getElementById('lb-star');
    var on = !!state.stars[current];
    b.textContent = on ? '★ Shortlisted' : '☆ Shortlist';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  document.getElementById('lb-star').onclick = function () { toggleStar(current); };

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.4);
    else if (e.key === '-') setZoom(zoom / 1.4);
    else if (e.key === '0') resetZoom();
    else if (e.key.toLowerCase() === 's') toggleStar(current);
  });

  /* ---------------- toolbar ---------------- */

  var btnGroup = document.getElementById('t-group');
  var btnStar = document.getElementById('t-starred');

  function syncToolbar() {
    btnGroup.setAttribute('aria-pressed', state.grouped ? 'true' : 'false');
    btnStar.setAttribute('aria-pressed', state.starredOnly ? 'true' : 'false');
  }

  btnGroup.onclick = function () { state.grouped = !state.grouped; save(); syncToolbar(); render(); requestAnimationFrame(relayout); };
  btnStar.onclick = function () { state.starredOnly = !state.starredOnly; save(); syncToolbar(); render(); requestAnimationFrame(relayout); };

  document.getElementById('t-reset').onclick = function () {
    if (!confirm('Reset the layout, shortlist and notes on this device? Images you added locally are kept.')) return;
    state.order = []; state.stars = {}; state.notes = {};
    save(); buildChips(); render(); requestAnimationFrame(relayout);
  };

  document.getElementById('t-export').onclick = function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'moodboard-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  document.getElementById('t-import').onclick = function () { document.getElementById('t-import-file').click(); };
  document.getElementById('t-import-file').onchange = function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var p = JSON.parse(r.result);
        Object.keys(state).forEach(function (k) { if (p[k] !== undefined) state[k] = p[k]; });
        save(); buildChips(); syncToolbar(); render(); requestAnimationFrame(relayout);
        toast('Board imported.');
      } catch (err) { toast('That file is not a board export.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };

  var collabBtn = document.getElementById('t-collab');
  function syncCollab() {
    collabBtn.textContent = state.collab ? 'Open shared board ↗' : 'Link a shared board…';
  }
  collabBtn.onclick = function (e) {
    if (state.collab && !e.shiftKey) { window.open(state.collab, '_blank', 'noopener'); return; }
    var url = prompt('Paste the URL of the collaborative board (Pinterest, Milanote, Figma, Canva):', state.collab || '');
    if (url === null) return;
    state.collab = url.trim();
    save(); syncCollab();
  };

  /* ---------------- drop your own images in ---------------- */

  var MAX_EDGE = 1400;

  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (dragId) return;                       // that's a card being rearranged
      e.preventDefault();
      document.body.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (ev === 'drop' && !dragId) e.preventDefault();
      if (e.relatedTarget) return;
      document.body.classList.remove('dragover');
    });
  });

  document.addEventListener('drop', function (e) {
    if (dragId) return;
    var files = Array.prototype.slice.call(e.dataTransfer.files || [])
      .filter(function (f) { return /^image\//.test(f.type); });
    if (files.length) addFiles(files);
  });

  document.getElementById('t-add').onclick = function () { document.getElementById('t-add-file').click(); };
  document.getElementById('t-add-file').onchange = function (e) {
    addFiles(Array.prototype.slice.call(e.target.files));
    e.target.value = '';
  };

  function addFiles(files) {
    var left = files.length;
    files.forEach(function (f) {
      downscale(f, function (dataUrl) {
        state.added.push({
          id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          src: dataUrl,
          title: f.name.replace(/\.[a-z0-9]+$/i, ''),
          concept: state.filter || 'unsorted',
          source: 'Added locally on this device',
          local: true,
          crop: { x: 0, y: 0, w: 100, h: 100 },
          tags: []
        });
        if (--left === 0) {
          save(); buildChips(); render(); requestAnimationFrame(relayout);
          toast(files.length + ' image(s) added — they live in this browser only. Export the board to share them.');
        }
      });
    });
  }

  function downscale(file, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var s = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copy(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  var toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'background:#21261b;border:1px solid #38402c;color:#ece7d8;padding:10px 16px;' +
        'border-radius:999px;z-index:99;font-size:13px;max-width:80vw;text-align:center;box-shadow:0 8px 26px rgba(0,0,0,.5)';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.style.display = 'none'; }, 4200);
  }

  /* ---------------- go ---------------- */

  buildChips();
  buildPalettes();
  syncToolbar();
  syncCollab();
  render();
  window.addEventListener('load', relayout);
})();
