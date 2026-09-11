const express = require('express');
const nunjucks = require('nunjucks');
const requireSession = require('../middleware/require-session');

const router = express.Router();
router.use(requireSession);

const templateEnvironment = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: false
});

router.post('/render', (req, res, next) => {
  const template = String(req.body.template || '');
  const title = String(req.body.title || 'Ticket Resolution Summary');

  try {
    // INTENTIONALLY VULNERABLE (SSTI): user-controlled text is compiled and
    // evaluated as a server-side Nunjucks template instead of being treated as text.
    const rendered = templateEnvironment.renderString(template, {
      customerName: 'Youssef Adel',
      ticketId: '#SH-2048',
      status: 'In Progress',
      agentName: req.session.user.name,
      internalNote: 'Escalate billing failures to team-alpha'
    });

    res.json({ title, rendered });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
