const db = require('./db');

console.log('Adding unique constraint to daily_sales table...');

// Add unique constraint on (dealer_code, transaction_date, application_unit)
// This ensures we can use ON DUPLICATE KEY UPDATE
const addUniqueConstraint = `
  ALTER TABLE daily_sales 
  ADD UNIQUE KEY unique_dealer_date_app (dealer_code, transaction_date, application_unit)
`;

db.query(addUniqueConstraint, (err) => {
  if (err) {
    // Check if constraint already exists
    if (err.code === 'ER_DUP_KEYNAME' || err.message.includes('Duplicate key name')) {
      console.log('✅ Unique constraint already exists on daily_sales table');
    } else {
      console.error('Error adding unique constraint:', err);
      process.exit(1);
    }
  } else {
    console.log('✅ Added unique constraint to daily_sales table');
  }
  
  // Also add unique constraint to daily_collections
  const addUniqueConstraintCollections = `
    ALTER TABLE daily_collections 
    ADD UNIQUE KEY unique_dealer_date (dealer_code, transaction_date)
  `;
  
  db.query(addUniqueConstraintCollections, (err) => {
    if (err) {
      if (err.code === 'ER_DUP_KEYNAME' || err.message.includes('Duplicate key name')) {
        console.log('✅ Unique constraint already exists on daily_collections table');
      } else {
        console.error('Error adding unique constraint to collections:', err);
        process.exit(1);
      }
    } else {
      console.log('✅ Added unique constraint to daily_collections table');
    }
    
    console.log('\n✅ All unique constraints added successfully!');
    process.exit(0);
  });
});

