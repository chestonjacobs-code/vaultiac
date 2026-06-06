# Vaultiac — PROJECT_STATUS.md
Last Updated: June 4, 2026

---

## Current Phase
**Phase 1 Complete — MVP Live at vaultiac.com**
**Post-Launch Bug Fix Session Complete (V016A–V017C)**

---

## What's Built and Working

### Infrastructure
- Node.js/Express backend deployed on Railway
- PostgreSQL database (Railway free tier) — persistent across deploys
- Domain: vaultiac.com (Cloudflare DNS → Railway)
- GitHub repo: https://github.com/chestonjacobs-code/vaultiac
- Auto-deploy on push to main

### Pages (all live)
- `vaultiac-home.html` — Homepage
- `vaultiac-card-picker.html` — Card search (live Pokémon TCG API) + static grid (also hits live API)
- `vaultiac-spotlight-linked.html` — Card spotlight with real card art, scene/color customization working
- `vaultiac-share.html` — Share page with real card preview, SVG social logos
- `vaultiac-trivia-select.html` — Trivia category selector (all Coming Soon except Pokémon flow)
- `vaultiac-trivia-riddle.html` — Daily Pokémon riddle (6 clues, daily lock at 8AM reset)
- `vaultiac-leaderboard.html` — Live leaderboard (points + streak, PostgreSQL)
- `vaultiac-market-pulse-widget.html` — Market movers widget (top mover card image, watchlist disclaimer)
- `vaultiac-newsletter-select.html` — Newsletter selector (all 3 cards Coming Soon)
- `vaultiac-newsletter-pokemon.html` — Pokémon newsletter (Coming Soon)

### APIs Wired
- **Pokémon TCG API** (pokemontcg.io) — card search, card picker, spotlight images
- **PokéAPI** (pokeapi.co) — trivia daily Pokémon, 6-clue generation
- **PokemonPriceTracker API** — daily market movers (free tier, 100 credits/day)
- **Claude API** — available, not currently used in trivia (static templates)

### Database Tables (PostgreSQL)
- `leaderboard` — username, total_points, current_streak, longest_streak, last_played_date, daily_play_date
- `trivia_sessions` — per-game log
- `market_data` — daily price data, price_change_pct, source
- `news_stories` — newsletter headlines (8-week retention)

### Scheduled Jobs
- Daily at 7AM: market scrape (PokemonPriceTracker watchlist of 20 cards, price change vs yesterday)
- News scrape runs same job (pokemon.com headlines)

### Trivia System
- 6 progressive clues: type → habitat → evolution → physical trait → ability → generation
- Points: 6 (clue 1) down to 1 (clue 6)
- Daily lock: one play per 8AM-to-8AM window
- Streak: increments if played on consecutive days
- Leaderboard: sorts by total_points or current_streak

---

## Environment Variables (Railway — Vaultiac service)
- `DATABASE_URL` — PostgreSQL connection string (set via Railway variable reference)
- `POKEMON_TCG_API_KEY` — pokemontcg.io key
- `POKEMON_PRICE_API_KEY` — pokemonpricetracker.com key
- `ANTHROPIC_API_KEY` — Anthropic key (available, not currently used)
- `NODE_ENV=production`
- `DATABASE_PATH=none` (legacy, ignored)

---

## Known Issues / Parked Work

### Next Up
- **Social share image generation** (V016G) — share buttons open toast only; need server-side image render to generate shareable spotlight PNG
- **Newsletter content** — all Coming Soon; not active yet
- **Username system** — everyone defaults to "Player"; parked for future session

### Confirmed Working After Last Session (V016F)
- Trivia per-device lock via localStorage — each browser independent ✅
- Market mover showing real PokemonPriceTracker data — was `result.price` typo, fixed to `result.prices` ✅
- price_change_pct will show real deltas starting June 5 (first two real days of data)
- Spotlight → Share scene/color passthrough via sessionStorage ✅
- Contact form live at vaultiac.com/vaultiac-contact.html — sends via Resend to chestonmarketingco@gmail.com ✅
- Suggestion panel wired to /api/contact on all 10 pages ✅
- Friends tab invite button copies https://vaultiac.com ✅
- Daily shared trivia Pokémon — everyone gets same Pokémon per day, cached in daily_trivia table ✅
- Updated trivia clue format: Type → Habitat → Stage → Flavor text → Ability → Generation ✅

### Confirmed Working After V017B (this session)
- Trivia “come back” message updated to 12AM ✅
- Share page: coin burst animation removed (was conflicting with mini scene canvas) ✅
- Share page: replaced with clean CSS fade-in ✅
- Share page: SCENE_LABELS dead code removed ✅
- Mini scene canvas z-index, dimensions, and background clearing all corrected ✅

### Confirmed Working After V017C
- Trivia “come back” message: “Come back tomorrow at 12AM for a new Pokémon.” ✅
- V017C prompt delivered and pushed to production

### Outstanding — Carry to V017D
- Share page scene preview still not rendering — verify coin burst removal is live in production first (hard refresh / cache clear)
- If still broken after cache clear, debug mini scene canvas render with fresh eyes

### Parked Features (Future Sessions)
- Sports Cards newsletter
- One Piece TCG newsletter
- Username system (currently defaults to "Player")
- Friend leaderboards (requires username system first)
- Social share image generation

---

## File Structure
```
Z:\Vaultiac\
  server/
    index.js
    db/db.js
    routes/cards.js, trivia.js, leaderboard.js, newsletter.js
    jobs/newsletter-scrape.js
  public/js/api.js
  vaultiac-*.html (11 pages)
  package.json
  Procfile
  .env (local, gitignored)
  .gitignore
```

---

## Session Naming
Last session ended at: **V017C**
Next session starts at: **V017D**

---

## Next Session Checklist
1. Hard refresh share page in production — confirm coin burst is gone
2. Verify scene background now renders in share page preview
3. If still broken: fresh debug of mini scene canvas
