const crypto = require('crypto');

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedValue) {
  const [algorithm, salt, storedHash] = String(storedValue || '').split('$');

  if (algorithm !== 'scrypt' || !salt || !storedHash) return false;

  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (storedBuffer.length !== KEY_LENGTH) return false;

  const suppliedBuffer = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  return crypto.timingSafeEqual(storedBuffer, suppliedBuffer);
}

module.exports = { hashPassword, verifyPassword };
