const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db');

// Configure multer for file uploads (for future use)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to normalize dealer code
const normalizeDealerCode = (code) => {
  if (!code) return '';
  const str = String(code).trim();
  return str.replace(/^0+/, '') || '0';
};

// Helper function to get days in month
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

// Calculate and get overdue report
router.get('/report', (req, res) => {
  const { year, month, territory } = req.query;
  
  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // For overdue_report data, we want to show the most recent upload for each dealer
  // So we'll get the latest current_date for each dealer
  
  // Main query to get overdue report
  // Show all uploaded overdue_report data
  // Use INNER JOIN to only show dealers with uploaded overdue data
  const query = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      COALESCE(d.lower_limit, 0) as lower_limit,
      COALESCE(d.upper_limit, 0) as upper_limit,
      -- Use uploaded overdue amounts
      COALESCE(ovr.lower_limit_overdue, 0) as lower_limit_overdue,
      COALESCE(ovr.upper_limit_overdue, 0) as upper_limit_overdue,
      -- Additional info from uploaded data
      ovr.year,
      ovr.month,
      ovr.\`current_date\` as report_date,
      ovr.days_into_month,
      -- Target and achievement (for reference, only if filters are set)
      COALESCE(fc.target_amount, abp.target_amount, 0) as target_amount,
      COALESCE(ach.achievement_amount, 0) as achievement_amount
    FROM overdue_report ovr
    INNER JOIN dealers d ON BINARY d.dealer_code = BINARY ovr.dealer_code
    LEFT JOIN territories t ON d.territory_id = t.id
    -- Optional joins for target/achievement (only used if year/month filters are set)
    LEFT JOIN abp_targets abp ON BINARY d.dealer_code = BINARY abp.dealer_code
      AND abp.year = ? AND abp.month = ?
    LEFT JOIN forecast_targets fc ON BINARY d.dealer_code = BINARY fc.dealer_code
      AND fc.year = ? AND fc.month = ?
    LEFT JOIN achievements ach ON BINARY d.dealer_code = BINARY ach.dealer_code
      AND ach.year = ? AND ach.month = ?
    ${whereClause}
    ORDER BY 
      ovr.\`current_date\` DESC,
      CASE 
        WHEN COALESCE(ovr.lower_limit_overdue, 0) > 0 THEN 0
        ELSE 1
      END,
      d.dealer_name ASC
  `;
  
  // Use current date for optional target/achievement joins (if filters are set)
  const currentDate = new Date();
  const reportYear = year ? parseInt(year) : currentDate.getFullYear();
  const reportMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
  
  const params = [
    reportYear, reportMonth,  // abp join (optional)
    reportYear, reportMonth,  // fc join (optional)
    reportYear, reportMonth,  // ach join (optional)
    ...queryParams
  ];
  
  // First, get the most recent current_date (To Date) from overdue_report
  const getLatestDateQuery = `SELECT MAX(\`current_date\`) as latest_date FROM overdue_report`;
  
  db.query(getLatestDateQuery, (dateErr, dateResults) => {
    let latestDate = null;
    
    if (dateErr) {
      console.error('Error fetching latest date:', dateErr);
      // Continue even if date query fails
    } else if (dateResults && dateResults.length > 0 && dateResults[0].latest_date) {
      latestDate = dateResults[0].latest_date;
    }
  
    // Now fetch the main report data
    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error fetching overdue report:', err);
        console.error('Query:', query);
        console.error('Params:', params);
        console.error('Error code:', err.code);
        console.error('Error SQL state:', err.sqlState);
        console.error('Full error:', JSON.stringify(err, null, 2));
        
        // Check if it's a table not found error
        if (err.message && (err.message.includes('doesn\'t exist') || err.message.includes('Unknown table'))) {
          return res.status(500).json({ 
            error: 'Database table missing', 
            details: 'overdue_report table does not exist. Please run: node server/create-overdue-report-table.js',
            sqlError: err.message
          });
        }
      
      // Check if it's a column not found error
      if (err.message && err.message.includes('Unknown column')) {
        return res.status(500).json({ 
          error: 'Database columns missing', 
          details: 'Some columns are missing. Please check the database schema.',
          sqlError: err.message
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to fetch overdue report', 
        details: err.message,
        code: err.code,
        sqlState: err.sqlState
      });
    }
    
    // Handle empty results gracefully
    const data = results || [];
    
    res.json({
      success: true,
      data: data,
      latestDate: latestDate, // Most recent "To Date" from overdue_report
      summary: {
        total_dealers: data.length,
        lower_limit_overdue_count: data.filter(r => parseFloat(r.lower_limit_overdue || 0) > 0).length,
        upper_limit_overdue_count: data.filter(r => parseFloat(r.upper_limit_overdue || 0) > 0).length,
        total_lower_limit_overdue: data.reduce((sum, r) => sum + parseFloat(r.lower_limit_overdue || 0), 0),
        total_upper_limit_overdue: data.reduce((sum, r) => sum + parseFloat(r.upper_limit_overdue || 0), 0)
      }
    });
  });
  });
});

