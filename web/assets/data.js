/* Board data. Plain JS (not JSON) so the page works when opened straight from disk.
   crop = percentage rectangle of the source file to show, {x, y, w, h}.
   The sources are phone screenshots, so we crop the UI chrome away non-destructively. */

window.BOARD = {
  title: "Fantasy Shoot — Test Run Mood Board",
  subtitle: "Reference pull for the September + October test shoots, Stockholm",

  concepts: [
    { key: "skogsalva", label: "Skogsälva — Forest fairy", color: "#8ba86a",
      note: "Backlit gossamer wings, oat linen and lace, living greenery. The core direction. Cheapest to stage, hardest to light." },
    { key: "morker", label: "Skogsrå — Dark nymph", color: "#4e6b52",
      note: "Moss and lichen on skin, ferns, low key, mist. Nordic folklore reads as native here, not imported. Strongest Sweden-fit." },
    { key: "rosen", label: "Rosenrus — Painterly romance", color: "#a4595e",
      note: "Bloom and haze, roses, old-master light. Lens-driven look. Needs a garden, not a forest." },
    { key: "vatten", label: "Vatten — Water & mist", color: "#5d7f92",
      note: "Näcken / water-spirit territory. Highest production risk in October — cold water, safety, one take." },
    { key: "studio", label: "Studio — Graphic glam", color: "#8a6f8f",
      note: "Controlled light, heavy headpiece, editorial makeup. The wet-weather fallback and the winter product." }
  ],

  palettes: [
    { name: "Mossa & lav (Swedish autumn)", colors: ["#2f3a2c", "#5a6b4a", "#8ba86a", "#c8c3a8", "#e8e2d2", "#a58b5e"] },
    { name: "Reference look (VN/CN)", colors: ["#1d3a2a", "#4f8a4a", "#a8d08a", "#fff3d6", "#f6d9c2", "#b83a3a"] },
    { name: "Rosenrus", colors: ["#3a2b2a", "#7b3f45", "#c46b6b", "#e7c9b8", "#f3e6d8", "#6f7a52"] }
  ],

  items: [
    {
      id: "skogsalva-white-lace",
      src: "images/01-skogsalva-white-lace.jpg",
      crop: { x: 0, y: 12, w: 100, h: 75 },
      title: "Copper-hair elf, white lace, mossy trunk",
      concept: "skogsalva",
      source: "Xiaohongshu",
      steal: "Wing translucency read against dark bark. Flower crown made of real greenery, not plastic. Hand on the trunk — always give the hands a job.",
      change: "The wig is very anime. For Sweden: real hair, loose, a little messy. Shoot one take with the pointed ears and one without.",
      tags: ["wings", "flower crown", "backlight", "lace slip", "forest"]
    },
    {
      id: "conservatory-green-wings",
      src: "images/02-conservatory-green-wings.jpg",
      crop: { x: 0, y: 11, w: 100, h: 50 },
      title: "Conservatory fairy, big green butterfly wings",
      concept: "skogsalva",
      source: "Xiaohongshu (huiwang9977)",
      steal: "The wing build — veined, semi-opaque, huge. The single most expensive-looking prop on the board. Layered tulle over a visible corset.",
      change: "Indoor set dressed with potted plants. Our Stockholm equivalent is a rented orangery or greenhouse — this is the wet-weather plan B.",
      tags: ["wings", "tulle", "greenhouse", "elf ears", "butterflies"]
    },
    {
      id: "backlit-bouquet-fairy",
      src: "images/04-backlit-bouquet-fairy.jpg",
      crop: { x: 0, y: 11, w: 100, h: 50 },
      title: "Backlit wings, held bouquet, natural updo",
      concept: "skogsalva",
      source: "Xiaohongshu (laimou0103)",
      steal: "Best lighting reference on the board: sun behind, wings glowing, face lifted by a reflector. Loose updo with escaped strands. Flowers as the hand prop.",
      change: "Very little. This is the closest thing here to something a Swedish viewer would call beautiful rather than costumed. Make it the hero frame.",
      tags: ["backlight", "reflector", "wings", "bouquet", "hero-frame"]
    },
    {
      id: "copper-hair-woodland-elf",
      src: "images/08-copper-hair-woodland-elf.jpg",
      crop: { x: 0, y: 11, w: 100, h: 51 },
      title: "Copper wig, green-gold silk, bluebell woodland",
      concept: "skogsalva",
      source: "Xiaohongshu",
      steal: "Silk that catches light and moves. Flower garland running down the skirt seam. Standing in low ground cover so the hem has something to sit in.",
      change: "The green-gold silk is the most costume-shop item on the board — real risk of reading as Halloween. Test it, but shoot the lace look first.",
      tags: ["silk", "wig", "garland", "woodland", "risky"]
    },
    {
      id: "moss-nymph-ferns",
      src: "images/07-moss-nymph-ferns.jpg",
      crop: { x: 0, y: 11, w: 100, h: 73 },
      title: "Moss makeup, ferns, low-key green",
      concept: "morker",
      source: "Xiaohongshu / Pinterest",
      steal: "Moss and leaf applied to face and chest. Low camera inside the ferns so foreground fronds frame the subject. Cool, desaturated green.",
      change: "Best Swedish fit on the board — this is essentially a skogsrå. Push it further: lichen, granite, birch, less fantasy-green and more grey-green.",
      tags: ["body makeup", "ferns", "low key", "foreground framing", "sweden-fit"]
    },
    {
      id: "rose-garden-haze",
      src: "images/09-rose-garden-haze.jpg",
      crop: { x: 0, y: 12, w: 100, h: 51 },
      title: "Rose hedge, white slip, heavy bloom",
      concept: "rosen",
      source: "Xiaohongshu",
      steal: "The haze — almost certainly a vintage or diffusion-filtered lens with a light flaring into it. And the gilded chair dragged outdoors: furniture in nature reads as luxury.",
      change: "Roses peak here in July, not October. Either find a garden still holding blooms or swap to rosehips and rowan berries, which are very Swedish autumn.",
      tags: ["diffusion filter", "flare", "roses", "furniture outdoors", "seasonality-problem"]
    },
    {
      id: "interior-romantic-grid",
      src: "images/06-interior-romantic-grid.jpg",
      crop: { x: 0, y: 11, w: 100, h: 50 },
      title: "Warm interior set — butterfly, florals, old-master light",
      concept: "rosen",
      source: "Xiaohongshu grid",
      steal: "One hard window-like source raking across the body. Reclining poses. A butterfly on the face as the single surreal beat in an otherwise real image.",
      change: "Read the grid as a delivery format too — clients want a set of four to six images that hang together, not forty loose files.",
      tags: ["interior", "hard light", "reclining", "butterfly", "set-of-six"]
    },
    {
      id: "waterfall-blue-ai",
      src: "images/03-waterfall-blue-ai.jpg",
      crop: { x: 0, y: 11, w: 100, h: 49 },
      title: "Waterfall, ice-blue wings (AI-modified)",
      concept: "vatten",
      source: "Pinterest — labelled 'AI-modifierad'",
      steal: "The colour story only: teal wings against cold water and black-green foliage.",
      change: "Pinterest itself labels this AI. Do not use it as a quality bar — it promises something a real shoot cannot deliver, and that gap is exactly what makes clients unhappy. Palette card only.",
      tags: ["ai-generated", "palette only", "cold water", "caution"]
    },
    {
      id: "than-tien-jungle",
      src: "images/10-than-tien-jungle.jpg",
      crop: { x: 0, y: 36, w: 100, h: 45 },
      title: "THẦN TIÊN — jungle, crown, butterfly",
      concept: "vatten",
      source: "Facebook — Nguyễn Vân / Kawai Studio, 2020",
      steal: "Godrays through canopy. Model half in the water. Butterfly on a fingertip. Also proof the product sells — this is a working Vietnamese studio's demo set.",
      change: "The tiara, the heavy skin retouch and the HDR green are the three things a Swedish viewer will read as cheap. All three are fixable in our version.",
      tags: ["vietnam reference", "godrays", "in water", "tiara", "retouch-warning"]
    },
    {
      id: "rose-noir-studio",
      src: "images/05-rose-noir-studio.jpg",
      crop: { x: 0, y: 34, w: 66, h: 46 },
      title: "BÔNG HỒNG ĐÊM — rose headdress, graphic eye",
      concept: "studio",
      source: "Facebook — Nguyễn Vân / Kawai Makeup Artist, 2020",
      steal: "Headpiece as the entire concept. Falling petals and butterflies composited in. Black background, one beauty light. Cheap to stage, high perceived value, weather-proof.",
      change: "The makeup is 2020 Vietnamese pageant. Swedish equivalent: same headpiece scale, skin left matte and textured, eye graphic in one colour instead of five.",
      tags: ["headpiece", "studio", "black background", "beauty light", "winter product"]
    }
  ]
};
