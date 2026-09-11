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
// VULNERABLE VERSION:
// The application previously had no Content Security Policy to provide
// browser-level protection if an unsafe HTML rendering sink was present.

// SECURE VERSION:
// CSP is defense in depth. Safe DOM rendering remains the primary fix.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; ')
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'Referrer-Policy',
    'same-origin'
  );

  next();
});
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// VULNERABLE VERSION (kept as a commented training reference):
// The cookie had no SameSite protection and an empty session could be
// created before authentication.
//
// app.use(session({
//   secret:
//     process.env.SESSION_SECRET ||
//     'supporthub-training-secret',
//   resave: false,
//   saveUninitialized: true,
//   cookie: {
//     httpOnly: true,
//     sameSite: false,
//     secure: false,
//     maxAge: 1000 * 60 * 60 * 4
//   }
// }));

// SECURE VERSION:
// SameSite=Lax adds browser-level CSRF protection.
// The CSRF token remains the primary protection for state changes.
app.use(session({
  secret:
    process.env.SESSION_SECRET ||
    'supporthub-training-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
