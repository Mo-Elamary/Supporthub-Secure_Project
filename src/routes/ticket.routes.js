const express = require('express');
const requireSession = require('../middleware/require-session');
const { db, assertDatabaseReady } = require('../database/database');

const router = express.Router();
router.use(requireSession);

router.get('/', (req, res) => {
  assertDatabaseReady();
  const tickets = db.prepare(`
    SELECT t.id, t.subject, t.description, t.status, t.priority,
           t.updated_label AS updated, c.contact_name AS customer,
           c.company_name AS customerCompany,
           COALESCE(u.full_name, 'Unassigned') AS assignee
    FROM tickets t
    JOIN customers c ON c.id = t.customer_id
    LEFT JOIN users u ON u.id = t.assignee_id
    ORDER BY t.id DESC
  `).all();
  res.json({ tickets });
});

router.get('/search', (req, res) => {
  assertDatabaseReady();
  const query = String(req.query.q || '');

  if (query.length > 200) {
    return res.status(400).json({ error: 'Search query is too long.' });
  }

  // VULNERABLE VERSION (kept as a commented training reference):
  // Interpolating `query` inside LIKE allowed input such as `' OR 1=1 --` to
  // alter the WHERE clause and return records that did not match the search.
  //
  // const sql = `
  //   SELECT t.id, t.subject, t.description, t.status, t.priority,
  //          t.updated_label AS updated, c.contact_name AS customer,
  //          c.company_name AS customerCompany,
  //          COALESCE(u.full_name, 'Unassigned') AS assignee
  //   FROM tickets t
  //   JOIN customers c ON c.id = t.customer_id
  //   LEFT JOIN users u ON u.id = t.assignee_id
  //   WHERE t.subject LIKE '%${query}%'
  //      OR t.description LIKE '%${query}%'
  //      OR c.contact_name LIKE '%${query}%'
  //   ORDER BY t.id DESC
  // `;
  // const tickets = db.prepare(sql).all();

  // SECURE VERSION:
  // The same search pattern is bound to each placeholder. SQLite therefore
  // treats quotes, comments, and operators as data rather than executable SQL.
  const searchPattern = `%${query}%`;
  const tickets = db.prepare(`
    SELECT t.id, t.subject, t.description, t.status, t.priority,
           t.updated_label AS updated, c.contact_name AS customer,
           c.company_name AS customerCompany,
           COALESCE(u.full_name, 'Unassigned') AS assignee
    FROM tickets t
    JOIN customers c ON c.id = t.customer_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.subject LIKE ?
       OR t.description LIKE ?
       OR c.contact_name LIKE ?
    ORDER BY t.id DESC
  `).all(searchPattern, searchPattern, searchPattern);

  res.json({ tickets, query });
});

router.post('/', (req, res) => {
  const { subject, customer, priority = 'Medium', description = '' } = req.body;
  if (!subject || !customer) return res.status(400).json({ error: 'Subject and customer are required.' });

  assertDatabaseReady();
  let customerRecord = db.prepare('SELECT id FROM customers WHERE contact_name = ?').get(customer);
  if (!customerRecord) {
    const generatedEmail = `${String(customer).toLowerCase().replace(/[^a-z0-9]+/g, '.')}@customer.test`;
    const insertCustomer = db.prepare(`INSERT INTO customers
      (contact_name, company_name, email, plan, status) VALUES (?, ?, ?, 'Starter', 'Active')`)
      .run(customer, 'Independent Customer', generatedEmail);
    customerRecord = { id: insertCustomer.lastInsertRowid };
  }

  const nextId = db.prepare('SELECT COALESCE(MAX(id), 2051) + 1 AS id FROM tickets').get().id;
  db.prepare(`INSERT INTO tickets
    (id, subject, description, customer_id, status, priority, assignee_id, created_by, updated_label)
    VALUES (?, ?, ?, ?, 'Open', ?, NULL, ?, 'Just now')`)
    .run(nextId, subject, description, customerRecord.id, priority, req.session.user.id);

  const ticket = db.prepare(`
    SELECT t.id, t.subject, t.description, t.status, t.priority,
           t.updated_label AS updated, c.contact_name AS customer,
           'Unassigned' AS assignee
    FROM tickets t JOIN customers c ON c.id = t.customer_id WHERE t.id = ?
  `).get(nextId);
  res.status(201).json({ message: 'Ticket created.', ticket });
});

router.get('/:ticketId/comments', (req, res) => {
  assertDatabaseReady();
  const comments = db.prepare(`
    SELECT id, author_name AS author, author_role AS role,
           body, created_label AS createdAt
    FROM comments WHERE ticket_id = ? ORDER BY id ASC
  `).all(req.params.ticketId);
  res.json({ comments });
});

router.post('/:ticketId/comments', (req, res) => {
  const body = String(req.body.body || '').trim();

  if (!body) {
    return res.status(400).json({
      error: 'Comment cannot be empty.'
    });
  }

  if (body.length > 2000) {
    return res.status(400).json({
      error: 'Comment cannot exceed 2000 characters.'
    });
  }

  // VULNERABLE VERSION (kept as a commented training reference):
  // The server previously stored user-controlled HTML and the browser
  // inserted it using innerHTML. The combination allowed Stored XSS.
  //
  // const body = String(req.body.body || '');
  // The value was stored and later treated as executable HTML.

  // SECURE VERSION:
  // Comments are plain text. Storing their original text is safe because
  // the browser now renders the value through textContent rather than HTML.
  assertDatabaseReady();

  const result = db.prepare(`
    INSERT INTO comments
      (
        ticket_id,
        user_id,
        customer_id,
        author_name,
        author_role,
        body,
        created_label
      )
    VALUES (?, ?, NULL, ?, 'staff', ?, 'Just now')
  `).run(
    req.params.ticketId,
    req.session.user.id,
    req.session.user.name,
    body
  );

  const comment = {
    id: result.lastInsertRowid,
    author: req.session.user.name,
    role: 'staff',
    body,
    createdAt: 'Just now'
  };

  res.status(201).json({
    message: 'Reply added.',
    comment
  });
});

module.exports = router;
