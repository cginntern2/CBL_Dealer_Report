const db = require('./db');

console.log('Migrating territories from dealers.territory column to territories table...\n');

// Step 1: Get unique territories from old territory column
db.query(`SELECT DISTINCT territory FROM dealers 
          WHERE territory IS NOT NULL AND territory != '' AND territory != 'NULL'`, 
  (err, territoryRows) => {
    if (err) {
      console.error('Error fetching territories:', err);
      db.end();
      process.exit(1);
    }

    if (territoryRows.length === 0) {
      console.log('❌ No territories found in dealers.territory column.');
      console.log('💡 You need to re-upload the Excel file (VW_ALL_CUSTOMER_INFO.xlsx)');
      console.log('   The new upload will automatically extract TERRITORY_NAME and create territories.');
      db.end();
      process.exit(0);
    }

    console.log(`Found ${territoryRows.length} unique territories to migrate\n`);

    // Step 2: Insert territories into territories table
    const territories = territoryRows.map(t => [null, t.territory.trim()]); // [territory_code, territory_name]
    const insertTerritoryQuery = `INSERT IGNORE INTO territories (territory_code, territory_name) VALUES ?`;

    db.query(insertTerritoryQuery, [territories], (err2, results) => {
      if (err2) {
        console.error('Error inserting territories:', err2);
        db.end();
        process.exit(1);
      }

      console.log(`✅ Inserted ${results.affectedRows} territories into territories table\n`);

      // Step 3: Get territory IDs
      const territoryNames = territories.map(t => t[1]);
      db.query('SELECT id, territory_name FROM territories WHERE territory_name IN (?)', 
        [territoryNames], 
        (err3, territoryIds) => {
          if (err3) {
            console.error('Error fetching territory IDs:', err3);
            db.end();
            process.exit(1);
          }

          // Create map of territory_name -> territory_id
          const territoryMap = {};
          territoryIds.forEach(t => {
            territoryMap[t.territory_name] = t.id;
          });

          console.log(`✅ Mapped ${territoryIds.length} territories to IDs\n`);

          // Step 4: Update dealers with territory_id
          let updateCount = 0;
          let totalUpdates = 0;

          // Process in batches
          territoryNames.forEach((territoryName, index) => {
            const territoryId = territoryMap[territoryName];
            
            db.query(
              'UPDATE dealers SET territory_id = ? WHERE territory = ? AND (territory_id IS NULL OR territory_id = 0)',
              [territoryId, territoryName],
              (err4, updateResult) => {
                if (err4) {
                  console.error(`Error updating dealers for territory "${territoryName}":`, err4);
                } else {
                  updateCount += updateResult.affectedRows;
                  console.log(`  ✓ Updated ${updateResult.affectedRows} dealers for "${territoryName}"`);
                }

                totalUpdates++;
                if (totalUpdates === territoryNames.length) {
                  console.log(`\n✅ Migration complete! Updated ${updateCount} dealers with territory_id`);
                  db.end();
                  process.exit(0);
                }
              }
            );
          });
        }
      );
    });
  }
);


