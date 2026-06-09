require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Validate Telegram initData (optional in dev, required in prod)
function validateTelegramData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const crypto = require('crypto');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (expectedHash !== hash) return null;
  const userParam = params.get('user');
  return userParam ? JSON.parse(userParam) : null;
}

// GET /api/user/:id — get or create user
app.get('/api/user/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    db.prepare('INSERT INTO users (id, username, score, energy, last_seen) VALUES (?, ?, 0, 1000, ?)').run(id, `user_${id}`, Date.now());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  res.json(user);
});

// PATCH /api/user/:id/name — update username
app.patch('/api/user/:id/name', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { username } = req.body;
  if (!Number.isFinite(id) || typeof username !== 'string' || username.trim().length < 1) {
    return res.status(400).json({ error: 'Bad request' });
  }
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim().slice(0, 32), id);
  res.json({ ok: true });
});

// POST /api/tap — record taps batch
app.post('/api/tap', (req, res) => {
  const { user_id, taps } = req.body;
  const id = parseInt(user_id, 10);
  const count = parseInt(taps, 10);

  if (!Number.isFinite(id) || !Number.isFinite(count) || count < 1 || count > 100) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Energy regeneration: +1 per second, max 1000
  const now = Date.now();
  const elapsed = Math.floor((now - user.last_seen) / 1000);
  const regen = Math.min(elapsed * 1, 1000 - user.energy);
  const newEnergy = Math.max(0, Math.min(user.energy + regen - count, 1000));

  if (user.energy + regen < count) {
    return res.status(400).json({ error: 'Not enough energy', energy: user.energy + regen });
  }

  const newScore = user.score + count;
  db.prepare('UPDATE users SET score = ?, energy = ?, last_seen = ? WHERE id = ?')
    .run(newScore, newEnergy, now, id);

  res.json({ score: newScore, energy: newEnergy });
});

// GET /api/leaderboard — top 50
app.get('/api/leaderboard', (req, res) => {
  const rows = db.prepare('SELECT id, username, score FROM users ORDER BY score DESC LIMIT 50').all();
  res.json(rows);
});

// Serve frontend for all other routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
