const cron = require('node-cron');
const axios = require('axios');
const db = require('../db/db');

function getEightWeeksAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return d.toISOString().split('T')[0];
}

async function scrapeNewsStory() {
  // Fetch Pokémon news RSS feed and parse first result
  const rssUrl = 'https://www.pokemon.com/us/pokemon-news/';
  const response = await axios.get(rssUrl, { timeout: 10000 });
  const html = response.data;

  // Basic regex parse for the first news headline and link from the page
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
}

async function scrapeMarketData() {
  // TODO: Add eBay OAuth token to use the real eBay Browse API
  // eBay Browse API endpoint: https://api.ebay.com/buy/browse/v1/item_summary/search
  // Requires OAuth 2.0 client credentials flow with scope: https://api.ebay.com/oauth/api_scope/buy.item.bulk

  // Mock data — replace with real eBay Browse API calls once OAuth is configured
  const mockCards = [
    { card_name: 'Charizard ex', set_name: 'Obsidian Flames', sale_price: 42.50, volume: 312 },
    { card_name: 'Pikachu VMAX', set_name: 'Vivid Voltage', sale_price: 28.00, volume: 287 },
    { card_name: 'Umbreon VMAX', set_name: 'Evolving Skies', sale_price: 65.00, volume: 201 },
    { card_name: 'Rayquaza VMAX', set_name: 'Evolving Skies', sale_price: 55.00, volume: 195 },
    { card_name: 'Mew VMAX', set_name: 'Fusion Strike', sale_price: 38.00, volume: 178 },
    { card_name: 'Lugia V', set_name: 'Silver Tempest', sale_price: 22.00, volume: 167 },
    { card_name: 'Giratina VSTAR', set_name: 'Lost Origin', sale_price: 31.00, volume: 155 },
    { card_name: 'Origin Forme Palkia VSTAR', set_name: 'Astral Radiance', sale_price: 19.00, volume: 143 },
    { card_name: 'Arceus VSTAR', set_name: 'Brilliant Stars', sale_price: 17.00, volume: 134 },
    { card_name: 'Darkrai VSTAR', set_name: 'Astral Radiance', sale_price: 14.00, volume: 121 },
  ];

  const today = new Date().toISOString().split('T')[0];
  return mockCards.map((c) => ({ ...c, source: 'ebay_mock', recorded_date: today }));
}

async function runScrapeJob() {
  const jobStart = new Date().toISOString();
  console.log(`[newsletter-scrape] Job started at ${jobStart}`);

  try {
    // 1. Scrape news story
    const story = await scrapeNewsStory();
    db.prepare(
      'INSERT INTO news_stories (headline, summary, source_url, published_date, scraped_at) VALUES (?, ?, ?, ?, ?)'
    ).run(story.headline, story.summary, story.source_url, story.published_date, story.scraped_at);
    console.log(`[newsletter-scrape] News story saved: "${story.headline}"`);
  } catch (err) {
    console.error('[newsletter-scrape] News scrape failed:', err.message);
  }

  try {
    // 2. Scrape/mock market data
    const marketRows = await scrapeMarketData();
    const insertMarket = db.prepare(
      'INSERT INTO market_data (card_name, set_name, sale_price, volume, source, recorded_date) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insertMarket.run(row.card_name, row.set_name, row.sale_price, row.volume, row.source, row.recorded_date);
      }
    });
    insertMany(marketRows);
    console.log(`[newsletter-scrape] ${marketRows.length} market rows saved`);
  } catch (err) {
    console.error('[newsletter-scrape] Market scrape failed:', err.message);
  }

  // 3. Delete news older than 8 weeks
  const cutoff = getEightWeeksAgo();
  const deleted = db.prepare('DELETE FROM news_stories WHERE published_date < ?').run(cutoff);
  console.log(`[newsletter-scrape] Deleted ${deleted.changes} old news stories (before ${cutoff})`);

  console.log(`[newsletter-scrape] Job completed at ${new Date().toISOString()}`);
}

// Schedule: every Monday at 7:00 AM
function scheduleJob() {
  cron.schedule('0 7 * * 1', () => {
    runScrapeJob().catch((err) => console.error('[newsletter-scrape] Unhandled error:', err));
  });
  console.log('[newsletter-scrape] Cron job scheduled: every Monday at 7:00 AM');
}

module.exports = { scheduleJob, runScrapeJob };
