#!/usr/bin/env node
/*
 * Take a board exported from the app and write its sticker arrangement back
 * into web/assets/data.js as the new default.
 *
 *   node tools/adopt-stickers.js ~/Downloads/moodboard-2026-09-05.json
 *
 * Positions are re-expressed as an anchor on the nearest photo corner rather
 * than absolute pixels, so the arrangement survives the masonry re-flowing when
 * photos are added or the canvas preset changes. A sticker that isn't near any
 * corner falls back to a fraction of the board.
 */

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const DATA = path.join(__dirname, '..', 'web', 'assets', 'data.js');
const SNAP_PX = 170;          // how close a corner has to be to win the anchor

if (!SRC) {
  console.error('usage: node tools/adopt-stickers.js <exported-board.json>');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const board = payload.board || (payload.doc && payload.doc.boards[payload.doc.active || 0]);
if (!board || !board.items) {
  console.error('That file has no board in it. Use the app\'s Export button.');
  process.exit(1);
}

const photos = board.items.filter(i => i.kind === 'photo');
const stickers = board.items.filter(i => i.kind === 'sticker');
if (!stickers.length) {
  console.error('No stickers on that board — nothing to adopt.');
  process.exit(1);
}

/* Nearest photo corner to the sticker's centre. */
function anchorFor(s) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  let best = null;

  for (const p of photos) {
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const px = p.x + (corner[1] === 'e' ? p.w : 0);
      const py = p.y + (corner[0] === 's' ? p.h : 0);
      const d = Math.hypot(cx - px, cy - py);
      if (!best || d < best.d) best = { d, img: p.img, corner, px, py };
    }
  }

  if (!best || best.d > SNAP_PX) return null;
  return {
    img: best.img,
    corner: best.corner,
    dx: Math.round(cx - best.px),
    dy: Math.round(cy - best.py),
    _d: Math.round(best.d)
  };
}

const lines = stickers.map(s => {
  const a = anchorFor(s);
  const geom = `w: ${Math.round(s.w)}, h: ${Math.round(s.h)}, rot: ${Math.round(s.rot || 0)}` +
    (s.flipX ? ', flipX: true' : '') + (s.flipY ? ', flipY: true' : '');

  if (a) {
    console.log(`  ${s.sticker.padEnd(12)} -> ${a.img} ${a.corner}  (${a._d}px from that corner)`);
    return `    { sticker: ${JSON.stringify(s.sticker)}, ` +
      `anchor: { img: ${JSON.stringify(a.img)}, corner: ${JSON.stringify(a.corner)}, dx: ${a.dx}, dy: ${a.dy} },\n` +
      `      ${geom} }`;
  }

  const fx = +(s.x / board.w).toFixed(4), fy = +(s.y / board.h).toFixed(4);
  console.log(`  ${s.sticker.padEnd(12)} -> no corner within ${SNAP_PX}px, kept as a board fraction`);
  return `    { sticker: ${JSON.stringify(s.sticker)}, fx: ${fx}, fy: ${fy},\n      ${geom} }`;
});

const block = '  stickers: [\n' +
  '    /* Adopted from an exported board — regenerate with tools/adopt-stickers.js */\n' +
  lines.join(',\n') + '\n  ]';

let data = fs.readFileSync(DATA, 'utf8');
const re = /\n {2}stickers: \[[\s\S]*?\n {2}\]/;
if (!re.test(data)) {
  console.error('Could not find the stickers block in data.js — has its shape changed?');
  process.exit(1);
}
data = data.replace(re, '\n' + block);
fs.writeFileSync(DATA, data, 'utf8');

console.log(`\nWrote ${stickers.length} sticker${stickers.length > 1 ? 's' : ''} into web/assets/data.js.`);
