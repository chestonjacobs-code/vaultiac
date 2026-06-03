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

async function scrapeMarketMovers() {
  try {
    // TCGFish hottest cards page — sorted by price change
    const url = 'https://tcgfish.com/trending';
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // TCGFish trending table — parse rows
    $('table tbody tr, .card-row, .trending-row').each((i, el) => {
      if (i >= 20) return; // cap at 20 rows
      const cells = $(el).find('td');
      if (cells.length < 3) return;

      const name = $(cells[0]).text().trim() || $(el).find('.card-name').text().trim();
      const priceText = $(cells[1]).text().trim() || $(el).find('.price').text().trim();
      const changeText = $(cells[2]).text().trim() || $(el).find('.change').text().trim();
      const setName = cells.length > 3 ? $(cells[3]).text().trim() : '';

      if (!name || !priceText) return;

      const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      const changeStr = changeText.replace(/[^0-9.\-+]/g, '');
      const change = parseFloat(changeStr) || 0;

      if (!isNaN(price) && price > 0) {
        results.push({
          card_name: name,
          set_name: setName || null,
          sale_price: price,
          volume: null,
          price_change_pct: change,
          source: 'tcgfish',
          recorded_date: new Date().toISOString().split('T')[0],
        });
      }
    });

    // If scrape returned nothing, fall back to mock data
    if (results.length === 0) {
      console.warn('[scrape] TCGFish returned no results — using mock data');
      return getMockMarketData();
    }

    console.log(`[scrape] TCGFish returned ${results.length} movers`);
    return results;

  } catch (err) {
    console.error('[scrape] TCGFish scrape failed:', err.message);
    return getMockMarketData();
  }
}

function getMockMarketData() {
  const today = new Date().toISOString().split('T')[0];
  return [
    { card_name: 'Charizard ex', set_name: 'Obsidian Flames', sale_price: 42.50, volume: 312, price_change_pct: 18.5, source: 'mock', recorded_date: today },
    { card_name: 'Umbreon VMAX', set_name: 'Evolving Skies', sale_price: 65.00, volume: 201, price_change_pct: 12.3, source: 'mock', recorded_date: today },
    { card_name: 'Rayquaza VMAX', set_name: 'Evolving Skies', sale_price: 55.00, volume: 195, price_change_pct: 9.8, source: 'mock', recorded_date: today },
    { card_name: 'Pikachu VMAX', set_name: 'Vivid Voltage', sale_price: 28.00, volume: 287, price_change_pct: 7.2, source: 'mock', recorded_date: today },
    { card_name: 'Mew VMAX', set_name: 'Fusion Strike', sale_price: 38.00, volume: 178, price_change_pct: 6.1, source: 'mock', recorded_date: today },
    { card_name: 'Lugia V', set_name: 'Silver Tempest', sale_price: 22.00, volume: 167, price_change_pct: 5.4, source: 'mock', recorded_date: today },
    { card_name: 'Giratina VSTAR', set_name: 'Lost Origin', sale_price: 31.00, volume: 155, price_change_pct: 4.8, source: 'mock', recorded_date: today },
    { card_name: 'Arceus VSTAR', set_name: 'Brilliant Stars', sale_price: 17.00, volume: 134, price_change_pct: 3.2, source: 'mock', recorded_date: today },
    { card_name: 'Darkrai VSTAR', set_name: 'Astral Radiance', sale_price: 14.00, volume: 121, price_change_pct: 2.1, source: 'mock', recorded_date: today },
    { card_name: 'Origin Forme Palkia VSTAR', set_name: 'Astral Radiance', sale_price: 19.00, volume: 143, price_change_pct: 1.8, source: 'mock', recorded_date: today },
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
