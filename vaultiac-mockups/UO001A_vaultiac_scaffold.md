# UO001A — VAULTIAC Scaffold

**Project:** VAULTIAC — Pokémon TCG collector platform  
**Tagline:** Pull it. Track it. Flex it.  
**Mockup dir:** `vaultiac-mockups/`  
**Status:** HTML mockups complete (4 screens). No framework, build system, or backend yet.

---

## 1. Product Overview

VAULTIAC is a mobile-first web app for Pokémon TCG collectors. The core loop:

1. **Pick a card** — search by Pokémon or browse by set
2. **Customize a spotlight** — styled shareable graphic with live market value
3. **Share the flex** — post to Instagram, X, TikTok, Snapchat, Pinterest, or save to camera roll

Planned features beyond Card Spotlight (all "Coming Soon" in current mockups):

| Feature | Description |
|---|---|
| Stock Finder | Locate stores near user with TCG product in stock |
| My Collection | Log cards, track total value and set completion |
| Weekly Newsletter | Market movers, set drops, weekly digest |
| Leaderboard | Who's pulling the rarest cards — live rankings |
| TCG Trivia | Daily trivia, knowledge scoring, climb ranks |
| Card Grader | AI estimates PSA/BGS grade from a card scan before submission |

---

## 2. Screen Inventory

### 2.1 `vaultiac-home.html` — Landing Page
- Fixed nav with VAULTIAC wordmark + vault icon SVG
- Hero: three layered vault rings (`vault-ring`, `vault-ring-inner`, `vault-ring-spin`), star canvas, gold glow bloom, 8 bolt ring, and an animated vault dial canvas (`#vaultDial`) — 3-spoke dial with tick marks, slowly rotating (~78s/rev), drawn entirely in Canvas
- Marquee strip: feature name ticker (includes Card Grader)
- Feature section: **seven** pack cards (one live, six "Coming Soon") — pack art areas now use per-pack Canvas drawings instead of emoji
- Card Spotlight deep-dive: step breakdown + phone mockup preview
- Email notify form (frontend only, no backend hookup)
- Footer

**Nav links:** Features → `#features` | Card Spotlight → `#spotlight` | Try it free → `vaultiac-card-picker.html`

**Pack art canvases** — each pack's art area is a `<canvas class="pack-canvas">` with a unique static scene drawn in JS:

| Pack | Canvas art |
|---|---|
| Card Spotlight | Deep purple bg, radial speed lines, gold glow orb, floating tilted card with ✦, corner sparkles |
| Stock Finder | Deep teal bg, concentric rings, teal map pin with glow, scattered store icons |
| My Collection | Deep purple bg, fanned stack of 4 colored cards + gold starred top card |
| Weekly Newsletter | Dark amber bg, light rays, paper envelope with V-seal and letter sticking out |
| Leaderboard | Dark rose bg, crown rays, gold trophy cup, silver/gold/bronze ranking bars |
| TCG Trivia | Dark navy bg, electric arcs, stylized two-lobe brain with ridges |
| Card Grader | (7th pack, accent `#f5d99a`) |

### 2.2 `vaultiac-card-picker.html` — Step 1: Pick Your Card
- Mode toggle: **Search Pokémon** (default) | **Browse by Set**
- Search bar with live filter, clear button, quick-pick chips (8 popular Pokémon)
- Type filter pills: All / Fire / Water / Grass / Psychic / Lightning / Dragon / Dark / Metal / Colorless
- Pokemon grid: 24 Pokémon, each with type-colored sprite ring, name, type badge, card count
- Set browse: four eras (Scarlet & Violet, Sword & Shield, Sun & Moon, Classic), ~31 sets total
- Card results panel: back button, sub-filters (All / Secret Rare / Ultra Rare / Holo / Alt Art / Full Art / Reverse Holo), card rows with thumb, tags, price, trend
- Sticky CTA footer ("Create My Spotlight") slides up on card selection
- On confirm: serialises card to `sessionStorage['vaultiac_card']`, navigates to spotlight

**Data:** All static (hardcoded POKEMON array, CARDS object with real prints for Charizard/Pikachu/Mewtwo/Umbreon/Rayquaza, FALLBACK_CARDS generator for the rest, SETS object).

