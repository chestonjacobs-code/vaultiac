// One-time seed script for the PA card shows starter list (V020M-followup).
// Run with: railway run node server/db/seed-pa-card-shows.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env'), override: true });
const pool = require('./db');

// Fallback ZIPs for cities where the Zippopotam.us city/state lookup doesn't
// return a usable post code. One-time hardcoded map for this specific 22-show
// seed list — not a general city->zip solution.
const CITY_ZIP_FALLBACK = {
  'Pittsburgh,PA': '15222',
  'Erie,PA': '16501',
  'Robinson Township,PA': '15205',
  'Cornwells Heights,PA': '19020',
  'Bensalem,PA': '19020',
  'Carlisle,PA': '17013',
  'Camp Hill,PA': '17011',
  'Quakertown,PA': '18951',
  'Canonsburg,PA': '15317',
  'Grantville,PA': '17028',
  'Allentown,PA': '18101',
  'Summerdale,PA': '17093',
  'Philadelphia,PA': '19107',
  'Selinsgrove,PA': '17870',
  'Gettysburg,PA': '17325',
  'Scranton,PA': '18503',
  'Warminster,PA': '18974',
  'Belle Vernon,PA': '15012',
  'Reading,PA': '19601',
  'Oaks,PA': '19456',
};

const SHOWS = [
  { show_name: 'Castle Shannon VFD - Pokemon One Piece & TCG Show', city: 'Pittsburgh', state: 'PA', venue_name: 'Castle Shannon VFD', date_start: '2026-08-01', date_end: '2026-08-01', time_range: '9AM-3PM', category: 'mixed', table_count: 140, admission: 'free', notes: 'Recurring monthly, organizer: Pittsburgh Card Show' },
  { show_name: 'Castle Shannon VFD - Sports Cards & Sports Collectibles Show', city: 'Pittsburgh', state: 'PA', venue_name: 'Castle Shannon VFD', date_start: '2026-08-02', date_end: '2026-08-02', time_range: '9AM-3PM', category: 'sports', table_count: 140, admission: 'free', notes: 'Recurring monthly, organizer: Pittsburgh Card Show' },
  { show_name: 'Millcreek Mall Card Show', city: 'Erie', state: 'PA', venue_name: 'Millcreek Mall', date_start: '2026-08-07', date_end: '2026-08-09', time_range: 'Fri 11-7 / Sat-Sun vary', category: 'mixed', table_count: 170, admission: 'free', notes: 'Organizer: Pittsburgh Card Show' },
  { show_name: 'The Mall at Robinson Card Show', city: 'Robinson Township', state: 'PA', venue_name: 'The Mall at Robinson', date_start: '2026-08-28', date_end: '2026-08-30', time_range: 'varies', category: 'mixed', table_count: 150, admission: 'free', notes: 'Organizer: Pittsburgh Card Show' },
  { show_name: 'Poppel Family Sports Card Pokemon Autographs and Collectibles Show', city: 'Cornwells Heights', state: 'PA', venue_name: null, date_start: '2026-08-01', date_end: '2026-08-01', time_range: null, category: 'mixed', table_count: null, admission: null, notes: 'Recurring organizer: Poppel shows' },
  { show_name: 'Poppel Sports Card Pokemon Comic Book TCG Funko and Collectibles Show', city: 'Bensalem', state: 'PA', venue_name: null, date_start: '2026-08-01', date_end: '2026-08-01', time_range: null, category: 'mixed', table_count: 175, admission: '$5', notes: 'Recurring organizer: Poppel shows' },
  { show_name: 'Carlisle Cards and Collectibles Show', city: 'Carlisle', state: 'PA', venue_name: 'Carlisle Expo Center', date_start: '2026-08-01', date_end: '2026-08-01', time_range: '10AM-6PM', category: 'general', table_count: null, admission: null, notes: 'Added per Cheston local knowledge' },
  { show_name: 'Capital City Mall Sports Cards & Collectible Show', city: 'Camp Hill', state: 'PA', venue_name: 'Capital City Mall', date_start: '2026-08-21', date_end: '2026-08-23', time_range: null, category: 'general', table_count: 45, admission: null, notes: 'Highest-frequency PA venue (21+ shows tracked), recurring near-weekly. Added per Cheston local knowledge (Harrisburg-area mall)' },
  { show_name: 'Sunday Sports Card Show', city: 'Quakertown', state: 'PA', venue_name: null, date_start: '2026-08-02', date_end: '2026-08-02', time_range: null, category: 'sports', table_count: 40, admission: 'free', notes: null },
  { show_name: 'Loft Conference Center Show', city: 'Canonsburg', state: 'PA', venue_name: 'Loft Conference Center', date_start: '2026-08-08', date_end: '2026-08-08', time_range: null, category: 'general', table_count: 100, admission: '$5, kids $2', notes: null },
  { show_name: 'Hollywood Casino Sports Card & TCG Show', city: 'Grantville', state: 'PA', venue_name: 'Hollywood Casino', date_start: '2026-08-08', date_end: '2026-08-08', time_range: null, category: 'mixed', table_count: 200, admission: 'free', notes: 'Recurring show' },
  { show_name: 'Allentown SK & R Sports Card and Memorabilia Show', city: 'Allentown', state: 'PA', venue_name: null, date_start: '2026-08-08', date_end: '2026-08-09', time_range: null, category: 'sports', table_count: null, admission: null, notes: null },
  { show_name: 'Harrisburg Sports Card & TCG Show', city: 'Summerdale', state: 'PA', venue_name: 'Conference Center at Central Penn College', date_start: '2026-08-15', date_end: '2026-08-15', time_range: '9AM-2PM', category: 'mixed', table_count: 140, admission: 'free', notes: 'Recurring show' },
  { show_name: 'Brotherly Love Card Show', city: 'Philadelphia', state: 'PA', venue_name: null, date_start: '2026-08-15', date_end: '2026-08-15', time_range: null, category: 'sports', table_count: 200, admission: '$10, kids free', notes: null },
  { show_name: 'Susquehanna Valley Mall Card Show', city: 'Selinsgrove', state: 'PA', venue_name: 'Susquehanna Valley Mall', date_start: '2026-08-18', date_end: '2026-08-18', time_range: null, category: 'general', table_count: 80, admission: null, notes: 'Recurring show' },
  { show_name: 'Gettysburg Sports Card and TCG Show', city: 'Gettysburg', state: 'PA', venue_name: null, date_start: '2026-08-22', date_end: '2026-08-22', time_range: null, category: 'mixed', table_count: null, admission: null, notes: 'Recurring organizer: Toys for the Ages Expo' },
  { show_name: 'Cards on the Bay', city: 'Erie', state: 'PA', venue_name: null, date_start: '2026-08-28', date_end: '2026-08-29', time_range: null, category: 'general', table_count: 150, admission: null, notes: null },
  { show_name: 'Lackawanna Sports Card & TCG Show', city: 'Scranton', state: 'PA', venue_name: null, date_start: '2026-08-29', date_end: '2026-08-30', time_range: null, category: 'mixed', table_count: null, admission: null, notes: 'Recurring show' },
  { show_name: 'Bucks County Card Show', city: 'Warminster', state: 'PA', venue_name: null, date_start: '2026-08-30', date_end: '2026-08-30', time_range: null, category: 'sports', table_count: 100, admission: '$10, under 8 free', notes: null },
  { show_name: 'The Card Show PA - Summer Blowout Sports Card and Pokemon Show', city: 'Belle Vernon', state: 'PA', venue_name: 'Ice Garden', date_start: '2026-07-25', date_end: '2026-07-25', time_range: null, category: 'mixed', table_count: 200, admission: null, notes: 'Recurring organizer: The Card Show PA' },
  { show_name: 'The Pennsylvania State Card Show', city: 'Reading', state: 'PA', venue_name: null, date_start: '2026-07-25', date_end: '2026-07-25', time_range: '9AM-3PM', category: 'general', table_count: null, admission: null, notes: 'Recurring monthly show' },
  { show_name: 'The Philly Show', city: 'Oaks', state: 'PA', venue_name: 'Greater Philadelphia Expo Center', date_start: '2026-09-25', date_end: '2026-09-27', time_range: null, category: 'general', table_count: 600, admission: '$12', notes: 'Major regional show, multi-day, established annual event' },
];

