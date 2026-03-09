const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db');
const { authenticateToken, authorize, hasPermission, canAccessDealerData } = require('../middleware/auth');

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
// Overdue Calculation Logic:
// 1. Lower Limit Overdue = closing_balance - lower_limit
//    - Checked on FIRST DAY of billing cycle
//    - Positive value = Violation (balance above lower limit on day 1)
//    - Negative value = No violation (balance below lower limit on day 1)
// 2. Upper Limit Overdue = closing_balance - upper_limit
//    - Monitored DURING the entire billing cycle
//    - Positive value = Violation (balance exceeded upper limit)
//    - Negative value = No violation (balance within upper limit)
router.get('/report', authenticateToken, canAccessDealerData, (req, res) => {
  const { year, month, territory } = req.query;
  
  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  // If dealer role, only show their own data
  if (req.user.role_name === 'dealer' && req.user.dealer_code) {
    whereClause += ' AND BINARY d.dealer_code = ?';
    queryParams.push(req.user.dealer_code);
  }
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // Only show dealers with limits set
  whereClause += ' AND (d.lower_limit > 0 OR d.upper_limit > 0)';
  
  // Main query to get overdue report from overdue_report table (calculated values)
  // This table is populated by the calculate-balance endpoint
  // If no overdue_report records exist, calculate on-the-fly from closing_balance
  const query = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      COALESCE(ovr.lower_limit, d.lower_limit, 0) as lower_limit,
      COALESCE(ovr.upper_limit, d.upper_limit, 0) as upper_limit,
      COALESCE(d.closing_balance, 0) as closing_balance,
      -- Use calculated overdue from overdue_report table if exists, otherwise calculate from closing_balance
      -- Lower Overdue = closing_balance - lower_limit
      -- Upper Overdue = closing_balance - upper_limit
      COALESCE(ovr.lower_limit_overdue, 
        COALESCE(d.closing_balance, 0) - COALESCE(d.lower_limit, 0), 0) as lower_limit_overdue,
      COALESCE(ovr.upper_limit_overdue,
        COALESCE(d.closing_balance, 0) - COALESCE(d.upper_limit, 0), 0) as upper_limit_overdue,
      -- Check if dealer is close to lower limit in last week of cycle
      -- Always uses CURRENT DATE (CURDATE()) to determine if we're in the last week
      -- Close = balance is within 20% or 10,000 (whichever is smaller) above lower limit
      -- Last week = 7 days or less remaining in billing cycle from current date
      CASE 
        WHEN COALESCE(d.closing_balance, 0) >= COALESCE(d.lower_limit, 0) 
          AND COALESCE(d.closing_balance, 0) <= COALESCE(d.lower_limit, 0) + LEAST(COALESCE(d.lower_limit, 0) * 0.2, 10000)
          AND (
            -- Check if CURRENT DATE is in last week of cycle (7 days or less remaining)
            -- Standard cycle (1st to end of month): Check if today is within last 7 days of month
            (COALESCE(d.billing_cycle_start_day, 1) = 1 AND DAY(CURDATE()) >= DAY(LAST_DAY(CURDATE())) - 6)
            OR
            -- Custom cycle (e.g., 26th to 25th): Check if today is within last 7 days before cycle end
            (COALESCE(d.billing_cycle_start_day, 1) > 1 AND (
              -- If we're past cycle start day in current month, check if within last 7 days of month
              (DAY(CURDATE()) >= COALESCE(d.billing_cycle_start_day, 1) AND DAY(CURDATE()) >= DAY(LAST_DAY(CURDATE())) - 6)
              OR
              -- If we're before cycle start day (in next cycle), check if within 7 days before cycle start
              (DAY(CURDATE()) < COALESCE(d.billing_cycle_start_day, 1) AND DAY(CURDATE()) >= COALESCE(d.billing_cycle_start_day, 1) - 7)
            ))
          )
        THEN 1
        ELSE 0
      END as close_to_lower_limit_last_week,
      -- Additional info
      ovr.year,
      ovr.month,
      COALESCE(ovr.\`current_date\`, CURDATE()) as report_date,
      ovr.days_into_month,
      -- Optional: Target and achievement (for reference, only if filters are set)
      COALESCE(fc.target_amount, abp.target_amount, 0) as target_amount,
      COALESCE(ach.achievement_amount, 0) as achievement_amount
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN overdue_report ovr ON BINARY d.dealer_code = BINARY ovr.dealer_code
    -- Optional joins for target/achievement (only used if year/month filters are set)
    LEFT JOIN abp_targets abp ON BINARY d.dealer_code = BINARY abp.dealer_code
      AND abp.year = ? AND abp.month = ?
    LEFT JOIN forecast_targets fc ON BINARY d.dealer_code = BINARY fc.dealer_code
      AND fc.year = ? AND fc.month = ?
    LEFT JOIN achievements ach ON BINARY d.dealer_code = BINARY ach.dealer_code
      AND ach.year = ? AND ach.month = ?
    ${whereClause}
    ORDER BY 
      CASE 
        WHEN COALESCE(ovr.lower_limit_overdue, 
          COALESCE(d.closing_balance, 0) - COALESCE(d.lower_limit, 0), 0) < 0 THEN 0
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
  
  // Get the most recent calculation date from overdue_report (current_date field)
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
        return res.status(500).json({ 
          error: 'Failed to fetch overdue report', 
          details: err.message
        });
      }
    
      // Handle empty results gracefully
      const data = results || [];
      
      res.json({
        success: true,
        data: data,
        latestDate: latestDate, // Most recent balance calculation date
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

// Update dealer limits (Admin, Sales Official, Sales Manager only)
router.put('/limits/:dealerCode', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), (req, res) => {
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
  
  // Try multiple matching strategies to handle leading zeros
  // First, try to find the dealer with flexible matching
  const findDealerQuery = `
    SELECT dealer_code 
    FROM dealers 
    WHERE dealer_code = ? 
       OR dealer_code = ?
       OR CAST(dealer_code AS UNSIGNED) = CAST(? AS UNSIGNED)
       OR TRIM(LEADING '0' FROM dealer_code) = ?
    LIMIT 1
  `;
  
  db.query(findDealerQuery, [dealerCode, normalizedCode, normalizedCode, normalizedCode], (findErr, dealerResults) => {
    if (findErr) {
      console.error('Error finding dealer:', findErr);
      return res.status(500).json({ error: 'Failed to find dealer', details: findErr.message });
    }
    
    if (dealerResults.length === 0) {
      return res.status(404).json({ error: 'Dealer not found' });
    }
    
    const actualDealerCode = dealerResults[0].dealer_code;
    
    // Now update using the actual dealer code from database
    const updateQuery = 'UPDATE dealers SET lower_limit = ?, upper_limit = ? WHERE dealer_code = ?';
    db.query(updateQuery, [parseFloat(lower_limit), parseFloat(upper_limit), actualDealerCode], (err, result) => {
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

// Upload Opening/Closing Balance from Territory Wise Sales & Collection Excel
// File format: Row 8 = headers, Column B = Customer Code (Dealer Code), Column W = Closing Balance
router.post('/upload-balance', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check if user uploaded a lock file
  if (req.file.originalname.startsWith('~$')) {
    return res.status(400).json({ 
      error: 'Lock file detected',
      details: 'You uploaded a temporary lock file (~$). Please close Excel and upload the actual file without ~$ prefix.',
      uploadedFile: req.file.originalname
    });
  }

  try {
    console.log('Balance Upload - File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    
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
    
    console.log('Balance Upload - Total rows read:', data.length);
    
    if (data.length < 9) {
      return res.status(400).json({ 
        error: 'Invalid file format. Expected at least 9 rows (header at row 8, data from row 9).', 
        received: data.length 
      });
    }
    
    // Row 8 (index 7) contains headers
    const headerRow = data[7];
    
    if (!Array.isArray(headerRow)) {
      return res.status(400).json({ 
        error: 'File format error: Could not read header row as array.',
        details: 'Please ensure the file is a valid Excel file with headers at row 8.'
      });
    }
    
    // Column B (index 1) = Customer Code (Dealer Code)
    // Column W (index 22) = Closing Balance
    const dealerCodeColIndex = 1; // Column B
    const closingBalanceColIndex = 22; // Column W
    
    console.log('Balance Upload - Header row length:', headerRow.length);
    console.log('Balance Upload - Column B (index 1):', headerRow[dealerCodeColIndex]);
    console.log('Balance Upload - Column W (index 22):', headerRow[closingBalanceColIndex]);
    
    // Validate headers
    const dealerCodeHeader = String(headerRow[dealerCodeColIndex] || '').trim();
    const closingBalanceHeader = String(headerRow[closingBalanceColIndex] || '').trim();
    
    if (!dealerCodeHeader.toLowerCase().includes('customer code') && 
        !dealerCodeHeader.toLowerCase().includes('dealer code')) {
      console.warn('Balance Upload - Warning: Column B header is not "Customer Code" or "Dealer Code". Found:', dealerCodeHeader);
    }
    
    if (!closingBalanceHeader.toLowerCase().includes('closing balance')) {
      return res.status(400).json({ 
        error: 'Could not find "Closing Balance" column in column W (index 22).',
        details: `Found header: "${closingBalanceHeader}". Expected "Closing Balance" in column W.`
      });
    }
    
    const records = [];
    const missingDealers = [];
    const errors = [];
    
    console.log(`Balance Upload - Processing ${data.length - 8} potential data rows`);
    
    // Process data rows starting from row 9 (index 8)
    for (let i = 8; i < data.length; i++) {
      const row = data[i];
      
      if (!Array.isArray(row) || row.length === 0) {
        continue; // Skip empty rows
      }
      
      const dealerCodeRaw = row[dealerCodeColIndex];
      const closingBalanceRaw = row[closingBalanceColIndex];
      
      // Skip if dealer code is empty
      if (!dealerCodeRaw || String(dealerCodeRaw).trim() === '') {
        continue;
      }
      
      // Normalize dealer code (handle leading zeros)
      const dealerCode = normalizeDealerCode(dealerCodeRaw);
      const originalCode = String(dealerCodeRaw || '').trim();
      
      // Parse closing balance
      let closingBalance = 0;
      if (closingBalanceRaw !== undefined && closingBalanceRaw !== null && closingBalanceRaw !== '') {
        const balanceStr = String(closingBalanceRaw).replace(/,/g, '').trim();
        closingBalance = parseFloat(balanceStr) || 0;
      }
      
      // Log first few records for debugging
      if (records.length < 10) {
        console.log(`Balance Upload - Record ${records.length + 1}: Raw Code="${dealerCodeRaw}", Normalized="${dealerCode}", Closing Balance=${closingBalance}`);
      }
      
      records.push({
        dealerCode,
        originalCode,
        closingBalance,
        rowIndex: i + 1
      });
    }
    
    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'No valid data found in the file.',
        details: 'Please ensure the file has data rows starting from row 9 with valid dealer codes and closing balances.'
      });
    }
    
    console.log(`Balance Upload - Total records parsed: ${records.length}`);
    console.log(`Balance Upload - Sample dealer codes (first 10): ${records.slice(0, 10).map(r => r.dealerCode).join(', ')}`);
    
    // Update dealers table with opening and closing balances
    // Opening balance = Closing balance (for initial setup, they're the same)
    let successCount = 0;
    let errorCount = 0;
    const updatePromises = [];
    
    console.log(`Balance Upload - Found ${records.length} records to process`);
    
    records.forEach((record) => {
      const updatePromise = new Promise((resolve) => {
        // Verify dealer exists - try multiple matching strategies
        const normalizedCode = record.dealerCode;
        const originalCode = record.originalCode || normalizedCode;
        
        // Try multiple matching strategies:
        // 1. Exact match (normalized)
        // 2. Numeric match (CAST to number)
        // 3. Normalized match (TRIM leading zeros)
        // 4. Original code match
        const dealerQuery = `
          SELECT dealer_code 
          FROM dealers 
          WHERE BINARY dealer_code = ?
             OR CAST(dealer_code AS UNSIGNED) = CAST(? AS UNSIGNED)
             OR TRIM(LEADING '0' FROM dealer_code) = ?
             OR dealer_code = ?
          LIMIT 1
        `;
        
        const codesToTry = [
          normalizedCode,  // For exact match if DB has same format
          normalizedCode,  // For CAST comparison (numeric)
          normalizedCode,  // For TRIM comparison (normalized)
          originalCode     // For exact match with original format
        ];
        
        db.query(dealerQuery, codesToTry, (err, dealerResult) => {
          if (err) {
            console.error(`Error checking dealer ${normalizedCode}:`, err);
            errors.push(`Row ${record.rowIndex}: Database error checking dealer ${normalizedCode}`);
            errorCount++;
            resolve();
            return;
          }
          
          if (dealerResult.length === 0) {
            // Log first few missing dealers for debugging
            if (missingDealers.length < 10) {
              console.log(`Balance Upload - Dealer "${normalizedCode}" (original: "${originalCode}") not found in database`);
            }
            missingDealers.push(normalizedCode);
            errorCount++;
            resolve();
            return;
          }
          
          // Use the actual dealer code from database
          const actualDealerCode = dealerResult[0].dealer_code;
          
          // Update opening_balance and closing_balance
          // For initial setup: opening_balance = closing_balance (both set to the same value)
          const updateQuery = `
            UPDATE dealers 
            SET opening_balance = ?,
                closing_balance = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE dealer_code = ?
          `;
          
          const updateParams = [
            record.closingBalance, // opening_balance = closing_balance (initial)
            record.closingBalance, // closing_balance
            actualDealerCode
          ];
          
          console.log(`Balance Upload - Updating dealer ${actualDealerCode} (matched from ${normalizedCode}) with opening/closing balance: ${record.closingBalance}`);
          
          db.query(updateQuery, updateParams, (updateErr, updateResult) => {
            if (updateErr) {
              console.error(`Error updating balance for dealer ${actualDealerCode}:`, updateErr);
              console.error(`Query: ${updateQuery}`);
              console.error(`Params:`, updateParams);
              errors.push(`Row ${record.rowIndex}: Failed to update dealer ${actualDealerCode} - ${updateErr.message}`);
              errorCount++;
            } else {
              if (updateResult.affectedRows > 0) {
                console.log(`Balance Upload - Successfully updated dealer ${actualDealerCode}, affected rows: ${updateResult.affectedRows}`);
                successCount++;
              } else {
                console.log(`Balance Upload - No rows updated for dealer ${actualDealerCode}`);
                errors.push(`Row ${record.rowIndex}: Dealer ${actualDealerCode} found but update failed`);
                errorCount++;
              }
            }
            resolve();
          });
        });
      });
      
      updatePromises.push(updatePromise);
    });
    
    // Wait for all updates to complete
    Promise.all(updatePromises).then(() => {
      const response = {
        success: true,
        message: `Opening/Closing balance uploaded successfully.`,
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
    console.error('Error processing balance upload:', error);
    res.status(500).json({ 
      error: 'Failed to process file', 
      details: error.message 
    });
  }
});

// Upload Daily Collections from Excel (Sales Manager, Sales Official, Admin only)
// File format: Should have Dealer Code, Date, Collection Amount columns
router.post('/collections/upload', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check if user uploaded a lock file
  if (req.file.originalname.startsWith('~$')) {
    return res.status(400).json({ 
      error: 'Lock file detected',
      details: 'You uploaded a temporary lock file (~$). Please close Excel and upload the actual file without ~$ prefix.',
      uploadedFile: req.file.originalname
    });
  }

  try {
    console.log('Collections Upload - File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'File buffer is empty. Please try uploading the file again.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      return res.status(400).json({ error: 'Could not read worksheet from file.' });
    }
    
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length < 9) {
      return res.status(400).json({ error: 'Invalid file format. Expected headers in row 8 and data starting from row 9.' });
    }
    
    // Row 8 (index 7) contains headers
    const headerRow = data[7] || [];
    
    // Fixed column indices based on file format:
    // B8 (index 1) = Customer Code
    // J8 (index 9) = MR Date (collection date)
    // Q8 (index 16) = Total Collect Amount
    const dealerCodeIndex = 1; // Column B
    const dateIndex = 9; // Column J
    const amountIndex = 16; // Column Q
    
    // Validate headers
    const customerCodeHeader = String(headerRow[dealerCodeIndex] || '').trim();
    const mrDateHeader = String(headerRow[dateIndex] || '').trim();
    const totalCollectHeader = String(headerRow[amountIndex] || '').trim();
    
    console.log('Collections Upload - Column validation:');
    console.log('  Column B (index 1):', customerCodeHeader);
    console.log('  Column J (index 9):', mrDateHeader);
    console.log('  Column Q (index 16):', totalCollectHeader);
    
    // Validate headers match expected format
    if (!customerCodeHeader.toLowerCase().includes('customer code')) {
      return res.status(400).json({ 
        error: 'Invalid file format. Column B should contain "Customer Code" header.',
        found: customerCodeHeader,
        expected: 'Customer Code'
      });
    }
    
    if (!mrDateHeader.toLowerCase().includes('mr date')) {
      return res.status(400).json({ 
        error: 'Invalid file format. Column J should contain "MR Date" header.',
        found: mrDateHeader,
        expected: 'MR Date'
      });
    }
    
    if (!totalCollectHeader.toLowerCase().includes('total collect')) {
      return res.status(400).json({ 
        error: 'Invalid file format. Column Q should contain "Total Collect Amount" header.',
        found: totalCollectHeader,
        expected: 'Total Collect Amount'
      });
    }
    
    console.log('Collections Upload - All columns validated successfully');
    
    // Helper function to convert Excel date to JS date
    const excelDateToJSDate = (excelDate) => {
      if (!excelDate && excelDate !== 0) return null;
      
      // If it's a number (Excel serial date), convert it
      if (typeof excelDate === 'number') {
        // Excel serial date: days since December 30, 1899
        // Note: Excel incorrectly treats 1900 as a leap year, but we use standard conversion
        const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
        const jsDate = new Date(excelEpoch.getTime() + excelDate * 24 * 60 * 60 * 1000);
        return jsDate;
      }
      
      // If it's a string, try multiple parsing methods
      if (typeof excelDate === 'string') {
        const trimmed = excelDate.trim();
        if (!trimmed) return null;
        
        // Try 1: Direct Date parsing (works for ISO format: "2024-01-15")
        let parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
        
        // Try 2: Common formats like "DD/MM/YYYY", "DD-MM-YYYY", "MM/DD/YYYY"
        const dateFormats = [
          /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // DD/MM/YYYY or MM/DD/YYYY
          /(\d{1,2})-(\d{1,2})-(\d{4})/,    // DD-MM-YYYY or MM-DD-YYYY
          /(\d{4})-(\d{1,2})-(\d{1,2})/,    // YYYY-MM-DD
          /(\d{1,2})\s+(\w{3,9})\s+(\d{4})/i // DD MMM YYYY or DD MMMM YYYY
        ];
        
        for (const format of dateFormats) {
          const match = trimmed.match(format);
          if (match) {
            let year, month, day;
            
            if (format === dateFormats[3]) {
              // DD MMM YYYY format
              const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              day = parseInt(match[1]);
              const monthName = match[2].toLowerCase().substring(0, 3);
              month = monthNames.indexOf(monthName);
              year = parseInt(match[3]);
              if (month === -1) continue;
            } else if (format === dateFormats[2]) {
              // YYYY-MM-DD format
              year = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              day = parseInt(match[3]);
            } else {
              // DD/MM/YYYY or MM/DD/YYYY - assume DD/MM/YYYY (more common)
              day = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              year = parseInt(match[3]);
            }
            
            parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) {
              return parsed;
            }
          }
        }
      }
      
      return null;
    };
    
    // Process data rows starting from row 9 (index 8)
    const dailyCollections = [];
    const missingDealers = [];
    let totalRowsProcessed = 0;
    let rowsWithData = 0;
    
    for (let i = 8; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      totalRowsProcessed++;
      
      // Get dealer code
      const dealerCodeRaw = row[dealerCodeIndex];
      if (!dealerCodeRaw && dealerCodeRaw !== 0) continue;
      
      const dealerCode = normalizeDealerCode(dealerCodeRaw);
      if (!dealerCode || dealerCode === '0') continue;
      
      // Get date
      const dateRaw = row[dateIndex];
      if (!dateRaw) continue;
      
      const transactionDate = excelDateToJSDate(dateRaw);
      if (!transactionDate || isNaN(transactionDate.getTime())) {
        continue;
      }
      
      const dateStr = transactionDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Get collection amount
      const collectionAmount = parseFloat(row[amountIndex]) || 0;
      if (collectionAmount <= 0) continue; // Skip zero or negative amounts
      
      rowsWithData++;
      
      dailyCollections.push({
        dealerCode,
        originalCode: String(dealerCodeRaw || '').trim(),
        transactionDate: dateStr,
        collectionAmount,
        rowIndex: i + 1
      });
    }
    
    if (dailyCollections.length === 0) {
      return res.status(400).json({ 
        error: 'No valid collection data found in Excel file.',
        totalRowsProcessed: totalRowsProcessed,
        suggestion: 'Check that Date and Collection Amount columns have valid data.'
      });
    }
    
    console.log(`Collections Upload - Found ${dailyCollections.length} collection transactions from ${totalRowsProcessed} rows`);
    
    // Verify dealers exist and insert daily collections
    db.query('SELECT dealer_code FROM dealers', (verifyErr, allDealers) => {
      if (verifyErr) {
        console.error('Error fetching dealers:', verifyErr);
        return res.status(500).json({ error: 'Failed to verify dealer codes', details: verifyErr.message });
      }
      
      // Create mapping: normalized code -> actual dealer_code from database
      const dealerCodeMap = {};
      allDealers.forEach(dealer => {
        const normalized = normalizeDealerCode(dealer.dealer_code);
        dealerCodeMap[normalized] = dealer.dealer_code;
      });
      
      // Filter valid collections and use actual dealer codes from DB
      const validCollections = [];
      dailyCollections.forEach(collection => {
        if (dealerCodeMap[collection.dealerCode]) {
          validCollections.push({
            ...collection,
            dealer_code: dealerCodeMap[collection.dealerCode] // Use actual format from DB
          });
        } else {
          if (missingDealers.length < 20) {
            missingDealers.push(collection.dealerCode);
          }
        }
      });
      
      if (validCollections.length === 0) {
        return res.status(400).json({
          error: 'No valid collections found. All dealer codes in the file do not exist in the system',
          missingDealers: [...new Set(missingDealers)],
          suggestion: 'Please add these dealers to the system first, or check if the dealer codes are correct.'
        });
      }
      
      // Group by dealer_code and transaction_date to sum amounts
      const groupedCollections = {};
      validCollections.forEach(collection => {
        const key = `${collection.dealer_code}-${collection.transactionDate}`;
        if (!groupedCollections[key]) {
          groupedCollections[key] = {
            dealer_code: collection.dealer_code,
            transaction_date: collection.transactionDate,
            collection_amount: 0
          };
        }
        groupedCollections[key].collection_amount += collection.collectionAmount;
      });
      
      const collectionsToInsert = Object.values(groupedCollections);
      
      // Insert daily collections
      // Use ON DUPLICATE KEY UPDATE to handle re-uploads (sum amounts)
      const insertQuery = `
        INSERT INTO daily_collections 
        (dealer_code, transaction_date, collection_amount) 
        VALUES ?
        ON DUPLICATE KEY UPDATE
          collection_amount = collection_amount + VALUES(collection_amount),
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const values = collectionsToInsert.map(c => [
        c.dealer_code,
        c.transaction_date,
        c.collection_amount
      ]);
      
      db.query(insertQuery, [values], (err, result) => {
        if (err) {
          console.error('Error inserting daily collections:', err);
          return res.status(500).json({ error: 'Failed to upload daily collections', details: err.message });
        }
        
        // Count unique dealers
        const uniqueDealers = new Set(collectionsToInsert.map(c => c.dealer_code));
        
        const response = {
          success: true,
          message: `Daily collections data uploaded successfully.`,
          summary: {
            total_transactions: dailyCollections.length,
            unique_daily_records: collectionsToInsert.length,
            inserted: result.affectedRows,
            dealers: uniqueDealers.size,
            date_range: {
              from: collectionsToInsert.length > 0 ? Math.min(...collectionsToInsert.map(c => c.transaction_date)) : null,
              to: collectionsToInsert.length > 0 ? Math.max(...collectionsToInsert.map(c => c.transaction_date)) : null
            }
          }
        };
        
        if (missingDealers.length > 0) {
          response.warning = `Some dealer codes in the file do not exist in the system: ${[...new Set(missingDealers)].slice(0, 10).join(', ')}${missingDealers.length > 10 ? '...' : ''}`;
          response.missing_dealers_count = missingDealers.length;
        }
        
        res.json(response);
      });
    });
    
  } catch (error) {
    console.error('Error processing collections upload:', error);
    res.status(500).json({ 
      error: 'Failed to process file', 
      details: error.message 
    });
  }
});

