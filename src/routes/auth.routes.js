const crypto = require('crypto');
const express = require('express');
const { db, assertDatabaseReady } = require('../database/database');
const { verifyPassword } = require('../security/password');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  assertDatabaseReady();

  // VULNERABLE VERSION (kept as a commented training reference):
  // The values below came directly from the request and were interpolated into
  // SQL. An input such as `' OR 1=1 --` could change the WHERE clause, comment
  // out the password check, and create an authenticated session.
  //
  // const sql = `
  //   SELECT id, full_name, email, role, initials
  //   FROM users
  //   WHERE email = '${email}' AND password = '${password}' AND status = 'Active'
  // `;
  // const user = db.prepare(sql).get();

  // SECURE VERSION:
  // The placeholder keeps the email value separate from the SQL statement.
  // Password verification is performed against a salted scrypt hash after the
  // user record has been retrieved; the raw password is never placed in SQL.
  const user = db.prepare(`
    SELECT id, full_name, email, role, initials, password_hash
    FROM users
    WHERE email = ? AND status = 'Active'
  `).get(String(email).trim().toLowerCase());

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.user = {
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: user.role,
    initials: user.initials
  };
// Generate a new CSRF token whenever a user signs in.
  req.session.csrfToken =
  crypto.randomBytes(32).toString('hex');
  res.json({ message: 'Signed in successfully.', user: req.session.user });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: req.session.user });
});

router.get('/csrf-token', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      error: 'Not signed in.'
    });
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken =
      crypto.randomBytes(32).toString('hex');
  }

  res.set('Cache-Control', 'no-store');

  res.json({
    csrfToken: req.session.csrfToken
  });
}); 

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Signed out.' }));
});

module.exports = router;
