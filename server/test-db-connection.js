// Test database connection
const db = require('./db');

console.log('Testing database connection...');

db.query('SELECT 1 as test', (err, results) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('Error code:', err.code);
    process.exit(1);
  } else {
    console.log('✅ Database connection successful!');
    console.log('Test query result:', results);
    process.exit(0);
  }
});

