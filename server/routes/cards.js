const express = require('express');
const axios = require('axios');
const router = express.Router();

const TCG_BASE = 'https://api.pokemontcg.io/v2';

function tcgHeaders() {
  const headers = {};
  if (process.env.POKEMON_TCG_API_KEY) {
    headers['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
  }
  return headers;
}

// GET /api/cards/search?q={query}
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  try {
    const response = await axios.get(`${TCG_BASE}/cards`, {
      headers: tcgHeaders(),
      params: { q: `name:${q}` },
    });

    const cards = response.data.data.map((card) => ({
      id: card.id,
      name: card.name,
      images: card.images,
      set: card.set ? { name: card.set.name } : null,
      rarity: card.rarity || null,
      types: card.types || [],
      hp: card.hp || null,
      number: card.number || null,
      artist: card.artist || null,
    }));

    res.json({ data: cards });
  } catch (err) {
    console.error('Card search error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// GET /api/cards/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await axios.get(`${TCG_BASE}/cards/${id}`, {
      headers: tcgHeaders(),
    });

    res.json({ data: response.data.data });
  } catch (err) {
    console.error('Card fetch error:', err.message);
    const status = err.response?.status === 404 ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'Card not found' : 'Failed to fetch card' });
  }
});

module.exports = router;
