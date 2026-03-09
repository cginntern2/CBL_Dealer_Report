const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const { authenticateToken, authorize } = require('../middleware/auth');

// Get all users (Admin only)
router.get('/', authenticateToken, authorize('admin'), (req, res) => {
  const query = `
    SELECT 
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.dealer_code,
      u.is_active,
      u.last_login,
      u.created_at,
      r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    ORDER BY u.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Database error', details: err.message });
    }
    res.json({ users: results });
  });
});

// Create new user (Admin only)
router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
  const { username, email, password, full_name, role_name, dealer_code } = req.body;

  // Validation
  if (!username || !password || !role_name) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
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
    // Check if username already exists, and if email is provided, check email too
    let checkQuery = 'SELECT id FROM users WHERE username = ?';
    let checkParams = [username];
    
    if (email && email.trim() !== '') {
      checkQuery = 'SELECT id FROM users WHERE username = ? OR email = ?';
      checkParams = [username, email];
    }
    
    db.query(
      checkQuery,
      checkParams,
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

              const emailValue = email && email.trim() !== '' ? email : null;
              db.query(insertQuery, [username, emailValue, password_hash, full_name, role_id, dealer_code], (err, result) => {
                if (err) {
                  return res.status(500).json({ error: 'Failed to create user', details: err.message });
                }

                res.json({
                  success: true,
                  message: 'User created successfully',
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

            const emailValue = email && email.trim() !== '' ? email : null;
            db.query(insertQuery, [username, emailValue, password_hash, full_name, role_id], (err, result) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to create user', details: err.message });
              }

              res.json({
                success: true,
                message: 'User created successfully',
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

// Update user (Admin only)
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { username, email, password, full_name, role_name, dealer_code, is_active } = req.body;

  try {
    // Get current user
    db.query('SELECT * FROM users WHERE id = ?', [id], async (err, userResults) => {
      if (err || userResults.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentUser = userResults[0];

      // Check if username already exists (excluding current user)
      let checkQuery = 'SELECT id FROM users WHERE username = ? AND id != ?';
      let checkParams = [username, id];
      
      // If email is provided, also check for email uniqueness
      if (email && email.trim() !== '') {
        checkQuery = 'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?';
        checkParams = [username, email, id];
      }
      
      db.query(
        checkQuery,
        checkParams,
        async (err, results) => {
          if (err) {
            return res.status(500).json({ error: 'Database error', details: err.message });
          }

          if (results.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }

          // Get role_id if role_name is provided
          let role_id = currentUser.role_id;
          if (role_name) {
            db.query('SELECT id FROM roles WHERE name = ?', [role_name], async (err, roleResults) => {
              if (err || roleResults.length === 0) {
                return res.status(400).json({ error: 'Invalid role' });
              }
              role_id = roleResults[0].id;

              // If dealer, verify dealer_code exists
              if (role_name === 'dealer' && dealer_code) {
                db.query('SELECT dealer_code FROM dealers WHERE dealer_code = ?', [dealer_code], async (err, dealerResults) => {
                  if (err || dealerResults.length === 0) {
                    return res.status(400).json({ error: 'Dealer code not found' });
                  }
                  updateUser();
                });
              } else {
                updateUser();
              }
            });
          } else {
            updateUser();
          }

          async function updateUser() {
            // Build update query
            const updates = [];
            const values = [];

            if (username) {
              updates.push('username = ?');
              values.push(username);
            }
            if (email) {
              updates.push('email = ?');
              values.push(email);
            }
            if (password) {
              const saltRounds = 10;
              const password_hash = await bcrypt.hash(password, saltRounds);
              updates.push('password_hash = ?');
              values.push(password_hash);
            }
            if (full_name !== undefined) {
              updates.push('full_name = ?');
              values.push(full_name);
            }
            if (role_id) {
              updates.push('role_id = ?');
              values.push(role_id);
            }
            if (dealer_code !== undefined) {
              updates.push('dealer_code = ?');
              values.push(dealer_code || null);
            }
            if (is_active !== undefined) {
              updates.push('is_active = ?');
              values.push(is_active);
            }

            if (updates.length === 0) {
              return res.status(400).json({ error: 'No fields to update' });
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

            db.query(updateQuery, values, (err, result) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to update user', details: err.message });
              }

              res.json({
                success: true,
                message: 'User updated successfully'
              });
            });
          }
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Delete user (Admin only)
router.delete('/:id', authenticateToken, authorize('admin'), (req, res) => {
  const { id } = req.params;

  // Prevent deleting yourself
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  });
});

module.exports = router;

