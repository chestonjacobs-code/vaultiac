# Vaultiac — PROJECT_STATUS.md
Last Updated: June 3, 2026

---

## Current Phase
**Phase 1 Complete — MVP Live at vaultiac.com**

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
- **Social share image generation** — share buttons open toast only; need server-side image render to generate shareable spotlight PNG
- **Real market data** — PokemonPriceTracker returns real prices but % change only meaningful after day 2 (first cron ran June 3 at 7AM)
- **Newsletter content** — all Coming Soon; not active yet

### Confirmed Working After Last Session (V015A)
- Scene animations (Starfield, Gold Coins, etc.) work behind card in spotlight
- Color presets (Ember, Ocean, etc.) change frame background correctly
- Root cause was duplicate `active` class on Colors tab pane in HTML — fixed

### Parked Features (Future Sessions)
- Sports Cards newsletter
- One Piece TCG newsletter
- Username system (currently defaults to "Player")
- Friend leaderboards

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
Last session ended at: **V015A**
Next session starts at: **V016A**

---

## Next Session Checklist
1. Check `https://vaultiac.com/api/newsletter/top-mover` — confirm `source` = `pokemonpricetracker` (first real data after 7AM June 4)
2. Verify price_change_pct is non-zero (requires two consecutive days of data)
3. Decide: social share image generation OR username system OR newsletter content
