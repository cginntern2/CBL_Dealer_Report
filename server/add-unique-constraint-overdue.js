const db = require('./db');

console.log('Adding unique constraint to overdue_report table...');

// Add unique constraint on (dealer_code, year, month)
const addUniqueConstraint = `
  ALTER TABLE overdue_report 
  ADD UNIQUE KEY unique_dealer_year_month (dealer_code, year, month)
`;

db.query(addUniqueConstraint, (err) => {
  if (err) {
    // Check if constraint already exists
    if (err.code === 'ER_DUP_KEYNAME' || err.message.includes('Duplicate key name')) {
      console.log('✅ Unique constraint already exists on overdue_report table');
    } else {
      console.error('Error adding unique constraint:', err);
      process.exit(1);
    }
  } else {
    console.log('✅ Added unique constraint to overdue_report table');
  }
  
  console.log('\n✅ Unique constraint ready!');
  process.exit(0);
});

