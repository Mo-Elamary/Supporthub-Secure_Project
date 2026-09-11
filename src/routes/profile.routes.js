const express = require('express');
const requireSession = require('../middleware/require-session');
const { db, assertDatabaseReady } = require('../database/database');

const router = express.Router();
router.use(requireSession);

router.get('/', (req, res) => {
  assertDatabaseReady();
  const profile = db.prepare(`
    SELECT u.id, u.full_name AS fullName, u.email, u.role, u.initials,
           p.first_name AS firstName, p.last_name AS lastName,
           p.job_title AS jobTitle, p.timezone, p.bio,
           p.resolved_count AS resolvedCount, u.joined_at AS joinedAt
    FROM users u JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `).get(req.session.user.id);
  res.json({ profile });
});

router.get('/team', (req, res) => {
  assertDatabaseReady();
  const members = db.prepare(`
    SELECT u.id, u.full_name AS fullName, u.role, u.initials,
           p.resolved_count AS resolvedCount,
           COUNT(CASE WHEN t.status != 'Resolved' THEN 1 END) AS activeTickets
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN tickets t ON t.assignee_id = u.id
    GROUP BY u.id
    ORDER BY u.id
  `).all();
  res.json({ companyName: 'NexaCare Solutions', members });
});

router.post('/update', (req, res) => {
  // INTENTIONALLY VULNERABLE (CSRF): this state-changing endpoint relies only on
  // the session cookie. It has no CSRF token or Origin/Referer validation.
  assertDatabaseReady();
  const current = db.prepare(`SELECT u.email, p.first_name AS firstName,
    p.last_name AS lastName, p.job_title AS jobTitle, p.timezone
    FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`).get(req.session.user.id);

  const values = {
    firstName: String(req.body.firstName ?? current.firstName),
    lastName: String(req.body.lastName ?? current.lastName),
    email: String(req.body.email ?? current.email),
    jobTitle: String(req.body.jobTitle ?? current.jobTitle),
    timezone: String(req.body.timezone ?? current.timezone)
  };

  const update = db.transaction(() => {
    db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?')
      .run(`${values.firstName} ${values.lastName}`, values.email, req.session.user.id);
    db.prepare(`UPDATE user_profiles SET first_name = ?, last_name = ?,
      job_title = ?, timezone = ? WHERE user_id = ?`)
      .run(values.firstName, values.lastName, values.jobTitle, values.timezone, req.session.user.id);
  });
  update();

  req.session.user.name = `${values.firstName} ${values.lastName}`;
  req.session.user.email = values.email;
  res.json({ message: 'Profile updated.', profile: values });
});

module.exports = router;
