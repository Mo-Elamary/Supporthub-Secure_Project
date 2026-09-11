const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const requireSession = require('../middleware/require-session');

const router = express.Router();
router.use(requireSession);

router.post('/preview', async (req, res, next) => {
  const url = String(req.body.url || '');
  if (!url) return res.status(400).json({ error: 'A URL is required.' });

  try {
    // INTENTIONALLY VULNERABLE (SSRF): the server fetches the user-controlled URL
    // without validating protocol, hostname, redirects, or private IP ranges.
    const response = await axios.get(url, {
      timeout: 4000,
      maxContentLength: 200000,
      responseType: 'text',
      validateStatus: () => true
    });

    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descriptionMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);

    res.json({
      requestedUrl: url,
      finalUrl: response.request?.res?.responseUrl || url,
      status: response.status,
      contentType: response.headers['content-type'] || 'unknown',
      title: titleMatch?.[1] || 'No page title',
      description: descriptionMatch?.[1] || html.slice(0, 500)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ping', (req, res, next) => {
  const host = String(req.body.host || '');
  if (!host) return res.status(400).json({ error: 'A hostname or IP address is required.' });

  const pingFlag = process.platform === 'win32' ? '-n 3' : '-c 3';

  // INTENTIONALLY VULNERABLE (OS Command Injection): untrusted input is directly
  // concatenated into a shell command. Run only on the localhost training machine.
  const command = `ping ${pingFlag} ${host}`;

  exec(command, { timeout: 5000, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
    if (error && !stdout) return next(error);
    res.json({ command, output: stdout || stderr, exitCode: error?.code || 0 });
  });
});

module.exports = router;
