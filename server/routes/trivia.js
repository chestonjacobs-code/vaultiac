const express = require('express');
const axios = require('axios');
const pool = require('../db/db');
const router = express.Router();

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// ---- POKEMON NAME LIST — loaded once at startup for fuzzy validation ----
let _pokemonNames = null;

async function getPokemonNames() {
  if (_pokemonNames) return _pokemonNames;
  try {
    const res = await axios.get(`${POKEAPI_BASE}/pokemon?limit=1025`);
    _pokemonNames = res.data.results.map(p => p.name.toLowerCase());
    console.log(`[trivia] Loaded ${_pokemonNames.length} Pokémon names for validation`);
  } catch(e) {
    console.warn('[trivia] Failed to load Pokémon name list:', e.message);
    _pokemonNames = [];
  }
  return _pokemonNames;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_,i) => Array.from({length: n+1}, (_,j) => j===0?i:0));
  for(let j=1;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++)
    for(let j=1;j<=n;j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function findClosestPokemon(guess, names) {
  let best = null, bestDist = Infinity;
  for (const name of names) {
    const d = levenshtein(guess, name);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return { name: best, distance: bestDist };
}

function getEasternDateString(date) {
  // Always return YYYY-MM-DD in America/New_York time
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function getToday() {
  return getEasternDateString(new Date());
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getEasternDateString(d);
}

function getCurrentPeriod() {
  // Reset at midnight Eastern Time
  return getEasternDateString(new Date());
}

function getNextReset() {
  // Next midnight Eastern Time as UTC ISO string
  const now = new Date();
  // Get current date in ET
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  // Build next midnight ET
  const nextMidnightET = new Date(etNow);
  nextMidnightET.setDate(nextMidnightET.getDate() + 1);
  nextMidnightET.setHours(0, 0, 0, 0);
  // Convert back: ET offset is UTC-4 (EDT) or UTC-5 (EST)
  // Use the difference between local parse and actual UTC to get offset
  const etOffset = now.getTime() - etNow.getTime();
  return new Date(nextMidnightET.getTime() + etOffset).toISOString();
}

function buildClues(pokemon, speciesData, stage, flavorText) {
  // Clue 1 — Type
  const types = pokemon.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1));
  const typeStr = types.length > 1 ? `${types[0]} and ${types[1]} type` : `${types[0]} type`;
  const clue1 = `This Pokémon is a ${typeStr} Pokémon.`;

  // Clue 2 — Generation
  const genRaw = speciesData.generation ? speciesData.generation.name : 'generation-i';
  const genMap = {
    'generation-i': 'Generation I', 'generation-ii': 'Generation II',
    'generation-iii': 'Generation III', 'generation-iv': 'Generation IV',
    'generation-v': 'Generation V', 'generation-vi': 'Generation VI',
    'generation-vii': 'Generation VII', 'generation-viii': 'Generation VIII',
    'generation-ix': 'Generation IX'
  };
  const gen = genMap[genRaw] || genRaw;
  const clue2 = `This Pokémon was introduced in ${gen}.`;

  // Clue 3 — Color
  const color = speciesData.color ? speciesData.color.name.charAt(0).toUpperCase() + speciesData.color.name.slice(1) : 'unknown';
  const clue3 = `This Pokémon is primarily ${color} in color.`;

  // Clue 4 — Evolution stage (plain English position in line)
  const stageNum = stage || 1;
  const hasEvolutions = speciesData.evolves_from_species || (speciesData.evolution_chain);
  const chainLength = stage; // stage is position in chain (1 = base, 2 = middle, 3 = final)

  // Determine if this Pokémon has any evolutions at all
  // We check evolves_to on the chain — passed in via stage logic above
  // Use stageNum and total chain info to build plain language
  let clue4;
  if (stageNum === 1) {
    if (!speciesData.evolves_from_species) {
      // Could be base with evolutions, or standalone — we'll say base
      clue4 = `This Pokémon is a base Pokémon — it has not yet evolved.`;
    } else {
      clue4 = `This Pokémon is a base Pokémon — it has not yet evolved.`;
    }
  } else if (stageNum === 2) {
    clue4 = `This Pokémon is the second in its evolutionary line.`;
  } else {
    clue4 = `This Pokémon is the final evolution in its line.`;
  }

  // Clue 5 — Flavor text (Pokédex entry)
  const clue5 = flavorText
    ? flavorText
    : `This Pokémon is a mysterious creature found across many regions.`;

  // Clue 6 — Category (Legendary / Mythical / Baby / Common)
  let category = 'a common';
  if (speciesData.is_legendary) category = 'a Legendary';
  else if (speciesData.is_mythical) category = 'a Mythical';
  else if (speciesData.is_baby) category = 'a Baby';
  const clue6 = `This Pokémon is ${category} Pokémon.`;

  return [clue1, clue2, clue3, clue4, clue5, clue6];
}

// GET /api/trivia/daily
router.get('/daily', async (req, res) => {
  try {
    const today = getToday();

    // Check cache first — same Pokémon for everyone on the same day
    const cached = await pool.query(
      'SELECT * FROM daily_trivia WHERE play_date = $1',
      [today]
    );

    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      return res.json({
        pokemon_name: row.pokemon_name,
        clues: row.clues,
      });
    }

    // Generate today's Pokémon — hash-based seed for even distribution across all 1025
    function hashDate(dateStr) {
      let h = 0x811c9dc5;
      for (let i = 0; i < dateStr.length; i++) {
        h ^= dateStr.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return h;
    }
    const randomId = (hashDate(today) % 1025) + 1;

    const [pokemonRes, speciesRes] = await Promise.all([
      axios.get(`${POKEAPI_BASE}/pokemon/${randomId}`),
      axios.get(`${POKEAPI_BASE}/pokemon-species/${randomId}`),
    ]);

    const pokemon = pokemonRes.data;
    const speciesData = speciesRes.data;

    // Fetch evolution chain to determine stage
    let stage = 1;
    try {
      const chainUrl = speciesData.evolution_chain?.url;
      if (chainUrl) {
        const chainRes = await axios.get(chainUrl);
        const chain = chainRes.data.chain;
        const findStage = (node, currentStage) => {
          if (node.species.name === speciesData.name) return currentStage;
          for (const next of node.evolves_to) {
            const found = findStage(next, currentStage + 1);
            if (found) return found;
          }
          return null;
        };
        stage = findStage(chain, 1) || 1;
      }
    } catch(e) {
      console.warn('[trivia] Evolution chain fetch failed:', e.message);
    }

    // Fetch English flavor text
    let flavorText = null;
    try {
      const entries = speciesData.flavor_text_entries || [];
      const english = entries.filter(e => e.language.name === 'en');
      if (english.length > 0) {
        const raw = english[Math.floor(Math.random() * english.length)].flavor_text;
        flavorText = raw.replace(/[\n\f\r]/g, ' ').replace(/\s+/g, ' ').trim();
        const namePattern = new RegExp(pokemon.name.replace(/-/g, '[- ]'), 'gi');
        flavorText = flavorText.replace(namePattern, 'This Pokémon');
        const displayName = speciesData.name.charAt(0).toUpperCase() + speciesData.name.slice(1);
        flavorText = flavorText.replace(new RegExp(displayName, 'g'), 'This Pokémon');
      }
    } catch(e) {
      console.warn('[trivia] Flavor text fetch failed:', e.message);
    }

    const clues = buildClues(pokemon, speciesData, stage, flavorText);

    // Save to cache — one row per day, shared by all players
    await pool.query(
      'INSERT INTO daily_trivia (play_date, pokemon_id, pokemon_name, clues) VALUES ($1, $2, $3, $4) ON CONFLICT (play_date) DO NOTHING',
      [today, randomId, pokemon.name, JSON.stringify(clues)]
    );

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

    const currentPeriod = getCurrentPeriod();
    if (correct) {
      total_points += points_earned;
      if (last_played_date === yesterday) {
        current_streak += 1;
      } else if (last_played_date !== today) {
        current_streak = 1;
      }
      if (current_streak > longest_streak) longest_streak = current_streak;
      last_played_date = today;
    }
    await pool.query(
      'UPDATE leaderboard SET total_points=$1, current_streak=$2, longest_streak=$3, last_played_date=$4, daily_play_date=$5 WHERE username=$6',
      [total_points, current_streak, longest_streak, last_played_date, currentPeriod, username]
    );

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

// POST /api/trivia/validate — fuzzy guess validation
// Returns: { status, suggestion, display_name }
// status: 'correct' | 'wrong' | 'close_to_answer' | 'close_to_other' | 'unknown'
router.post('/validate', async (req, res) => {
  const { guess, pokemon_name } = req.body;
  if (!guess || !pokemon_name) return res.status(400).json({ error: 'guess and pokemon_name required' });

  const g = guess.trim().toLowerCase();
  const answer = pokemon_name.toLowerCase();

  // Exact correct answer
  if (g === answer) return res.json({ status: 'correct' });

  const names = await getPokemonNames();

  // Check if guess is an exact known Pokémon name (correctly spelled, just wrong)
  if (names.includes(g)) return res.json({ status: 'wrong', display_name: g.charAt(0).toUpperCase() + g.slice(1) });

  // Fuzzy check against the correct answer first
  const distToAnswer = levenshtein(g, answer);
  if (distToAnswer <= 2) {
    const display = answer.charAt(0).toUpperCase() + answer.slice(1);
    return res.json({ status: 'close_to_answer', suggestion: display, distance: distToAnswer });
  }

  // Fuzzy check against all known Pokémon names
  const closest = findClosestPokemon(g, names);
  if (closest.distance <= 2) {
    const display = closest.name.charAt(0).toUpperCase() + closest.name.slice(1);
    return res.json({ status: 'close_to_other', suggestion: display, distance: closest.distance });
  }

  // Not close to anything
  return res.json({ status: 'unknown' });
});

// Preload Pokémon name list at startup (non-blocking)
getPokemonNames();

module.exports = router;
