const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all dealers with pagination and filtering
router.get('/', (req, res) => {
  const { page = 1, limit, territory, showAll = 'false' } = req.query;
  const showAllFlag = showAll === 'true';
  const defaultLimit = 10;
  const limitValue = limit ? parseInt(limit) : defaultLimit;
  
  // Build WHERE clause for filters
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // Get total count for pagination (using the same WHERE clause)
  const countQuery = `SELECT COUNT(*) as total FROM dealers d ${whereClause}`;
  
  db.query(countQuery, queryParams, (err, countResults) => {
    if (err) {
      console.error('Error counting dealers:', err);
      return res.status(500).json({ error: 'Failed to fetch dealers' });
    }
    
    const total = countResults[0].total;
    
    // Build main query with pagination (join with territories to get territory name)
    let query = `SELECT d.*, t.territory_name, t.territory_code 
                 FROM dealers d 
                 LEFT JOIN territories t ON d.territory_id = t.id 
                 ${whereClause} 
                 ORDER BY d.dealer_name ASC`;
    const finalQueryParams = [...queryParams];
    
    // Apply pagination only if showAll is false
    if (!showAllFlag) {
      const offset = (parseInt(page) - 1) * limitValue;
      query += ` LIMIT ? OFFSET ?`;
      finalQueryParams.push(limitValue, offset);
    }
    
    db.query(query, finalQueryParams, (err, results) => {
      if (err) {
        console.error('Error fetching dealers:', err);
        return res.status(500).json({ error: 'Failed to fetch dealers' });
      }
      res.json({ 
        dealers: results,
        total: total,
        page: parseInt(page),
        limit: showAllFlag ? total : limitValue,
        showAll: showAllFlag
      });
    });
  });
});

// Get unique territories for filter dropdown
router.get('/territories', (req, res) => {
  const query = 'SELECT id, territory_name FROM territories ORDER BY territory_name ASC';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching territories:', err);
      return res.status(500).json({ error: 'Failed to fetch territories' });
    }
    res.json({ territories: results });
  });
});

// Get single dealer by ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM dealers WHERE id = ?';
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching dealer:', err);
      return res.status(500).json({ error: 'Failed to fetch dealer' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }
    res.json({ dealer: results[0] });
  });
});

