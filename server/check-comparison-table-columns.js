const db = require('./db');

console.log('Checking columns in comparison tables...\n');

// Check abp_vs_achievement table
db.query('DESCRIBE abp_vs_achievement', (err1, results1) => {
  if (err1) {
    console.error('Error checking abp_vs_achievement:', err1.message);
  } else {
    console.log('Columns in abp_vs_achievement:');
    results1.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    console.log('');
  }
  
  // Check forecast_vs_achievement table
  db.query('DESCRIBE forecast_vs_achievement', (err2, results2) => {
    if (err2) {
      console.error('Error checking forecast_vs_achievement:', err2.message);
    } else {
      console.log('Columns in forecast_vs_achievement:');
      results2.forEach(col => {
        console.log(`  - ${col.Field} (${col.Type})`);
      });
      console.log('');
    }
    
    // Check if percentage columns exist
    const abpHasAmountPct = results1 && results1.some(col => col.Field === 'amount_percentage');
    const abpHasQtyPct = results1 && results1.some(col => col.Field === 'quantity_percentage');
    const fcHasAmountPct = results2 && results2.some(col => col.Field === 'amount_percentage');
    const fcHasQtyPct = results2 && results2.some(col => col.Field === 'quantity_percentage');
    
    console.log('Percentage columns status:');
    console.log(`  abp_vs_achievement.amount_percentage: ${abpHasAmountPct ? 'EXISTS' : 'MISSING'}`);
    console.log(`  abp_vs_achievement.quantity_percentage: ${abpHasQtyPct ? 'EXISTS' : 'MISSING'}`);
    console.log(`  forecast_vs_achievement.amount_percentage: ${fcHasAmountPct ? 'EXISTS' : 'MISSING'}`);
    console.log(`  forecast_vs_achievement.quantity_percentage: ${fcHasQtyPct ? 'EXISTS' : 'MISSING'}`);
    
    if (!abpHasAmountPct || !abpHasQtyPct || !fcHasAmountPct || !fcHasQtyPct) {
      console.log('\n⚠ Some percentage columns are missing. Running migration...');
      require('./add-percentage-columns-to-comparison-tables.js');
    } else {
      console.log('\n✓ All percentage columns exist!');
    }
    
    process.exit(0);
  });
});

