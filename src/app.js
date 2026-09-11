const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const ticketRoutes = require('./routes/ticket.routes');
const toolRoutes = require('./routes/tool.routes');
const templateRoutes = require('./routes/template.routes');
const systemRoutes = require('./routes/system.routes');
const profileRoutes = require('./routes/profile.routes');

const app = express();
const publicDirectory = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  // INTENTIONALLY WEAK FOR THE VULNERABLE LAB.
  // The secure edition will move this secret to a strong environment value,
  // rotate it, use a persistent store, and harden the cookie settings.
  secret: process.env.SESSION_SECRET || 'supporthub-training-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    // INTENTIONALLY VULNERABLE (CSRF): no SameSite protection is applied.
    sameSite: false,
    secure: false,
    maxAge: 1000 * 60 * 60 * 4
  }
}));

app.use(express.static(publicDirectory));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, application: 'SupportHub', mode: 'vulnerable' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/profile', profileRoutes);

// A local-only resource used to demonstrate SSRF in the lab.
// It represents an internal service that a normal browser workflow cannot reach.
app.get('/internal/ops-note', (req, res) => {
  res.type('text/plain').send('INTERNAL ONLY: Demo backup code = SH-LAB-4821');
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

// VULNERABLE VERSION (kept as a commented training reference):
// The handler returned the exception message, error type, stack trace,
// request path, and server working directory directly to the browser.
//
// app.use((error, req, res, next) => {
//   res.status(error.status || 500).json({
//     error: error.message,
//     name: error.name,
//     stack: error.stack,
//     path: req.originalUrl,
//     workingDirectory: process.cwd()
//   });
// });

// SECURE VERSION:
// Detailed exception information is written only to protected server logs.
// The browser receives a generic message and a reference identifier.
app.use((error, req, res, next) => {
  const requestId = crypto.randomUUID();

  const requestedStatus = Number(error.status);
  const status =
    Number.isInteger(requestedStatus) &&
    requestedStatus >= 400 &&
    requestedStatus <= 599
      ? requestedStatus
      : 500;

  console.error(`[${requestId}] Request failed`, {
    method: req.method,
    path: req.originalUrl,
    status,
    name: error.name,
    message: error.message,
    stack: error.stack
  });

  res.status(status).json({
    error:
      status >= 500
        ? 'An unexpected error occurred.'
        : error.message,
    requestId
  });
});

module.exports = app;
