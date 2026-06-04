const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const pool = require('../db/db');

function getEightWeeksAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return d.toISOString().split('T')[0];
}

async function scrapeNewsStory() {
  try {
    const rssUrl = 'https://www.pokemon.com/us/pokemon-news/';
    const response = await axios.get(rssUrl, { timeout: 10000 });
    const html = response.data;

    const titleMatch = html.match(/<h3[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
      || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const headline = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
      : 'Pokémon News Update';

    const linkMatch = html.match(/href="(\/us\/pokemon-news\/[^"]+)"/);
    const sourceUrl = linkMatch ? `https://www.pokemon.com${linkMatch[1]}` : rssUrl;

    return {
      headline,
      summary: null,
      source_url: sourceUrl,
      published_date: new Date().toISOString().split('T')[0],
      scraped_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[scrape] News fetch failed:', err.message);
    return null;
  }
}

// Fixed watchlist of top 20 most-traded Pokémon TCG cards
const WATCHLIST = [
  { name: 'Charizard ex', set: 'Obsidian Flames', tcgId: 'sv3-125' },
  { name: 'Charizard ex', set: '151', tcgId: 'sv3pt5-6' },
  { name: 'Umbreon VMAX', set: 'Evolving Skies', tcgId: 'swsh7-215' },
  { name: 'Rayquaza VMAX', set: 'Evolving Skies', tcgId: 'swsh7-218' },
  { name: 'Charizard VMAX', set: "Champion's Path", tcgId: 'swsh35-74' },
  { name: 'Pikachu VMAX', set: 'Vivid Voltage', tcgId: 'swsh4-188' },
  { name: 'Mew VMAX', set: 'Fusion Strike', tcgId: 'swsh8-269' },
  { name: 'Lugia V', set: 'Silver Tempest', tcgId: 'swsh11-186' },
  { name: 'Giratina VSTAR', set: 'Lost Origin', tcgId: 'swsh11-201' },
  { name: 'Arceus VSTAR', set: 'Brilliant Stars', tcgId: 'swsh9-176' },
  { name: 'Mewtwo ex', set: '151', tcgId: 'sv3pt5-205' },
  { name: 'Gardevoir ex', set: 'Scarlet & Violet', tcgId: 'sv1-230' },
  { name: 'Miraidon ex', set: 'Scarlet & Violet', tcgId: 'sv1-243' },
  { name: 'Koraidon ex', set: 'Scarlet & Violet', tcgId: 'sv1-247' },
  { name: 'Charizard ex', set: 'Paldean Fates', tcgId: 'sv4pt5-234' },
  { name: 'Iono', set: 'Paldea Evolved', tcgId: 'sv2-185' },
  { name: 'Pidgeot ex', set: 'Obsidian Flames', tcgId: 'sv3-164' },
  { name: 'Umbreon ex', set: 'Twilight Masquerade', tcgId: 'sv6-211' },
  { name: 'Darkrai VSTAR', set: 'Astral Radiance', tcgId: 'swsh10-180' },
  { name: 'Origin Forme Palkia VSTAR', set: 'Astral Radiance', tcgId: 'swsh10-202' },
];

async function fetchCardPrice(card) {
  try {
    const apiKey = process.env.POKEMON_PRICE_API_KEY;
    if (!apiKey) throw new Error('POKEMON_PRICE_API_KEY not set');

    const url = `https://www.pokemonpricetracker.com/api/v2/cards?search=${encodeURIComponent(card.name)}&set=${encodeURIComponent(card.set)}&limit=1&includeHistory=false`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 10000,
    });

    const data = response.data;
    const cards = data.data || [];
    if (cards.length === 0) return null;

    const result = cards[0];
    const price = result.prices?.market || result.prices?.low || null;
    if (!price) return null;

    return {
      card_name: card.name,
      set_name: card.set,
      sale_price: parseFloat(price),
      volume: null,
      source: 'pokemonpricetracker',
    };
  } catch (err) {
    console.warn(`[scrape] Failed to fetch price for ${card.name}: ${err.message}`);
    return null;
  }
}

async function scrapeMarketMovers() {
  const today = new Date().toISOString().split('T')[0];

  // Fetch yesterday's prices from DB for comparison
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let yesterdayPrices = {};
  try {
    const { rows } = await pool.query(
      'SELECT card_name, set_name, sale_price FROM market_data WHERE recorded_date = $1',
      [yesterdayStr]
    );
    rows.forEach(r => {
      yesterdayPrices[`${r.card_name}||${r.set_name}`] = parseFloat(r.sale_price);
    });
  } catch (err) {
    console.warn('[scrape] Could not load yesterday prices:', err.message);
  }

  // Fetch today's prices from API (batched with small delays to respect rate limits)
  const results = [];
  for (const card of WATCHLIST) {
    const priceData = await fetchCardPrice(card);
    if (priceData) {
      const key = `${priceData.card_name}||${priceData.set_name}`;
      const prevPrice = yesterdayPrices[key];
      const pctChange = prevPrice
        ? parseFloat(((priceData.sale_price - prevPrice) / prevPrice * 100).toFixed(2))
        : 0;

      results.push({
        ...priceData,
        price_change_pct: pctChange,
        recorded_date: today,
      });
    }
    // Small delay between API calls to be respectful
    await new Promise(r => setTimeout(r, 200));
  }

  if (results.length === 0) {
    console.warn('[scrape] PokemonPriceTracker returned no results — using mock data');
    return getMockMarketData();
  }

  console.log(`[scrape] PokemonPriceTracker returned ${results.length} prices`);
  return results;
}