// Calculate closing balance for all dealers (Sales Manager, Sales Official, Admin only)
// Formula: Closing = Opening + Sales - Collection
router.post('/calculate-balance', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), (req, res) => {
  const { startDate, endDate } = req.body;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD format)' });
  }
  
  console.log(`Calculating closing balance from ${startDate} to ${endDate}`);
  
  // Helper function to check if a date is in the last week of the billing cycle
  const isInLastWeekOfCycle = (date, cycleStartDay) => {
    const checkDate = new Date(date);
    const year = checkDate.getFullYear();
    const month = checkDate.getMonth() + 1; // 1-12
    const day = checkDate.getDate();
    
    // Calculate cycle end day (day before cycle start day)
    let cycleEndDay = cycleStartDay - 1;
    if (cycleEndDay < 1) {
      cycleEndDay = 31; // Last day of previous month
    }
    
    // Calculate days remaining in cycle
    let daysRemaining;
    if (cycleStartDay === 1) {
      // Standard cycle: 1st to end of month
      const daysInMonth = new Date(year, month, 0).getDate();
      daysRemaining = daysInMonth - day + 1;
    } else {
      // Custom cycle: cycleStartDay to (cycleStartDay - 1) of next month
      if (day >= cycleStartDay) {
        // We're in current month's cycle
        const daysInMonth = new Date(year, month, 0).getDate();
        daysRemaining = daysInMonth - day + 1;
      } else {
        // We're in next month's cycle (before cycleStartDay)
        daysRemaining = cycleStartDay - day;
      }
    }
    
    // Last week = 7 days or less remaining
    return daysRemaining <= 7;
  };
  
  // Helper function to check if balance is close to lower limit (within 20% or 10,000, whichever is smaller)
  const isCloseToLowerLimit = (balance, lowerLimit) => {
    if (lowerLimit <= 0) return false;
    const difference = balance - lowerLimit;
    const threshold = Math.min(lowerLimit * 0.2, 10000); // 20% or 10,000, whichever is smaller
    // Close if balance is above lower limit but within threshold
    return difference >= 0 && difference <= threshold;
  };
  
  // Get all dealers with their opening balances and billing cycle info
  db.query('SELECT dealer_code, opening_balance, closing_balance, COALESCE(billing_cycle_start_day, 1) as cycle_start_day, lower_limit FROM dealers', (err, dealers) => {
    if (err) {
      console.error('Error fetching dealers:', err);
      return res.status(500).json({ error: 'Failed to fetch dealers', details: err.message });
    }
    
    let processedCount = 0;
    let errorCount = 0;
    const errors = [];
    const updatePromises = [];
    
    dealers.forEach(dealer => {
      const updatePromise = new Promise((resolve) => {
        const dealerCode = dealer.dealer_code;
        const openingBalance = parseFloat(dealer.opening_balance || 0);
        const cycleStartDay = dealer.cycle_start_day || 1;
        const dealerLowerLimit = parseFloat(dealer.lower_limit || 0);
        
        // Get total sales for this dealer in date range
        const salesQuery = `
          SELECT 
            transaction_date,
            SUM(sales_amount) as daily_sales
          FROM daily_sales
          WHERE dealer_code = ? 
            AND transaction_date >= ? 
            AND transaction_date <= ?
          GROUP BY transaction_date
          ORDER BY transaction_date ASC
        `;
        
        db.query(salesQuery, [dealerCode, startDate, endDate], (salesErr, salesResults) => {
          if (salesErr) {
            console.error(`Error fetching sales for dealer ${dealerCode}:`, salesErr);
            errors.push(`Dealer ${dealerCode}: ${salesErr.message}`);
            errorCount++;
            resolve();
            return;
          }
          
          // Get total collections for this dealer in date range
          const collectionsQuery = `
            SELECT 
              transaction_date,
              SUM(collection_amount) as daily_collection
            FROM daily_collections
            WHERE dealer_code = ? 
              AND transaction_date >= ? 
              AND transaction_date <= ?
            GROUP BY transaction_date
            ORDER BY transaction_date ASC
          `;
          
          db.query(collectionsQuery, [dealerCode, startDate, endDate], (collectionsErr, collectionsResults) => {
            if (collectionsErr) {
              console.error(`Error fetching collections for dealer ${dealerCode}:`, collectionsErr);
              errors.push(`Dealer ${dealerCode}: ${collectionsErr.message}`);
              errorCount++;
              resolve();
              return;
            }
            
            // Create maps for quick lookup (normalize dates to YYYY-MM-DD format)
            const salesMap = {};
            salesResults.forEach(s => {
              const dateStr = s.transaction_date instanceof Date 
                ? s.transaction_date.toISOString().split('T')[0]
                : String(s.transaction_date).split('T')[0];
              salesMap[dateStr] = parseFloat(s.daily_sales || 0);
            });
            
            const collectionsMap = {};
            collectionsResults.forEach(c => {
              const dateStr = c.transaction_date instanceof Date 
                ? c.transaction_date.toISOString().split('T')[0]
                : String(c.transaction_date).split('T')[0];
              collectionsMap[dateStr] = parseFloat(c.daily_collection || 0);
            });
            
            // Get all unique dates in range
            const allDates = new Set();
            salesResults.forEach(s => {
              // Convert to string format YYYY-MM-DD for consistent sorting
              const dateStr = s.transaction_date instanceof Date 
                ? s.transaction_date.toISOString().split('T')[0]
                : String(s.transaction_date).split('T')[0];
              allDates.add(dateStr);
            });
            collectionsResults.forEach(c => {
              // Convert to string format YYYY-MM-DD for consistent sorting
              const dateStr = c.transaction_date instanceof Date 
                ? c.transaction_date.toISOString().split('T')[0]
                : String(c.transaction_date).split('T')[0];
              allDates.add(dateStr);
            });
            
            // Sort dates as strings (YYYY-MM-DD format sorts correctly)
            const sortedDates = Array.from(allDates).sort();
            
            // Calculate closing balance day by day
            let currentBalance = openingBalance;
            const balanceHistory = [];
            
            sortedDates.forEach(date => {
              const sales = salesMap[date] || 0;
              const collection = collectionsMap[date] || 0;
              
              const opening = currentBalance;
              currentBalance = opening + sales - collection;
              
              balanceHistory.push({
                dealer_code: dealerCode,
                balance_date: date,
                opening_balance: opening,
                sales_amount: sales,
                collection_amount: collection,
                closing_balance: currentBalance
              });
            });
            
            // Update dealer's closing balance to the latest calculated balance
            if (sortedDates.length > 0) {
              const latestBalance = currentBalance;
              
              // Update dealers table
              const updateDealerQuery = `
                UPDATE dealers 
                SET closing_balance = ?, updated_at = CURRENT_TIMESTAMP
                WHERE dealer_code = ?
              `;
              
              // Get dealer limits for overdue calculation
              db.query('SELECT lower_limit, upper_limit FROM dealers WHERE dealer_code = ?', [dealerCode], (limitErr, limitResults) => {
                if (limitErr) {
                  console.error(`Error fetching limits for dealer ${dealerCode}:`, limitErr);
                  errors.push(`Dealer ${dealerCode}: ${limitErr.message}`);
                  errorCount++;
                  resolve();
                  return;
                }
                
                const lowerLimit = parseFloat(limitResults[0]?.lower_limit || 0);
                const upperLimit = parseFloat(limitResults[0]?.upper_limit || 0);
                
                // Calculate overdue based on business rules:
                // 1. Lower Limit Overdue: Checked on FIRST DAY of billing cycle
                //    - If closing_balance > lower_limit on day 1 → Violation (positive overdue)
                //    - Formula: closing_balance - lower_limit (positive = violation)
                // 2. Upper Limit Overdue: Monitored DURING the entire cycle
                //    - If closing_balance > upper_limit at any point → Violation (positive overdue)
                //    - Formula: closing_balance - upper_limit (positive = violation)
                // Note: Negative values mean no violation, positive values mean violation
                const lowerOverdue = currentBalance - lowerLimit;
                const upperOverdue = currentBalance - upperLimit;
                
                // Update dealer's closing balance
                db.query(updateDealerQuery, [latestBalance, dealerCode], (updateErr) => {
                  if (updateErr) {
                    console.error(`Error updating closing balance for dealer ${dealerCode}:`, updateErr);
                    errors.push(`Dealer ${dealerCode}: ${updateErr.message}`);
                    errorCount++;
                    resolve();
                    return;
                  }
                  
                  // Calculate year and month from endDate
                  const endDateObj = new Date(endDate);
                  const reportYear = endDateObj.getFullYear();
                  const reportMonth = endDateObj.getMonth() + 1;
                  const daysIntoMonth = endDateObj.getDate();
                  
                  // Insert/update overdue report with calculated values
                  // Only insert if dealer has limits set
                  if (lowerLimit > 0 || upperLimit > 0) {
                    const overdueQuery = `
                      INSERT INTO overdue_report 
                      (dealer_code, year, month, lower_limit, upper_limit, lower_limit_overdue, upper_limit_overdue, current_date, days_into_month)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                      ON DUPLICATE KEY UPDATE
                        lower_limit = VALUES(lower_limit),
                        upper_limit = VALUES(upper_limit),
                        lower_limit_overdue = VALUES(lower_limit_overdue),
                        upper_limit_overdue = VALUES(upper_limit_overdue),
                        current_date = VALUES(current_date),
                        days_into_month = VALUES(days_into_month),
                        updated_at = CURRENT_TIMESTAMP
                    `;
                    
                    db.query(overdueQuery, [
                      dealerCode,
                      reportYear,
                      reportMonth,
                      lowerLimit,
                      upperLimit,
                      lowerOverdue,
                      upperOverdue,
                      endDate,
                      daysIntoMonth
                    ], (overdueErr) => {
                      if (overdueErr) {
                        console.error(`Error inserting overdue for dealer ${dealerCode}:`, overdueErr);
                        errors.push(`Dealer ${dealerCode} overdue: ${overdueErr.message}`);
                      }
                      
                      // Insert/update balance history
                      if (balanceHistory.length > 0) {
                        const historyQuery = `
                          INSERT INTO dealer_balance_history 
                          (dealer_code, balance_date, opening_balance, sales_amount, collection_amount, closing_balance)
                          VALUES ?
                          ON DUPLICATE KEY UPDATE
                            opening_balance = VALUES(opening_balance),
                            sales_amount = VALUES(sales_amount),
                            collection_amount = VALUES(collection_amount),
                            closing_balance = VALUES(closing_balance),
                            updated_at = CURRENT_TIMESTAMP
                        `;
                        
                        const historyValues = balanceHistory.map(h => [
                          h.dealer_code,
                          h.balance_date,
                          h.opening_balance,
                          h.sales_amount,
                          h.collection_amount,
                          h.closing_balance
                        ]);
                        
                        db.query(historyQuery, [historyValues], (historyErr) => {
                          if (historyErr) {
                            console.error(`Error inserting balance history for dealer ${dealerCode}:`, historyErr);
                            errors.push(`Dealer ${dealerCode} history: ${historyErr.message}`);
                          } else {
                            processedCount++;
                          }
                          resolve();
                        });
                      } else {
                        processedCount++;
                        resolve();
                      }
                    });
                  } else {
                    // No limits set, just update balance history
                    if (balanceHistory.length > 0) {
                      const historyQuery = `
                        INSERT INTO dealer_balance_history 
                        (dealer_code, balance_date, opening_balance, sales_amount, collection_amount, closing_balance)
                        VALUES ?
                        ON DUPLICATE KEY UPDATE
                          opening_balance = VALUES(opening_balance),
                          sales_amount = VALUES(sales_amount),
                          collection_amount = VALUES(collection_amount),
                          closing_balance = VALUES(closing_balance),
                          updated_at = CURRENT_TIMESTAMP
                      `;
                      
                      const historyValues = balanceHistory.map(h => [
                        h.dealer_code,
                        h.balance_date,
                        h.opening_balance,
                        h.sales_amount,
                        h.collection_amount,
                        h.closing_balance
                      ]);
                      
                      db.query(historyQuery, [historyValues], (historyErr) => {
                        if (historyErr) {
                          console.error(`Error inserting balance history for dealer ${dealerCode}:`, historyErr);
                          errors.push(`Dealer ${dealerCode} history: ${historyErr.message}`);
                        } else {
                          processedCount++;
                        }
                        resolve();
                      });
                    } else {
                      processedCount++;
                      resolve();
                    }
                  }
                });
              });
            } else {
              // No transactions in date range, balance remains the same
              processedCount++;
              resolve();
            }
          });
        });
      });
      
      updatePromises.push(updatePromise);
    });
    
    // Wait for all updates to complete
    Promise.all(updatePromises).then(() => {
      res.json({
        success: true,
        message: `Closing balance calculated successfully.`,
        summary: {
          total_dealers: dealers.length,
          processed: processedCount,
          errors: errorCount,
          date_range: {
            from: startDate,
            to: endDate
          }
        },
        errors: errors.length > 0 && errors.length <= 20 ? errors : errors.slice(0, 20)
      });
    });
  });
});

// Bulk update dealer limits from Excel
// TODO: Implement Excel upload for dealer limits
// router.post('/limits/upload', upload.single('file'), (req, res) => {
//   // Similar to other upload endpoints - would need to parse Excel with dealer_code, lower_limit, upper_limit columns
//   // Implementation similar to targets upload
// });

module.exports = router;
