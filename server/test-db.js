const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('Testing database connection...');
console.log('Env file path:', path.join(__dirname, '.env'));
console.log('Host:', process.env.DB_HOST);
console.log('User:', process.env.DB_USER);
console.log('Database:', process.env.DB_NAME);
console.log('Password:', process.env.DB_PASSWORD ? '***' : 'not set');

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cbl_dealer_report'
});

db.connect((err) => {
  if (err) {
    console.error('\n❌ Database connection failed!');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('\nPossible issues:');
    console.error('1. MySQL server is not running');
    console.error('2. Database "cbl_dealer_report" does not exist');
    console.error('3. Wrong username or password');
    console.error('4. MySQL server is not accessible on localhost:3306');
    process.exit(1);
  } else {
    console.log('\n✅ Connected to MySQL database successfully!');
    
    // Test query
    db.query('SELECT COUNT(*) as count FROM dealers', (err, results) => {
      if (err) {
        console.error('Error querying dealers table:', err.message);
      } else {
        console.log(`Dealers in database: ${results[0].count}`);
      }
      db.end();
      process.exit(0);
    });
  }
});

