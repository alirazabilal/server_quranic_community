const crypto = require('crypto');
const Community = require('../models/Community');

/**
 * Generate a unique 6-character alphanumeric join code.
 * Retries up to 10 times to avoid (extremely unlikely) collisions.
 */
async function generateUniqueCode(retries = 10) {
  for (let i = 0; i < retries; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().substring(0, 6);
    const exists = await Community.exists({ joinCode: code });
    if (!exists) return code;
  }
  throw new Error('Could not generate unique join code after multiple attempts.');
}

module.exports = { generateUniqueCode };
