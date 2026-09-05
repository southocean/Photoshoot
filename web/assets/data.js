/* Photo library + the board that ships by default.
   Plain JS (not JSON) so the page works when opened straight from disk.
   crop = [x, y, w, h] as percentages of the source file. The first ten are phone
   screenshots, so their crops trim the UI chrome; the rest are full frames. */

window.LIBRARY = [
  /* ---- Skogsälva: wings, gossamer, backlight ---- */
  { key: "01", src: "images/01-skogsalva-white-lace.jpg", crop: [0, 12, 100, 75], concept: "Skogsälva",
    title: "Copper-hair elf, white lace", source: "Xiaohongshu",
    note: "Wings against dark bark. Real greenery crown, not plastic. Summer green — here for the wings, not the season." },
  { key: "02", src: "images/02-conservatory-green-wings.jpg", crop: [0, 11, 100, 50], concept: "Skogsälva",
    title: "Conservatory fairy, green wings", source: "Xiaohongshu · huiwang9977",
    note: "The wing build — veined, semi-opaque, huge. The most expensive-looking prop we've seen." },
  { key: "04", src: "images/04-backlit-bouquet-fairy.jpg", crop: [0, 11, 100, 50], concept: "Skogsälva",
    title: "Backlit wings, held bouquet", source: "Xiaohongshu · laimou0103",
    note: "Best lighting reference we have: sun behind, wings glowing, reflector lifting the face. Copy the light, change the season." },
  { key: "08", src: "images/08-copper-hair-woodland-elf.jpg", crop: [0, 11, 100, 51], concept: "Skogsälva",
    title: "Copper wig, green-gold silk", source: "Xiaohongshu",
    note: "Silk that moves. Garland down the skirt seam. The most costume-shop item on the board." },
  { key: "22", src: "images/22-fairy-oversized-flowers.jpg", crop: [0, 0, 100, 100], concept: "Skogsälva",
    title: "Fairy among oversized flowers", source: "Stock preview — watermarked",
    note: "The idea worth stealing is scale: build flowers bigger than the model and she becomes small. Cheap in foam, huge on camera." },

  /* ---- Skogsrå: moss, spruce, low key, Nordic folklore ---- */
  { key: "07", src: "images/07-moss-nymph-ferns.jpg", crop: [0, 11, 100, 73], concept: "Skogsrå",
    title: "Moss makeup, ferns, low key", source: "Xiaohongshu",
    note: "Moss and leaf on skin, camera low inside the ferns. Closest thing on the board to an actual skogsrå." },
  { key: "14", src: "images/14-lantern-spruce-forest.jpg", crop: [0, 0, 100, 100], concept: "Skogsrå",
    title: "Lantern, tartan shawl, spruce forest", source: "Pinterest",
    note: "This is the Nordic direction, fully realised — dark spruce, moss floor, wool, one warm practical light. Cheapest hero on the board and the best Sweden fit." },
  { key: "10", src: "images/10-than-tien-jungle.jpg", crop: [0, 36, 100, 45], concept: "Skogsrå",
    title: "THẦN TIÊN — jungle, crown", source: "Facebook · Kawai Studio",
    note: "Godrays through canopy, model half in the water. Proof the product sells — a working Vietnamese studio's demo set." },

  /* ---- Hösthäxa: the autumn witch, the easiest sell in October ---- */
  { key: "17", src: "images/17-witch-birch-lake.jpg", crop: [0, 0, 100, 100], concept: "Hösthäxa", hero: true,
    title: "Witch by the birch lake", source: "Pinterest",
    note: "The whole autumn palette in one frame: teal water against orange birch. Black knit, red skirt, pointed hat. Nothing here is expensive." },
  { key: "11", src: "images/11-autumn-witch-knit.jpg", crop: [0, 0, 100, 100], concept: "Hösthäxa",
    title: "Cable-knit witch with a broom", source: "Pinterest",
    note: "Warm, funny, unthreatening — the version a Swedish customer would actually book. Ordinary clothes plus one prop." },
  { key: "13", src: "images/13-witch-back-jackolantern.jpg", crop: [0, 0, 100, 100], concept: "Hösthäxa",
    title: "Witch from behind, jack-o'-lantern", source: "Pinterest",
    note: "Shot from behind, so it works for a client who hates being photographed. Worth having in the menu for exactly that." },
  { key: "12", src: "images/12-child-witch-pumpkins.jpg", crop: [0, 0, 100, 100], concept: "Hösthäxa",
    title: "Child witch, pumpkins, fairy lights", source: "Pinterest",
    note: "Same set, half the styling, parents paying. A set built once can run children all morning and adults all afternoon." },

  /* ---- Höstdrottning: fine art, the portfolio pieces ---- */
  { key: "18", src: "images/18-autumn-queen-red-gown.jpg", crop: [0, 0, 100, 100], concept: "Höstdrottning",
    title: "Autumn queen, red gown, leaf crown", source: "Joan Hall",
    note: "Falling leaves thrown by an assistant, dark forest, one hard light. The portfolio piece that makes people enquire." },
  { key: "25", src: "images/25-leaf-umbrella-redhead.jpg", crop: [0, 0, 100, 100], concept: "Höstdrottning",
    title: "Umbrella made of maple leaves", source: "Stock preview — watermarked",
    note: "The single best prop idea in the whole collection. An old umbrella and a bag of leaves. Make one for the October shoot." },
  { key: "20", src: "images/20-golden-gown-godrays.jpg", crop: [0, 0, 100, 100], concept: "Höstdrottning",
    title: "Golden gown, hanging leaves, godrays", source: "Pinterest · likely AI",
    note: "Reads AI — treat as a lighting diagram, not a promise. Hanging leaf curtain plus a hazed backlight is buildable indoors." },

  /* ---- Barn & familj: the segment that already pays ---- */
  { key: "16", src: "images/16-family-leaf-throw.jpg", crop: [0, 0, 100, 100], concept: "Barn & familj",
    title: "Family throwing leaves", source: "Andrea Thornton Photography",
    note: "No costume, no concept, real laughter. This is the milestone product the market research says Swedes already buy." },
  { key: "15", src: "images/15-baby-in-leaves.jpg", crop: [0, 0, 100, 100], concept: "Barn & familj",
    title: "Baby in a drift of leaves, backlit", source: "Tiny Tots Photography",
    note: "Low sun behind, rim on the hair, leaves thrown just out of frame. Same light as the fairy shots, entirely different customer." },
  { key: "21", src: "images/21-baby-leaf-numeral.jpg", crop: [0, 0, 100, 100], concept: "Barn & familj",
    title: "Age laid out in leaves", source: "Pinterest",
    note: "Flat lay on dark velvet. Costs nothing, sells as a monthly series, and parents share it without being asked." },

  /* ---- Nyfödd: studio, weatherproof, high margin ---- */
  { key: "19", src: "images/19-newborn-pumpkins.jpg", crop: [0, 0, 100, 100], concept: "Nyfödd",
    title: "Newborn wrapped in orange, pumpkins", source: "Studio Newborn, Charlotte NC",
    note: "The highest-margin idea in the research made literal. Indoors, warm, bookable in November when the forest is dead." },
  { key: "23", src: "images/23-newborn-bucket-rust.jpg", crop: [0, 0, 100, 100], concept: "Nyfödd",
    title: "Newborn in a bucket, rust wrap", source: "Pinterest",
    note: "Dark wood, gold leaves, one soft source overhead. A bucket, a wrap and a fur — the entire set costs under 500 kr." },
  { key: "24", src: "images/24-newborn-basket-yellow.jpg", crop: [0, 0, 100, 100], concept: "Nyfödd",
    title: "Newborn in a basket, yellow blooms", source: "Pinterest",
    note: "Same set-up, different colourway. Shows how one prop kit yields a season of different-looking sets." },

  /* ---- Studio & painterly ---- */
  { key: "05", src: "images/05-rose-noir-studio.jpg", crop: [0, 35.5, 66, 44], concept: "Studio",
    title: "BÔNG HỒNG ĐÊM — rose headdress", source: "Facebook · Kawai Makeup Artist",
    note: "Headpiece as the whole concept. Black background, one beauty light. Weather-proof, and our winter product." },
  { key: "09", src: "images/09-rose-garden-haze.jpg", crop: [0, 12, 100, 51], concept: "Rosenrus",
    title: "Rose hedge, heavy bloom", source: "Xiaohongshu",
    note: "Diffusion filter and a flare. Roses are done by October — swap to rosehips and rowan, which are more Swedish anyway." },
  { key: "06", src: "images/06-interior-romantic-grid.jpg", crop: [0, 11, 100, 50], concept: "Rosenrus",
    title: "Warm interior, old-master light", source: "Xiaohongshu",
    note: "One hard raking source, reclining poses, a butterfly as the single surreal beat." },
  { key: "03", src: "images/03-waterfall-blue-ai.jpg", crop: [0, 11, 100, 49], concept: "Vatten",
    title: "Waterfall, ice-blue wings", source: "Pinterest · labelled AI",
    note: "Palette card only. It promises something a real shoot can't deliver, and that gap is what makes clients unhappy." }
];

