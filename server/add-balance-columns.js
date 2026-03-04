const db = require('./db');

console.log('Adding opening_balance and closing_balance columns to dealers table...');

// Add opening_balance column
const addOpeningBalanceQuery = `
  ALTER TABLE dealers 
  ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(15, 2) DEFAULT 0 COMMENT 'Opening balance for the dealer'
`;

// Add closing_balance column
const addClosingBalanceQuery = `
  ALTER TABLE dealers 
  ADD COLUMN IF NOT EXISTS closing_balance DECIMAL(15, 2) DEFAULT 0 COMMENT 'Current closing balance for the dealer'
`;

// MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
// So we'll use a different approach - check if column exists first
const checkColumnQuery = `
  SELECT COUNT(*) as count
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dealers'
    AND COLUMN_NAME = ?
`;

db.query(checkColumnQuery, ['opening_balance'], (err, results) => {
  if (err) {
    console.error('Error checking opening_balance column:', err);
    process.exit(1);
  }

  const openingExists = results[0].count > 0;

  if (!openingExists) {
    db.query('ALTER TABLE dealers ADD COLUMN opening_balance DECIMAL(15, 2) DEFAULT 0 COMMENT \'Opening balance for the dealer\'', (err) => {
      if (err) {
        console.error('Error adding opening_balance column:', err);
        process.exit(1);
      }
      console.log('✅ Added opening_balance column to dealers table');
      
      // Now check and add closing_balance
      addClosingBalanceColumn();
    });
  } else {
    console.log('✅ opening_balance column already exists');
    addClosingBalanceColumn();
  }
});

function addClosingBalanceColumn() {
  db.query(checkColumnQuery, ['closing_balance'], (err, results) => {
    if (err) {
      console.error('Error checking closing_balance column:', err);
      process.exit(1);
    }

    const closingExists = results[0].count > 0;

    if (!closingExists) {
      db.query('ALTER TABLE dealers ADD COLUMN closing_balance DECIMAL(15, 2) DEFAULT 0 COMMENT \'Current closing balance for the dealer\'', (err) => {
        if (err) {
          console.error('Error adding closing_balance column:', err);
          process.exit(1);
        }
        console.log('✅ Added closing_balance column to dealers table');
        console.log('\n✅ All balance columns added successfully!');
        process.exit(0);
      });
    } else {
      console.log('✅ closing_balance column already exists');
      console.log('\n✅ All balance columns are ready!');
      process.exit(0);
    }
  });
}

