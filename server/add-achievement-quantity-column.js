const db = require('./db');

console.log('Adding achievement_quantity column to achievements table...');

// Add quantity column
db.query('ALTER TABLE achievements ADD COLUMN achievement_quantity DECIMAL(15, 2) DEFAULT 0', (err) => {
  if (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ achievement_quantity column already exists');
    } else {
      console.error('Error adding achievement_quantity column:', err.message);
      process.exit(1);
    }
  } else {
    console.log('✓ achievement_quantity column added successfully');
  }
  
  console.log('\nDone! Column is ready.');
  process.exit(0);
});

// Wait a moment for connection to be ready
setTimeout(() => {
  // Query already executed above
}, 1000);
