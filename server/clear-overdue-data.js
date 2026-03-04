const db = require('./db');

console.log('Clearing all previous overdue data from overdue_report table...');

const clearQuery = 'TRUNCATE TABLE overdue_report';

db.query(clearQuery, (err) => {
  if (err) {
    console.error('Error clearing overdue data:', err);
    process.exit(1);
  }
  
  console.log('✅ All previous overdue data cleared successfully!');
  console.log('The system will now calculate overdue from closing balance only.');
  process.exit(0);
});

