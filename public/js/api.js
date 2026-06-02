const API = {
  searchCards: (q) => fetch(`/api/cards/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
  getCard: (id) => fetch(`/api/cards/${id}`).then(r => r.json()),
  getDailyTrivia: () => fetch('/api/trivia/daily').then(r => r.json()),
  submitTrivia: (data) => fetch('/api/trivia/submit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r => r.json()),
  getLeaderboard: (sort='points') => fetch(`/api/leaderboard?sort=${sort}`).then(r => r.json()),
  getNewsletter: () => fetch('/api/newsletter').then(r => r.json()),
  getMarketData: () => fetch('/api/newsletter/market').then(r => r.json()),
};
