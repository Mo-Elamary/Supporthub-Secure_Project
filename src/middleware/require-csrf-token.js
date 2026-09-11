const crypto = require('crypto');

function tokensMatch(expectedToken, providedToken) {
  const expected = Buffer.from(
    String(expectedToken || ''),
    'utf8'
  );

  const provided = Buffer.from(
    String(providedToken || ''),
    'utf8'
  );

  if (
    expected.length === 0 ||
    expected.length !== provided.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

function requireCsrfToken(req, res, next) {
  const expectedToken = req.session.csrfToken;
  const providedToken = req.get('X-CSRF-Token');

  // Defense in depth:
  // If the browser provides an Origin header, it must match SupportHub.
  const requestOrigin = req.get('Origin');

  if (requestOrigin) {
    const expectedOrigin =
      `${req.protocol}://${req.get('host')}`;

    if (requestOrigin !== expectedOrigin) {
      return res.status(403).json({
        error: 'Cross-origin request rejected.'
      });
    }
  }

  if (!tokensMatch(expectedToken, providedToken)) {
    return res.status(403).json({
      error: 'Invalid or missing CSRF token.'
    });
  }

  next();
}

module.exports = requireCsrfToken;