const cron = require('node-cron');
const axios = require('axios');
const pool = require('../db/db');

function getEightWeeksAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return d.toISOString().split('T')[0];
}

async function scrapeNewsStory() {
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
}

async function scrapeMarketData() {
  // TODO: Add eBay OAuth token for real data
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
    const story = await scrapeNewsStory();
    await pool.query(
      'INSERT INTO news_stories (headline, summary, source_url, published_date, scraped_at) VALUES ($1,$2,$3,$4,$5)',
      [story.headline, story.summary, story.source_url, story.published_date, story.scraped_at]
    );
    console.log(`[newsletter-scrape] News story saved: "${story.headline}"`);
  } catch (err) {
    console.error('[newsletter-scrape] News scrape failed:', err.message);
  }

  try {
    const marketRows = await scrapeMarketData();
    for (const row of marketRows) {
      await pool.query(
        'INSERT INTO market_data (card_name, set_name, sale_price, volume, source, recorded_date) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.card_name, row.set_name, row.sale_price, row.volume, row.source, row.recorded_date]
      );
    }
    console.log(`[newsletter-scrape] ${marketRows.length} market rows saved`);
  } catch (err) {
    console.error('[newsletter-scrape] Market scrape failed:', err.message);
  }

  try {
    const cutoff = getEightWeeksAgo();
    const result = await pool.query('DELETE FROM news_stories WHERE published_date < $1', [cutoff]);
    console.log(`[newsletter-scrape] Deleted ${result.rowCount} old news stories (before ${cutoff})`);
  } catch (err) {
    console.error('[newsletter-scrape] Cleanup failed:', err.message);
  }

  console.log(`[newsletter-scrape] Job completed at ${new Date().toISOString()}`);
}

function scheduleJob() {
  cron.schedule('0 7 * * 1', () => {
    runScrapeJob().catch((err) => console.error('[newsletter-scrape] Unhandled error:', err));
  });
  console.log('[newsletter-scrape] Cron job scheduled: every Monday at 7:00 AM');
}

module.exports = { scheduleJob, runScrapeJob };
