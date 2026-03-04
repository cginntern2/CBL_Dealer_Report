const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all dealer billing cycles (exceptions)
router.get('/', (req, res) => {
  const query = `
    SELECT 
      dbc.id,
      dbc.dealer_code,
      d.dealer_name,
      t.territory_name,
      dbc.cycle_start_day,
      dbc.notes,
      dbc.created_at,
      dbc.updated_at
    FROM dealer_billing_cycles dbc
    INNER JOIN dealers d ON dbc.dealer_code = d.dealer_code
    LEFT JOIN territories t ON d.territory_id = t.id
    ORDER BY dbc.cycle_start_day, d.dealer_name
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching billing cycles:', err);
      return res.status(500).json({ error: 'Failed to fetch billing cycles' });
    }
    res.json({ 
      billingCycles: results,
      total: results.length
    });
  });
});

// Get billing cycle for a specific dealer
router.get('/dealer/:dealerCode', (req, res) => {
  const { dealerCode } = req.params;
  
  const query = `
    SELECT 
      dbc.id,
      dbc.dealer_code,
      d.dealer_name,
      dbc.cycle_start_day,
      dbc.notes
    FROM dealer_billing_cycles dbc
    INNER JOIN dealers d ON dbc.dealer_code = d.dealer_code
    WHERE dbc.dealer_code = ?
  `;

  db.query(query, [dealerCode], (err, results) => {
    if (err) {
      console.error('Error fetching dealer billing cycle:', err);
      return res.status(500).json({ error: 'Failed to fetch dealer billing cycle' });
    }
    
    if (results.length === 0) {
      // No exception found - dealer uses standard cycle (1-30/31)
      return res.json({ 
        hasCycle: false,
        cycleStartDay: 1,
        message: 'Dealer uses standard monthly cycle (1st-30th/31st)'
      });
    }
    
    res.json({ 
      hasCycle: true,
      ...results[0]
    });
  });
});

// Add or update billing cycle for a dealer
router.post('/', (req, res) => {
  const { dealer_code, cycle_start_day, notes } = req.body;

  if (!dealer_code) {
    return res.status(400).json({ error: 'Dealer code is required' });
  }

  if (!cycle_start_day || cycle_start_day < 1 || cycle_start_day > 28) {
    return res.status(400).json({ error: 'Cycle start day must be between 1 and 28' });
  }

  // Check if dealer exists
  db.query('SELECT dealer_code, dealer_name FROM dealers WHERE dealer_code = ?', [dealer_code], (err, dealerResults) => {
    if (err) {
      console.error('Error checking dealer:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (dealerResults.length === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }

    // Insert or update billing cycle
    const upsertQuery = `
      INSERT INTO dealer_billing_cycles (dealer_code, cycle_start_day, notes)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        cycle_start_day = VALUES(cycle_start_day),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP
    `;

    db.query(upsertQuery, [dealer_code, cycle_start_day, notes || null], (err, result) => {
      if (err) {
        console.error('Error saving billing cycle:', err);
        return res.status(500).json({ error: 'Failed to save billing cycle' });
      }

      const cycleEndDay = cycle_start_day - 1;
      res.json({
        success: true,
        message: `Billing cycle set: ${cycle_start_day}th to ${cycleEndDay}th for ${dealerResults[0].dealer_name}`,
        dealer_code,
        cycle_start_day,
        cycle_end_day: cycleEndDay
      });
    });
  });
});

// Delete billing cycle (revert to standard)
router.delete('/:dealerCode', (req, res) => {
  const { dealerCode } = req.params;

  db.query('DELETE FROM dealer_billing_cycles WHERE dealer_code = ?', [dealerCode], (err, result) => {
    if (err) {
      console.error('Error deleting billing cycle:', err);
      return res.status(500).json({ error: 'Failed to delete billing cycle' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Billing cycle not found for this dealer' });
    }

    res.json({
      success: true,
      message: 'Billing cycle removed. Dealer now uses standard monthly cycle (1st-30th/31st)'
    });
  });
});

// Search dealers for adding billing cycle
router.get('/search-dealers', (req, res) => {
  const { q } = req.query;
  
  if (!q || q.length < 2) {
    return res.json({ dealers: [] });
  }

  const searchQuery = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      CASE WHEN dbc.id IS NOT NULL THEN 1 ELSE 0 END as has_custom_cycle,
      dbc.cycle_start_day
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN dealer_billing_cycles dbc ON d.dealer_code = dbc.dealer_code
    WHERE d.dealer_code LIKE ? OR d.dealer_name LIKE ?
    ORDER BY d.dealer_name
    LIMIT 20
  `;

  const searchTerm = `%${q}%`;
  db.query(searchQuery, [searchTerm, searchTerm], (err, results) => {
    if (err) {
      console.error('Error searching dealers:', err);
      return res.status(500).json({ error: 'Failed to search dealers' });
    }
    res.json({ dealers: results });
  });
});

module.exports = router;