### 2.3 `vaultiac-spotlight-linked.html` — Step 2: Customize Spotlight
- Vault door intro animation (CSS-only, 2.3s, then hides)
- Story-format frame (9:16 aspect ratio, responsive)
- Full-frame hover sheen sweep
- Card inner: procedural creature art, attack rows, stat bar
- Meta display: card name, set·number·rarity, market value, weekly trend, username, date
- Share CTA button (top-right of frame) → navigates to `vaultiac-share.html`
- Edit tab (bottom of frame): Show/Hide toggles a slide-up customize panel

**Customize panel tabs:**
- **Caption** — 4 presets (Latest Pickup / My Grail / Favorite / Finally Found It), updates eyebrow + big headline
- **Colors** — 8 presets (Aurora / Midnight / Ember / Ocean / Forest / Void / Gold / Rose), applies gradient to frame background
- **Scenes** — 6 animated Canvas scenes rendered in thumbnails and full-frame:
  - Gold Coins — falling/drifting coin pile with spark flares
  - Divine Light — ember star motes drifting upward with 8-point cross flares
  - Pedestal — spotlight cone, marble plinth, floating dust
  - Starfield — nebula, twinkling stars, shooting star
  - Sewer — tunnel ribs, slime streaks, dripping pipe, murky water, bubbles
  - Sad Rain — moody downpour (raindrop streaks, puddles, splash rings)
