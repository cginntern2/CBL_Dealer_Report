const db = require('./db');

console.log('Testing comparison tables data...\n');

// Test ABP vs Achievement
db.query('SELECT COUNT(*) as count FROM abp_vs_achievement', (err1, results1) => {
  if (err1) {
    console.error('Error querying abp_vs_achievement:', err1.message);
  } else {
    console.log(`✓ abp_vs_achievement table has ${results1[0].count} records`);
    
    // Get a sample
    db.query('SELECT * FROM abp_vs_achievement LIMIT 3', (err2, results2) => {
      if (err2) {
        console.error('Error getting sample:', err2.message);
      } else {
        console.log('\nSample records from abp_vs_achievement:');
        console.log(JSON.stringify(results2, null, 2));
      }
      
      // Test Forecast vs Achievement
      db.query('SELECT COUNT(*) as count FROM forecast_vs_achievement', (err3, results3) => {
        if (err3) {
          console.error('Error querying forecast_vs_achievement:', err3.message);
        } else {
          console.log(`\n✓ forecast_vs_achievement table has ${results3[0].count} records`);
          
          // Get a sample
          db.query('SELECT * FROM forecast_vs_achievement LIMIT 3', (err4, results4) => {
            if (err4) {
              console.error('Error getting sample:', err4.message);
            } else {
              console.log('\nSample records from forecast_vs_achievement:');
              console.log(JSON.stringify(results4, null, 2));
            }
            
            // Test the actual query used by the API
            console.log('\n\nTesting API query (no filters):');
            db.query(`
              SELECT 
                a.dealer_code,
                a.dealer_name,
                a.territory_name,
                a.year,
                a.month,
                a.abp_target_amount,
                a.abp_target_quantity,
                a.achievement_amount,
                a.achievement_quantity,
                a.amount_percentage,
                a.quantity_percentage
              FROM abp_vs_achievement a
              WHERE 1=1
              ORDER BY a.dealer_name ASC, a.year DESC, a.month DESC
              LIMIT 5
            `, (err5, results5) => {
              if (err5) {
                console.error('Error testing API query:', err5.message);
              } else {
                console.log(`Found ${results5.length} records with API query`);
                if (results5.length > 0) {
                  console.log('Sample from API query:');
                  console.log(JSON.stringify(results5[0], null, 2));
                }
              }
              process.exit(0);
            });
          });
        }
      });
    });
  }
});