// Add dealer manually
router.post('/', (req, res) => {
  const { dealer_name, dealer_code, contact_person, email, phone, address, territory_id, credit_days, status } = req.body;
  
  // Validate required fields
  if (!dealer_name || !dealer_code) {
    return res.status(400).json({ error: 'Dealer name and dealer code are required' });
  }
  
  const query = `INSERT INTO dealers (dealer_name, dealer_code, contact_person, email, phone, address, territory_id, credit_days, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const values = [
    dealer_name,
    dealer_code,
    contact_person || null,
    email || null,
    phone || null,
    address || null,
    territory_id ? parseInt(territory_id) : null,
    credit_days || 30,
    status || 'active'
  ];
  
  db.query(query, values, (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Dealer code already exists' });
      }
      console.error('Error adding dealer:', err);
      return res.status(500).json({ error: 'Failed to add dealer' });
    }
    res.status(201).json({ 
      message: 'Dealer added successfully',
      dealerId: results.insertId 
    });
  });
});

// Upload Excel file and import dealers
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Try to read from first row, if that doesn't work, try other rows
    let data = xlsx.utils.sheet_to_json(worksheet, { defval: null, raw: false });
    
    // If no data, try starting from row 2 (headers might be on row 2)
    if (data.length === 0 || Object.keys(data[0] || {}).length === 0) {
      const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:Z1000');
      range.s.r = 1; // Start from row 2 (0-indexed)
      worksheet['!ref'] = xlsx.utils.encode_range(range);
      data = xlsx.utils.sheet_to_json(worksheet, { defval: null, raw: false });
    }
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty or no data found' });
    }
    
    // Log all columns found in the Excel file for debugging
    console.log('=== EXCEL FILE COLUMNS DEBUG ===');
    console.log('Total rows:', data.length);
    if (data.length > 0) {
      const allColumns = Object.keys(data[0]);
      console.log('All column names found:', allColumns);
      console.log('Sample row data:', JSON.stringify(data[0], null, 2));
      
      // Also log first few rows to understand the data structure
      console.log('First 3 rows sample:');
      data.slice(0, 3).forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`, Object.keys(row).slice(0, 5).map(key => `${key}: ${row[key]}`).join(', '));
      });
    }
    
    // Helper function to find column by multiple possible names (case-insensitive, handles spaces/underscores/dots)
    const findColumn = (row, possibleNames) => {
      if (!row) return '';
      
      // First try exact matches
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
          return String(row[name]).trim();
        }
      }
      
      // Then try case-insensitive matching (normalize by removing spaces, underscores, dots, dashes)
      const rowKeys = Object.keys(row);
      for (const name of possibleNames) {
        const normalizedName = name.toLowerCase().replace(/[_\s\.-]/g, '');
        for (const key of rowKeys) {
          const normalizedKey = key.toLowerCase().replace(/[_\s\.-]/g, '');
          if (normalizedKey === normalizedName && row[key] !== undefined && row[key] !== null && row[key] !== '') {
            return String(row[key]).trim();
          }
        }
      }
      
      // Try partial matching (contains all words)
      for (const name of possibleNames) {
        const nameParts = name.toLowerCase().split(/[\s_\.-]+/).filter(p => p.length > 2);
        for (const key of rowKeys) {
          const keyLower = key.toLowerCase();
          if (nameParts.length > 0 && nameParts.every(part => keyLower.includes(part))) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
              return String(row[key]).trim();
            }
          }
        }
      }
      
      return '';
    };
    
    // Map Excel columns to database fields (comprehensive mapping)
    const dealers = data.map(row => {
      // Try to find dealer/customer name with extensive variations
      const dealer_name = findColumn(row, [
        'Customer Name', 'CUSTOMER NAME', 'Customer_Name', 'customer_name',
        'Dealer Name', 'DEALER NAME', 'Dealer_Name', 'dealer_name',
        'DealerName', 'CustomerName', 'Name', 'NAME',
        'Customer', 'CUSTOMER', 'Dealer', 'DEALER'
      ]) || '';
      
      // Try to find dealer/customer code with extensive variations
      const dealer_code = findColumn(row, [
        'Customer Code', 'CUSTOMER CODE', 'Customer_Code', 'customer_code',
        'Dealer Code', 'DEALER CODE', 'Dealer_Code', 'dealer_code',
        'DealerCode', 'CustomerCode', 'Code', 'CODE',
        'Customer Co', 'CUSTOMER CO', 'Dealer Co', 'DEALER CO',
        'CustomerCo', 'DealerCo', 'Cust Code', 'CUST CODE',
        'Cust_Code', 'CustCode', 'CUSTOMERCODE', 'DEALERCODE'
      ]) || '';
      
      // Contact person
      const contact_person = findColumn(row, [
        'Contact Person', 'CONTACT PERSON', 'Contact_Person', 'contact_person',
        'ContactPerson', 'Contact', 'CONTACT'
      ]) || '';
      
      // Email
      const email = findColumn(row, [
        'Email', 'EMAIL', 'Email Address', 'EMAIL ADDRESS',
        'Email_Address', 'email_address', 'E-Mail', 'E-MAIL'
      ]) || '';
      
      // Phone
      const phone = findColumn(row, [
        'Phone', 'PHONE', 'Mobile', 'MOBILE',
        'Telephone', 'TELEPHONE', 'Contact Number', 'CONTACT NUMBER',
        'Contact_Number', 'Phone Number', 'PHONE NUMBER'
      ]) || '';
      
      // Address
      const address = findColumn(row, [
        'Address', 'ADDRESS', 'Location', 'LOCATION'
      ]) || '';
      
      // Territory Name - extract from Excel
      const territory_name = findColumn(row, [
        'Territory Name', 'TERRITORY NAME', 'Territory_Name', 'TERRITORY_NAME',
        'Territory', 'TERRITORY', 'TerritoryName'
      ]) || '';
      
      // Territory Code - extract from Excel (optional)
      const territory_code = findColumn(row, [
        'Territory Code', 'TERRITORY CODE', 'Territory_Code', 'TERRITORY_CODE',
        'TerritoryCode'
      ]) || '';
      
      // Credit days/limit
      const credit_days_raw = findColumn(row, [
        'Credit Days', 'CREDIT DAYS', 'Credit_Days', 'credit_days',
        'CreditDays', 'Credit Limit', 'CREDIT LIMIT', 'Credit_Limit',
        'CreditLimit', 'Credit Days Limit', 'Credit_Days_Limit'
      ]) || 30;
      const credit_days = parseInt(credit_days_raw) || 30;
      
      // Status
      const status = findColumn(row, [
        'Status', 'STATUS', 'Active Status', 'ACTIVE STATUS'
      ]) || 'active';
      
      return {
        dealer_name,
        dealer_code,
        contact_person,
        email,
        phone,
        address,
        territory_name: territory_name.trim(),
        territory_code: territory_code.trim(),
        credit_days: isNaN(credit_days) ? 30 : credit_days,
        status: ['active', 'inactive', 'delinquent'].includes(status.toLowerCase()) ? status.toLowerCase() : 'active'
      };
    });
    
    // Filter out rows with missing required fields
    const validDealers = dealers.filter(d => d.dealer_name && d.dealer_code);
    
    if (validDealers.length === 0) {
      // Provide detailed error message with found columns
      const sampleColumns = data.length > 0 ? Object.keys(data[0]) : [];
      const sampleRow = data.length > 0 ? data[0] : {};
      
      return res.status(400).json({ 
        error: 'No valid dealers found in Excel file. Please check column names.',
        foundColumns: sampleColumns,
        totalRows: data.length,
        sampleData: Object.fromEntries(
          Object.entries(sampleRow).slice(0, 10).map(([key, value]) => [key, String(value).substring(0, 50)])
        ),
        message: `Found ${sampleColumns.length} columns: ${sampleColumns.slice(0, 10).join(', ')}${sampleColumns.length > 10 ? '...' : ''}. The system is looking for columns containing 'Dealer Name'/'Customer Name' and 'Dealer Code'/'Customer Code'.`
      });
    }
    
    console.log(`Successfully parsed ${validDealers.length} valid dealers from ${data.length} total rows`);
    
    // Step 1: Extract unique territories and insert them into territories table
    const uniqueTerritories = {};
    validDealers.forEach(d => {
      if (d.territory_name && d.territory_name.trim()) {
        const territoryName = d.territory_name.trim();
        if (!uniqueTerritories[territoryName]) {
          uniqueTerritories[territoryName] = {
            name: territoryName,
            code: d.territory_code && d.territory_code.trim() ? d.territory_code.trim() : null
          };
        }
      }
    });
    
    const territoriesArray = Object.values(uniqueTerritories);
    console.log(`Found ${territoriesArray.length} unique territories`);
    
    // Insert territories into territories table
    if (territoriesArray.length > 0) {
      const territoryInsertQuery = `INSERT IGNORE INTO territories (territory_code, territory_name) VALUES ?`;
      const territoryValues = territoriesArray.map(t => [t.code, t.name]);
      
      db.query(territoryInsertQuery, [territoryValues], (err) => {
        if (err) {
          console.error('Error inserting territories:', err);
          return res.status(500).json({ error: 'Failed to import territories: ' + err.message });
        }
        
        console.log(`✅ Inserted/updated ${territoriesArray.length} territories`);
        
        // Step 2: Get territory IDs from database
        const territoryNames = territoriesArray.map(t => t.name);
        const getTerritoryIdsQuery = `SELECT id, territory_name FROM territories WHERE territory_name IN (?)`;
        
        db.query(getTerritoryIdsQuery, [territoryNames], (err, territoryResults) => {
          if (err) {
            console.error('Error fetching territory IDs:', err);
            return res.status(500).json({ error: 'Failed to fetch territory IDs: ' + err.message });
          }
          
          // Create a map of territory_name -> territory_id
          const territoryMap = {};
          territoryResults.forEach(t => {
            territoryMap[t.territory_name] = t.id;
          });
          
          console.log(`✅ Mapped ${territoryResults.length} territories to IDs`);
          
          // Step 3: Insert dealers with territory_id
          const insertQuery = `INSERT IGNORE INTO dealers (dealer_name, dealer_code, contact_person, email, phone, address, territory_id, credit_days, status) 
                               VALUES ?`;
          
          const values = validDealers.map(d => {
            const territoryId = d.territory_name && d.territory_name.trim() 
              ? (territoryMap[d.territory_name.trim()] || null) 
              : null;
            
            return [
              d.dealer_name,
              d.dealer_code,
              d.contact_person || null,
              d.email || null,
              d.phone || null,
              d.address || null,
              territoryId,
              d.credit_days,
              d.status
            ];
          });
          
          db.query(insertQuery, [values], (err, results) => {
            if (err) {
              console.error('Error importing dealers:', err);
              return res.status(500).json({ error: 'Failed to import dealers: ' + err.message });
            }
            
            // For INSERT IGNORE, affectedRows shows how many rows were actually inserted
            const inserted = results.affectedRows;
            const skipped = validDealers.length - inserted;
            
            res.json({
              message: 'Dealers imported successfully',
              total: validDealers.length,
              inserted,
              skipped,
              territoriesProcessed: territoriesArray.length
            });
          });
        });
      });
    } else {
      // No territories found, insert dealers without territory_id
      const insertQuery = `INSERT IGNORE INTO dealers (dealer_name, dealer_code, contact_person, email, phone, address, territory_id, credit_days, status) 
                           VALUES ?`;
      
      const values = validDealers.map(d => [
        d.dealer_name,
        d.dealer_code,
        d.contact_person || null,
        d.email || null,
        d.phone || null,
        d.address || null,
        null, // no territory_id
        d.credit_days,
        d.status
      ]);
      
      db.query(insertQuery, [values], (err, results) => {
        if (err) {
          console.error('Error importing dealers:', err);
          return res.status(500).json({ error: 'Failed to import dealers: ' + err.message });
        }
        
        const inserted = results.affectedRows;
        const skipped = validDealers.length - inserted;
        
        res.json({
          message: 'Dealers imported successfully (no territories found)',
          total: validDealers.length,
          inserted,
          skipped
        });
      });
    }
    
  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file: ' + error.message });
  }
});

