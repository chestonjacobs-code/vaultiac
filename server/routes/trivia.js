const express = require('express');
const axios = require('axios');
const pool = require('../db/db');
const router = express.Router();

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Daily period: resets at 8AM each day
// Returns a string like "2026-06-03-period2" (8AM+) or previous day's "period2" (before 8AM)
function getCurrentPeriod() {
  const now = new Date();
  const hour = now.getHours();
  const dateStr = now.toISOString().split('T')[0];
  if (hour < 8) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0] + '-period2';
  }
  return dateStr + '-period2';
}

function getNextReset() {
  const now = new Date();
  const next = new Date(now);
  if (now.getHours() >= 8) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

function buildClues(pokemon, speciesData) {
  // Clue 1 — Type
  const types = pokemon.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1));
  const typeStr = types.length > 1 ? `${types[0]} and ${types[1]} type` : `${types[0]} type`;
  const clue1 = `This Pokémon is a ${typeStr} Pokémon.`;

  // Clue 2 — Habitat
  const habitat = speciesData.habitat ? speciesData.habitat.name.replace('-', ' ') : 'unknown habitat';
  const clue2 = `This Pokémon can be found in the ${habitat}.`;

  // Clue 3 — Evolution stage
  const evolvesFrom = speciesData.evolves_from_species;
  let clue3;
  if (!evolvesFrom) {
    clue3 = `This is a base form Pokémon — it does not evolve from anything.`;
  } else {
    clue3 = `This Pokémon is an evolved form. It evolved from another Pokémon.`;
  }

  // Clue 4 — Physical trait
  const heightM = (pokemon.height / 10).toFixed(1);
  const weightKg = (pokemon.weight / 10).toFixed(1);
  const clue4 = `This Pokémon stands ${heightM}m tall and weighs ${weightKg}kg.`;

  // Clue 5 — Ability or move
  const abilities = pokemon.abilities.map(a => a.ability.name.replace('-', ' '));
  const ability = abilities[0].charAt(0).toUpperCase() + abilities[0].slice(1);
  const clue5 = `One of this Pokémon's abilities is ${ability}.`;

  // Clue 6 — Generation
  const genRaw = speciesData.generation ? speciesData.generation.name : 'generation-i';
  const genMap = {
    'generation-i': 'Generation I', 'generation-ii': 'Generation II',
    'generation-iii': 'Generation III', 'generation-iv': 'Generation IV',
    'generation-v': 'Generation V', 'generation-vi': 'Generation VI',
    'generation-vii': 'Generation VII', 'generation-viii': 'Generation VIII',
    'generation-ix': 'Generation IX'
  };
  const gen = genMap[genRaw] || genRaw;
  const clue6 = `This Pokémon was introduced in ${gen}.`;

  return [clue1, clue2, clue3, clue4, clue5, clue6];
}

// GET /api/trivia/daily
router.get('/daily', async (req, res) => {
  try {
    const randomId = Math.floor(Math.random() * 1025) + 1;

    const [pokemonRes, speciesRes] = await Promise.all([
      axios.get(`${POKEAPI_BASE}/pokemon/${randomId}`),
      axios.get(`${POKEAPI_BASE}/pokemon-species/${randomId}`),
    ]);

    const pokemon = pokemonRes.data;
    const speciesData = speciesRes.data;
    const clues = buildClues(pokemon, speciesData);

    res.json({
      pokemon_name: pokemon.name,
      clues,
    });
  } catch (err) {
    console.error('Trivia daily error:', err.message);
    res.status(500).json({ error: 'Failed to generate trivia' });
  }
});

// GET /api/trivia/status — check if user has played today
router.get('/status', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ can_play: true, next_reset: getNextReset() });

  try {
    const { rows } = await pool.query(
      'SELECT daily_play_date FROM leaderboard WHERE username = $1',
      [username]
    );

    if (rows.length === 0) return res.json({ can_play: true, next_reset: getNextReset() });

    const playDate = rows[0].daily_play_date;
    const currentPeriod = getCurrentPeriod();
    const canPlay = playDate !== currentPeriod;

    res.json({
      can_play: canPlay,
      next_reset: getNextReset(),
      last_played_period: playDate || null,
    });
  } catch (err) {
    console.error('Trivia status error:', err.message);
    res.json({ can_play: true, next_reset: getNextReset() });
  }
});

// POST /api/trivia/submit
router.post('/submit', async (req, res) => {
  const { username, pokemon_name, guess, clues_used } = req.body;
  if (!username || !pokemon_name || !guess || clues_used == null) {
    return res.status(400).json({ error: 'username, pokemon_name, guess, and clues_used are required' });
  }

  const correct = guess.toLowerCase() === pokemon_name.toLowerCase();
  const points_earned = correct ? Math.max(7 - clues_used, 1) : 0;
  const today = getToday();
  const yesterday = getYesterday();

  try {
    // Upsert user
    await pool.query(
      `INSERT INTO leaderboard (username, total_points, current_streak, longest_streak, last_played_date, daily_play_date)
       VALUES ($1, 0, 0, 0, NULL, NULL)
       ON CONFLICT (username) DO NOTHING`,
      [username]
    );

    const { rows } = await pool.query(
      'SELECT * FROM leaderboard WHERE username = $1',
      [username]
    );
    let { total_points, current_streak, longest_streak, last_played_date } = rows[0];

    if (correct) {
      total_points += points_earned;
      if (last_played_date === yesterday) {
        current_streak += 1;
      } else if (last_played_date === today) {
        // already played today — no change
      } else {
        current_streak = 1;
      }
      if (current_streak > longest_streak) longest_streak = current_streak;
      last_played_date = today;

      const currentPeriod = getCurrentPeriod();
      await pool.query(
        'UPDATE leaderboard SET total_points=$1, current_streak=$2, longest_streak=$3, last_played_date=$4, daily_play_date=$5 WHERE username=$6',
        [total_points, current_streak, longest_streak, last_played_date, currentPeriod, username]
      );
    }

    await pool.query(
      'INSERT INTO trivia_sessions (username, pokemon_name, clues_used, points_earned, solved, played_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [username, pokemon_name, clues_used, points_earned, correct ? 1 : 0, new Date().toISOString()]
    );

    res.json({ correct, points_earned, current_streak, total_points });
  } catch (err) {
    console.error('Trivia submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit trivia' });
  }
});

module.exports = router;
