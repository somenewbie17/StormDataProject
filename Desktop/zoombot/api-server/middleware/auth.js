/**
 * JWT Authentication Middleware
 * Validates JWT tokens and attaches user info to request
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Verify JWT token and attach user to request
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token: user not found' });
    }

    // Check if user subscription is active (basic check)
    if (user.tier === 'free' && decoded.tier !== 'free') {
      return res.status(403).json({ 
        error: 'Subscription expired or invalid',
        action: 'upgrade_required'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', action: 'login_required' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional auth - continues if no token provided
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Silently fail - token invalid but allow request
    next();
  }
}

/**
 * Check if user has required tier
 */
function requireTier(...allowedTiers) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedTiers.includes(req.user.tier)) {
      return res.status(403).json({ 
        error: 'Insufficient subscription tier',
        required: allowedTiers,
        current: req.user.tier,
        action: 'upgrade_required'
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireTier,
  JWT_SECRET
};
