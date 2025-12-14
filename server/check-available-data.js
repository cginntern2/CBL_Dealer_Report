const db = require('./db');

console.log('Checking available data in comparison tables...\n');

// Check ABP vs Achievement
db.query(`
  SELECT DISTINCT year, month 
  FROM abp_vs_achievement 
  ORDER BY year DESC, month DESC 
  LIMIT 20
`, (err1, results1) => {
  if (err1) {
    console.error('Error:', err1.message);
  } else {
    console.log('Available Year/Month combinations in abp_vs_achievement:');
    results1.forEach(r => {
      console.log(`  ${r.year}-${String(r.month).padStart(2, '0')}`);
    });
  }
  
  // Check Forecast vs Achievement
  db.query(`
    SELECT DISTINCT year, month 
    FROM forecast_vs_achievement 
    ORDER BY year DESC, month DESC 
    LIMIT 20
  `, (err2, results2) => {
    if (err2) {
      console.error('Error:', err2.message);
    } else {
      console.log('\nAvailable Year/Month combinations in forecast_vs_achievement:');
      results2.forEach(r => {
        console.log(`  ${r.year}-${String(r.month).padStart(2, '0')}`);
      });
    }
    
    // Get total counts
    db.query('SELECT COUNT(*) as total FROM abp_vs_achievement', (err3, results3) => {
      console.log(`\nTotal records in abp_vs_achievement: ${results3[0].total}`);
      
      db.query('SELECT COUNT(*) as total FROM forecast_vs_achievement', (err4, results4) => {
        console.log(`Total records in forecast_vs_achievement: ${results4[0].total}`);
        process.exit(0);
      });
    });
  });
});

