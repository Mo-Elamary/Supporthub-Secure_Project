function requireSession(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }

  next();
}

module.exports = requireSession;
