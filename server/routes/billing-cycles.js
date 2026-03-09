const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authorize } = require('../middleware/auth');

// Get all dealers with their billing cycles
router.get('/', (req, res) => {
  const { showExceptionsOnly } = req.query;
  
  let query = `
    SELECT 
      d.id,
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      COALESCE(d.billing_cycle_start_day, 1) as cycle_start_day,
      d.updated_at
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
  `;
  
  // If showExceptionsOnly is true, only show dealers with non-standard cycles
  if (showExceptionsOnly === 'true') {
    query += ` WHERE d.billing_cycle_start_day IS NOT NULL AND d.billing_cycle_start_day != 1`;
  }
  
  query += ` ORDER BY d.billing_cycle_start_day DESC, d.dealer_name`;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching billing cycles:', err);
      return res.status(500).json({ error: 'Failed to fetch billing cycles' });
    }
    
    // Count exceptions (non-standard cycles)
    const exceptions = results.filter(r => r.cycle_start_day !== 1);
    
    res.json({ 
      billingCycles: showExceptionsOnly === 'true' ? exceptions : results,
      total: results.length,
      exceptionsCount: exceptions.length
    });
  });
});

// Get billing cycle for a specific dealer
router.get('/dealer/:dealerCode', (req, res) => {
  const { dealerCode } = req.params;
  
  const query = `
    SELECT 
      d.id,
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      COALESCE(d.billing_cycle_start_day, 1) as cycle_start_day
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    WHERE d.dealer_code = ?
  `;

  db.query(query, [dealerCode], (err, results) => {
    if (err) {
      console.error('Error fetching dealer billing cycle:', err);
      return res.status(500).json({ error: 'Failed to fetch dealer billing cycle' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }
    
    const dealer = results[0];
    const isStandardCycle = dealer.cycle_start_day === 1;
    
    res.json({ 
      ...dealer,
      isStandardCycle,
      message: isStandardCycle 
        ? 'Dealer uses standard monthly cycle (1st-30th/31st)'
        : `Dealer uses custom cycle (${dealer.cycle_start_day}th-${dealer.cycle_start_day - 1}th)`
    });
  });
});

// Update billing cycle for a dealer (Admin and Sales Manager only)
router.post('/', authenticateToken, authorize('admin', 'sales_manager'), (req, res) => {
  const { dealer_code, cycle_start_day } = req.body;

  if (!dealer_code) {
    return res.status(400).json({ error: 'Dealer code is required' });
  }

  if (!cycle_start_day || cycle_start_day < 1 || cycle_start_day > 28) {
    return res.status(400).json({ error: 'Cycle start day must be between 1 and 28' });
  }

  // Update the dealer's billing cycle
  const updateQuery = `
    UPDATE dealers 
    SET billing_cycle_start_day = ?, updated_at = CURRENT_TIMESTAMP
    WHERE dealer_code = ?
  `;

  db.query(updateQuery, [parseInt(cycle_start_day), dealer_code], (err, result) => {
    if (err) {
      console.error('Error saving billing cycle:', err);
      return res.status(500).json({ error: 'Failed to save billing cycle' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }

    const cycleEndDay = cycle_start_day - 1;
    res.json({
      success: true,
      message: `Billing cycle set: ${cycle_start_day}th to ${cycleEndDay === 0 ? 'end of previous month' : cycleEndDay + 'th'}`,
      dealer_code,
      cycle_start_day: parseInt(cycle_start_day),
      cycle_end_day: cycleEndDay
    });
  });
});

// Reset billing cycle to standard (1st of month) (Admin and Sales Manager only)
router.delete('/:dealerCode', authenticateToken, authorize('admin', 'sales_manager'), (req, res) => {
  const { dealerCode } = req.params;

  const updateQuery = `
    UPDATE dealers 
    SET billing_cycle_start_day = 1, updated_at = CURRENT_TIMESTAMP
    WHERE dealer_code = ?
  `;

  db.query(updateQuery, [dealerCode], (err, result) => {
    if (err) {
      console.error('Error resetting billing cycle:', err);
      return res.status(500).json({ error: 'Failed to reset billing cycle' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }

    res.json({
      success: true,
      message: 'Billing cycle reset to standard monthly cycle (1st-30th/31st)'
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
      CASE WHEN COALESCE(d.billing_cycle_start_day, 1) != 1 THEN 1 ELSE 0 END as has_custom_cycle,
      COALESCE(d.billing_cycle_start_day, 1) as cycle_start_day
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
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

