const db = require('./db');

// Check if column exists first, then add if it doesn't
const checkColumnQuery = `
SELECT COUNT(*) as count 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'dealers' 
AND COLUMN_NAME = 'territory'
`;

db.query(checkColumnQuery, (err, results) => {
  if (err) {
    console.error('Error checking column:', err.message);
    db.end();
    process.exit(1);
  }
  
  if (results[0].count > 0) {
    console.log('✅ Territory column already exists in dealers table');
    db.end();
    process.exit(0);
  }
  
  // Column doesn't exist, add it
  const addTerritoryColumn = `
    ALTER TABLE dealers 
    ADD COLUMN territory VARCHAR(255) AFTER address
  `;
  
  db.query(addTerritoryColumn, (err, results) => {
    if (err) {
      console.error('Error adding territory column:', err.message);
      db.end();
      process.exit(1);
    } else {
      console.log('✅ Territory column added successfully to dealers table');
      db.end();
      process.exit(0);
    }
  });
});

