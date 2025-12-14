const xlsx = require('xlsx');
const path = require('path');
const db = require('./db');

console.log('Extracting territories from both N-1 and N-2 sheets...\n');

const excelPath = path.join(__dirname, '..', 'Sales Collection - Nov-25.xlsx');
const dealerTerritoryMap = {};

function processSheet(worksheet, sheetName) {
  console.log(`\nProcessing ${sheetName}...`);
  const arrayData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  const headerRow = arrayData[6]; // Row 7 (0-indexed: 6)
  const territoryNameIndex = 0; // First column
  const dealerCodeIndex = 1; // Second column
  
  let currentTerritory = null;
  let dealerCount = 0;
  let territoryCount = 0;
  
  for (let i = 7; i < arrayData.length; i++) {
    const row = arrayData[i];
    if (!row || row.length === 0) continue;
    
    const territoryNameCell = row[territoryNameIndex];
    const dealerCodeCell = row[dealerCodeIndex];
    
    // Check if this is a territory row
    if (territoryNameCell && String(territoryNameCell).trim() !== '' && 
        String(territoryNameCell).toLowerCase().includes('territory')) {
      
      let territoryName = String(territoryNameCell).trim();
      
      // Remove sales person name if present
      if (territoryName.includes('-')) {
        const parts = territoryName.split('-');
        if (parts[0].toLowerCase().includes('territory')) {
          territoryName = parts[0].trim();
        }
      }
      
      // Remove markers like "(COM)"
      territoryName = territoryName.replace(/\s*\([^)]*\)\s*/g, '').trim();
      
      currentTerritory = territoryName;
      territoryCount++;
      
    } else if (dealerCodeCell && currentTerritory) {
      const dealerCode = String(dealerCodeCell).trim();
      
      if (/^0\d{3,4}$/.test(dealerCode)) {
        // Only add if not already mapped (prefer first occurrence)
        if (!dealerTerritoryMap[dealerCode]) {
          dealerTerritoryMap[dealerCode] = currentTerritory;
          dealerCount++;
        }
      }
    }
  }
  
  console.log(`  Found ${territoryCount} territories`);
  console.log(`  Found ${dealerCount} new dealers`);
  return dealerCount;
}

try {
  const workbook = xlsx.readFile(excelPath);
  
  // Process both sheets
  processSheet(workbook.Sheets['N-1'], 'N-1');
  processSheet(workbook.Sheets['N-2'], 'N-2');
  
  const totalDealers = Object.keys(dealerTerritoryMap).length;
  const uniqueTerritories = [...new Set(Object.values(dealerTerritoryMap))];
  
  console.log(`\n✅ Total: ${totalDealers} dealers with territories`);
  console.log(`✅ Unique territories: ${uniqueTerritories.length}`);
  console.log('Territories:', uniqueTerritories.join(', '));
  
  // Insert/update territories
  const territoryValues = uniqueTerritories.map(name => [null, name]);
  const insertTerritoryQuery = `INSERT IGNORE INTO territories (territory_code, territory_name) VALUES ?`;
  
  db.query(insertTerritoryQuery, [territoryValues], (err) => {
    if (err) {
      console.error('Error inserting territories:', err);
      db.end();
      process.exit(1);
    }
    
    console.log(`\n✅ Territories inserted/updated in database\n`);
    
    // Get territory IDs
    db.query('SELECT id, territory_name FROM territories WHERE territory_name IN (?)', 
      [uniqueTerritories], 
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
        
        // Update dealers
        const dealerCodes = Object.keys(dealerTerritoryMap);
        let completed = 0;
        let updated = 0;
        let notFound = 0;
        let alreadyHas = 0;
        
        dealerCodes.forEach(dealerCode => {
          const territoryName = dealerTerritoryMap[dealerCode];
          const territoryId = territoryMap[territoryName];
          
          if (!territoryId) {
            completed++;
            notFound++;
            if (completed === dealerCodes.length) {
              finish();
            }
            return;
          }
          
          // Check if dealer exists and current territory_id
          db.query('SELECT id, territory_id FROM dealers WHERE dealer_code = ?', 
            [dealerCode], 
            (err3, dealer) => {
              if (err3 || dealer.length === 0) {
                completed++;
                notFound++;
              } else if (dealer[0].territory_id && dealer[0].territory_id !== 0) {
                completed++;
                alreadyHas++;
              } else {
                // Update dealer
                db.query(
                  `UPDATE dealers SET territory_id = ? WHERE dealer_code = ?`,
                  [territoryId, dealerCode],
                  (err4, result) => {
                    completed++;
                    if (!err4 && result.affectedRows > 0) {
                      updated++;
                    } else {
                      notFound++;
                    }
                    
                    if (completed === dealerCodes.length) {
                      finish();
                    }
                  }
                );
                return;
              }
              
              if (completed === dealerCodes.length) {
                finish();
              }
            }
          );
        });
        
        function finish() {
          console.log(`\n✅ Update Summary:`);
          console.log(`   - Updated: ${updated} dealers`);
          console.log(`   - Already had territory: ${alreadyHas} dealers`);
          console.log(`   - Dealers not found: ${notFound} dealers`);
          console.log(`   - Total processed: ${dealerCodes.length} dealers`);
          
          // Final count
          db.query('SELECT COUNT(*) as count FROM dealers WHERE territory_id IS NOT NULL AND territory_id != 0', 
            (err5, res5) => {
              if (!err5) {
                console.log(`\n✅ Total dealers with territory_id in database: ${res5[0].count}`);
              }
              db.end();
              process.exit(0);
            });
        }
      });
  });

} catch (error) {
  console.error('Error:', error.message);
  db.end();
  process.exit(1);
}


