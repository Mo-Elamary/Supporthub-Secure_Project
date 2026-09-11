const express = require('express');
const axios = require('axios');
const net = require('net');
const { execFile } = require('child_process');
const requireSession = require('../middleware/require-session');

const {
  validatePublicUrl,
  createPinnedAgent
} = require('../security/safe-url');


const router = express.Router();
router.use(requireSession);

function isValidHostname(value) {
  if (!value || value.length > 253) return false;

  const hostname = value.endsWith('.')
    ? value.slice(0, -1)
    : value;

  if (!hostname) return false;

  return hostname.split('.').every((label) => {
    if (!label || label.length > 63) return false;

    return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/
      .test(label);
  });
}

function isValidDiagnosticHost(value) {
  return net.isIP(value) !== 0 || isValidHostname(value);
}

router.post('/preview', async (req, res, next) => {
  const url = String(req.body.url || '').trim();

  if (!url) {
    return res.status(400).json({
      error: 'A URL is required.'
    });
  }

  try {
    // VULNERABLE VERSION (kept as a commented training reference):
    // The server previously fetched a complete user-controlled URL without
    // validating its protocol, port, hostname, resolved IP, or redirects.
    //
    // const response = await axios.get(url, {
    //   timeout: 4000,
    //   maxContentLength: 200000,
    //   responseType: 'text',
    //   validateStatus: () => true
    // });

    // SECURE VERSION:
    // Parse and validate the URL, resolve its hostname, and reject private
    // or restricted addresses before creating an outbound connection.
    const validated = await validatePublicUrl(url);

    // Pin the request to the IP address that was validated. This prevents
    // the HTTP client from resolving the hostname again to a different IP.
    const agent = createPinnedAgent(
      validated.protocol,
      validated.address,
      validated.family
    );

    const agentOptions =
      validated.protocol === 'https:'
        ? { httpsAgent: agent }
        : { httpAgent: agent };

    const response = await axios.get(validated.url, {
      timeout: 4000,
      maxContentLength: 200000,
      maxBodyLength: 200000,
      responseType: 'text',
      validateStatus: () => true,

      // Redirects are disabled because every new destination would require
      // another complete protocol, port, DNS, and IP validation.
      maxRedirects: 0,

      // Ignore environment proxy settings so the validated pinned
      // connection is used directly.
      proxy: false,

      ...agentOptions
    });

    const html =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

    const titleMatch = html.match(
      /<title[^>]*>([^<]*)<\/title>/i
    );

    const descriptionMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    );

    res.json({
      requestedUrl: validated.url,

      // Redirects are disabled, so the final destination must remain
      // identical to the validated destination.
      finalUrl: validated.url,

      status: response.status,
      contentType:
        response.headers['content-type'] || 'unknown',
      title: titleMatch?.[1] || 'No page title',
      description:
        descriptionMatch?.[1] || html.slice(0, 500)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ping', (req, res) => {
  const host = String(req.body.host || '').trim();

  if (!host) {
    return res.status(400).json({
      error: 'A hostname or IP address is required.'
    });
  }

  if (!isValidDiagnosticHost(host)) {
    return res.status(400).json({
      error: 'Invalid hostname or IP address.'
    });
  }

  // VULNERABLE VERSION (kept as a commented training reference):
  // Untrusted input was concatenated into a command string and passed to
  // exec(), which runs commands through the operating-system shell.
  //
  // const pingFlag =
  //   process.platform === 'win32' ? '-n 3' : '-c 3';
  //
  // const command = `ping ${pingFlag} ${host}`;
  //
  // exec(
  //   command,
  //   {
  //     timeout: 5000,
  //     maxBuffer: 64 * 1024
  //   },
  //   (error, stdout, stderr) => {
  //     if (error && !stdout) return next(error);
  //
  //     res.json({
  //       command,
  //       output: stdout || stderr,
  //       exitCode: error?.code || 0
  //     });
  //   }
  // );

  // SECURE VERSION:
  // execFile() receives the executable and its arguments separately.
  // shell:false prevents the operating system from interpreting characters
  // such as &, |, ;, redirections, or command substitutions.
  const pingArguments =
    process.platform === 'win32'
      ? ['-n', '3', host]
      : ['-c', '3', host];

  execFile(
    'ping',
    pingArguments,
    {
      timeout: 5000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      shell: false
    },
    (error, stdout, stderr) => {
      if (error && !stdout) {
        return res.status(502).json({
          error: 'Connectivity test failed.',
          target: host
        });
      }

      res.json({
        target: host,
        output: stdout || stderr,
        exitCode:
          Number.isInteger(error?.code)
            ? error.code
            : 0
      });
    }
  );
});

module.exports = router;