function getMockMarketData() {
  const today = new Date().toISOString().split('T')[0];
  return [
    { card_name: 'Charizard ex', set_name: 'Obsidian Flames', sale_price: 42.50, volume: null, price_change_pct: 18.5, source: 'mock', recorded_date: today },
    { card_name: 'Umbreon VMAX', set_name: 'Evolving Skies', sale_price: 65.00, volume: null, price_change_pct: 12.3, source: 'mock', recorded_date: today },
    { card_name: 'Rayquaza VMAX', set_name: 'Evolving Skies', sale_price: 55.00, volume: null, price_change_pct: 9.8, source: 'mock', recorded_date: today },
    { card_name: 'Pikachu VMAX', set_name: 'Vivid Voltage', sale_price: 28.00, volume: null, price_change_pct: 7.2, source: 'mock', recorded_date: today },
    { card_name: 'Mew VMAX', set_name: 'Fusion Strike', sale_price: 38.00, volume: null, price_change_pct: 6.1, source: 'mock', recorded_date: today },
    { card_name: 'Lugia V', set_name: 'Silver Tempest', sale_price: 22.00, volume: null, price_change_pct: 5.4, source: 'mock', recorded_date: today },
    { card_name: 'Giratina VSTAR', set_name: 'Lost Origin', sale_price: 31.00, volume: null, price_change_pct: 4.8, source: 'mock', recorded_date: today },
    { card_name: 'Arceus VSTAR', set_name: 'Brilliant Stars', sale_price: 17.00, volume: null, price_change_pct: 3.2, source: 'mock', recorded_date: today },
    { card_name: 'Darkrai VSTAR', set_name: 'Astral Radiance', sale_price: 14.00, volume: null, price_change_pct: 2.1, source: 'mock', recorded_date: today },
    { card_name: 'Origin Forme Palkia VSTAR', set_name: 'Astral Radiance', sale_price: 19.00, volume: null, price_change_pct: 1.8, source: 'mock', recorded_date: today },
  ];
}

async function runScrapeJob() {
  const jobStart = new Date().toISOString();
  console.log(`[newsletter-scrape] Job started at ${jobStart}`);

  // 1. Scrape news
  const story = await scrapeNewsStory();
  if (story) {
    try {
      await pool.query(
        'INSERT INTO news_stories (headline, summary, source_url, published_date, scraped_at) VALUES ($1,$2,$3,$4,$5)',
        [story.headline, story.summary, story.source_url, story.published_date, story.scraped_at]
      );
      console.log(`[newsletter-scrape] News story saved: "${story.headline}"`);
    } catch (err) {
      console.error('[newsletter-scrape] News insert failed:', err.message);
    }
  }

  // 2. Scrape market movers
  const marketRows = await scrapeMarketMovers();
  for (const row of marketRows) {
    try {
      await pool.query(
        'INSERT INTO market_data (card_name, set_name, sale_price, volume, source, recorded_date) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.card_name, row.set_name, row.sale_price, row.volume, row.source, row.recorded_date]
      );
    } catch (err) {
      console.error('[newsletter-scrape] Market insert failed:', err.message);
    }
  }
  console.log(`[newsletter-scrape] ${marketRows.length} market rows saved`);

  // 3. Clean up old news (keep 8 weeks)
  try {
    const cutoff = getEightWeeksAgo();
    const result = await pool.query('DELETE FROM news_stories WHERE published_date < $1', [cutoff]);
    console.log(`[newsletter-scrape] Deleted ${result.rowCount} old news stories`);
  } catch (err) {
    console.error('[newsletter-scrape] Cleanup failed:', err.message);
  }

  console.log(`[newsletter-scrape] Job completed at ${new Date().toISOString()}`);
}

// Schedule: DAILY at 7:00 AM (changed from weekly)
function scheduleJob() {
  cron.schedule('0 7 * * *', () => {
    runScrapeJob().catch((err) => console.error('[newsletter-scrape] Unhandled error:', err));
  });
  console.log('[newsletter-scrape] Cron job scheduled: daily at 7:00 AM');
}

module.exports = { scheduleJob, runScrapeJob };