// Update dealer limits
router.put('/limits/:dealerCode', (req, res) => {
  const { dealerCode } = req.params;
  const { lower_limit, upper_limit } = req.body;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  if (lower_limit === undefined || upper_limit === undefined) {
    return res.status(400).json({ error: 'Both lower_limit and upper_limit are required' });
  }
  
  if (parseFloat(lower_limit) < 0 || parseFloat(upper_limit) < 0) {
    return res.status(400).json({ error: 'Limits must be non-negative' });
  }
  
  if (parseFloat(lower_limit) > parseFloat(upper_limit) && parseFloat(upper_limit) > 0) {
    return res.status(400).json({ error: 'Lower limit cannot exceed upper limit' });
  }
  
  const query = 'UPDATE dealers SET lower_limit = ?, upper_limit = ? WHERE dealer_code = ?';
  db.query(query, [parseFloat(lower_limit), parseFloat(upper_limit), normalizedCode], (err, result) => {
    if (err) {
      console.error('Error updating dealer limits:', err);
      return res.status(500).json({ error: 'Failed to update dealer limits', details: err.message });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }
    
    res.json({
      success: true,
      message: 'Dealer limits updated successfully'
    });
  });
});

// Export overdue report to Excel
router.get('/export', (req, res) => {
  const { year, month, territory } = req.query;
  
  // Use current date if not specified
  const currentDate = new Date();
  const reportYear = year ? parseInt(year) : currentDate.getFullYear();
  const reportMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
  
  // Calculate previous month
  let prevYear = reportYear;
  let prevMonth = reportMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = reportYear - 1;
  }
  
  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // Same query as report endpoint
  const query = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      COALESCE(d.lower_limit, 0) as lower_limit,
      COALESCE(d.upper_limit, 0) as upper_limit,
      COALESCE(fc.target_amount, abp.target_amount, 0) as target_amount,
      COALESCE(ach.achievement_amount, 0) as achievement_amount,
      CASE 
        WHEN COALESCE(prev_ach.achievement_amount, 0) < COALESCE(d.lower_limit, 0) THEN
          COALESCE(d.lower_limit, 0) - COALESCE(prev_ach.achievement_amount, 0)
        ELSE 0
      END as lower_limit_overdue,
      CASE 
        WHEN COALESCE(ach.achievement_amount, 0) > COALESCE(d.upper_limit, 0) AND COALESCE(d.upper_limit, 0) > 0 THEN
          COALESCE(ach.achievement_amount, 0) - COALESCE(d.upper_limit, 0)
        ELSE 0
      END as upper_limit_overdue,
      ${reportYear} as year,
      ${reportMonth} as month
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN abp_targets abp ON d.dealer_code = abp.dealer_code 
      AND abp.year = ? AND abp.month = ?
    LEFT JOIN forecast_targets fc ON d.dealer_code = fc.dealer_code 
      AND fc.year = ? AND fc.month = ?
    LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code 
      AND ach.year = ? AND ach.month = ?
    LEFT JOIN achievements prev_ach ON d.dealer_code = prev_ach.dealer_code 
      AND prev_ach.year = ? AND prev_ach.month = ?
    ${whereClause}
    AND (d.lower_limit > 0 OR d.upper_limit > 0)
    ORDER BY 
      CASE 
        WHEN COALESCE(prev_ach.achievement_amount, 0) < COALESCE(d.lower_limit, 0) THEN 0
        ELSE 1
      END,
      d.dealer_name ASC
  `;
  
  const params = [
    reportYear, reportMonth,  // abp join
    reportYear, reportMonth,  // fc join
    reportYear, reportMonth,  // ach join
    prevYear, prevMonth,       // prev_ach join
    ...queryParams
  ];
  
  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching export data:', err);
      return res.status(500).json({ error: 'Failed to export report', details: err.message });
    }
    
    // Create Excel workbook
    const workbook = xlsx.utils.book_new();
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const worksheetData = [
      ['Dealer Code', 'Dealer Name', 'Territory', 'Year', 'Month', 'Lower Limit', 'Upper Limit', 'Target', 'Achievement', 'Lower Limit Overdue', 'Upper Limit Overdue']
    ];
    
    results.forEach(row => {
      worksheetData.push([
        row.dealer_code,
        row.dealer_name,
        row.territory_name || 'N/A',
        row.year,
        monthNames[row.month] || row.month,
        parseFloat(row.lower_limit || 0),
        parseFloat(row.upper_limit || 0),
        parseFloat(row.target_amount || 0),
        parseFloat(row.achievement_amount || 0),
        parseFloat(row.lower_limit_overdue || 0),
        parseFloat(row.upper_limit_overdue || 0)
      ]);
    });
    
    const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Overdue Report');
    
    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    const filename = `overdue_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });
});