// Update dealer
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { dealer_name, dealer_code, contact_person, email, phone, address, territory, credit_days, status } = req.body;
  
  const query = `UPDATE dealers 
                 SET dealer_name = ?, dealer_code = ?, contact_person = ?, email = ?, phone = ?, address = ?, territory = ?, credit_days = ?, status = ?
                 WHERE id = ?`;
  
  const values = [
    dealer_name,
    dealer_code,
    contact_person || null,
    email || null,
    phone || null,
    address || null,
    territory || null,
    credit_days || 30,
    status || 'active',
    id
  ];
  
  db.query(query, values, (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Dealer code already exists' });
      }
      console.error('Error updating dealer:', err);
      return res.status(500).json({ error: 'Failed to update dealer' });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }
    res.json({ message: 'Dealer updated successfully' });
  });
});

// Delete dealer
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM dealers WHERE id = ?';
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error deleting dealer:', err);
      return res.status(500).json({ error: 'Failed to delete dealer' });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }
    res.json({ message: 'Dealer deleted successfully' });
  });
});

// Delete all dealers (this will also delete all delinquent records due to CASCADE)
router.delete('/clear/all', (req, res) => {
  const query = 'DELETE FROM dealers';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error deleting all dealers:', err);
      return res.status(500).json({ error: 'Failed to delete all dealers' });
    }
    res.json({ 
      message: 'All dealers deleted successfully. All related delinquent records have also been deleted.',
      deleted: results.affectedRows
    });
  });
});

module.exports = router;
