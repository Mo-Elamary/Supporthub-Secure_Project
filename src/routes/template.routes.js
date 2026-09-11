const express = require('express');
const requireSession =
  require('../middleware/require-session');
const {
  renderApprovedTemplate
} = require('../security/safe-template');

const router = express.Router();
router.use(requireSession);

// VULNERABLE VERSION (kept as a commented training reference):
// The application previously created a Nunjucks environment and passed
// complete user-controlled template text to renderString().
//
// const nunjucks = require('nunjucks');
//
// const templateEnvironment = new nunjucks.Environment(null, {
//   autoescape: false,
//   throwOnUndefined: false
// });

router.post('/render', (req, res, next) => {
  const template = String(req.body.template || '');

  const title = String(
    req.body.title || 'Ticket Resolution Summary'
  ).trim();

  if (title.length > 120) {
    return res.status(400).json({
      error: 'Template title is too long.'
    });
  }

  try {
    // VULNERABLE VERSION (kept as a commented training reference):
    // User-controlled text was compiled and evaluated by Nunjucks.
    // Expressions such as {{ 7 * 7 }} were executed by the server,
    // and unlisted values such as internalNote were accessible.
    //
    // const rendered = templateEnvironment.renderString(template, {
    //   customerName: 'Youssef Adel',
    //   ticketId: '#SH-2048',
    //   status: 'In Progress',
    //   agentName: req.session.user.name,
    //   internalNote:
    //     'Escalate billing failures to team-alpha'
    // });

    // SECURE VERSION:
    // Only explicitly approved placeholders are replaced.
    // The template text is never passed to a template engine.
    const rendered = renderApprovedTemplate(template, {
      customerName: 'Youssef Adel',
      ticketId: '#SH-2048',
      status: 'In Progress',
      agentName: req.session.user.name
    });

    res.json({
      title:
        title || 'Ticket Resolution Summary',
      rendered
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;