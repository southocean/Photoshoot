# Photoshoot

### → **[southocean.github.io/Photoshoot](https://southocean.github.io/Photoshoot/)**

The live mood board and market research. Nothing to install, works on a phone.

Working repo for a fantasy photoshoot + wardrobe/prop rental business in Stockholm.
Two things live here: the market research behind the idea, and the planning material for the September/October test shoots.

---

## The mood board

Open the [live site](https://southocean.github.io/Photoshoot/), or `web/index.html` straight from disk. No server, no build step either way.

**Arranging**
- **Drag** a photo to move it, the **corner dots** to resize, the **side dot** to rotate (hold Shift to snap to 15°)
- **Crop** without touching the original, free or to a fixed ratio, with its own undo
- Switch a photo between **rectangle and circle**, and cycle its **frame**: none, white, black, hairline
- **Undo / redo** everything, or **Reset** to the shipped arrangement, which is undoable too

**Filling it**
- The **Gallery** holds every reference. Click one to drop it on the board
- **Upload your own**, or drag image files anywhere onto the page. The meter shows how much room your browser has left
- Add **text blocks**, **colour palettes** and **stickers**. **Auto-arrange** tidies everything back into a grid
- Several **boards** in one file, one per look, with canvas presets for tall, 16:9, square and A4

**Getting it out**
- **Download** the board as a PNG. On a phone that goes through the share sheet, so "Save Image" puts it in your photo library
- **Export / Import** the whole thing as JSON, to send your version to someone else

**Market research** is the second tab: both reports, with a progress rail that follows the section you are reading.

Everything you change is stored in *your* browser only. That is a real limitation: see below.

### Adding more photos properly
Drop the files in `web/images/`, then add an entry to `web/assets/data.js`. The `crop` field is a percentage rectangle `[x, y, w, h]` of the source file, so phone screenshots can have their UI chrome cropped away without editing the image.

### About collaboration
This board is static, so your friends cannot edit the same copy. Use a shared Pinterest board for collecting and this one for deciding: collecting is divergent and belongs somewhere everyone already has an account, deciding is convergent and benefits from the opinionated structure here. Export and send the JSON when you want someone to see your exact arrangement.

---

## The documents

| | |
|---|---|
| [01-market-research.md](docs/01-market-research.md) | Is there a market in Stockholm? Segments, pricing, competitors, unit economics, cultural fit, legal flags |
| [02-validation-plan.md](docs/02-validation-plan.md) | Five cheap tests over 8 weeks, with thresholds and a decision gate |
| [03-test-run-plan.md](docs/03-test-run-plan.md) | The two test shoots: light times, run of show, locations, four looks, what to measure |
| [04-shoot-checklist.md](docs/04-shoot-checklist.md) | Everything to pack for an outdoor autumn shoot |
| [05-props-and-wardrobe.md](docs/05-props-and-wardrobe.md) | What to rent, what to buy, rough budget |

Both research reports also read in the browser, on the **Market research** tab of the [live site](https://southocean.github.io/Photoshoot/).

---

## The three things worth remembering

1. **Sweden buys transformation and milestones, not status display.** The Vietnamese framing ("look beautiful and prestigious") runs straight into Jantelagen. The same shoot sold as play, craft and a rite of passage does not.

2. **Use the Nordic fantasy canon.** Skogsrå, huldra, John Bauer's forests, Midsommar flower crowns. Same wings, same craft, completely different cultural permission, and no competitor is doing it.

3. **The economics only work batched.** One private client a day with a hired makeup artist leaves almost nothing. The studios you're copying run several clients through one set-up. Design for that from the start.

---

## Status

- [x] Mood board built from the first 10 references
- [x] Market research, first pass
- [x] Test run plan with computed light times
- [x] Published at [southocean.github.io/Photoshoot](https://southocean.github.io/Photoshoot/)
- [ ] Scout locations at shoot-hour
- [ ] Book model + wardrobe rental
- [ ] Landing page (hosting still being decided)
- [ ] Run the five validation tests

---

## Adopting a board arrangement

Rearrange the stickers in the browser, hit **Export**, then:

```bash
node tools/adopt-stickers.js ~/Downloads/moodboard-YYYY-MM-DD.json
```

That rewrites the `stickers` block in `web/assets/data.js` so your arrangement
becomes the shipped default. Positions are re-expressed as an anchor on the
nearest photo corner rather than absolute pixels, so they survive the masonry
re-flowing when photos are added or the canvas preset changes; anything not near
a corner falls back to a fraction of the board.
