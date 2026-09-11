const express = require('express');
const requireSession = require('../middleware/require-session');

const router = express.Router();
router.use(requireSession);

router.get('/info', (req, res) => {
  // VULNERABLE VERSION (kept as a commented training reference):
  // This response exposed operating-system information, internal paths,
  // configuration values, and secrets to every authenticated user.
  //
  // res.json({
  //   application: 'SupportHub 1.0.0-dev',
  //   environment: process.env.NODE_ENV || 'development',
  //   runtime: process.version,
  //   platform: `${process.platform} ${process.arch}`,
  //   hostname: os.hostname(),
  //   workingDirectory: process.cwd(),
  //   database: `SQLite — ${databasePath}`,
  //   debugMode: true,
  //   demoApiKey: 'sh_demo_7F9K2X1_NOT_REAL',
  //   sessionSecret:
  //     process.env.SESSION_SECRET ||
  //     'supporthub-training-secret'
  // });

  // SECURE VERSION:
  // Return only the minimum operational information required by the UI.
  // Internal paths, hostnames, runtime versions, and secrets stay private.
  res.set('Cache-Control', 'no-store');

  res.json({
    application: 'SupportHub',
    environment: 'Training Lab',
    serviceStatus: 'Operational',
    databaseStatus: 'Connected',
    diagnostics: 'Protected',
    debugMode: false
  });
});

router.get('/error-test', (req, res, next) => {
  // This authenticated training endpoint remains available to verify that
  // the global error handler no longer exposes internal exception details.
  const error = new Error(
    'Simulated database failure near SELECT * FROM tickets'
  );

  error.code = 'SQLITE_ERROR';
  next(error);
});

module.exports = router;