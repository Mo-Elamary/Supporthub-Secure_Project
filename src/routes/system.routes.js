const express = require('express');
const os = require('os');
const requireSession = require('../middleware/require-session');
const { databasePath } = require('../database/database');

const router = express.Router();
router.use(requireSession);

router.get('/info', (req, res) => {
  // INTENTIONALLY VULNERABLE (Information Disclosure): this response exposes
  // unnecessary runtime, host, path, configuration, and fake secret information.
  res.json({
    application: 'SupportHub 1.0.0-dev',
    environment: process.env.NODE_ENV || 'development',
    runtime: process.version,
    platform: `${process.platform} ${process.arch}`,
    hostname: os.hostname(),
    workingDirectory: process.cwd(),
    database: `SQLite — ${databasePath}`,
    debugMode: true,
    demoApiKey: 'sh_demo_7F9K2X1_NOT_REAL',
    sessionSecret: process.env.SESSION_SECRET || 'supporthub-training-secret'
  });
});

router.get('/error-test', (req, res, next) => {
  // The global vulnerable error handler returns the full stack trace.
  const error = new Error('Simulated database failure near SELECT * FROM tickets');
  error.code = 'SQLITE_ERROR';
  next(error);
});

module.exports = router;
