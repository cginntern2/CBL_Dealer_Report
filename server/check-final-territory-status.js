const db = require('./db');

console.log('Final Territory Status:\n');

db.query('SELECT COUNT(*) as total FROM dealers', (err, res1) => {
  if (err) {
    console.error('Error:', err);
    db.end();
    return;
  }
  
  const totalDealers = res1[0].total;
  
  db.query('SELECT COUNT(*) as with_territory FROM dealers WHERE territory_id IS NOT NULL AND territory_id != 0', 
    (err2, res2) => {
      if (err2) {
        console.error('Error:', err2);
        db.end();
        return;
      }
      
      const withTerritory = res2[0].with_territory;
      const withoutTerritory = totalDealers - withTerritory;
      
      console.log(`Total dealers: ${totalDealers}`);
      console.log(`Dealers with territory_id: ${withTerritory}`);
      console.log(`Dealers without territory_id: ${withoutTerritory}`);
      console.log(`Coverage: ${((withTerritory / totalDealers) * 100).toFixed(1)}%`);
      
      db.query('SELECT COUNT(*) as count FROM territories', (err3, res3) => {
        if (!err3) {
          console.log(`\nTotal territories: ${res3[0].count}`);
          
          db.query('SELECT territory_name, COUNT(*) as dealer_count FROM dealers d JOIN territories t ON d.territory_id = t.id GROUP BY territory_name ORDER BY dealer_count DESC LIMIT 10', 
            (err4, res4) => {
              if (!err4 && res4.length > 0) {
                console.log('\nTop territories by dealer count:');
                res4.forEach(t => {
                  console.log(`  - ${t.territory_name}: ${t.dealer_count} dealers`);
                });
              }
              db.end();
              process.exit(0);
            });
        } else {
          db.end();
          process.exit(0);
        }
      });
    });
});

