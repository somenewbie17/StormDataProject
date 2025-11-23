/**
 * Signed URL Generation
 * Creates time-limited, HMAC-signed URLs for secure video access
 */

const crypto = require('crypto');

const VIDEO_SIGNING_SECRET = process.env.VIDEO_SIGNING_SECRET || 'video-secret-change-in-production';

/**
 * Generate a signed URL for video/media access
 * @param {string} botId - Recording bot ID
 * @param {string} userId - User ID
 * @param {string} resourceType - 'video', 'audio', 'transcript', 'chapters', 'summary'
 * @param {number} expiresIn - Seconds until expiry (default: 1 hour)
 * @returns {object} { url, token, expires }
 */
function generateSignedUrl(botId, userId, resourceType = 'video', expiresIn = 3600) {
  const expires = Date.now() + (expiresIn * 1000);
  
  // Create payload
  const payload = `${botId}:${userId}:${resourceType}:${expires}`;
  
  // Generate HMAC signature
  const signature = crypto
    .createHmac('sha256', VIDEO_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  
  return {
    botId,
    resourceType,
    token: signature,
    expires,
    expiresIn
  };
}

/**
 * Validate a signed URL
 * @param {string} botId
 * @param {string} userId
 * @param {string} resourceType
 * @param {string} token
 * @param {number} expires
 * @returns {object} { valid: boolean, error?: string }
 */
function validateSignedUrl(botId, userId, resourceType, token, expires) {
  // Check expiry
  if (Date.now() > parseInt(expires)) {
    return { valid: false, error: 'URL expired' };
  }

  // Regenerate signature
  const payload = `${botId}:${userId}:${resourceType}:${expires}`;
  const expectedSignature = crypto
    .createHmac('sha256', VIDEO_SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  // Compare signatures (timing-safe)
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedSignature))) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

/**
 * Generate signed URLs for all media types for a recording
 */
function generateAllSignedUrls(botId, userId, expiresIn = 3600) {
  return {
    video: generateSignedUrl(botId, userId, 'video', expiresIn),
    audio: generateSignedUrl(botId, userId, 'audio', expiresIn),
    transcript: generateSignedUrl(botId, userId, 'transcript', expiresIn),
    chapters: generateSignedUrl(botId, userId, 'chapters', expiresIn),
    summary: generateSignedUrl(botId, userId, 'summary', expiresIn)
  };
}

module.exports = {
  generateSignedUrl,
  validateSignedUrl,
  generateAllSignedUrls,
  VIDEO_SIGNING_SECRET
};
