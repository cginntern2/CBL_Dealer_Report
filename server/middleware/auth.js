const jwt = require('jsonwebtoken');
const db = require('../db');

// JWT Secret (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Get user details from database
    const query = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.dealer_code,
        u.is_active,
        r.name as role_name,
        r.permissions
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ? AND u.is_active = TRUE
    `;

    db.query(query, [decoded.userId], (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (results.length === 0) {
        return res.status(403).json({ error: 'User not found or inactive' });
      }

      const user = results[0];
      
      // Parse permissions JSON
      try {
        user.permissions = typeof user.permissions === 'string' 
          ? JSON.parse(user.permissions) 
          : user.permissions;
      } catch (e) {
        user.permissions = {};
      }

      // Attach user to request
      req.user = user;
      next();
    });
  });
};

// Role-based authorization middleware
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (allowedRoles.includes(req.user.role_name)) {
      next();
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  };
};

// Permission-based authorization middleware
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const permissions = req.user.permissions || {};

    // Admin has all permissions
    if (req.user.role_name === 'admin' || permissions.all === true) {
      return next();
    }

    // Check specific permission
    if (permissions[permission] === true) {
      return next();
    }

    res.status(403).json({ error: `Permission denied: ${permission} required` });
  };
};

// Check if user can access system changes (admin only)
const canModifySystem = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const permissions = req.user.permissions || {};

  // Only admin can modify system
  if (req.user.role_name === 'admin' && permissions.system_changes === true) {
    return next();
  }

  res.status(403).json({ error: 'System modification requires admin role' });
};

// Check if user can access dealer data (dealers can only see their own)
const canAccessDealerData = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // If dealer role, they can only access their own data
  if (req.user.role_name === 'dealer') {
    req.dealerCodeFilter = req.user.dealer_code;
  }

  // Other roles can access all data
  next();
};

module.exports = {
  authenticateToken,
  authorize,
  hasPermission,
  canModifySystem,
  canAccessDealerData,
  JWT_SECRET
};