/* Page backgrounds offered in the toolbar. */
window.GROUNDS = ["#211a13", "#1b2016", "#14170f", "#2f2018", "#ede8d9", "#e5d9c3", "#c8c3a8", "#ffffff"];

/* The board as it first opens. Everything on it is movable, resizable, deletable.
   At most two photos per concept — a mood board is defined by what you left off. */
window.DEFAULT_BOARD = {
  name: "Höst — all references",
  bg: "#211a13",
  w: 1600,
  photos: ["17", "11", "14", "07", "18", "25", "22", "15", "19", "23", "04", "08", "01", "20", "05"],
  items: [
    { kind: "text", text: "HÖST", font: "display", size: 92, color: "#f0e6d2", w: 752, h: 108, span: 2 },
    { kind: "text", text: "DIRECTION — three weeks of Swedish autumn: gold, rust, wet granite\nand a sun that never gets high. Every look has to work in that light,\nfor a client of any age.",
      font: "display", size: 21, color: "#f0e6d2", w: 752, h: 96, span: 2 },
    { kind: "text", text: "KEYWORDS\ngold & rust · low sun · wool not satin\nreal weather · one surreal beat",
      font: "mono", size: 14, color: "#d9a441", w: 368, h: 92 },
    { kind: "text", text: "Test run · Stockholm\nShoot 1 — Sat 26 Sep, golden 17:44\nShoot 2 — Sat 17 Oct, golden 16:38",
      font: "mono", size: 15, color: "#d9a441", w: 368, h: 92 },
    { kind: "swatch", label: "HÖSTGULD — where we should land",
      colors: ["#2a2318", "#6b4a24", "#b8792c", "#d9a441", "#e8d5a8", "#7a3b2e"], w: 368, h: 118 },
    { kind: "swatch", label: "MOSSA & LAV — the cool half",
      colors: ["#2f3a2c", "#5a6b4a", "#8ba86a", "#c8c3a8", "#e8e2d2", "#a58b5e"], w: 368, h: 118 }
  ]
};
