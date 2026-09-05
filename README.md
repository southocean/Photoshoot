# Photoshoot

Working repo for a fantasy photoshoot + wardrobe/prop rental business in Stockholm.
Two things live here: the market research behind the idea, and the planning material for the September/October test shoots.

---

## The mood board

Open **[`web/index.html`](web/index.html)** in a browser. It works straight from disk — no server, no build step.

- **Click** a card to open it full-screen. **Scroll or double-click** to zoom, **drag** to pan
- **← / →** move between images, **S** shortlists, **Esc** closes
- **Drag cards** to rearrange the board
- **★** to shortlist, then "Shortlist only" to see just the picks
- Each image carries two notes: **what to steal** from it, and **what to change** for a Swedish audience
- Type your own notes in the panel — they save in your browser
- **Drag image files onto the page** to add your own finds
- **Export / Import** to send your version of the board to someone else

Everything you change is stored in *your* browser only. That is a real limitation — see below.

### Adding more photos properly
Drop the files in `web/images/`, then add an entry to `web/assets/data.js`. The `crop` field is a percentage rectangle `{x, y, w, h}` of the source file, so phone screenshots can have their UI chrome cropped away without editing the image.

### About collaboration
This board is static, so your friends cannot edit the same copy. **Use a shared Pinterest board for collecting and this board for deciding** — the "Link a shared board…" button stores that URL. Rationale is in the discussion notes; short version: collecting is divergent and belongs somewhere everyone already has an account, deciding is convergent and benefits from the opinionated structure here.

---

## The documents

| | |
|---|---|
| [01-market-research.md](docs/01-market-research.md) | Is there a market in Stockholm? Segments, pricing, competitors, unit economics, cultural fit, legal flags |
| [02-validation-plan.md](docs/02-validation-plan.md) | Five cheap tests over 8 weeks, with thresholds and a decision gate |
| [03-test-run-plan.md](docs/03-test-run-plan.md) | The two test shoots: light times, run of show, locations, four looks, what to measure |
| [04-shoot-checklist.md](docs/04-shoot-checklist.md) | Everything to pack for an outdoor autumn shoot |
| [05-props-and-wardrobe.md](docs/05-props-and-wardrobe.md) | What to rent, what to buy, rough budget |

---

## The three things worth remembering

1. **Sweden buys transformation and milestones, not status display.** The Vietnamese framing ("look beautiful and prestigious") runs straight into Jantelagen. The same shoot sold as play, craft and a rite of passage does not.

2. **Use the Nordic fantasy canon.** Skogsrå, huldra, John Bauer's forests, Midsommar flower crowns. Same wings, same craft, completely different cultural permission — and no competitor is doing it.

3. **The economics only work batched.** One private client a day with a hired makeup artist leaves almost nothing. The studios you're copying run several clients through one set-up. Design for that from the start.

---

## Status

- [x] Mood board built from the first 10 references
- [x] Market research, first pass
- [x] Test run plan with computed light times
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
