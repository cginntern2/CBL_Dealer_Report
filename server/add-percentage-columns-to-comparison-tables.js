const db = require('./db');

console.log('Adding percentage columns to comparison tables...');

// Add percentage columns to abp_vs_achievement (one by one to handle existing columns)
db.query('ALTER TABLE abp_vs_achievement ADD COLUMN amount_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT \'Achievement Amount / ABP Target Amount * 100\'', (err1a) => {
  if (err1a) {
    if (err1a.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ amount_percentage column already exists in abp_vs_achievement');
    } else {
      console.error('Error adding amount_percentage to abp_vs_achievement:', err1a.message);
    }
  } else {
    console.log('✓ Added amount_percentage column to abp_vs_achievement');
  }
  
  db.query('ALTER TABLE abp_vs_achievement ADD COLUMN quantity_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT \'Achievement Quantity / ABP Target Quantity * 100\'', (err1b) => {
    if (err1b) {
      if (err1b.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ quantity_percentage column already exists in abp_vs_achievement');
      } else {
        console.error('Error adding quantity_percentage to abp_vs_achievement:', err1b.message);
      }
    } else {
      console.log('✓ Added quantity_percentage column to abp_vs_achievement');
    }
    
    // Now add to forecast_vs_achievement
    db.query('ALTER TABLE forecast_vs_achievement ADD COLUMN amount_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT \'Achievement Amount / Forecast Target Amount * 100\'', (err2a) => {
      if (err2a) {
        if (err2a.code === 'ER_DUP_FIELDNAME') {
          console.log('✓ amount_percentage column already exists in forecast_vs_achievement');
        } else {
          console.error('Error adding amount_percentage to forecast_vs_achievement:', err2a.message);
        }
      } else {
        console.log('✓ Added amount_percentage column to forecast_vs_achievement');
      }
      
      db.query('ALTER TABLE forecast_vs_achievement ADD COLUMN quantity_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT \'Achievement Quantity / Forecast Target Quantity * 100\'', (err2b) => {
        if (err2b) {
          if (err2b.code === 'ER_DUP_FIELDNAME') {
            console.log('✓ quantity_percentage column already exists in forecast_vs_achievement');
          } else {
            console.error('Error adding quantity_percentage to forecast_vs_achievement:', err2b.message);
          }
        } else {
          console.log('✓ Added quantity_percentage column to forecast_vs_achievement');
        }
        
        console.log('\nDone! Percentage columns added to both tables.');
        process.exit(0);
      });
    });
  });
});