// Returns only exact-name matches for the city — Zippopotam's city/state
// lookup does prefix/fuzzy matching (e.g. querying "Pittsburgh" can return
// "East Pittsburgh" as places[0]), so places[0] alone is not trustworthy.
async function geocodeCityState(city, state) {
  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(state)}/${encodeURIComponent(city)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const places = data.places || [];
    const exactMatches = places.filter((p) => p['place name'] && p['place name'].toLowerCase() === city.toLowerCase());
    if (exactMatches.length === 0) return null;
    return exactMatches;
  } catch (e) {
    return null;
  }
}

async function geocodeZip(zip) {
  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const place = data.places && data.places[0];
    if (!place) return null;
    return { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
  } catch (e) {
    return null;
  }
}

async function resolveGeo(city, state) {
  const fallbackZip = CITY_ZIP_FALLBACK[`${city},${state}`] || null;
  const exactMatches = await geocodeCityState(city, state);

  if (exactMatches) {
    // Prefer the hardcoded fallback ZIP if it's among the exact-name matches
    // (picks the well-known/downtown ZIP over an arbitrary suburb sharing the name).
    const preferred = fallbackZip ? exactMatches.find((p) => p['post code'] === fallbackZip) : null;
    const match = preferred || exactMatches[0];
    return { lat: parseFloat(match.latitude), lng: parseFloat(match.longitude), zip: match['post code'] || fallbackZip };
  }

  if (fallbackZip) {
    const zipGeo = await geocodeZip(fallbackZip);
    if (zipGeo) return { lat: zipGeo.lat, lng: zipGeo.lng, zip: fallbackZip };
    return { lat: null, lng: null, zip: fallbackZip };
  }

  return { lat: null, lng: null, zip: null };
}

(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const results = [];
  for (const show of SHOWS) {
    const existing = await pool.query(
      `SELECT 1 FROM card_shows WHERE source = 'seed' AND show_name = $1 AND date_start = $2`,
      [show.show_name, show.date_start]
    );
    if (existing.rows.length > 0) {
      results.push({ show_name: show.show_name, skipped: true });
      continue;
    }
    const geo = await resolveGeo(show.city, show.state);
    await pool.query(
      `INSERT INTO card_shows
        (show_name, venue_name, city, state, zip, lat, lng, date_start, date_end, time_range, category, table_count, admission, notes, source, submitted_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'seed',NULL,'published')`,
      [show.show_name, show.venue_name, show.city, show.state, geo.zip, geo.lat, geo.lng, show.date_start, show.date_end, show.time_range, show.category, show.table_count, show.admission, show.notes]
    );
    results.push({ show_name: show.show_name, city: show.city, zip: geo.zip, lat: geo.lat, lng: geo.lng });
  }
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
})();
