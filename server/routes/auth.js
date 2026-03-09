const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// Register new user (Admin only - will be protected later)
router.post('/register', async (req, res) => {
  const { username, email, password, full_name, role_name, dealer_code } = req.body;

  // Validation
  if (!username || !email || !password || !role_name) {
    return res.status(400).json({ error: 'Username, email, password, and role are required' });
  }

  // Validate role
  const validRoles = ['admin', 'sales_official', 'sales_manager', 'dealer'];
  if (!validRoles.includes(role_name)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // If dealer role, dealer_code is required
  if (role_name === 'dealer' && !dealer_code) {
    return res.status(400).json({ error: 'Dealer code is required for dealer role' });
  }

  try {
    // Check if username or email already exists
    db.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: 'Database error', details: err.message });
        }

        if (results.length > 0) {
          return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Get role_id
        db.query('SELECT id FROM roles WHERE name = ?', [role_name], async (err, roleResults) => {
          if (err || roleResults.length === 0) {
            return res.status(400).json({ error: 'Invalid role' });
          }

          const role_id = roleResults[0].id;

          // If dealer, verify dealer_code exists
          if (role_name === 'dealer' && dealer_code) {
            db.query('SELECT dealer_code FROM dealers WHERE dealer_code = ?', [dealer_code], async (err, dealerResults) => {
              if (err || dealerResults.length === 0) {
                return res.status(400).json({ error: 'Dealer code not found' });
              }

              // Hash password
              const saltRounds = 10;
              const password_hash = await bcrypt.hash(password, saltRounds);

              // Insert user
              const insertQuery = `
                INSERT INTO users (username, email, password_hash, full_name, role_id, dealer_code)
                VALUES (?, ?, ?, ?, ?, ?)
              `;

              db.query(insertQuery, [username, email, password_hash, full_name, role_id, dealer_code], (err, result) => {
                if (err) {
                  return res.status(500).json({ error: 'Failed to create user', details: err.message });
                }

                res.json({
                  success: true,
                  message: 'User registered successfully',
                  userId: result.insertId
                });
              });
            });
          } else {
            // Hash password
            const saltRounds = 10;
            const password_hash = await bcrypt.hash(password, saltRounds);

            // Insert user
            const insertQuery = `
              INSERT INTO users (username, email, password_hash, full_name, role_id, dealer_code)
              VALUES (?, ?, ?, ?, ?, NULL)
            `;

            db.query(insertQuery, [username, email, password_hash, full_name, role_id], (err, result) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to create user', details: err.message });
              }

              res.json({
                success: true,
                message: 'User registered successfully',
                userId: result.insertId
              });
            });
          }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Find user with role and permissions
  const query = `
    SELECT 
      u.id,
      u.username,
      u.email,
      u.password_hash,
      u.full_name,
      u.dealer_code,
      u.is_active,
      r.name as role_name,
      r.permissions
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.username = ? OR u.email = ?
  `;

  db.query(query, [username, username], async (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = results[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Parse permissions
    try {
      user.permissions = typeof user.permissions === 'string' 
        ? JSON.parse(user.permissions) 
        : user.permissions;
    } catch (e) {
      user.permissions = {};
    }

    // Update last_login
    db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role_name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user info (without password)
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role_name,
        dealer_code: user.dealer_code,
        permissions: user.permissions
      }
    });
  });
});

// Verify token / Get current user
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      full_name: req.user.full_name,
      role: req.user.role_name,
      dealer_code: req.user.dealer_code,
      permissions: req.user.permissions
    }
  });
});

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticateToken, (req, res) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // But we can update last_login or add to a blacklist if needed
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;