- **Custom** — file upload (image/*), sets as full-frame background; remove button

**Card data injection:** reads `sessionStorage['vaultiac_card']` on load, populates meta fields and card inner name.

### 2.4 `vaultiac-share.html` — Step 3: Share the Flex
- Full-screen coin burst canvas animation on load (160 coins, 2.8s, arcing outward)
- UI reveals staggered as burst reaches 70%
- Mini spotlight preview card (reads from sessionStorage)
- Share grid (2-col): Instagram, X/Twitter, TikTok, Snapchat, Pinterest, Copy Link
- Download button ("Save image to camera roll")
- Start Over link → back to card picker
- Toast notifications for all share/download actions

**Note:** All share/download actions are mockup-only (toasts, no real export or deep-link).

---

## 3. Design System

### 3.1 Typography
| Role | Family | Weight |
|---|---|---|
| Display / wordmark / prices | Fraunces (serif, optical size 9–144) | 300, 400, 600, 900 |
| Body / UI / labels | Hanken Grotesk (sans) | 400, 500, 600, 700, 800 |

### 3.2 Color Tokens
```css
--ink:     #06050c   /* page background */
--paper:   #f3eee6   /* primary text */
--muted:   #7a7488   /* secondary text */
--muted2:  #9a93a6   /* tertiary text */
--gold:    #e8c27a   /* primary accent */
--gold2:   #f5d99a
--gold3:   #c8a050
--holo1:   #7ce8d6   /* teal / trend-up */
--holo2:   #a78bfa   /* purple */
--holo3:   #f0a6c8   /* pink / trend-down */
--holo4:   #ffd98a   /* warm yellow */
--surface:  #0f0e1a
--surface2: #161424
--surface3: #1c1a2e
--steel1:  #2e3340   /* vault metal */
--steel2:  #1c2028
--line:    rgba(255,255,255,.08)
--line2:   rgba(255,255,255,.13)
```

### 3.3 Shared Motifs
- Grain overlay: SVG fractalNoise, `opacity:.03–.04`, `position:fixed`, `pointer-events:none`
- Vault ring: large circle with dashed inner ring + conic-gradient rotation animation
- Gold gradient: `linear-gradient(90deg, --gold3, --gold, --gold2)` on primary CTAs
- Rise animation: `opacity:0 → 1`, `translateY(16px → 0)`, used for hero stagger
- Reveal class: IntersectionObserver-driven fade-in for below-fold sections
- Scroll reveals: `.reveal` → `.reveal.in` via IntersectionObserver threshold 0.1

### 3.4 Card Pack Visual Language
Each feature pack has:
- `pack-front` with themed gradient background
- `pack-top` strip: metallic gradient bar with shimmer animation
- `pack-art` area: `<canvas class="pack-canvas" width="160" height="180">` with a unique static Canvas scene per pack (drawn once on load)
- `pack-bottom` strip: feature name in accent color
- Dashed `pack-tear` line between top and art
- Hover glow (`::after` radial-gradient) + `translateY(-6px) rotate(-1deg)` lift
- Click-to-open keyframe animation before navigation

---

## 4. Data Model (Current Static Shape)

### Card object (sessionStorage payload)
```js
{
  name:    string,   // "Charizard ex"
  set:     string,   // "Obsidian Flames"
  num:     string,   // "215/197"
  rarity:  string,   // "secret" | "ultra" | "rare" | "common"
  tags:    string[], // ["secret", "alt-art"]
  price:   string,   // "$148.00"
  trend:   string,   // "+18%"
  up:      boolean,
  pokemon: string,   // "Charizard"
}
```

### Rarity labels
```
secret → "Secret Rare"
ultra  → "Ultra Rare"
rare   → "Holo Rare"
common → "Common"
```

### Type enum
`fire | water | grass | psychic | lightning | dragon | dark | metal | colorless`

---

## 5. Inter-Screen Navigation

```
vaultiac-home.html
  └─ [Try Card Spotlight / pack click] ──► vaultiac-card-picker.html
                                               └─ [Create My Spotlight] ──► vaultiac-spotlight-linked.html
                                                                                └─ [Share My Spotlight →] ──► vaultiac-share.html
                                                                                                                  └─ [Start over] ──► vaultiac-card-picker.html
```

Back navigation:
- Spotlight → Picker: injected "← Back to Search" button (only when arriving from picker)
- Share → Picker: "← Start over with a different card" link

---

## 6. Known Gaps / Next Work

### 6.1 Functional gaps (mockup limitations)
- [ ] No real image export — spotlight share/download is stub (toast only)
- [ ] No deep links to social platforms — all show toasts
- [ ] Email notify form POSTs nowhere
- [ ] Card data is entirely hardcoded; no TCG API integration (e.g. [Pokémon TCG API](https://pokemontcg.io))
- [ ] Market prices are static strings; no live pricing source
- [ ] Username is hardcoded `@cheston` / `@you`
- [ ] Date is hardcoded `MAY 2026`
- [ ] sessionStorage cleared on tab close; no persistence

### 6.2 UX gaps
- [ ] No loading/skeleton states on card picker grid
- [ ] No pagination — Pokemon grid caps at 24
- [ ] Set browse shows generic card list (not real cards from the set)
- [ ] No card search within a set
- [ ] Spotlight card art is always procedural (no real card image)
- [ ] No username input — @handle on spotlight is a placeholder

### 6.3 Missing screens
- [ ] User profile / handle setup (before or within spotlight flow)
- [ ] Collection view (My Collection feature)
- [ ] Stock Finder map view
- [ ] Leaderboard feed
- [ ] Trivia game screen
- [ ] Newsletter archive / subscribe confirmation
- [ ] Card Grader flow (camera/upload → AI grade estimate result)

### 6.4 Technical debt
- [ ] No component abstraction — VAULTIAC brand nav SVG is copy-pasted across all 4 files
- [ ] No shared CSS — each file has a full inline `<style>` block
- [ ] No build tooling, bundler, or module system
- [ ] Scene canvas particle data initialised inline, not seeded deterministically

---

## 7. Proposed Next Steps (Priority Order)

1. **Extract shared shell** — nav, fonts, CSS tokens, grain overlay into a single `_shell.html` or convert to a framework component
2. **Real card images** — integrate Pokémon TCG API (`api.pokemontcg.io/v2/cards`) to replace procedural card art with actual card image URLs
3. **Live pricing** — connect to TCGPlayer or CardMarket price endpoint; replace static `$xx.xx` strings
4. **Image export** — implement `html2canvas` or Canvas-based export so Share/Download actually produces a PNG
5. **Social deep links** — use Web Share API (`navigator.share`) with the exported image blob; fall back per-platform to intent URLs
6. **Username input** — simple prompt or profile step before spotlight; store in localStorage
7. **API-backed search** — replace hardcoded POKEMON/CARDS/SETS arrays with live TCG API calls + debounced search
8. **Backend + auth** — user accounts, saved collections, notify list storage (Supabase or Firebase are natural fits given the zero-backend start)

---

## 8. File Map

```
vaultiac-mockups/
├── UO001A_vaultiac_scaffold.md      ← this file
├── vaultiac-home.html               ← landing page
├── vaultiac-card-picker.html        ← step 1: pick card
├── vaultiac-spotlight-linked.html   ← step 2: customize spotlight
└── vaultiac-share.html              ← step 3: share
```
