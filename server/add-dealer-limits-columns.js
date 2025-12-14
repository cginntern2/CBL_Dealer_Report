const db = require('./db');

console.log('Adding lower_limit and upper_limit columns to dealers table...');

// Simple approach: Try to add columns, ignore error if they already exist
const addColumns = () => {
  // Add lower_limit column
  db.query('ALTER TABLE dealers ADD COLUMN lower_limit DECIMAL(15, 2) DEFAULT 0', (err) => {
    if (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ lower_limit column already exists');
      } else {
        console.error('Error adding lower_limit column:', err.message);
        process.exit(1);
      }
    } else {
      console.log('✓ lower_limit column added successfully');
    }
    
    // Add upper_limit column
    db.query('ALTER TABLE dealers ADD COLUMN upper_limit DECIMAL(15, 2) DEFAULT 0', (err) => {
      if (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log('✓ upper_limit column already exists');
        } else {
          console.error('Error adding upper_limit column:', err.message);
          process.exit(1);
        }
      } else {
        console.log('✓ upper_limit column added successfully');
      }
      
      console.log('\nDone! Columns are ready.');
      process.exit(0);
    });
  });
};

// Wait a moment for connection to be ready
setTimeout(() => {
  addColumns();
}, 1000);
