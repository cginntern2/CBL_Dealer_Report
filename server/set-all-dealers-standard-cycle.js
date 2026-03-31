const db = require('./db');

console.log('Setting all dealers to standard billing cycle (1st to 30th/31st)...');

// Update all dealers to have billing_cycle_start_day = 1 (standard cycle)
const updateQuery = `
  UPDATE dealers 
  SET billing_cycle_start_day = 1, updated_at = CURRENT_TIMESTAMP
  WHERE billing_cycle_start_day IS NULL OR billing_cycle_start_day != 1
`;

db.query(updateQuery, (err, result) => {
  if (err) {
    console.error('Error updating dealers:', err);
    process.exit(1);
  }
  
  console.log(`✅ Successfully updated ${result.affectedRows} dealer(s) to standard billing cycle (1st to 30th/31st)`);
  console.log('\nAll dealers now have billing cycle: 1st to end of month');
  console.log('You can manually update the 10-12 dealers with custom cycles later via the Billing Cycles module.');
  process.exit(0);
});



