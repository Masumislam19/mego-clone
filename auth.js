const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { email, username, password } = req.body || {};

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'সব ফিল্ড পূরণ করুন' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'এই ইমেইল দিয়ে আগেই একাউন্ট আছে' });
  }

  const hash = await bcrypt.hash(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)')
    .run(cleanEmail, username.trim(), hash);

  req.session.userId = info.lastInsertRowid;
  req.session.username = username.trim();
  res.json({ ok: true, username: username.trim() });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'ইমেইল ও পাসওয়ার্ড দিন' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    return res.status(400).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }
  res.json({ userId: req.session.userId, username: req.session.username });
});

module.exports = router;
