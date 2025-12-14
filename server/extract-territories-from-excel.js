const xlsx = require('xlsx');
const path = require('path');
const db = require('./db');

console.log('Extracting territories from Excel file and linking to existing dealers...\n');

const excelPath = path.join(__dirname, '..', 'VW_ALL_CUSTOMER_INFO.xlsx');

try {
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  console.log(`Read ${data.length} rows from Excel file\n`);

  // Helper function to find column (case-insensitive)
  const findColumn = (row, possibleNames) => {
    const rowKeys = Object.keys(row);
    for (const name of possibleNames) {
      for (const key of rowKeys) {
        if (key.toLowerCase() === name.toLowerCase() || key.replace(/[\s_\.-]/g, '').toLowerCase() === name.replace(/[\s_\.-]/g, '').toLowerCase()) {
          if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
            return String(row[key]).trim();
          }
        }
      }
    }
    return '';
  };

  // Extract dealer codes and territories
  const dealerTerritoryMap = {};
  let processed = 0;
  let withTerritory = 0;

  data.forEach(row => {
    const dealer_code = findColumn(row, [
      'DEALER_CODE', 'Dealer Code', 'DEALER CODE', 'Dealer_Code',
      'Customer Code', 'CUSTOMER CODE', 'Customer_Code'
    ]);

    const territory_name = findColumn(row, [
      'TERRITORY_NAME', 'Territory Name', 'TERRITORY NAME', 'Territory_Name',
      'Territory', 'TERRITORY'
    ]);

    if (dealer_code) {
      processed++;
      // Normalize dealer code (remove leading zeros for matching)
      const normalizedCode = dealer_code.replace(/^0+/, '') || dealer_code;
      dealerTerritoryMap[normalizedCode] = {
        originalCode: dealer_code,
        territory: territory_name
      };
      if (territory_name) withTerritory++;
    }
  });

  console.log(`Processed ${processed} dealer codes`);
  console.log(`Found ${withTerritory} dealers with territory information\n`);

  // Step 1: Insert unique territories
  const uniqueTerritories = {};
  Object.values(dealerTerritoryMap).forEach(item => {
    if (item.territory && item.territory.trim()) {
      const territoryName = item.territory.trim();
      if (!uniqueTerritories[territoryName]) {
        uniqueTerritories[territoryName] = true;
      }
    }
  });

  const territoriesArray = Object.keys(uniqueTerritories);
  console.log(`Found ${territoriesArray.length} unique territories\n`);

  if (territoriesArray.length === 0) {
    console.log('❌ No territories found in Excel file. Please check the file.');
    db.end();
    process.exit(1);
  }

  // Insert territories
  const territoryInsertQuery = `INSERT IGNORE INTO territories (territory_code, territory_name) VALUES ?`;
  const territoryValues = territoriesArray.map(name => [null, name]);

  db.query(territoryInsertQuery, [territoryValues], (err) => {
    if (err) {
      console.error('Error inserting territories:', err);
      db.end();
      process.exit(1);
    }

    console.log(`✅ Inserted/updated ${territoriesArray.length} territories\n`);

    // Get territory IDs
    db.query('SELECT id, territory_name FROM territories WHERE territory_name IN (?)', 
      [territoriesArray], 
      (err2, territoryIds) => {
        if (err2) {
          console.error('Error fetching territory IDs:', err2);
          db.end();
          process.exit(1);
        }

        const territoryMap = {};
        territoryIds.forEach(t => {
          territoryMap[t.territory_name] = t.id;
        });

        console.log(`✅ Mapped ${territoryIds.length} territories to IDs\n`);

        // Step 2: Update dealers with territory_id
        // Get all dealers with their codes (normalized for matching)
        db.query('SELECT id, dealer_code FROM dealers', (err3, dealers) => {
          if (err3) {
            console.error('Error fetching dealers:', err3);
            db.end();
            process.exit(1);
          }

          let updated = 0;
          let notFound = 0;

          dealers.forEach(dealer => {
            // Normalize dealer code for matching
            const normalizedCode = dealer.dealer_code.replace(/^0+/, '') || dealer.dealer_code;
            const territoryInfo = dealerTerritoryMap[normalizedCode];

            if (territoryInfo && territoryInfo.territory) {
              const territoryId = territoryMap[territoryInfo.territory.trim()];
              
              if (territoryId) {
                db.query(
                  'UPDATE dealers SET territory_id = ? WHERE id = ? AND (territory_id IS NULL OR territory_id = 0)',
                  [territoryId, dealer.id],
                  (err4) => {
                    if (!err4) updated++;
                  }
                );
              }
            } else {
              notFound++;
            }
          });

          // Wait a bit for updates to complete
          setTimeout(() => {
            console.log(`✅ Updated ${updated} dealers with territory_id`);
            if (notFound > 0) {
              console.log(`⚠️  ${notFound} dealers not found in Excel file (may have different dealer codes)`);
            }
            console.log('\n✅ Territory extraction complete!');
            db.end();
            process.exit(0);
          }, 2000);
        });
      });
  });

} catch (error) {
  console.error('Error processing Excel file:', error.message);
  console.log('\nMake sure VW_ALL_CUSTOMER_INFO.xlsx exists in the project root.');
  db.end();
  process.exit(1);
}