// Upload Payment Overdue Report from Excel
// File format: Header row at row 8 (index 7), contains: Dealer ID, Lower overdue amount, Upper overdue amount
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check if user uploaded a lock file (starts with ~$)
  if (req.file.originalname.startsWith('~$')) {
    return res.status(400).json({ 
      error: 'Lock file detected',
      details: 'You uploaded a temporary lock file (~$). Please close Excel and upload the actual file without ~$ prefix.',
      uploadedFile: req.file.originalname
    });
  }

  try {
    console.log('Overdue Upload - File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'File buffer is empty. Please try uploading the file again.' });
    }
    
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      return res.status(400).json({ error: 'Could not read worksheet from file.' });
    }
    
    // Use sheet_to_json with header: 1 to get arrays (not objects)
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    
    console.log('Overdue Upload - Total rows read:', data.length);
    
    if (data.length < 8) {
      return res.status(400).json({ error: 'Invalid file format. Expected at least 8 rows (header at row 8).', received: data.length });
    }
    
    // Row 8 (index 7) contains headers
    const headerRow = data[7];
    
    if (!Array.isArray(headerRow)) {
      return res.status(400).json({ 
        error: 'File format error: Could not read header row as array.',
        details: 'Please ensure the file is a valid Excel file with headers at row 8.'
      });
    }
    
    console.log('Overdue Upload - Header row length:', headerRow.length);
    console.log('Overdue Upload - Header row:', headerRow);
    
    // Find column indices for: Dealer ID, Lower overdue amount, Upper overdue amount
    let dealerIdCol = -1;
    let lowerOverdueCol = -1;
    let upperOverdueCol = -1;
    
    // Flexible column finding (case-insensitive, handles typos)
    for (let i = 0; i < headerRow.length; i++) {
      const cell = String(headerRow[i] || '').trim().toLowerCase();
      
      // Find Dealer ID column (could be "Dealer ID", "Dealer Code", "Dealer Code/ID", etc.)
      if (dealerIdCol === -1 && (
        cell.includes('dealer') && (cell.includes('id') || cell.includes('code'))
      )) {
        dealerIdCol = i;
        console.log(`Overdue Upload - Found Dealer ID column at index ${i}: "${headerRow[i]}"`);
      }
      
      // Find Lower overdue amount column
      if (lowerOverdueCol === -1 && (
        cell.includes('lower') && (cell.includes('overdue') || cell.includes('over due'))
      )) {
        lowerOverdueCol = i;
        console.log(`Overdue Upload - Found Lower Overdue column at index ${i}: "${headerRow[i]}"`);
      }
      
      // Find Upper overdue amount column
      if (upperOverdueCol === -1 && (
        cell.includes('upper') && (cell.includes('overdue') || cell.includes('over due'))
      )) {
        upperOverdueCol = i;
        console.log(`Overdue Upload - Found Upper Overdue column at index ${i}: "${headerRow[i]}"`);
      }
    }
    
    // Validate that all required columns were found
    if (dealerIdCol === -1) {
      return res.status(400).json({ 
        error: 'Could not find "Dealer ID" or "Dealer Code" column in row 8.',
        details: 'Please ensure the file has a header row at row 8 with columns: Dealer ID, Lower overdue amount, Upper overdue amount.'
      });
    }
    
    if (lowerOverdueCol === -1) {
      return res.status(400).json({ 
        error: 'Could not find "Lower overdue amount" column in row 8.',
        details: 'Please ensure the file has a header row at row 8 with columns: Dealer ID, Lower overdue amount, Upper overdue amount.'
      });
    }
    
    if (upperOverdueCol === -1) {
      return res.status(400).json({ 
        error: 'Could not find "Upper overdue amount" column in row 8.',
        details: 'Please ensure the file has a header row at row 8 with columns: Dealer ID, Lower overdue amount, Upper overdue amount.'
      });
    }
    
    // Extract "To Date" from cell A5 (row 5, index 4, column A, index 0)
    let toDate = null;
    let currentDate = new Date(); // Default to current date if A5 is not found
    
    if (data.length > 4 && Array.isArray(data[4]) && data[4][0]) {
      const a5Value = String(data[4][0]).trim();
      console.log('Overdue Upload - Cell A5 value:', a5Value);
      
      // Try to parse the date from A5
      // Could be in various formats: "To Date: 15/12/2025", "15/12/2025", "2025-12-15", etc.
      const dateMatch = a5Value.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
      if (dateMatch) {
        const dateStr = dateMatch[1];
        // Try parsing different date formats
        const dateParts = dateStr.split(/[\/\-]/);
        if (dateParts.length === 3) {
          let day, month, year;
          // Try DD/MM/YYYY or DD-MM-YYYY format
          if (dateParts[2].length === 4) {
            day = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]);
            year = parseInt(dateParts[2]);
          } else {
            // Try YYYY-MM-DD format
            year = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]);
            day = parseInt(dateParts[2]);
          }
          
          if (day && month && year) {
            currentDate = new Date(year, month - 1, day);
            toDate = currentDate;
            console.log('Overdue Upload - Parsed To Date from A5:', currentDate.toISOString().split('T')[0]);
          }
        }
      } else {
        // Try direct date parsing
        const parsedDate = new Date(a5Value);
        if (!isNaN(parsedDate.getTime())) {
          currentDate = parsedDate;
          toDate = currentDate;
          console.log('Overdue Upload - Parsed To Date from A5 (direct):', currentDate.toISOString().split('T')[0]);
        }
      }
    }
    
    if (!toDate) {
      console.log('Overdue Upload - Could not parse To Date from A5, using current date');
    }
    
    const reportYear = currentDate.getFullYear();
    const reportMonth = currentDate.getMonth() + 1;
    const daysIntoMonth = currentDate.getDate();
    
    const records = [];
    const missingDealers = [];
    const errors = [];
    
    console.log(`Overdue Upload - Processing ${data.length - 8} potential data rows`);
    
    for (let i = 8; i < data.length; i++) {
      const row = data[i];
      
      if (!Array.isArray(row) || row.length === 0) {
        continue; // Skip empty rows
      }
      
      const dealerCodeRaw = row[dealerIdCol];
      const lowerOverdueRaw = row[lowerOverdueCol];
      const upperOverdueRaw = row[upperOverdueCol];
      
      // Skip if dealer code is empty
      if (!dealerCodeRaw || String(dealerCodeRaw).trim() === '') {
        continue;
      }
      
      const dealerCode = normalizeDealerCode(dealerCodeRaw);
      const originalCode = String(dealerCodeRaw || '').trim();
      const lowerOverdue = parseFloat(String(lowerOverdueRaw || '0').replace(/,/g, '')) || 0;
      const upperOverdue = parseFloat(String(upperOverdueRaw || '0').replace(/,/g, '')) || 0;
      
      // Log first few records for debugging
      if (records.length < 10) {
        console.log(`Overdue Upload - Record ${records.length + 1}: Raw Code="${dealerCodeRaw}" (type: ${typeof dealerCodeRaw}), Original="${originalCode}", Normalized="${dealerCode}", Lower=${lowerOverdue}, Upper=${upperOverdue}`);
      }
      
      // Verify dealer exists
      records.push({
        dealerCode,
        originalCode,
        lowerOverdue,
        upperOverdue,
        rowIndex: i + 1
      });
    }
    
    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'No valid data found in the file.',
        details: 'Please ensure the file has data rows starting from row 9 with valid dealer codes.'
      });
    }
    
    console.log(`Overdue Upload - Total records parsed: ${records.length}`);
    console.log(`Overdue Upload - Sample dealer codes (first 10): ${records.slice(0, 10).map(r => r.dealerCode).join(', ')}`);
    
    // Check what dealer codes exist in database (sample and count)
    db.query('SELECT dealer_code FROM dealers LIMIT 20', (err, dbDealers) => {
      if (!err) {
        if (dbDealers.length > 0) {
          console.log(`Overdue Upload - Sample dealer codes in database (first 20): ${dbDealers.map(d => d.dealer_code).join(', ')}`);
        } else {
          console.log(`Overdue Upload - WARNING: No dealers found in database! Please import dealers first.`);
        }
      }
    });
    
    // Also get total count
    db.query('SELECT COUNT(*) as total FROM dealers', (err, countResult) => {
      if (!err && countResult.length > 0) {
        console.log(`Overdue Upload - Total dealers in database: ${countResult[0].total}`);
      }
    });
    
    // Update overdue_report table with current date
    let successCount = 0;
    let errorCount = 0;
    const updatePromises = [];
    
    console.log(`Overdue Upload - Found ${records.length} records to process`);
    
    records.forEach((record) => {
      const updatePromise = new Promise((resolve) => {
        // First, verify dealer exists - try multiple formats
        const normalizedCode = record.dealerCode;
        const originalCode = record.originalCode || normalizedCode;
        
        // Try multiple matching strategies:
        // Since dealer codes in DB might have leading zeros (0419) but Excel has (419),
        // we need to normalize both sides for comparison
        // Strategy: Use MySQL's CAST or string functions to normalize dealer_code in DB
        // and compare with normalized code from Excel
        
        // Try exact match first (in case format matches)
        // Then try normalized match (remove leading zeros from DB codes)
        const query = `
          SELECT dealer_code 
          FROM dealers 
          WHERE dealer_code = ? 
             OR CAST(dealer_code AS UNSIGNED) = CAST(? AS UNSIGNED)
             OR TRIM(LEADING '0' FROM dealer_code) = ?
             OR dealer_code = ?
        `;
        
        // Try: exact match, numeric match, normalized match, and original code
        const codesToTry = [
          normalizedCode,  // For exact match if DB has same format
          normalizedCode,  // For CAST comparison (numeric)
          normalizedCode,  // For TRIM comparison (normalized)
          originalCode     // For exact match with original format
        ];
        
        db.query(query, codesToTry, (err, dealerResult) => {
            if (err) {
              console.error(`Error checking dealer ${normalizedCode}:`, err);
              errors.push(`Row ${record.rowIndex}: Database error checking dealer ${normalizedCode}`);
              errorCount++;
              resolve();
              return;
            }
            
            if (dealerResult.length === 0) {
              // Log first few missing dealers for debugging
              if (missingDealers.length < 5) {
                console.log(`Overdue Upload - Dealer "${normalizedCode}" (original: "${originalCode}") not found in database`);
              }
              missingDealers.push(normalizedCode);
              errorCount++;
              resolve();
              return;
            }
            
            // Use the actual dealer code from database (in case of case sensitivity or formatting differences)
            const actualDealerCode = dealerResult[0].dealer_code;
            
            // Update or insert into overdue_report table
            // First check if record exists, then UPDATE or INSERT
            const checkQuery = `SELECT id FROM overdue_report WHERE dealer_code = ? AND year = ? AND month = ?`;
            
            db.query(checkQuery, [actualDealerCode, reportYear, reportMonth], (checkErr, checkResult) => {
            if (checkErr) {
              console.error(`Error checking existing record for dealer ${record.dealerCode}:`, checkErr);
              errors.push(`Row ${record.rowIndex}: Database error checking existing record for dealer ${record.dealerCode}`);
              errorCount++;
              resolve();
              return;
            }
            
            const currentDateStr = currentDate.toISOString().split('T')[0];
            
            if (checkResult.length > 0) {
              // Update existing record
              const updateQuery = `
                UPDATE overdue_report 
                SET lower_limit_overdue = ?,
                    upper_limit_overdue = ?,
                    \`current_date\` = ?,
                    days_into_month = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE dealer_code = ? AND year = ? AND month = ?
              `;
              
              const updateParams = [
                record.lowerOverdue,
                record.upperOverdue,
                currentDateStr,
                daysIntoMonth,
                actualDealerCode,
                reportYear,
                reportMonth
              ];
              
              console.log(`Overdue Upload - Updating existing record for dealer ${actualDealerCode} (matched from ${normalizedCode}) with lower: ${record.lowerOverdue}, upper: ${record.upperOverdue}`);
              
              db.query(updateQuery, updateParams, (updateErr, updateResult) => {
                if (updateErr) {
                  console.error(`Error updating overdue for dealer ${record.dealerCode}:`, updateErr);
                  console.error(`Query: ${updateQuery}`);
                  console.error(`Params:`, updateParams);
                  errors.push(`Row ${record.rowIndex}: Failed to update dealer ${record.dealerCode} - ${updateErr.message}`);
                  errorCount++;
                } else {
                  console.log(`Overdue Upload - Successfully updated dealer ${record.dealerCode}, affected rows: ${updateResult.affectedRows}`);
                  successCount++;
                }
                resolve();
              });
            } else {
              // Insert new record
              const insertQuery = `
                INSERT INTO overdue_report 
                (dealer_code, year, month, lower_limit_overdue, upper_limit_overdue, \`current_date\`, days_into_month, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              `;
              
              const insertParams = [
                actualDealerCode,
                reportYear,
                reportMonth,
                record.lowerOverdue,
                record.upperOverdue,
                currentDateStr,
                daysIntoMonth
              ];
              
              console.log(`Overdue Upload - Inserting new record for dealer ${actualDealerCode} (matched from ${normalizedCode}) with lower: ${record.lowerOverdue}, upper: ${record.upperOverdue}`);
              
              db.query(insertQuery, insertParams, (insertErr, insertResult) => {
                if (insertErr) {
                  console.error(`Error inserting overdue for dealer ${record.dealerCode}:`, insertErr);
                  console.error(`Query: ${insertQuery}`);
                  console.error(`Params:`, insertParams);
                  errors.push(`Row ${record.rowIndex}: Failed to insert dealer ${record.dealerCode} - ${insertErr.message}`);
                  errorCount++;
                } else {
                  console.log(`Overdue Upload - Successfully inserted dealer ${record.dealerCode}, affected rows: ${insertResult.affectedRows}`);
                  successCount++;
                }
                resolve();
              });
            }
          });
        });
      });
      
      updatePromises.push(updatePromise);
    });
    
    // Wait for all updates to complete
    Promise.all(updatePromises).then(() => {
      const response = {
        success: true,
        message: `Overdue report uploaded successfully.`,
        summary: {
          total_records: records.length,
          success_count: successCount,
          error_count: errorCount,
          missing_dealers_count: missingDealers.length
        }
      };
      
      if (missingDealers.length > 0) {
        if (missingDealers.length === records.length) {
          response.warning = `ALL dealer codes in the file do not exist in the database. Please ensure dealers are imported first via Dealer Management module.`;
          response.suggestion = `Sample dealer codes from file: ${missingDealers.slice(0, 10).join(', ')}. Check if these match the dealer codes in your Dealer Management module.`;
        } else {
          response.warning = `Some dealer codes in the file do not exist in the system: ${missingDealers.slice(0, 10).join(', ')}${missingDealers.length > 10 ? '...' : ''}`;
        }
        response.missing_dealers = missingDealers;
      }
      
      if (errors.length > 0 && errors.length <= 20) {
        response.errors = errors;
      } else if (errors.length > 20) {
        response.errors = errors.slice(0, 20);
        response.more_errors = errors.length - 20;
      }
      
      res.json(response);
    });
    
  } catch (error) {
    console.error('Error processing overdue upload:', error);
    res.status(500).json({ 
      error: 'Failed to process file', 
      details: error.message 
    });
  }
});

// Bulk update dealer limits from Excel
// TODO: Implement Excel upload for dealer limits
// router.post('/limits/upload', upload.single('file'), (req, res) => {
//   // Similar to other upload endpoints - would need to parse Excel with dealer_code, lower_limit, upper_limit columns
//   // Implementation similar to targets upload
// });

module.exports = router;
