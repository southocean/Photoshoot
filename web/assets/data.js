/* Photo library + the board that ships by default.
   Plain JS (not JSON) so the page works when opened straight from disk.
   crop = [x, y, w, h] as percentages of the source file — the sources are phone
   screenshots, so we trim the UI chrome away without touching the image. */

window.LIBRARY = [
  { key: "01", src: "images/01-skogsalva-white-lace.jpg", crop: [0, 12, 100, 75],
    title: "Copper-hair elf, white lace", note: "Wings against dark bark. Real greenery crown, not plastic.",
    source: "Xiaohongshu", temp: "warm" },

  { key: "02", src: "images/02-conservatory-green-wings.jpg", crop: [0, 11, 100, 50],
    title: "Conservatory fairy, green wings", note: "The wing build — veined, semi-opaque, huge.",
    source: "Xiaohongshu · huiwang9977", temp: "cool" },

  { key: "04", src: "images/04-backlit-bouquet-fairy.jpg", crop: [0, 11, 100, 50],
    title: "Backlit wings, held bouquet", note: "Best lighting ref on the board. Sun behind, reflector lifting the face.",
    source: "Xiaohongshu · laimou0103", temp: "warm", hero: true },

  { key: "08", src: "images/08-copper-hair-woodland-elf.jpg", crop: [0, 11, 100, 51],
    title: "Copper wig, green-gold silk", note: "Silk that moves. Garland down the skirt seam.",
    source: "Xiaohongshu", temp: "warm" },

  { key: "07", src: "images/07-moss-nymph-ferns.jpg", crop: [0, 11, 100, 73],
    title: "Moss makeup, ferns, low key", note: "Closest to a skogsrå. Best Swedish fit on the board.",
    source: "Xiaohongshu", temp: "cool" },

  { key: "09", src: "images/09-rose-garden-haze.jpg", crop: [0, 12, 100, 51],
    title: "Rose hedge, heavy bloom", note: "Diffusion filter + flare. Gilded chair dragged outdoors.",
    source: "Xiaohongshu", temp: "warm" },

  { key: "06", src: "images/06-interior-romantic-grid.jpg", crop: [0, 11, 100, 50],
    title: "Warm interior, old-master light", note: "One hard raking source. Butterfly as the single surreal beat.",
    source: "Xiaohongshu", temp: "warm" },

  { key: "03", src: "images/03-waterfall-blue-ai.jpg", crop: [0, 11, 100, 49],
    title: "Waterfall, ice-blue wings", note: "Labelled AI on Pinterest — palette card only, not a quality bar.",
    source: "Pinterest", temp: "cool" },

  { key: "10", src: "images/10-than-tien-jungle.jpg", crop: [0, 36, 100, 45],
    title: "THẦN TIÊN — jungle, crown", note: "Godrays, half in water. A working Vietnamese studio's demo set.",
    source: "Facebook · Kawai Studio", temp: "cool" },

  { key: "05", src: "images/05-rose-noir-studio.jpg", crop: [0, 35.5, 66, 44],
    title: "BÔNG HỒNG ĐÊM — rose headdress", note: "Headpiece as the whole concept. Black background, one beauty light.",
    source: "Facebook · Kawai Makeup Artist", temp: "warm" }
];

/* Page backgrounds offered in the toolbar. */
window.GROUNDS = ["#1b2016", "#14170f", "#2a2320", "#3a2b2a", "#ede8d9", "#d8cfba", "#c8c3a8", "#ffffff"];

/* The board as it first opens — everything here is movable, resizable and deletable.
   The first two blocks are the brief: the one-line direction and the keywords every
   image on the board has to earn its place against. */
window.DEFAULT_BOARD = {
  name: "All references",
  bg: "#1b2016",
  w: 1600,
  items: [
    { kind: "text", text: "SKOGSÄLVA", font: "display", size: 78, color: "#ede8d9", w: 752, h: 96, span: 2 },
    { kind: "text", text: "DIRECTION — A Swedish forest spirit photographed at last light,\nbeautiful enough to hang on a wall and real enough that nobody\ncalls it a costume.",
      font: "display", size: 21, color: "#ede8d9", w: 752, h: 92, span: 2 },
    { kind: "text", text: "KEYWORDS\nbacklit · damp · unstyled hair · lichen\nlinen not satin · quiet not sparkling",
      font: "mono", size: 14, color: "#a3be71", w: 368, h: 92 },
    { kind: "text", text: "Fantasy shoot test run · Stockholm\nShoot 1 — Sat 26 Sep, golden 17:44\nShoot 2 — Sat 17 Oct, golden 16:38",
      font: "mono", size: 15, color: "#a3be71", w: 368, h: 92 },
    { kind: "swatch", label: "MOSSA & LAV — where we should land",
      colors: ["#2f3a2c", "#5a6b4a", "#8ba86a", "#c8c3a8", "#e8e2d2", "#a58b5e"], w: 368, h: 118 },
    { kind: "swatch", label: "REFERENCE LOOK — VN / CN",
      colors: ["#1d3a2a", "#4f8a4a", "#a8d08a", "#fff3d6", "#f6d9c2", "#b83a3a"], w: 368, h: 118 }
  ]
};
