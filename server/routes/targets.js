const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('../db');
const { authenticateToken, authorize, canAccessDealerData } = require('../middleware/auth');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to find column index by name (flexible matching)
const findColumn = (headers, possibleNames) => {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => {
      // Normalize header: trim, lowercase, replace newlines/tabs with spaces, then normalize whitespace
      const header = String(h || '').trim().toLowerCase().replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ');
      const searchName = name.toLowerCase().replace(/\s+/g, ' ');
      return header === searchName || 
             header.includes(searchName) || 
             searchName.includes(header) ||
             header.replace(/[\s_\-\.]/g, '') === searchName.replace(/[\s_\-\.]/g, '');
    });
    if (index !== -1) return index;
  }
  return -1;
};

// Helper function to normalize dealer code (remove leading zeros for matching)
const normalizeDealerCode = (code) => {
  if (!code) return '';
  const str = String(code).trim();
  // Remove leading zeros but keep at least one digit
  return str.replace(/^0+/, '') || '0';
};

// Sync comparison tables (ABP vs Achievement and Forecast vs Achievement)
const syncComparisonTables = (callback) => {
  // Sync ABP vs Achievement - get all unique dealer/year/month combinations
  const syncABPvsAchievement = `
    REPLACE INTO abp_vs_achievement 
    (dealer_code, dealer_name, territory_name, year, month, abp_target_amount, abp_target_quantity, achievement_amount, achievement_quantity, amount_percentage, quantity_percentage)
    SELECT 
      d.dealer_code,
      d.dealer_name,
      COALESCE(t.territory_name, 'N/A') as territory_name,
      COALESCE(abp.year, ach.year) as year,
      COALESCE(abp.month, ach.month) as month,
      COALESCE(abp.target_amount, 0) as abp_target_amount,
      COALESCE(abp.abp_quantity, 0) as abp_target_quantity,
      COALESCE(ach.achievement_amount, 0) as achievement_amount,
      COALESCE(ach.achievement_quantity, 0) as achievement_quantity,
      CASE 
        WHEN COALESCE(abp.target_amount, 0) > 0 THEN (COALESCE(ach.achievement_amount, 0) / abp.target_amount) * 100
        ELSE 0
      END as amount_percentage,
      CASE 
        WHEN COALESCE(abp.abp_quantity, 0) > 0 THEN (COALESCE(ach.achievement_quantity, 0) / abp.abp_quantity) * 100
        ELSE 0
      END as quantity_percentage
    FROM (
      SELECT DISTINCT dealer_code, year, month FROM abp_targets
      UNION
      SELECT DISTINCT dealer_code, year, month FROM achievements
    ) AS combined
    INNER JOIN dealers d ON d.dealer_code = combined.dealer_code
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN abp_targets abp ON d.dealer_code = abp.dealer_code 
      AND combined.year = abp.year AND combined.month = abp.month
    LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code 
      AND combined.year = ach.year AND combined.month = ach.month
    ON DUPLICATE KEY UPDATE
      dealer_name = VALUES(dealer_name),
      territory_name = VALUES(territory_name),
      abp_target_amount = VALUES(abp_target_amount),
      abp_target_quantity = VALUES(abp_target_quantity),
      achievement_amount = VALUES(achievement_amount),
      achievement_quantity = VALUES(achievement_quantity),
      amount_percentage = VALUES(amount_percentage),
      quantity_percentage = VALUES(quantity_percentage),
      updated_at = CURRENT_TIMESTAMP
  `;

  // Sync Forecast vs Achievement - get all unique dealer/year/month combinations
  const syncForecastVsAchievement = `
    REPLACE INTO forecast_vs_achievement 
    (dealer_code, dealer_name, territory_name, year, month, forecast_target_amount, forecast_target_quantity, achievement_amount, achievement_quantity, amount_percentage, quantity_percentage)
    SELECT 
      d.dealer_code,
      d.dealer_name,
      COALESCE(t.territory_name, 'N/A') as territory_name,
      COALESCE(fc.year, ach.year) as year,
      COALESCE(fc.month, ach.month) as month,
      COALESCE(fc.target_amount, 0) as forecast_target_amount,
      COALESCE(fc.forecast_quantity, 0) as forecast_target_quantity,
      COALESCE(ach.achievement_amount, 0) as achievement_amount,
      COALESCE(ach.achievement_quantity, 0) as achievement_quantity,
      CASE 
        WHEN COALESCE(fc.target_amount, 0) > 0 THEN (COALESCE(ach.achievement_amount, 0) / fc.target_amount) * 100
        ELSE 0
      END as amount_percentage,
      CASE 
        WHEN COALESCE(fc.forecast_quantity, 0) > 0 THEN (COALESCE(ach.achievement_quantity, 0) / fc.forecast_quantity) * 100
        ELSE 0
      END as quantity_percentage
    FROM (
      SELECT DISTINCT dealer_code, year, month FROM forecast_targets
      UNION
      SELECT DISTINCT dealer_code, year, month FROM achievements
    ) AS combined
    INNER JOIN dealers d ON d.dealer_code = combined.dealer_code
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN forecast_targets fc ON d.dealer_code = fc.dealer_code 
      AND combined.year = fc.year AND combined.month = fc.month
    LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code 
      AND combined.year = ach.year AND combined.month = ach.month
    ON DUPLICATE KEY UPDATE
      dealer_name = VALUES(dealer_name),
      territory_name = VALUES(territory_name),
      forecast_target_amount = VALUES(forecast_target_amount),
      forecast_target_quantity = VALUES(forecast_target_quantity),
      achievement_amount = VALUES(achievement_amount),
      achievement_quantity = VALUES(achievement_quantity),
      amount_percentage = VALUES(amount_percentage),
      quantity_percentage = VALUES(quantity_percentage),
      updated_at = CURRENT_TIMESTAMP
  `;

  db.query(syncABPvsAchievement, (err1) => {
    if (err1) {
      console.error('Error syncing ABP vs Achievement:', err1);
      // Continue even if one fails
    }
    
    db.query(syncForecastVsAchievement, (err2) => {
      if (err2) {
        console.error('Error syncing Forecast vs Achievement:', err2);
      }
      
      if (callback) callback();
    });
  });
};

// Helper function to parse month from various formats
const parseMonth = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  // Try to parse as number
  const num = parseInt(str);
  if (num >= 1 && num <= 12) return num;
  // Try month names
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                     'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const lower = str.toLowerCase();
  const fullIndex = monthNames.findIndex(m => lower.includes(m));
  if (fullIndex !== -1) return fullIndex + 1;
  const abbrIndex = monthAbbr.findIndex(m => lower.includes(m));
  if (abbrIndex !== -1) return abbrIndex + 1;
  return null;
};

// Helper function to parse year
const parseYear = (value) => {
  if (!value) return null;
  const num = parseInt(String(value).trim());
  if (num >= 2000 && num <= 2100) return num;
  return null;
};

// Helper function to parse month string like "July -25" or "Jan-26"
const parseMonthYear = (monthStr) => {
  if (!monthStr) return null;
  const str = String(monthStr).trim();
  
  // Extract year (last 2 digits)
  const yearMatch = str.match(/(\d{2})$/);
  if (!yearMatch) return null;
  
  const yearSuffix = parseInt(yearMatch[1]);
  // Assume 20xx for years 00-50, 19xx for 51-99
  const year = yearSuffix <= 50 ? 2000 + yearSuffix : 1900 + yearSuffix;
  
  // Extract month name
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                     'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  const lower = str.toLowerCase();
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i]) || lower.includes(monthAbbr[i])) {
      return { month: i + 1, year: year };
    }
  }
  
  return null;
};

// Upload ABP Targets from Excel (Sales Manager, Sales Official, Admin only)
router.post('/abp/upload', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), upload.single('file'), (req, res) => {
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
    console.log('ABP Upload - File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    console.log('ABP Upload - Buffer type:', typeof req.file.buffer, 'Buffer length:', req.file.buffer ? req.file.buffer.length : 0);
    
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'File buffer is empty. Please try uploading the file again.' });
    }
    
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log('ABP Upload - Sheet name:', sheetName);
    console.log('ABP Upload - Available sheets:', workbook.SheetNames);
    
    if (!worksheet) {
      return res.status(400).json({ error: 'Could not read worksheet from file.' });
    }
    
    // Use sheet_to_json with header: 1 to get arrays (not objects)
    // This ensures we get arrays like [col0, col1, col2...] instead of objects
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    
    console.log('ABP Upload - Total rows read:', data.length);
    if (data.length > 0) {
      const firstRowType = Array.isArray(data[0]) ? 'array' : 'object';
      console.log('ABP Upload - First row type:', firstRowType);
      console.log('ABP Upload - First few rows lengths:', data.slice(0, 6).map((r, i) => {
        if (!r) return `Row ${i + 1}: empty`;
        if (Array.isArray(r)) return `Row ${i + 1}: ${r.length} columns (array)`;
        return `Row ${i + 1}: ${Object.keys(r).length} columns (object)`;
      }));
      console.log('ABP Upload - Row 4 sample (first 10 cells):', data[3] ? (Array.isArray(data[3]) ? data[3].slice(0, 10) : Object.values(data[3]).slice(0, 10)) : 'empty');
      console.log('ABP Upload - Row 5 sample (first 10 cells):', data[4] ? (Array.isArray(data[4]) ? data[4].slice(0, 10) : Object.values(data[4]).slice(0, 10)) : 'empty');
    }
    
    if (data.length < 6) {
      return res.status(400).json({ error: 'Invalid file format. Expected at least 6 rows.', received: data.length });
    }
    
    // Row 4 (index 3) contains month headers
    const monthRow = data[3];
    // Row 5 (index 4) contains column headers
    const headerRow = data[4];
    
    // CRITICAL: Ensure rows are arrays, not objects
    // If xlsx returns objects, convert them to arrays
    if (!Array.isArray(monthRow) || !Array.isArray(headerRow)) {
      console.error('ABP Upload - ERROR: Month row or header row is not an array!');
      console.error('  Month row type:', typeof monthRow, Array.isArray(monthRow) ? 'array' : 'object');
      console.error('  Header row type:', typeof headerRow, Array.isArray(headerRow) ? 'array' : 'object');
      return res.status(400).json({ 
        error: 'File format error: Could not read rows as arrays. Please ensure the file is a valid Excel file.',
        details: 'The system expects array format but received object format. This may indicate a file corruption or format issue.'
      });
    }
    
    console.log('ABP Upload - Month row length:', monthRow ? monthRow.length : 0);
    console.log('ABP Upload - Header row length:', headerRow ? headerRow.length : 0);
    console.log('ABP Upload - Row 4 (month row) type:', Array.isArray(monthRow) ? 'array' : typeof monthRow);
    console.log('ABP Upload - Row 5 (header row) type:', Array.isArray(headerRow) ? 'array' : typeof headerRow);
    console.log('ABP Upload - Row 6 (first data row) type:', data[5] ? (Array.isArray(data[5]) ? 'array' : typeof data[5]) : 'empty');
    
    // Find month positions and their corresponding columns
    // Pattern: Each month has 7 columns: ET Reg, ET Premium, Rickshaw, IPS, Solar, Total QTY, Sales Value
    // Month header is in row 4, application headers are in row 5, Total QTY and Sales Value are in row 5
    const monthMappings = [];
    
    // First, find all month headers and their positions
    // Note: Month headers may be in merged cells, but xlsx reads them as appearing at specific columns
    // We simply find each unique month header at its first occurrence
    const monthHeaders = [];
    const seenMonths = new Set();
    
    for (let i = 0; i < monthRow.length; i++) {
      const cell = monthRow[i];
      if (cell && typeof cell === 'string') {
        const monthInfo = parseMonthYear(cell);
        if (monthInfo && !cell.toLowerCase().includes('total')) {
          // Only add if we haven't seen this month value before (to avoid duplicates from merged cells)
          if (!seenMonths.has(cell)) {
            seenMonths.add(cell);
            monthHeaders.push({
              col: i, // Column where month header appears
              month: monthInfo.month,
              year: monthInfo.year,
              monthName: cell
            });
          }
        }
      }
    }
    
    // Sort by column index to ensure correct order
    monthHeaders.sort((a, b) => a.col - b.col);
    
    console.log('ABP Upload - Found month headers:', monthHeaders.map(m => `${m.monthName} at column ${m.col}`));
    
    // Now find "Total QTY" and "Sales Value" columns that correspond to each month
    // Total QTY is typically 5 columns after the month header (in the 6th position)
    // Sales Value is typically 6 columns after the month header (in the 7th position)
    // But we'll verify by checking if the headers at those positions are correct
    const findSalesValueHeader = (colName) => {
      if (!colName) {
        return false;
      }
      const normalized = String(colName).trim().toLowerCase().replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ');
      // Match "sales value" exactly or if it contains both "sales" and "value"
      const isExactMatch = normalized === 'sales value';
      const hasBothWords = normalized.includes('sales') && normalized.includes('value');
      const result = isExactMatch || hasBothWords;
      return result;
    };
    const findTotalQtyHeader = (colName) => {
      if (!colName) {
        return false;
      }
      const normalized = String(colName).trim().toLowerCase().replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ');
      // Match "total qty" or "qty" with total present
      const hasTotal = normalized.includes('total');
      const hasQty = normalized.includes('qty') || normalized.includes('quantity');
      return hasTotal && hasQty;
    };
    
    monthHeaders.forEach((monthHeader, idx) => {
      // Pattern: Each month has 7 columns: ET Reg/ET Premium, Rickshaw, IPS, Solar, Total QTY, Sales Value
      // Total QTY is typically column +5, Sales Value column +6
      let foundSalesCol = -1;
      let foundQtyCol = -1;
      const appColumns = []; // { name, col }
      
      // Determine the end of this month's group (start of next month, or end of row)
      const nextMonthStart = (idx < monthHeaders.length - 1) ? monthHeaders[idx + 1].col : headerRow.length;
      const monthGroupEnd = Math.min(nextMonthStart, headerRow.length);
      
      // Sales Value should be near the end of the month group (typically 6 columns after start)
      // Search from the expected position backwards and forwards
      const expectedSalesCol = monthHeader.col + 6;
      const expectedQtyCol = monthHeader.col + 5;

      // Capture the 5 application columns (col to col+4) with their headers
      // These should be the application unit names (ET Reg, ET Premium, Rickshaw, IPS, Solar)
      for (let appCol = monthHeader.col; appCol < monthHeader.col + 5 && appCol < monthGroupEnd; appCol++) {
        const appNameRaw = headerRow[appCol];
        const appName = appNameRaw ? String(appNameRaw).trim() : '';
        // Only add if we have a valid name (skip empty headers)
        if (appName && appName.length > 0) {
          appColumns.push({ 
            name: appName, 
            col: appCol 
          });
        }
      }
      
      console.log(`ABP Upload - ${monthHeader.monthName}: Found ${appColumns.length} application columns:`, appColumns.map(a => `${a.name} at col ${a.col}`));
      
      // First, try the expected Total QTY position (5 columns after month start)
      if (expectedQtyCol < monthGroupEnd) {
        const headerAtExpectedQty = headerRow[expectedQtyCol];
        const headerStrQty = String(headerAtExpectedQty || '').trim();
        const matchesQty = headerAtExpectedQty && findTotalQtyHeader(headerAtExpectedQty);
        console.log(`ABP Upload - ${monthHeader.monthName}: Checking qty col ${expectedQtyCol}, header="${headerStrQty}", matches=${matchesQty}`);
        if (matchesQty) {
          foundQtyCol = expectedQtyCol;
          console.log(`ABP Upload - ✓ ${monthHeader.monthName}: Found Total QTY at expected column ${expectedQtyCol}`);
        }
      }
      // If not found, search for qty in month group
      if (foundQtyCol === -1) {
        console.log(`ABP Upload - ${monthHeader.monthName}: Searching Total QTY wider range (cols ${monthHeader.col + 3} to ${monthGroupEnd - 1})`);
        for (let checkCol = monthHeader.col + 3; checkCol < monthGroupEnd; checkCol++) {
          const headerAtCheck = headerRow[checkCol];
          if (headerAtCheck && findTotalQtyHeader(headerAtCheck)) {
            foundQtyCol = checkCol;
            console.log(`ABP Upload - ✓ ${monthHeader.monthName}: Found Total QTY at column ${checkCol} (searched)`);
            break;
          }
        }
        if (foundQtyCol === -1) {
          console.log(`ABP Upload - ⚠ ${monthHeader.monthName}: Total QTY NOT FOUND in range ${monthHeader.col + 3} to ${monthGroupEnd - 1}`);
        }
      }
      
      // First, try the expected position (6 columns after month start)
      if (expectedSalesCol < monthGroupEnd) {
        const headerAtExpected = headerRow[expectedSalesCol];
        const headerStr = String(headerAtExpected || '').trim();
        const matches = headerAtExpected && findSalesValueHeader(headerAtExpected);
        console.log(`ABP Upload - ${monthHeader.monthName}: Checking col ${expectedSalesCol}, header="${headerStr}", matches=${matches}`);
        if (matches) {
          foundSalesCol = expectedSalesCol;
          console.log(`ABP Upload - ✓ ${monthHeader.monthName}: Found Sales Value at expected column ${expectedSalesCol}`);
        }
      }
      
      // If not found, search in the month group (from start to end)
      if (foundSalesCol === -1) {
        console.log(`ABP Upload - ${monthHeader.monthName}: Searching wider range (cols ${monthHeader.col + 3} to ${monthGroupEnd - 1})`);
        for (let checkCol = monthHeader.col + 3; checkCol < monthGroupEnd; checkCol++) {
          const headerAtCheck = headerRow[checkCol];
          if (headerAtCheck && findSalesValueHeader(headerAtCheck)) {
            foundSalesCol = checkCol;
            console.log(`ABP Upload - ✓ ${monthHeader.monthName}: Found Sales Value at column ${checkCol} (searched)`);
            break;
          }
        }
        if (foundSalesCol === -1) {
          console.log(`ABP Upload - ✗ ${monthHeader.monthName}: Sales Value NOT FOUND in range ${monthHeader.col + 3} to ${monthGroupEnd - 1}`);
        }
      }
      
      if (foundSalesCol !== -1) {
        monthMappings.push({
          monthHeaderCol: monthHeader.col,
          salesValueCol: foundSalesCol,
          qtyCol: foundQtyCol,
          applications: appColumns,
          month: monthHeader.month,
          year: monthHeader.year,
          monthName: monthHeader.monthName
        });
        console.log(`ABP Upload - Mapped ${monthHeader.monthName}: Month starts at col ${monthHeader.col}, Sales Value at col ${foundSalesCol} (offset: ${foundSalesCol - monthHeader.col}, month group ends at col ${monthGroupEnd})`);
      } else {
        console.warn(`ABP Upload - WARNING: Could not find Sales Value column for ${monthHeader.monthName} (month starts at col ${monthHeader.col}, group ends at col ${monthGroupEnd})`);
        console.warn(`  Searched columns ${monthHeader.col + 3} to ${monthGroupEnd - 1}`);
        console.warn(`  Headers in range:`, headerRow.slice(monthHeader.col, monthGroupEnd).map((h, i) => `Col ${monthHeader.col + i}: "${h}"`));
      }
    });
    
    console.log('ABP Upload - Found months:', monthMappings.map(m => `${m.monthName} (${m.year}-${m.month}) at column ${m.salesValueCol}`));
    console.log('ABP Upload - Month-to-SalesValue mappings:', monthMappings.map(m => `${m.monthName}: SalesValue at column ${m.salesValueCol} (header: "${headerRow[m.salesValueCol]}"), TotalQTY at column ${m.qtyCol}`));
    
    if (monthMappings.length === 0) {
      console.error('ABP Upload - CRITICAL ERROR: No month mappings found!');
      console.error('  Month headers found:', monthHeaders.length);
      console.error('  Month headers:', monthHeaders.map(m => `${m.monthName} at col ${m.col}`));
      console.error('  Sample month row cells:', monthRow.slice(0, 20));
      console.error('  Sample header row cells:', headerRow.slice(0, 20));
      
      return res.status(400).json({ 
        error: 'Could not find month headers in row 4 or corresponding Sales Value columns in row 5.',
        details: {
          foundMonthHeaders: monthHeaders.length,
          monthHeaders: monthHeaders.map(m => m.monthName),
          suggestion: 'Please ensure the file format matches the ABP template with month headers in row 4 and column headers in row 5.'
        }
      });
    }
    
    console.log(`ABP Upload - SUCCESS: Found ${monthMappings.length} month mappings, ready to process data rows`);
    
    // Find ERP ID column (this is the dealer code) - Row 5, Column 2 (index 1)
    // Note: "Territory Name" in Column 0 is actually the dealer name
    // "ERP ID" in Column 1 is the dealer code to match with dealers table
    let dealerCodeIndex = findColumn(headerRow, ['erp id', 'erp_id', 'erpid', 'erp']);
    if (dealerCodeIndex === -1) {
      // Fallback to column 1 (index 1) if not found by name
      dealerCodeIndex = 1;
      console.log('ABP Upload - ERP ID column not found by name, using default index 1');
    }
    
    const erpIdHeader = headerRow[dealerCodeIndex];
    console.log('ABP Upload - Using ERP ID column at index:', dealerCodeIndex);
    console.log('ABP Upload - ERP ID header value:', erpIdHeader, '(normalized:', String(erpIdHeader || '').trim().replace(/[\n\r\t]/g, ' '), ')');
    console.log('ABP Upload - Data rows to process:', data.length - 5);
    
    const targets = [];
    const abpItems = []; // per-application items
    const errors = [];
    const dealerCodesFound = new Set();
    const dealerCodesWithTargets = new Set();
    
    // Process data rows starting from row 6 (index 5)
    let rowsProcessed = 0;
    let rowsWithDealerCode = 0;
    
    for (let i = 5; i < data.length; i++) {
      const row = data[i];
      rowsProcessed++;
      
      // Check if row exists and has data
      if (!row) {
        continue;
      }
      
      // Handle both array and object formats
      const rowLength = Array.isArray(row) ? row.length : Object.keys(row).length;
      if (rowLength === 0) {
        continue;
      }
      
      // Get dealer code - handle both array index and object property access
      let dealerCodeRaw;
      if (Array.isArray(row)) {
        dealerCodeRaw = row[dealerCodeIndex];
      } else {
        // If row is an object, try to get by index or by header name
        dealerCodeRaw = row[dealerCodeIndex] || row[headerRow[dealerCodeIndex]];
      }
      
      // Convert to string if it's a number (Excel may read codes as numbers)
      if (typeof dealerCodeRaw === 'number') {
        dealerCodeRaw = String(dealerCodeRaw);
      }
      
      // Debug first few rows
      if (i < 10) {
        console.log(`ABP Upload - Row ${i + 1}: dealerCodeRaw =`, dealerCodeRaw, `(type: ${typeof dealerCodeRaw}, row type: ${Array.isArray(row) ? 'array' : 'object'}, row length: ${rowLength})`);
      }
      
      // Check if dealer code exists (handle both undefined and empty string)
      // Note: dealerCodeRaw can be 0 (number), which is falsy but we want to allow it
      if (dealerCodeRaw === undefined || dealerCodeRaw === null || dealerCodeRaw === '') {
        // Skip rows without dealer codes
        if (i < 10) console.log(`ABP Upload - Row ${i + 1}: Skipping - no dealer code`);
        continue;
      }
      
      rowsWithDealerCode++;
      const dealerCode = normalizeDealerCode(dealerCodeRaw);
      
      if (i < 10) {
        console.log(`ABP Upload - Row ${i + 1}: Normalized "${dealerCodeRaw}" → "${dealerCode}"`);
      }
      
      if (!dealerCode || dealerCode === '0') {
        console.log(`ABP Upload - Row ${i + 1}: Invalid dealer code after normalization: "${dealerCodeRaw}" → "${dealerCode}"`);
        continue;
      }
      
      dealerCodesFound.add(dealerCode);
      
      // Extract Sales Value for each month
      // Treat empty/null values as 0 - dealers will fill in values later
      monthMappings.forEach(mapping => {
        let salesValueRaw;
        let qtyValueRaw;
        if (Array.isArray(row)) {
          salesValueRaw = row[mapping.salesValueCol];
          qtyValueRaw = mapping.qtyCol !== -1 ? row[mapping.qtyCol] : null;
        } else {
          // If row is object, try to get by index or find the column
          salesValueRaw = row[mapping.salesValueCol] || (headerRow[mapping.salesValueCol] ? row[headerRow[mapping.salesValueCol]] : null);
          qtyValueRaw = mapping.qtyCol !== -1 ? (row[mapping.qtyCol] || (headerRow[mapping.qtyCol] ? row[headerRow[mapping.qtyCol]] : null)) : null;
        }
        
        // Handle numeric values (Excel may read numbers as numbers)
        if (typeof salesValueRaw === 'number') {
          salesValueRaw = salesValueRaw.toString();
        }
        if (typeof qtyValueRaw === 'number') {
          qtyValueRaw = qtyValueRaw.toString();
        }
        
        const salesValue = (salesValueRaw === null || salesValueRaw === undefined || salesValueRaw === '' || salesValueRaw === ' ') 
          ? 0 
          : (parseFloat(salesValueRaw) || 0);
        const qtyValue = (qtyValueRaw === null || qtyValueRaw === undefined || qtyValueRaw === '' || qtyValueRaw === ' ')
          ? 0
          : (parseFloat(qtyValueRaw) || 0);
        
        // Add all targets, even if 0 (dealers will update later)
        dealerCodesWithTargets.add(dealerCode);
        targets.push({
          dealer_code: dealerCode,
          year: mapping.year,
          month: mapping.month,
          target_amount: salesValue,
          abp_quantity: qtyValue
        });

        // Per-application quantities
        if (mapping.applications && Array.isArray(mapping.applications) && mapping.applications.length > 0) {
          mapping.applications.forEach(app => {
            // Skip if application name is missing or empty
            if (!app || !app.name || typeof app.name !== 'string' || app.name.trim() === '') {
              if (i < 10) {
                console.log(`ABP Upload - Row ${i + 1}: Skipping application column ${app?.col} - name is missing or empty`);
              }
              return;
            }
            
            let appQtyRaw;
            if (Array.isArray(row)) {
              appQtyRaw = row[app.col];
            } else {
              appQtyRaw = row[app.col] || (headerRow[app.col] ? row[headerRow[app.col]] : null);
            }
            if (typeof appQtyRaw === 'number') {
              appQtyRaw = appQtyRaw.toString();
            }
            const appQty = (appQtyRaw === null || appQtyRaw === undefined || appQtyRaw === '' || appQtyRaw === ' ')
              ? 0
              : (parseFloat(appQtyRaw) || 0);
            
            // Only store if application_unit name is valid (double-check)
            const appUnitName = app.name.trim();
            if (appUnitName && appUnitName.length > 0) {
              abpItems.push({
                dealer_code: dealerCode,
                year: mapping.year,
                month: mapping.month,
                application_unit: appUnitName,
                qty: appQty,
                amount: 0 // not available in ABP
              });
            } else {
              console.warn(`ABP Upload - Row ${i + 1}: Application unit name is empty after trim for column ${app.col}`);
            }
          });
        } else {
          // Log if no applications found for this month
          if (i < 10 && mapping.monthHeaderCol !== undefined) {
            console.log(`ABP Upload - Row ${i + 1}: No application columns found for ${mapping.monthName}. appColumns length: ${mapping.applications?.length || 0}`);
          }
        }
      });
    }
    
    console.log(`ABP Upload - Row processing summary:`);
    console.log(`  Total data rows in file: ${data.length}`);
    console.log(`  Rows processed: ${rowsProcessed}`);
    console.log(`  Rows with dealer codes: ${rowsWithDealerCode}`);
    console.log(`  Month mappings available: ${monthMappings.length}`);
    console.log(`  Expected targets per dealer: ${monthMappings.length}`);
    console.log(`  Expected total targets: ${rowsWithDealerCode * monthMappings.length}`);
    console.log(`ABP Upload - After processing rows: ${targets.length} targets, ${dealerCodesWithTargets.size} dealers`);
    console.log(`ABP Upload - Sample dealer codes:`, Array.from(dealerCodesWithTargets).slice(0, 5));
    
    // Show sample targets
    if (targets.length > 0) {
      console.log(`ABP Upload - Sample targets (first 5):`, targets.slice(0, 5));
    } else {
      console.log(`ABP Upload - WARNING: targets array is empty!`);
      console.log(`  This means the forEach loop for monthMappings did not execute or did not push any targets.`);
      console.log(`  monthMappings.length = ${monthMappings.length}`);
      console.log(`  dealerCodesWithTargets.size = ${dealerCodesWithTargets.size}`);
    }
    
    if (targets.length === 0) {
      console.error('ABP Upload - CRITICAL ERROR: No targets created!');
      console.error(`  Total data rows: ${data.length}`);
      console.error(`  Rows processed: ${rowsProcessed}`);
      console.error(`  Rows with dealer codes: ${rowsWithDealerCode}`);
      console.error(`  Dealers found: ${dealerCodesFound.size}`);
      console.error(`  Month mappings: ${monthMappings.length}`);
      console.error(`  Dealer code column index: ${dealerCodeIndex}`);
      console.error(`  Expected targets: ${rowsWithDealerCode * monthMappings.length} (if all rows had dealer codes)`);
      
      // Show sample of what we're reading
      if (data.length > 5) {
        const sampleRow = data[5];
        console.error(`  Sample row 6 type:`, Array.isArray(sampleRow) ? 'array' : typeof sampleRow);
        console.error(`  Sample row 6 length:`, Array.isArray(sampleRow) ? sampleRow.length : (sampleRow ? Object.keys(sampleRow).length : 0));
        console.error(`  Sample row 6 (first 15 cells):`, Array.isArray(sampleRow) ? sampleRow.slice(0, 15) : Object.values(sampleRow).slice(0, 15));
        console.error(`  Dealer code from row 6 at index ${dealerCodeIndex}:`, Array.isArray(sampleRow) ? sampleRow[dealerCodeIndex] : (sampleRow ? sampleRow[dealerCodeIndex] : 'N/A'));
      }
      
      // Check if monthMappings is empty
      if (monthMappings.length === 0) {
        console.error('  ROOT CAUSE: monthMappings is empty - no months were mapped!');
      } else if (rowsWithDealerCode === 0) {
        console.error('  ROOT CAUSE: No rows with dealer codes found!');
      } else {
        console.error('  ROOT CAUSE: Unknown - rows and months found but no targets created');
      }
      
      return res.status(400).json({ 
        error: 'No valid targets found in Excel file.',
        details: `Processed ${rowsProcessed} rows, found ${rowsWithDealerCode} rows with dealer codes, but created 0 targets.`,
        debug: {
          totalRows: data.length,
          rowsProcessed: rowsProcessed,
          rowsWithDealerCode: rowsWithDealerCode,
          dealersFound: dealerCodesFound.size,
          monthsFound: monthMappings.length,
          dealerCodeColumnIndex: dealerCodeIndex
        },
        suggestion: 'Please check that the file format matches the ABP template. Ensure: 1) Headers are in row 5, 2) Data starts from row 6, 3) ERP ID is in column 2, 4) Month headers are in row 4.'
      });
    }
    
    // Count targets with actual values vs zeros
    const targetsWithValues = targets.filter(t => t.target_amount > 0).length;
    const targetsWithZeros = targets.length - targetsWithValues;
    
    console.log(`ABP Upload - Processing ${targets.length} targets (${targetsWithValues} with values, ${targetsWithZeros} zeros) from ${dealerCodesWithTargets.size} dealers...`);
    console.log('Sample targets before validation:', targets.slice(0, 3));
    console.log('Dealer codes found:', Array.from(dealerCodesWithTargets));
    
    // First, verify that all dealer codes exist in the database
    // Get all dealers and create a mapping from normalized code to actual code
    db.query('SELECT dealer_code FROM dealers', (verifyErr, allDealers) => {
      if (verifyErr) {
        console.error('Error fetching dealers:', verifyErr);
        return res.status(500).json({ error: 'Failed to verify dealer codes', details: verifyErr.message });
      }
      
      // Create mapping: normalized code -> actual dealer_code from database
      const dealerCodeMap = {};
      allDealers.forEach(dealer => {
        const normalized = normalizeDealerCode(dealer.dealer_code);
        dealerCodeMap[normalized] = dealer.dealer_code; // Store actual format from DB
      });
      
      // Check which dealer codes from Excel exist
      const missingDealerCodes = [];
      const validDealerCodes = new Set();
      
      dealerCodesWithTargets.forEach(normalizedCode => {
        if (dealerCodeMap[normalizedCode]) {
          validDealerCodes.add(normalizedCode);
        } else {
          missingDealerCodes.push(normalizedCode);
        }
      });
      
      console.log(`ABP Upload - Dealer code validation: ${validDealerCodes.size} valid, ${missingDealerCodes.length} missing`);
      console.log(`ABP Upload - Sample file codes (normalized):`, Array.from(dealerCodesWithTargets).slice(0, 10));
      console.log(`ABP Upload - Sample DB codes (normalized):`, Object.keys(dealerCodeMap).slice(0, 10));
      
      // If ALL dealer codes are missing, that's the problem
      if (missingDealerCodes.length > 0 && validDealerCodes.size === 0) {
        return res.status(400).json({
          error: 'None of the dealer codes (ERP IDs) in the file match dealers in the system',
          details: {
            missingDealerCodes: missingDealerCodes.slice(0, 20),
            totalMissing: missingDealerCodes.length,
            totalInFile: dealerCodesWithTargets.size,
            sampleDatabaseCodes: Object.keys(dealerCodeMap).slice(0, 20),
            totalInDatabase: Object.keys(dealerCodeMap).length
          },
          suggestion: 'Please ensure the ERP IDs in the file match the dealer codes in your dealers table. The system normalizes codes (removes leading zeros) for matching.',
          note: 'Example: ERP ID "01359" becomes "1359" for matching. Make sure your dealer codes in the database match when normalized.'
        });
      }
      
      // Filter targets to only include valid dealer codes
      const updatedTargets = targets
        .filter(t => dealerCodeMap[t.dealer_code]) // Only keep targets for valid dealer codes
        .map(t => ({
          ...t,
          dealer_code: dealerCodeMap[t.dealer_code] // Use actual format from DB
        }));
      
      if (updatedTargets.length === 0) {
        // This should not happen if the above check passed, but handle it anyway
        return res.status(400).json({
          error: 'No valid targets found after dealer code validation',
          details: {
            targetsInFile: targets.length,
            dealersInFile: dealerCodesWithTargets.size,
            dealersInDatabase: Object.keys(dealerCodeMap).length,
            fileDealerCodes: Array.from(dealerCodesWithTargets).slice(0, 20),
            databaseDealerCodes: Object.keys(dealerCodeMap).slice(0, 20)
          },
          suggestion: 'Please ensure the ERP IDs in the file match the dealer codes in your dealers table. Check the dealer codes listed above.'
        });
      }
      
      if (missingDealerCodes.length > 0) {
        console.warn(`ABP Upload - Warning: ${missingDealerCodes.length} dealer codes not found, proceeding with ${validDealerCodes.size} valid codes`);
      }
      
      // Insert targets using REPLACE INTO (upsert)
      const insertQuery = `REPLACE INTO abp_targets (dealer_code, year, month, target_amount, abp_quantity) VALUES ?`;
      const values = updatedTargets.map(t => [t.dealer_code, t.year, t.month, t.target_amount, t.abp_quantity || 0]);
      
      db.query(insertQuery, [values], (err, result) => {
        if (err) {
          console.error('Error inserting ABP targets:', err);
          return res.status(500).json({ error: 'Failed to upload ABP targets', details: err.message });
        }

        // Insert per-application items if any
        const updatedItems = abpItems
          .filter(item => dealerCodeMap[item.dealer_code])
          .map(item => ({
            ...item,
            dealer_code: dealerCodeMap[item.dealer_code]
          }));

        const insertItems = () => {
          if (updatedItems.length === 0) {
            // No items to insert, return success response
            return respondSuccess();
          }
          
          // Filter out items with null/empty application_unit
          const validItems = updatedItems.filter(it => 
            it.application_unit && 
            typeof it.application_unit === 'string' && 
            it.application_unit.trim().length > 0
          );
          
          if (validItems.length === 0) {
            console.log('ABP Upload - No valid application unit items to insert (all had null/empty application_unit)');
            return respondSuccess();
          }
          
          if (validItems.length < updatedItems.length) {
            console.warn(`ABP Upload - Filtered out ${updatedItems.length - validItems.length} items with null/empty application_unit`);
          }
          
          const itemValues = validItems.map(it => [
            it.dealer_code,
            it.year,
            it.month,
            it.application_unit.trim(),
            it.qty,
            it.amount
          ]);
          const itemQuery = `REPLACE INTO abp_target_items (dealer_code, year, month, application_unit, qty, amount) VALUES ?`;
          db.query(itemQuery, [itemValues], (itemErr) => {
            if (itemErr) {
              console.error('Error inserting ABP target items:', itemErr);
              // Check if table doesn't exist
              if (itemErr.code === 'ER_NO_SUCH_TABLE') {
                return res.status(500).json({ 
                  error: 'Failed to upload ABP target items', 
                  details: itemErr.message,
                  suggestion: 'The abp_target_items table does not exist. Please run: node server/create-abp-items-table.js'
                });
              }
              return res.status(500).json({ 
                error: 'Failed to upload ABP target items', 
                details: itemErr.message,
                code: itemErr.code,
                sqlState: itemErr.sqlState
              });
            }
            return respondSuccess();
          });
        };

        const respondSuccess = () => {
          // Sync comparison tables
          syncComparisonTables(() => {
            // Create summary by month
            const monthSummary = {};
            targets.forEach(t => {
              const key = `${t.year}-${String(t.month).padStart(2, '0')}`;
              if (!monthSummary[key]) {
                monthSummary[key] = { count: 0, total: 0 };
              }
              monthSummary[key].count++;
              monthSummary[key].total += t.target_amount;
            });
            
            res.json({
              success: true,
              message: `Successfully uploaded ${updatedTargets.length} ABP targets from ${dealerCodesWithTargets.size} dealer(s)`,
              inserted: updatedTargets.length,
              targets: {
                withValues: targetsWithValues,
                withZeros: targetsWithZeros,
                note: targetsWithZeros > 0 ? 'Some targets are set to 0 (empty Sales Values). Dealers can update these later.' : 'All targets have values.'
              },
              dealers: {
                total: dealerCodesWithTargets.size,
                codes: Array.from(dealerCodesWithTargets).map(code => dealerCodeMap[code])
              },
              months: {
                total: monthMappings.length,
                summary: monthSummary
              },
              sample: updatedTargets.slice(0, 5)
            });
          });
        };

        // Proceed to insert items (or respond if none)
        insertItems();
        
      });
    });
    
  } catch (error) {
    console.error('Error processing ABP Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file', details: error.message });
  }
});

// Upload Forecast Targets from Excel (Sales Manager, Sales Official, Admin only)
router.post('/forecast/upload', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), upload.single('file'), (req, res) => {
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
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length < 3) {
      return res.status(400).json({ error: 'Invalid file format. Expected at least 3 rows.' });
    }
    
    // Row 1 (index 0), Column C (index 2) contains month info (merged cell C1:J1)
    const monthInfo = data[0][2]; // C1
    if (!monthInfo) {
      return res.status(400).json({ 
        error: 'Month information not found in cell C1. Expected format: "Forecast November -25" or similar.' 
      });
    }
    
    // Parse month and year from C1
    const monthYearInfo = parseMonthYear(monthInfo);
    if (!monthYearInfo) {
      return res.status(400).json({ 
        error: `Could not parse month/year from cell C1: "${monthInfo}". Expected format like "Forecast November -25"` 
      });
    }
    
    const { month, year } = monthYearInfo;
    console.log(`Forecast Upload - Month: ${month}, Year: ${year} (from: ${monthInfo})`);
    
    // Row 2 (index 1) contains headers
    const headers = data[1] || [];
    
    // Find Sales Value column (should be column I, index 8)
    const salesValueIndex = findColumn(headers, ['sales value', 'sales_value', 'target', 'target amount', 'forecast', 'amount']);
    // Find Quantity column (optional)
    const salesQtyIndex = findColumn(headers, ['sales qty', 'sales quantity', 'quantity', 'qty', 'total qty']);
    
    // Identify application unit columns (ET Reg, ET Premium, Rickshaw, IPS, Solar)
    // These should be before Total QTY and Sales Value
    const applicationUnitColumns = [];
    const applicationUnitNames = ['et reg', 'et premium', 'et premiun', 'rickshaw', 'ips', 'solar'];
    
    headers.forEach((header, index) => {
      if (!header) return;
      const headerLower = String(header).trim().toLowerCase();
      // Check if this header matches any application unit name
      const matchedUnit = applicationUnitNames.find(unitName => 
        headerLower === unitName || headerLower.includes(unitName) || unitName.includes(headerLower)
      );
      if (matchedUnit && index !== salesValueIndex && index !== salesQtyIndex) {
        applicationUnitColumns.push({
          name: String(header).trim(),
          col: index
        });
      }
    });
    
    console.log('Forecast Upload - Found application unit columns:', applicationUnitColumns.map(a => `${a.name} at col ${a.col}`));
    
    if (salesValueIndex === -1) {
      return res.status(400).json({ 
        error: 'Sales Value column not found. Expected column header: "Sales Value"',
        foundColumns: headers.filter(h => h)
      });
    }
    
    // Find ERP ID column (this is the dealer code) - Row 2, Column B (index 1)
    // Note: "Territory Name" in Column A is actually the dealer name
    // "ERP ID" in Column B is the dealer code to match with dealers table
    let dealerCodeIndex = findColumn(headers, ['erp id', 'erp_id', 'erpid', 'erp']);
    if (dealerCodeIndex === -1) {
      // Fallback to column B (index 1) if not found by name
      dealerCodeIndex = 1;
    }
    
    console.log('Forecast Upload - Using ERP ID column at index:', dealerCodeIndex, 'Header:', headers[dealerCodeIndex]);
    
    const targets = [];
    const forecastItems = []; // per-application unit items
    const errors = [];
    const dealerCodesFound = new Set();
    const dealerCodesWithTargets = new Set();
    
    // Process data rows starting from row 3 (index 2)
    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      // Get dealer code (can be string or number)
      const dealerCodeRaw = row[dealerCodeIndex];
      if (!dealerCodeRaw && dealerCodeRaw !== 0) continue;
      
      const dealerCode = normalizeDealerCode(dealerCodeRaw);
      if (!dealerCode || dealerCode === '0') continue;
      
      dealerCodesFound.add(dealerCode);
      
      const targetAmount = parseFloat(row[salesValueIndex]) || 0;
      const forecastQty = salesQtyIndex !== -1 ? (parseFloat(row[salesQtyIndex]) || 0) : 0;
      
      // Only add if target amount or quantity > 0
      if (targetAmount > 0 || forecastQty > 0) {
        dealerCodesWithTargets.add(dealerCode);
        targets.push({
          dealer_code: dealerCode,
          year: year,
          month: month,
          target_amount: targetAmount,
          forecast_quantity: forecastQty
        });
      }
      
      // Parse application unit quantities
      applicationUnitColumns.forEach(appUnit => {
        const appQtyRaw = row[appUnit.col];
        const appQty = (appQtyRaw === null || appQtyRaw === undefined || appQtyRaw === '' || appQtyRaw === ' ' || appQtyRaw === '-')
          ? 0
          : (parseFloat(appQtyRaw) || 0);
        
        // Store all application units, even if qty is 0
        forecastItems.push({
          dealer_code: dealerCode,
          year: year,
          month: month,
          application_unit: appUnit.name,
          qty: appQty,
          amount: 0 // Amount not available per unit in Forecast format
        });
      });
    }
    
    if (targets.length === 0) {
      return res.status(400).json({ 
        error: 'No valid targets found in Excel file. Make sure Sales Value column has data filled in by dealers.',
        dealersFound: Array.from(dealerCodesFound),
        month: `${year}-${String(month).padStart(2, '0')}`,
        suggestion: 'Check that dealers have filled in the Sales Value column.'
      });
    }
    
    console.log(`Processing ${targets.length} Forecast targets for ${year}-${month} from ${dealerCodesWithTargets.size} dealers...`);
    
    // First, verify that all dealer codes exist in the database
    // Get all dealers and create a mapping from normalized code to actual code
    db.query('SELECT dealer_code FROM dealers', (verifyErr, allDealers) => {
      if (verifyErr) {
        console.error('Error fetching dealers:', verifyErr);
        return res.status(500).json({ error: 'Failed to verify dealer codes', details: verifyErr.message });
      }
      
      // Create mapping: normalized code -> actual dealer_code from database
      const dealerCodeMap = {};
      allDealers.forEach(dealer => {
        const normalized = normalizeDealerCode(dealer.dealer_code);
        dealerCodeMap[normalized] = dealer.dealer_code; // Store actual format from DB
      });
      
      // Check which dealer codes from Excel exist
      const missingDealerCodes = [];
      const validDealerCodes = new Set();
      
      dealerCodesWithTargets.forEach(normalizedCode => {
        if (dealerCodeMap[normalizedCode]) {
          validDealerCodes.add(normalizedCode);
        } else {
          missingDealerCodes.push(normalizedCode);
        }
      });
      
      console.log(`Forecast Upload - Dealer code validation: ${validDealerCodes.size} valid, ${missingDealerCodes.length} missing`);
      
      // If ALL dealer codes are missing, that's a critical error
      if (missingDealerCodes.length > 0 && validDealerCodes.size === 0) {
        return res.status(400).json({
          error: 'None of the dealer codes in the file match dealers in the system',
          details: {
            missingDealerCodes: missingDealerCodes.slice(0, 20),
            totalMissing: missingDealerCodes.length,
            sampleDatabaseCodes: Object.keys(dealerCodeMap).slice(0, 20)
          },
          suggestion: 'Please ensure the ERP IDs in the file match the dealer codes in your dealers table. The system normalizes codes (removes leading zeros) for matching.'
        });
      }
      
      // Filter targets to only include valid dealer codes
      const updatedTargets = targets
        .filter(t => dealerCodeMap[t.dealer_code]) // Only keep targets for valid dealer codes
        .map(t => ({
          ...t,
          dealer_code: dealerCodeMap[t.dealer_code] // Use actual format from DB
        }));
      
      if (updatedTargets.length === 0) {
        return res.status(400).json({
          error: 'No valid targets found after dealer code validation',
          details: {
            targetsInFile: targets.length,
            dealersInFile: dealerCodesWithTargets.size,
            missingDealerCodes: missingDealerCodes.slice(0, 20)
          },
          suggestion: 'Please ensure the dealer codes in the file match the dealer codes in your dealers table.'
        });
      }
      
      // Warn about missing dealer codes but proceed with valid ones
      if (missingDealerCodes.length > 0) {
        console.warn(`Forecast Upload - Warning: ${missingDealerCodes.length} dealer codes not found, proceeding with ${validDealerCodes.size} valid codes`);
      }
      
      // Insert targets using REPLACE INTO (upsert)
      const insertQuery = `REPLACE INTO forecast_targets (dealer_code, year, month, target_amount, forecast_quantity) VALUES ?`;
      const values = updatedTargets.map(t => [t.dealer_code, t.year, t.month, t.target_amount, t.forecast_quantity || 0]);
      
      db.query(insertQuery, [values], (err, result) => {
        if (err) {
          console.error('Error inserting Forecast targets:', err);
          return res.status(500).json({ error: 'Failed to upload Forecast targets', details: err.message });
        }
        
        // Insert per-application unit items
        const insertItems = () => {
          if (forecastItems.length === 0) {
            return syncComparisonTables(() => respondSuccess());
          }
          
          // Filter items to only include valid dealer codes
          const updatedItems = forecastItems
            .filter(item => dealerCodeMap[item.dealer_code])
            .map(item => ({
              ...item,
              dealer_code: dealerCodeMap[item.dealer_code]
            }));
          
          const itemValues = updatedItems.map(it => [
            it.dealer_code,
            it.year,
            it.month,
            it.application_unit,
            it.qty,
            it.amount
          ]);
          
          const itemQuery = `REPLACE INTO forecast_target_items (dealer_code, year, month, application_unit, qty, amount) VALUES ?`;
          db.query(itemQuery, [itemValues], (itemErr) => {
            if (itemErr) {
              console.error('Error inserting Forecast target items:', itemErr);
              // Check if table doesn't exist
              if (itemErr.code === 'ER_NO_SUCH_TABLE') {
                return res.status(500).json({ 
                  error: 'Failed to upload Forecast target items', 
                  details: itemErr.message,
                  suggestion: 'The forecast_target_items table does not exist. Please run: node server/migrate-application-units.js'
                });
              }
              // Continue even if items fail - main targets are saved
              console.warn('Warning: Failed to save application unit items, but main targets were saved');
            }
            return syncComparisonTables(() => respondSuccess());
          });
        };
        
        const respondSuccess = () => {
          const response = {
            success: true,
            message: `Successfully uploaded ${updatedTargets.length} Forecast targets for ${monthInfo.trim()}`,
            inserted: updatedTargets.length,
            month: {
              name: monthInfo.trim(),
              year: year,
              month: month
            },
            dealers: {
              total: dealerCodesWithTargets.size,
              codes: Array.from(dealerCodesWithTargets).map(code => dealerCodeMap[code])
            },
            totalTarget: updatedTargets.reduce((sum, t) => sum + t.target_amount, 0),
            applicationUnits: applicationUnitColumns.length,
            sample: updatedTargets.slice(0, 5)
          };
          
          // Add warning if some dealer codes were missing
          if (missingDealerCodes.length > 0) {
            response.warning = `Some dealer codes (${missingDealerCodes.length}) were not found in the system and were skipped.`;
            response.missingDealerCodes = missingDealerCodes.slice(0, 20);
            response.totalSkipped = missingDealerCodes.length;
            response.totalProcessed = validDealerCodes.size;
          }
          
          res.json(response);
        };
        
        // Insert items
        insertItems();
      });
    });
    
  } catch (error) {
    console.error('Error processing Forecast Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file', details: error.message });
  }
});

// Helper function to convert Excel serial date to JavaScript date
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

// Upload Achievements from Excel (Sales Register format)
// Upload Achievements from Excel (Sales Manager, Sales Official, Admin only)
router.post('/achievements/upload', authenticateToken, authorize('admin', 'sales_official', 'sales_manager'), upload.single('file'), (req, res) => {
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
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length < 9) {
      return res.status(400).json({ error: 'Invalid file format. Expected headers in row 8 and data starting from row 9.' });
    }
    
    // Row 8 (index 7) contains headers
    const headerRow = data[7] || [];
    
    // Find required columns - must contain "actual" for quantity and amount
    const findColumnWithActual = (headers, possibleNames) => {
      for (const name of possibleNames) {
        const index = headers.findIndex(h => {
          if (!h) return false;
          const header = String(h).trim().toLowerCase();
          const searchName = name.toLowerCase();
          // Must contain "actual" to avoid matching regular invoice columns
          return header.includes('actual') && (
            header === searchName || 
            header.includes(searchName) || 
            searchName.includes(header) ||
            header.replace(/[\s_\-\.]/g, '') === searchName.replace(/[\s_\-\.]/g, '')
          );
        });
        if (index !== -1) return index;
      }
      return -1;
    };
    
    // Find dealer code column - could be "Dealer Code" or "ERP ID"
    let dealerCodeIndex = findColumn(headerRow, ['dealer code', 'dealer_code', 'dealerco', 'erp id', 'erp_id', 'erpid', 'code', 'dealer']);
    const orderDateIndex = findColumn(headerRow, ['order date', 'order_date', 'date', 'invoice date', 'orderdate']);
    // Find Application Unit column
    const applicationUnitIndex = findColumn(headerRow, ['application unit', 'application_unit', 'application', 'unit', 'app unit']);
    // Note: File has typo "Qunatity" instead of "Quantity"
    const quantityIndex = findColumnWithActual(headerRow, ['actual invoice qunatity', 'actual invoice quantity', 'actual_invoice_qunatity', 'actual_invoice_quantity']);
    const amountIndex = findColumnWithActual(headerRow, ['actual invoice amount', 'actual_invoice_amount']);
    
    if (dealerCodeIndex === -1) {
      return res.status(400).json({ 
        error: 'Dealer Code column not found. Expected column header: "Dealer Code"',
        foundColumns: headerRow.filter(h => h)
      });
    }
    
    if (orderDateIndex === -1) {
      return res.status(400).json({ 
        error: 'Order Date column not found. Expected column header: "Order Date"',
        foundColumns: headerRow.filter(h => h)
      });
    }
    
    if (amountIndex === -1) {
      return res.status(400).json({ 
        error: 'Actual Invoice Amount column not found. Expected column header: "Actual Invoice Amount"',
        foundColumns: headerRow.filter(h => h)
      });
    }
    
    // Quantity is optional - don't error if not found, but log it
    if (quantityIndex === -1) {
      console.log('Achievements Upload - Warning: Actual Invoice Quantity column not found. Quantity will be set to 0.');
    }
    
    console.log('Achievements Upload - Columns found:');
    console.log('  Dealer Code:', dealerCodeIndex, headerRow[dealerCodeIndex]);
    console.log('  Order Date:', orderDateIndex, headerRow[orderDateIndex]);
    console.log('  Actual Invoice Amount:', amountIndex, headerRow[amountIndex]);
    if (quantityIndex !== -1) {
      console.log('  Actual Invoice Quantity:', quantityIndex, headerRow[quantityIndex]);
    }
    if (applicationUnitIndex !== -1) {
      console.log('  Application Unit:', applicationUnitIndex, headerRow[applicationUnitIndex]);
    } else {
      console.log('  Application Unit: NOT FOUND - will aggregate without unit breakdown');
    }
    
    // Process data rows starting from row 9 (index 8)
    // Aggregate achievements by dealer, year, month, and application unit
    const achievementMap = {}; // Key: dealer_code-year-month (for main achievements table)
    const achievementItemsMap = {}; // Key: dealer_code-year-month-application_unit (for items table)
    const dealerCodesFound = new Set();
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
      
      dealerCodesFound.add(dealerCode);
      
      // Get order date and parse year/month
      const orderDateRaw = row[orderDateIndex];
      if (!orderDateRaw) continue;
      
      const orderDate = excelDateToJSDate(orderDateRaw);
      if (!orderDate || isNaN(orderDate.getTime())) {
        console.warn(`Row ${i + 1}: Invalid order date: ${orderDateRaw}`);
        continue;
      }
      
      const year = orderDate.getFullYear();
      const month = orderDate.getMonth() + 1; // JavaScript months are 0-indexed
      
      // Get application unit (if available)
      let applicationUnit = 'Total'; // Default if not found
      if (applicationUnitIndex !== -1) {
        const appUnitRaw = row[applicationUnitIndex];
        if (appUnitRaw) {
          applicationUnit = String(appUnitRaw).trim();
          if (!applicationUnit) applicationUnit = 'Total';
        }
      }
      
      // Get achievement amount (Actual Invoice Amount)
      const achievementAmount = parseFloat(row[amountIndex]) || 0;
      
      // Get achievement quantity (Actual Invoice Quantity) - optional
      const achievementQuantity = quantityIndex !== -1 ? (parseFloat(row[quantityIndex]) || 0) : 0;
      
      if (achievementAmount <= 0 && achievementQuantity <= 0) continue; // Skip zero records
      
      rowsWithData++;
      
      // Aggregate by dealer-year-month (for main achievements table)
      const key = `${dealerCode}-${year}-${month}`;
      if (!achievementMap[key]) {
        achievementMap[key] = {
          dealer_code: dealerCode,
          year: year,
          month: month,
          achievement_amount: 0,
          achievement_quantity: 0
        };
      }
      achievementMap[key].achievement_amount += achievementAmount;
      achievementMap[key].achievement_quantity += achievementQuantity;
      
      // Aggregate by dealer-year-month-application_unit (for items table)
      const itemKey = `${dealerCode}-${year}-${month}-${applicationUnit}`;
      if (!achievementItemsMap[itemKey]) {
        achievementItemsMap[itemKey] = {
          dealer_code: dealerCode,
          year: year,
          month: month,
          application_unit: applicationUnit,
          qty: 0,
          amount: 0
        };
      }
      achievementItemsMap[itemKey].qty += achievementQuantity;
      achievementItemsMap[itemKey].amount += achievementAmount;
    }
    
    const achievements = Object.values(achievementMap);
    const achievementItems = Object.values(achievementItemsMap);
    
    if (achievements.length === 0) {
      return res.status(400).json({ 
        error: 'No valid achievements found in Excel file.',
        totalRowsProcessed: totalRowsProcessed,
        rowsWithData: rowsWithData,
        dealersFound: Array.from(dealerCodesFound),
        suggestion: 'Check that Order Date and Actual Invoice Amount columns have valid data.'
      });
    }
    
    console.log(`Processing ${achievements.length} aggregated achievements from ${rowsWithData} invoice rows...`);
    console.log(`Processing ${achievementItems.length} application unit items...`);
    
    // Verify that all dealer codes exist in the database
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
      
      // Check which dealer codes exist
      const missingDealerCodes = [];
      const validAchievements = [];
      
      achievements.forEach(ach => {
        if (dealerCodeMap[ach.dealer_code]) {
          validAchievements.push({
            ...ach,
            dealer_code: dealerCodeMap[ach.dealer_code] // Use actual format from DB
          });
        } else {
          missingDealerCodes.push(ach.dealer_code);
        }
      });
      
      // Only error if ALL dealer codes are missing
      if (validAchievements.length === 0) {
        return res.status(400).json({
          error: 'No valid achievements found. All dealer codes in the file do not exist in the system',
          missingDealerCodes: [...new Set(missingDealerCodes)],
          suggestion: 'Please add these dealers to the system first, or check if the dealer codes are correct.'
        });
      }
      
      // Warn about missing dealer codes but proceed with valid ones
      if (missingDealerCodes.length > 0) {
        console.warn(`Achievements Upload - Warning: ${missingDealerCodes.length} dealer codes not found, proceeding with ${validAchievements.length} valid achievements`);
      }
      
      // Insert achievements using REPLACE INTO (upsert)
      const insertQuery = `REPLACE INTO achievements (dealer_code, year, month, achievement_amount, achievement_quantity) VALUES ?`;
      const values = validAchievements.map(a => [a.dealer_code, a.year, a.month, a.achievement_amount, a.achievement_quantity || 0]);
      
      db.query(insertQuery, [values], (err, result) => {
        if (err) {
          console.error('Error inserting achievements:', err);
          return res.status(500).json({ error: 'Failed to upload achievements', details: err.message });
        }
        
        // Insert per-application unit items
        const insertItems = () => {
          if (achievementItems.length === 0) {
            return syncComparisonTables(() => respondSuccess());
          }
          
          // Filter items to only include valid dealer codes
          const updatedItems = achievementItems
            .filter(item => dealerCodeMap[item.dealer_code])
            .map(item => ({
              ...item,
              dealer_code: dealerCodeMap[item.dealer_code]
            }));
          
          const itemValues = updatedItems.map(it => [
            it.dealer_code,
            it.year,
            it.month,
            it.application_unit,
            it.qty,
            it.amount
          ]);
          
          const itemQuery = `REPLACE INTO achievement_items (dealer_code, year, month, application_unit, qty, amount) VALUES ?`;
          db.query(itemQuery, [itemValues], (itemErr) => {
            if (itemErr) {
              console.error('Error inserting Achievement items:', itemErr);
              // Check if table doesn't exist
              if (itemErr.code === 'ER_NO_SUCH_TABLE') {
                return res.status(500).json({ 
                  error: 'Failed to upload Achievement items', 
                  details: itemErr.message,
                  suggestion: 'The achievement_items table does not exist. Please run: node server/migrate-application-units.js'
                });
              }
              // Continue even if items fail - main achievements are saved
              console.warn('Warning: Failed to save application unit items, but main achievements were saved');
            }
            return syncComparisonTables(() => respondSuccess());
          });
        };
        
        const respondSuccess = () => {
          // Create summary by month
          const monthSummary = {};
          validAchievements.forEach(a => {
            const key = `${a.year}-${String(a.month).padStart(2, '0')}`;
            if (!monthSummary[key]) {
              monthSummary[key] = { count: 0, total: 0 };
            }
            monthSummary[key].count++;
            monthSummary[key].total += a.achievement_amount;
          });
          
          const response = {
            success: true,
            message: `Successfully uploaded ${validAchievements.length} achievements aggregated from ${rowsWithData} invoice rows`,
            inserted: validAchievements.length,
            rowsProcessed: {
              total: totalRowsProcessed,
              withData: rowsWithData
            },
            dealers: {
              total: new Set(validAchievements.map(a => a.dealer_code)).size,
              codes: [...new Set(validAchievements.map(a => a.dealer_code))]
            },
            months: {
              total: Object.keys(monthSummary).length,
              summary: monthSummary
            },
            applicationUnits: applicationUnitIndex !== -1 ? 'Grouped by Application Unit' : 'Not available',
            sample: validAchievements.slice(0, 5)
          };
          
          // Add warning if some dealer codes were missing
          if (missingDealerCodes.length > 0) {
            response.warning = `Some dealer codes (${missingDealerCodes.length}) were not found in the system and were skipped.`;
            response.missingDealerCodes = [...new Set(missingDealerCodes)].slice(0, 50);
            response.totalSkipped = missingDealerCodes.length;
            response.totalProcessed = validAchievements.length;
          }
          
          res.json(response);
        };
        
        // Insert items
        insertItems();
      });
    });
    
  } catch (error) {
    console.error('Error processing Achievements Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file', details: error.message });
  }
});

// Get Target vs Achievement Report
router.get('/report', authenticateToken, canAccessDealerData, (req, res) => {
  const { dealer_code, year, month, territory, showAll = 'false' } = req.query;
  const showAllFlag = showAll === 'true';
  const defaultLimit = 10;
  const limit = showAllFlag ? null : (parseInt(req.query.limit) || defaultLimit);
  const page = parseInt(req.query.page) || 1;
  
  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  // If dealer role, only show their own data (override dealer_code param)
  if (req.user.role_name === 'dealer' && req.user.dealer_code) {
    whereClause += ' AND BINARY d.dealer_code = ?';
    queryParams.push(req.user.dealer_code);
  } else if (dealer_code) {
    whereClause += ' AND d.dealer_code = ?';
    queryParams.push(normalizeDealerCode(dealer_code));
  }
  
  // Note: year and month filtering is done in JOIN conditions, not WHERE clause
  // to avoid duplicate parameter binding
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // Build JOIN conditions for year/month filters
  // Use comparison tables first, fall back to raw tables if comparison tables don't have data
  let abpCompJoinCondition = 'd.dealer_code = abp_comp.dealer_code';
  let fcCompJoinCondition = 'd.dealer_code = fc_comp.dealer_code';
  let abpRawJoinCondition = 'd.dealer_code = abp_raw.dealer_code';
  let fcRawJoinCondition = 'd.dealer_code = fc_raw.dealer_code';
  let achJoinCondition = 'd.dealer_code = ach.dealer_code';
  
  // Build join params for each table in the order they appear in the JOIN clauses
  // Order: abp_comp, fc_comp, abp_raw, fc_raw, ach
  // For each: year (if set), then month (if set)
  const abpCompParams = [];
  const fcCompParams = [];
  const abpRawParams = [];
  const fcRawParams = [];
  const achParams = [];
  
  if (year) {
    abpCompJoinCondition += ' AND abp_comp.year = ?';
    fcCompJoinCondition += ' AND fc_comp.year = ?';
    abpRawJoinCondition += ' AND abp_raw.year = ?';
    fcRawJoinCondition += ' AND fc_raw.year = ?';
    achJoinCondition += ' AND ach.year = ?';
    abpCompParams.push(parseInt(year));
    fcCompParams.push(parseInt(year));
    abpRawParams.push(parseInt(year));
    fcRawParams.push(parseInt(year));
    achParams.push(parseInt(year));
  }
  
  if (month) {
    abpCompJoinCondition += ' AND abp_comp.month = ?';
    fcCompJoinCondition += ' AND fc_comp.month = ?';
    abpRawJoinCondition += ' AND abp_raw.month = ?';
    fcRawJoinCondition += ' AND fc_raw.month = ?';
    achJoinCondition += ' AND ach.month = ?';
    abpCompParams.push(parseInt(month));
    fcCompParams.push(parseInt(month));
    abpRawParams.push(parseInt(month));
    fcRawParams.push(parseInt(month));
    achParams.push(parseInt(month));
  }
  
  // Params must be in the order the JOINs appear in the query
  const joinParams = [...abpCompParams, ...fcCompParams, ...abpRawParams, ...fcRawParams, ...achParams];
  const finalParams = [...joinParams, ...queryParams];
  
  // When year/month filters are applied, show all dealers (even with 0s)
  // When no filters are applied, only show dealers with data
  const hasDateFilter = year || month;
  const dataFilterClause = hasDateFilter 
    ? '' // Show all dealers when filtering by date
    : 'AND (abp_comp.id IS NOT NULL OR fc_comp.id IS NOT NULL OR abp_raw.id IS NOT NULL OR fc_raw.id IS NOT NULL OR ach.id IS NOT NULL)'; // Only show dealers with data when no date filter
  
  // Main query - prefer comparison tables, fall back to raw tables if comparison tables don't have data
  // Use percentages from comparison tables when available
  let query = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      t.territory_name,
      COALESCE(fc_comp.year, fc_raw.year, abp_comp.year, abp_raw.year, ach.year${year ? `, ${parseInt(year)}` : ''}) as year,
      COALESCE(fc_comp.month, fc_raw.month, abp_comp.month, abp_raw.month, ach.month${month ? `, ${parseInt(month)}` : ''}) as month,
      -- ABP Target: Prefer from comparison table, fall back to raw table
      COALESCE(abp_comp.abp_target_amount, abp_raw.target_amount, 0) as abp_target,
      COALESCE(abp_comp.abp_target_quantity, abp_raw.abp_quantity, 0) as abp_quantity,
      -- Forecast Target: Prefer from comparison table, fall back to raw table
      COALESCE(fc_comp.forecast_target_amount, fc_raw.target_amount, 0) as forecast_target,
      COALESCE(fc_comp.forecast_target_quantity, fc_raw.forecast_quantity, 0) as forecast_quantity,
      -- Debug: Check if forecast data exists
      CASE WHEN fc_comp.id IS NOT NULL OR fc_raw.id IS NOT NULL THEN 1 ELSE 0 END as has_forecast_data,
      -- Achievement: Prefer from comparison tables, fall back to raw achievements table
      COALESCE(fc_comp.achievement_amount, abp_comp.achievement_amount, ach.achievement_amount, 0) as achievement,
      COALESCE(fc_comp.achievement_quantity, abp_comp.achievement_quantity, ach.achievement_quantity, 0) as achievement_quantity,
      -- Effective Target: Forecast overrides ABP (if Forecast exists, use it; otherwise use ABP)
      CASE 
        WHEN COALESCE(fc_comp.forecast_target_amount, fc_raw.target_amount, 0) > 0 THEN 
          COALESCE(fc_comp.forecast_target_amount, fc_raw.target_amount, 0)
        ELSE COALESCE(abp_comp.abp_target_amount, abp_raw.target_amount, 0)
      END as effective_target,
      -- Achievement Percentage: Use pre-calculated percentage from comparison tables when available
      -- Otherwise calculate on the fly from raw tables
      CASE 
        WHEN fc_comp.forecast_target_amount IS NOT NULL AND fc_comp.forecast_target_amount > 0 THEN 
          COALESCE(fc_comp.amount_percentage, 0)
        WHEN fc_raw.target_amount IS NOT NULL AND fc_raw.target_amount > 0 THEN 
          ((COALESCE(ach.achievement_amount, 0) / fc_raw.target_amount) * 100)
        WHEN abp_comp.abp_target_amount IS NOT NULL AND abp_comp.abp_target_amount > 0 THEN 
          COALESCE(abp_comp.amount_percentage, 0)
        WHEN abp_raw.target_amount IS NOT NULL AND abp_raw.target_amount > 0 THEN 
          ((COALESCE(ach.achievement_amount, 0) / abp_raw.target_amount) * 100)
        ELSE 0
      END as achievement_percentage,
      -- Variance: Achievement - Effective Target
      (COALESCE(fc_comp.achievement_amount, abp_comp.achievement_amount, ach.achievement_amount, 0) - 
       CASE 
         WHEN COALESCE(fc_comp.forecast_target_amount, fc_raw.target_amount, 0) > 0 THEN 
           COALESCE(fc_comp.forecast_target_amount, fc_raw.target_amount, 0)
         ELSE COALESCE(abp_comp.abp_target_amount, abp_raw.target_amount, 0)
       END) as variance
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN abp_vs_achievement abp_comp ON ${abpCompJoinCondition}
    LEFT JOIN forecast_vs_achievement fc_comp ON ${fcCompJoinCondition}
    LEFT JOIN abp_targets abp_raw ON ${abpRawJoinCondition}
    LEFT JOIN forecast_targets fc_raw ON ${fcRawJoinCondition}
    LEFT JOIN achievements ach ON ${achJoinCondition}
    ${whereClause}
    ${dataFilterClause}
    ORDER BY d.dealer_name ASC, COALESCE(fc_comp.year, fc_raw.year, abp_comp.year, abp_raw.year, ach.year) DESC, COALESCE(fc_comp.month, fc_raw.month, abp_comp.month, abp_raw.month, ach.month) DESC
  `;
  
  // Get total count - simplified
  const countQuery = `
    SELECT COUNT(DISTINCT d.dealer_code) as total
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN abp_vs_achievement abp_comp ON ${abpCompJoinCondition}
    LEFT JOIN forecast_vs_achievement fc_comp ON ${fcCompJoinCondition}
    LEFT JOIN abp_targets abp_raw ON ${abpRawJoinCondition}
    LEFT JOIN forecast_targets fc_raw ON ${fcRawJoinCondition}
    LEFT JOIN achievements ach ON ${achJoinCondition}
    ${whereClause}
    ${dataFilterClause}
  `;
  
  console.log('=== TARGET REPORT QUERY DEBUG ===');
  console.log('Query params:', { dealer_code, year, month, territory, showAll: showAllFlag, limit, page });
  console.log('Join conditions:', { abpCompJoinCondition, fcCompJoinCondition, abpRawJoinCondition, fcRawJoinCondition });
  console.log('Using comparison tables (preferred) and raw tables (fallback):');
  console.log('  - Comparison: abp_vs_achievement, forecast_vs_achievement');
  console.log('  - Raw: abp_targets, forecast_targets, achievements');
  console.log('Final params:', finalParams);
  console.log('Query:', query.substring(0, 200) + '...');
  
  db.query(countQuery, finalParams, (err, countResults) => {
    if (err) {
      console.error('Error counting targets:', err);
      console.error('Count query:', countQuery);
      console.error('Count query params:', finalParams);
      return res.status(500).json({ error: 'Failed to fetch report', details: err.message });
    }
    
    const total = countResults[0]?.total || 0;
    console.log('Total count:', total);
    
    // Apply pagination
    if (limit) {
      const offset = (page - 1) * limit;
      query += ` LIMIT ? OFFSET ?`;
      finalParams.push(limit, offset);
    }
    
    db.query(query, finalParams, (err, results) => {
      if (err) {
        console.error('Error fetching target vs achievement report:', err);
        console.error('Main query:', query);
        console.error('Main query params:', finalParams);
        return res.status(500).json({ error: 'Failed to fetch report', details: err.message });
      }
      
      console.log('Query successful, returned', results.length, 'rows');
      
      // Debug: Check forecast data in results
      if (month) {
        const forecastRows = results.filter(r => parseFloat(r.forecast_target) > 0);
        console.log(`Forecast data check for month ${month}: ${forecastRows.length} rows with forecast_target > 0`);
        if (forecastRows.length > 0) {
          console.log('Sample forecast rows:', forecastRows.slice(0, 3).map(r => ({
            dealer_code: r.dealer_code,
            forecast_target: r.forecast_target,
            forecast_quantity: r.forecast_quantity,
            has_forecast_data: r.has_forecast_data
          })));
        } else {
          console.log('WARNING: No rows with forecast_target > 0 found!');
          console.log('Sample rows (first 3):', results.slice(0, 3).map(r => ({
            dealer_code: r.dealer_code,
            forecast_target: r.forecast_target,
            forecast_quantity: r.forecast_quantity,
            has_forecast_data: r.has_forecast_data
          })));
        }
      }
      
      res.json({
        success: true,
        data: results,
        total: total,
        page: page,
        limit: limit || total,
        showAll: showAllFlag
      });
    });
  });
});

// Get per-application items for a dealer/month
router.get('/items', (req, res) => {
  const { dealer_code, year, month, type } = req.query; // type: 'abp', 'forecast', 'achievement'
  
  if (!dealer_code || !year || !month) {
    return res.status(400).json({ error: 'dealer_code, year, and month are required' });
  }
  
  const normalizedCode = normalizeDealerCode(dealer_code);
  const queryYear = parseInt(year);
  const queryMonth = parseInt(month);
  
  let tableName;
  let qtyColumn;
  let amountColumn;
  
  switch (type) {
    case 'abp':
      tableName = 'abp_target_items';
      qtyColumn = 'qty';
      amountColumn = 'amount';
      break;
    case 'forecast':
      tableName = 'forecast_target_items';
      qtyColumn = 'qty';
      amountColumn = 'amount';
      break;
    case 'achievement':
      tableName = 'achievement_items';
      qtyColumn = 'qty';
      amountColumn = 'amount';
      break;
    default:
      // Return all types
      const queries = [];
      const allItems = {};
      
      // ABP items
      db.query(
        `SELECT application_unit as application_name, qty, amount FROM abp_target_items 
         WHERE dealer_code = ? AND year = ? AND month = ? 
         ORDER BY application_name`,
        [normalizedCode, queryYear, queryMonth],
        (err, abpResults) => {
          if (err) {
            console.error('Error fetching ABP items:', err);
            return res.status(500).json({ error: 'Failed to fetch items', details: err.message });
          }
          allItems.abp = abpResults || [];
          
          // Forecast items
          db.query(
            `SELECT application_unit as application_name, qty, amount FROM forecast_target_items 
             WHERE dealer_code = ? AND year = ? AND month = ? 
             ORDER BY application_name`,
            [normalizedCode, queryYear, queryMonth],
            (err, fcResults) => {
              if (err) {
                console.error('Error fetching Forecast items:', err);
                return res.status(500).json({ error: 'Failed to fetch items', details: err.message });
              }
              allItems.forecast = fcResults || [];
              
              // Achievement items
              db.query(
                `SELECT application_unit as application_name, qty, amount FROM achievement_items 
                 WHERE dealer_code = ? AND year = ? AND month = ? 
                 ORDER BY application_name`,
                [normalizedCode, queryYear, queryMonth],
                (err, achResults) => {
                  if (err) {
                    console.error('Error fetching Achievement items:', err);
                    return res.status(500).json({ error: 'Failed to fetch items', details: err.message });
                  }
                  allItems.achievement = achResults || [];
                  
                  res.json({
                    success: true,
                    data: allItems
                  });
                }
              );
            }
          );
        }
      );
      return;
  }
  
  const query = `SELECT application_unit as application_name, ${qtyColumn} as qty, ${amountColumn} as amount 
                 FROM ${tableName} 
                 WHERE dealer_code = ? AND year = ? AND month = ? 
                 ORDER BY application_unit`;
  
  db.query(query, [normalizedCode, queryYear, queryMonth], (err, results) => {
    if (err) {
      console.error(`Error fetching ${type} items:`, err);
      return res.status(500).json({ error: 'Failed to fetch items', details: err.message });
    }
    
    res.json({
      success: true,
      data: results || []
    });
  });
});

// Get available application units
router.get('/application-units', (req, res) => {
  const { comparison_type } = req.query;
  const targetTable = comparison_type === 'abp' ? 'abp_target_items' : (comparison_type === 'forecast' ? 'forecast_target_items' : null);
  
  if (!targetTable) {
    // Get from both tables
    db.query(
      `SELECT DISTINCT application_unit FROM abp_target_items WHERE application_unit IS NOT NULL AND application_unit != ''
       UNION
       SELECT DISTINCT application_unit FROM forecast_target_items WHERE application_unit IS NOT NULL AND application_unit != ''
       UNION
       SELECT DISTINCT application_unit FROM achievement_items WHERE application_unit IS NOT NULL AND application_unit != ''
       ORDER BY application_unit`,
      (err, results) => {
        if (err) {
          console.error('Error fetching application units:', err);
          return res.status(500).json({ error: 'Failed to fetch application units', details: err.message });
        }
        res.json({
          success: true,
          units: results.map(r => r.application_unit).filter(u => u)
        });
      }
    );
  } else {
    db.query(
      `SELECT DISTINCT application_unit FROM ${targetTable} 
       WHERE application_unit IS NOT NULL AND application_unit != ''
       UNION
       SELECT DISTINCT application_unit FROM achievement_items 
       WHERE application_unit IS NOT NULL AND application_unit != ''
       ORDER BY application_unit`,
      (err, results) => {
        if (err) {
          console.error('Error fetching application units:', err);
          return res.status(500).json({ error: 'Failed to fetch application units', details: err.message });
        }
        res.json({
          success: true,
          units: results.map(r => r.application_unit).filter(u => u)
        });
      }
    );
  }
});

// Get Application Unit Details - unit-wise breakdown
router.get('/unit-details', (req, res) => {
  const { year, month, territory, application_unit, comparison_type } = req.query;
  // comparison_type: 'abp' or 'forecast'
  
  if (!comparison_type || !['abp', 'forecast'].includes(comparison_type)) {
    return res.status(400).json({ error: 'comparison_type is required and must be "abp" or "forecast"' });
  }
  
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  // Build territory filter
  if (territory && territory !== 'all') {
    whereClause += ' AND d.dealer_code IN (SELECT dealer_code FROM dealers WHERE territory_id = ?)';
    queryParams.push(parseInt(territory));
  }
  
  // Build year/month filters
  if (year && year !== 'all') {
    whereClause += ' AND COALESCE(tgt.year, ach.year) = ?';
    queryParams.push(parseInt(year));
  }
  
  if (month && month !== 'all') {
    whereClause += ' AND COALESCE(tgt.month, ach.month) = ?';
    queryParams.push(parseInt(month));
  }
  
  // Build application unit filter
  if (application_unit && application_unit !== 'all') {
    whereClause += ' AND COALESCE(tgt.application_unit, ach.application_unit) = ?';
    queryParams.push(application_unit);
  }
  
  const targetTable = comparison_type === 'abp' ? 'abp_target_items' : 'forecast_target_items';
  
  // Build JOIN conditions for target table
  let tgtJoinCondition = 'd.dealer_code = tgt.dealer_code';
  const tgtJoinParams = [];
  
  if (year && year !== 'all') {
    tgtJoinCondition += ' AND tgt.year = ?';
    tgtJoinParams.push(parseInt(year));
  }
  if (month && month !== 'all') {
    tgtJoinCondition += ' AND tgt.month = ?';
    tgtJoinParams.push(parseInt(month));
  }
  if (application_unit && application_unit !== 'all') {
    tgtJoinCondition += ' AND tgt.application_unit = ?';
    tgtJoinParams.push(application_unit);
  }
  
  // Query to get unit-wise data with dealer breakdown
  const query = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      COALESCE(t.territory_name, 'N/A') as territory_name,
      COALESCE(tgt.year, ach.year) as year,
      COALESCE(tgt.month, ach.month) as month,
      COALESCE(tgt.application_unit, ach.application_unit, 'Total') as application_unit,
      COALESCE(tgt.qty, 0) as target_qty,
      COALESCE(tgt.amount, 0) as target_amount,
      COALESCE(ach.qty, 0) as achievement_qty,
      COALESCE(ach.amount, 0) as achievement_amount,
      (COALESCE(ach.qty, 0) - COALESCE(tgt.qty, 0)) as qty_gap,
      (COALESCE(ach.amount, 0) - COALESCE(tgt.amount, 0)) as amount_gap,
      CASE 
        WHEN COALESCE(tgt.qty, 0) > 0 THEN (COALESCE(ach.qty, 0) / tgt.qty) * 100
        ELSE 0
      END as qty_percentage,
      CASE 
        WHEN COALESCE(tgt.amount, 0) > 0 THEN (COALESCE(ach.amount, 0) / tgt.amount) * 100
        ELSE 0
      END as amount_percentage
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN ${targetTable} tgt ON ${tgtJoinCondition}
    LEFT JOIN achievement_items ach ON d.dealer_code = ach.dealer_code
      AND COALESCE(tgt.year, ach.year) = ach.year
      AND COALESCE(tgt.month, ach.month) = ach.month
      AND COALESCE(tgt.application_unit, ach.application_unit) = ach.application_unit
    ${whereClause}
    HAVING (target_qty > 0 OR achievement_qty > 0 OR target_amount > 0 OR achievement_amount > 0)
    ORDER BY territory_name, d.dealer_name, application_unit, year DESC, month DESC
  `;
  
  const finalParams = [...tgtJoinParams, ...queryParams];
  
  db.query(query, finalParams, (err, results) => {
    if (err) {
      console.error('Error fetching unit details:', err);
      return res.status(500).json({ error: 'Failed to fetch unit details', details: err.message });
    }
    
    // Group by application unit for summary
    const unitSummary = {};
    results.forEach(row => {
      const unit = row.application_unit || 'Total';
      if (!unitSummary[unit]) {
        unitSummary[unit] = {
          application_unit: unit,
          total_target_qty: 0,
          total_target_amount: 0,
          total_achievement_qty: 0,
          total_achievement_amount: 0,
          dealers: []
        };
      }
      unitSummary[unit].total_target_qty += row.target_qty;
      unitSummary[unit].total_target_amount += row.target_amount;
      unitSummary[unit].total_achievement_qty += row.achievement_qty;
      unitSummary[unit].total_achievement_amount += row.achievement_amount;
      unitSummary[unit].dealers.push(row);
    });
    
    // Calculate percentages for summary
    Object.keys(unitSummary).forEach(unit => {
      const summary = unitSummary[unit];
      summary.qty_gap = summary.total_achievement_qty - summary.total_target_qty;
      summary.amount_gap = summary.total_achievement_amount - summary.total_target_amount;
      summary.qty_percentage = summary.total_target_qty > 0 
        ? (summary.total_achievement_qty / summary.total_target_qty) * 100 
        : 0;
      summary.amount_percentage = summary.total_target_amount > 0 
        ? (summary.total_achievement_amount / summary.total_target_amount) * 100 
        : 0;
    });
    
    res.json({
      success: true,
      data: results,
      summary: Object.values(unitSummary),
      comparison_type: comparison_type
    });
  });
});

// Get ABP vs Achievement from comparison table
router.get('/abp-vs-achievement', (req, res) => {
  const { year, month, territory } = req.query;
  
  console.log('ABP vs Achievement API called with params:', { year, month, territory });
  
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (territory && territory !== 'all') {
    // Filter by territory_id using dealers table
    whereClause = `WHERE a.dealer_code IN (SELECT dealer_code FROM dealers WHERE territory_id = ?)`;
    queryParams.push(parseInt(territory));
  }
  
  if (year) {
    whereClause += ' AND a.year = ?';
    queryParams.push(parseInt(year));
  }
  
  if (month) {
    whereClause += ' AND a.month = ?';
    queryParams.push(parseInt(month));
  }
  
  const query = `
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
      a.quantity_percentage,
      d.nat_code,
      d.nat_name,
      d.div_code,
      d.div_name
    FROM abp_vs_achievement a
    LEFT JOIN dealers d ON a.dealer_code = d.dealer_code
    ${whereClause}
    ORDER BY d.nat_name ASC, a.territory_name ASC, a.dealer_name ASC
  `;
  
  console.log('Query:', query);
  console.log('Params:', queryParams);
  
  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching ABP vs Achievement:', err);
      return res.status(500).json({ error: 'Failed to fetch ABP vs Achievement', details: err.message });
    }
    
    console.log(`ABP vs Achievement: Found ${results ? results.length : 0} records`);
    
    res.json({
      success: true,
      data: results || []
    });
  });
});

// Get Forecast vs Achievement from comparison table
router.get('/forecast-vs-achievement', (req, res) => {
  const { year, month, territory } = req.query;
  
  console.log('Forecast vs Achievement API called with params:', { year, month, territory });
  
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (territory && territory !== 'all') {
    // Filter by territory_id using dealers table
    whereClause = `WHERE f.dealer_code IN (SELECT dealer_code FROM dealers WHERE territory_id = ?)`;
    queryParams.push(parseInt(territory));
  }
  
  if (year) {
    whereClause += ' AND f.year = ?';
    queryParams.push(parseInt(year));
  }
  
  if (month) {
    whereClause += ' AND f.month = ?';
    queryParams.push(parseInt(month));
  }
  
  const query = `
    SELECT 
      f.dealer_code,
      f.dealer_name,
      f.territory_name,
      f.year,
      f.month,
      f.forecast_target_amount,
      f.forecast_target_quantity,
      f.achievement_amount,
      f.achievement_quantity,
      f.amount_percentage,
      f.quantity_percentage,
      d.nat_code,
      d.nat_name,
      d.div_code,
      d.div_name
    FROM forecast_vs_achievement f
    LEFT JOIN dealers d ON f.dealer_code = d.dealer_code
    ${whereClause}
    ORDER BY d.nat_name ASC, f.territory_name ASC, f.dealer_name ASC
  `;
  
  console.log('Query:', query);
  console.log('Params:', queryParams);
  
  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching Forecast vs Achievement:', err);
      return res.status(500).json({ error: 'Failed to fetch Forecast vs Achievement', details: err.message });
    }
    
    console.log(`Forecast vs Achievement: Found ${results ? results.length : 0} records`);
    
    res.json({
      success: true,
      data: results || []
    });
  });
});

// Get dealer-wise breakdown for ABP vs Achievement or Forecast vs Achievement
router.get('/dealer-breakdown', (req, res) => {
  const { year, month, territory, type } = req.query; // type: 'abp' or 'forecast'
  
  if (!type || (type !== 'abp' && type !== 'forecast')) {
    return res.status(400).json({ error: 'Type parameter required: "abp" or "forecast"' });
  }
  
  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month parameters required' });
  }
  
  const queryYear = parseInt(year);
  const queryMonth = parseInt(month);
  
  let whereClause = 'WHERE 1=1';
  const queryParams = [queryYear, queryMonth];
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // Build query based on type
  let query;
  if (type === 'abp') {
    query = `
      SELECT 
        d.dealer_code,
        d.dealer_name,
        COALESCE(t.territory_name, 'N/A') as territory_name,
        COALESCE(abp.target_amount, 0) as target_amount,
        COALESCE(abp.abp_quantity, 0) as target_quantity,
        COALESCE(ach.achievement_amount, 0) as achievement_amount,
        COALESCE(ach.achievement_quantity, 0) as achievement_quantity
      FROM dealers d
      LEFT JOIN territories t ON d.territory_id = t.id
      LEFT JOIN abp_targets abp ON d.dealer_code = abp.dealer_code AND abp.year = ? AND abp.month = ?
      LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code AND ach.year = ? AND ach.month = ?
      ${whereClause}
      AND (abp.id IS NOT NULL OR ach.id IS NOT NULL)
      ORDER BY d.dealer_name ASC
    `;
    queryParams.push(queryYear, queryMonth, queryYear, queryMonth);
  } else {
    query = `
      SELECT 
        d.dealer_code,
        d.dealer_name,
        COALESCE(t.territory_name, 'N/A') as territory_name,
        COALESCE(fc.target_amount, 0) as target_amount,
        COALESCE(fc.forecast_quantity, 0) as target_quantity,
        COALESCE(ach.achievement_amount, 0) as achievement_amount,
        COALESCE(ach.achievement_quantity, 0) as achievement_quantity
      FROM dealers d
      LEFT JOIN territories t ON d.territory_id = t.id
      LEFT JOIN forecast_targets fc ON d.dealer_code = fc.dealer_code AND fc.year = ? AND fc.month = ?
      LEFT JOIN achievements ach ON d.dealer_code = ach.dealer_code AND ach.year = ? AND ach.month = ?
      ${whereClause}
      AND (fc.id IS NOT NULL OR ach.id IS NOT NULL)
      ORDER BY d.dealer_name ASC
    `;
    queryParams.push(queryYear, queryMonth, queryYear, queryMonth);
  }
  
  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching dealer breakdown:', err);
      return res.status(500).json({ error: 'Failed to fetch dealer breakdown', details: err.message });
    }
    
    res.json({
      success: true,
      data: results || [],
      type: type,
      year: queryYear,
      month: queryMonth
    });
  });
});

// Get summary statistics
router.get('/stats', (req, res) => {
  const { year, month, territory } = req.query;
  
  let abpJoinCondition = 'd.dealer_code = abp.dealer_code';
  let fcJoinCondition = 'd.dealer_code = fc.dealer_code';
  let achJoinCondition = 'd.dealer_code = ach.dealer_code';
  const joinParams = [];
  const whereParams = [];
  
  if (year) {
    abpJoinCondition += ' AND abp.year = ?';
    fcJoinCondition += ' AND fc.year = ?';
    achJoinCondition += ' AND ach.year = ?';
    joinParams.push(parseInt(year), parseInt(year), parseInt(year));
  }
  
  if (month) {
    abpJoinCondition += ' AND abp.month = ?';
    fcJoinCondition += ' AND fc.month = ?';
    achJoinCondition += ' AND ach.month = ?';
    joinParams.push(parseInt(month), parseInt(month), parseInt(month));
  }
  
  let whereClause = 'WHERE (abp.id IS NOT NULL OR fc.id IS NOT NULL OR ach.id IS NOT NULL)';
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    whereParams.push(parseInt(territory));
  }
  
  const allParams = [...joinParams, ...whereParams];
  
  const query = `
    SELECT 
      COUNT(DISTINCT d.dealer_code) as total_dealers,
      COALESCE(SUM(abp.target_amount), 0) as total_abp_target,
      COALESCE(SUM(fc.target_amount), 0) as total_forecast_target,
      COALESCE(SUM(ach.achievement_amount), 0) as total_achievement,
      COALESCE(SUM(CASE 
        WHEN fc.target_amount IS NOT NULL THEN fc.target_amount
        ELSE abp.target_amount
      END), 0) as total_effective_target,
      COALESCE(AVG(CASE 
        WHEN fc.target_amount IS NOT NULL AND fc.target_amount > 0 THEN 
          ((ach.achievement_amount / fc.target_amount) * 100)
        WHEN abp.target_amount IS NOT NULL AND abp.target_amount > 0 THEN 
          ((ach.achievement_amount / abp.target_amount) * 100)
        ELSE NULL
      END), 0) as avg_achievement_percentage
    FROM dealers d
    LEFT JOIN abp_targets abp ON ${abpJoinCondition}
    LEFT JOIN forecast_targets fc ON ${fcJoinCondition}
    LEFT JOIN achievements ach ON ${achJoinCondition}
    ${whereClause}
  `;
  
  db.query(query, allParams, (err, results) => {
    if (err) {
      console.error('Error fetching stats:', err);
      return res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
    }
    
    const stats = results[0] || {};
    res.json({
      success: true,
      stats: {
        total_abp_target: parseFloat(stats.total_abp_target) || 0,
        total_forecast_target: parseFloat(stats.total_forecast_target) || 0,
        total_achievement: parseFloat(stats.total_achievement) || 0,
        total_effective_target: parseFloat(stats.total_effective_target) || 0,
        avg_achievement_percentage: parseFloat(stats.avg_achievement_percentage) || 0
      }
    });
  });
});

// Get available years and months
router.get('/filters', (req, res) => {
  const query = `
    SELECT DISTINCT year, month
    FROM (
      SELECT year, month FROM abp_targets
      UNION
      SELECT year, month FROM forecast_targets
      UNION
      SELECT year, month FROM achievements
    ) as all_dates
    ORDER BY year DESC, month DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching filters:', err);
      return res.status(500).json({ error: 'Failed to fetch filters' });
    }
    
    const years = [...new Set(results.map(r => r.year))].sort((a, b) => b - a);
    const months = [...new Set(results.map(r => r.month))].sort((a, b) => a - b);
    
    res.json({
      success: true,
      years: years,
      months: months
    });
  });
});

// Export report to Excel
router.get('/export', (req, res) => {
  const { dealer_code, year, month, territory, showAll = 'true' } = req.query;
  const showAllFlag = showAll === 'true';
  
  // Build WHERE clause (same logic as report endpoint)
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (dealer_code) {
    whereClause += ' AND d.dealer_code = ?';
    queryParams.push(normalizeDealerCode(dealer_code));
  }
  
  let abpJoinCondition = 'd.dealer_code = abp.dealer_code';
  let fcJoinCondition = 'd.dealer_code = fc.dealer_code';
  let achJoinCondition = 'd.dealer_code = ach.dealer_code';
  const joinParams = [];
  
  if (year) {
    abpJoinCondition += ' AND abp.year = ?';
    fcJoinCondition += ' AND fc.year = ?';
    achJoinCondition += ' AND ach.year = ?';
    joinParams.push(parseInt(year), parseInt(year), parseInt(year));
  }
  
  if (month) {
    abpJoinCondition += ' AND abp.month = ?';
    fcJoinCondition += ' AND fc.month = ?';
    achJoinCondition += ' AND ach.month = ?';
    joinParams.push(parseInt(month), parseInt(month), parseInt(month));
  }
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  const finalParams = [...joinParams, ...queryParams];
  
  const query = `
    SELECT 
      d.dealer_code,
      d.dealer_name,
      COALESCE(t.territory_name, 'N/A') as territory_name,
      COALESCE(fc.year, abp.year, ach.year) as year,
      COALESCE(fc.month, abp.month, ach.month) as month,
      COALESCE(abp.target_amount, 0) as abp_target,
      COALESCE(fc.target_amount, 0) as forecast_target,
      CASE 
        WHEN fc.target_amount IS NOT NULL THEN fc.target_amount
        ELSE COALESCE(abp.target_amount, 0)
      END as effective_target,
      COALESCE(ach.achievement_amount, 0) as achievement,
      -- Achievement Percentage: (Achievement / Effective Target) * 100
      -- Effective Target priority: Forecast > ABP
      -- Achievements are total amounts (aggregated from Sales Register, no category breakdown)
      CASE 
        WHEN fc.target_amount IS NOT NULL AND fc.target_amount > 0 THEN 
          ((COALESCE(ach.achievement_amount, 0) / fc.target_amount) * 100)
        WHEN abp.target_amount IS NOT NULL AND abp.target_amount > 0 THEN 
          ((COALESCE(ach.achievement_amount, 0) / abp.target_amount) * 100)
        ELSE 0
      END as achievement_percentage,
      (COALESCE(ach.achievement_amount, 0) - 
       CASE 
         WHEN fc.target_amount IS NOT NULL THEN fc.target_amount
         ELSE COALESCE(abp.target_amount, 0)
       END) as variance
    FROM dealers d
    LEFT JOIN territories t ON d.territory_id = t.id
    LEFT JOIN abp_targets abp ON ${abpJoinCondition}
    LEFT JOIN forecast_targets fc ON ${fcJoinCondition}
    LEFT JOIN achievements ach ON ${achJoinCondition}
    ${whereClause}
    AND (abp.id IS NOT NULL OR fc.id IS NOT NULL OR ach.id IS NOT NULL)
    ORDER BY d.dealer_name ASC, COALESCE(fc.year, abp.year, ach.year) DESC, COALESCE(fc.month, abp.month, ach.month) DESC
  `;
  
  db.query(query, finalParams, (err, results) => {
    if (err) {
      console.error('Error fetching export data:', err);
      return res.status(500).json({ error: 'Failed to export report', details: err.message });
    }
    
    // Create Excel workbook
    const workbook = xlsx.utils.book_new();
    const worksheetData = [
      ['Dealer Code', 'Dealer Name', 'Territory', 'Year', 'Month', 'ABP Target', 'ABP Qty', 'Forecast Target', 'Forecast Qty', 'Effective Target', 'Achievement', 'Achievement Qty', 'Achievement %', 'Variance']
    ];
    
    results.forEach(row => {
      const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      worksheetData.push([
        row.dealer_code,
        row.dealer_name,
        row.territory_name,
        row.year,
        monthNames[row.month] || row.month,
        row.abp_target,
        row.abp_quantity || 0,
        row.forecast_target,
        row.forecast_quantity || 0,
        row.effective_target,
        row.achievement,
        row.achievement_quantity || 0,
        parseFloat(row.achievement_percentage).toFixed(2) + '%',
        row.variance
      ]);
    });
    
    const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Target vs Achievement');
    
    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    const filename = `target_vs_achievement_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });
});

// Delete ABP target
router.delete('/abp/:dealerCode/:year/:month', (req, res) => {
  const { dealerCode, year, month } = req.params;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  const query = 'DELETE FROM abp_targets WHERE dealer_code = ? AND year = ? AND month = ?';
  db.query(query, [normalizedCode, parseInt(year), parseInt(month)], (err, result) => {
    if (err) {
      console.error('Error deleting ABP target:', err);
      return res.status(500).json({ error: 'Failed to delete ABP target', details: err.message });
    }
    
    res.json({
      success: true,
      message: 'ABP target deleted successfully'
    });
  });
});

// Delete Forecast target
router.delete('/forecast/:dealerCode/:year/:month', (req, res) => {
  const { dealerCode, year, month } = req.params;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  const query = 'DELETE FROM forecast_targets WHERE dealer_code = ? AND year = ? AND month = ?';
  db.query(query, [normalizedCode, parseInt(year), parseInt(month)], (err, result) => {
    if (err) {
      console.error('Error deleting Forecast target:', err);
      return res.status(500).json({ error: 'Failed to delete Forecast target', details: err.message });
    }
    
    res.json({
      success: true,
      message: 'Forecast target deleted successfully'
    });
  });
});

// Delete Achievement
router.delete('/achievement/:dealerCode/:year/:month', (req, res) => {
  const { dealerCode, year, month } = req.params;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  const query = 'DELETE FROM achievements WHERE dealer_code = ? AND year = ? AND month = ?';
  db.query(query, [normalizedCode, parseInt(year), parseInt(month)], (err, result) => {
    if (err) {
      console.error('Error deleting achievement:', err);
      return res.status(500).json({ error: 'Failed to delete achievement', details: err.message });
    }
    
    res.json({
      success: true,
      message: 'Achievement deleted successfully'
    });
  });
});

// Update ABP target
router.put('/abp/:dealerCode/:year/:month', (req, res) => {
  const { dealerCode, year, month } = req.params;
  const { target_amount } = req.body;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  if (!target_amount || target_amount < 0) {
    return res.status(400).json({ error: 'Invalid target amount' });
  }
  
  const query = 'UPDATE abp_targets SET target_amount = ? WHERE dealer_code = ? AND year = ? AND month = ?';
  db.query(query, [parseFloat(target_amount), normalizedCode, parseInt(year), parseInt(month)], (err, result) => {
    if (err) {
      console.error('Error updating ABP target:', err);
      return res.status(500).json({ error: 'Failed to update ABP target', details: err.message });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ABP target not found' });
    }
    
    res.json({
      success: true,
      message: 'ABP target updated successfully'
    });
  });
});

// Update Forecast target
router.put('/forecast/:dealerCode/:year/:month', (req, res) => {
  const { dealerCode, year, month } = req.params;
  const { target_amount } = req.body;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  if (!target_amount || target_amount < 0) {
    return res.status(400).json({ error: 'Invalid target amount' });
  }
  
  const query = 'UPDATE forecast_targets SET target_amount = ? WHERE dealer_code = ? AND year = ? AND month = ?';
  db.query(query, [parseFloat(target_amount), normalizedCode, parseInt(year), parseInt(month)], (err, result) => {
    if (err) {
      console.error('Error updating Forecast target:', err);
      return res.status(500).json({ error: 'Failed to update Forecast target', details: err.message });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Forecast target not found' });
    }
    
    res.json({
      success: true,
      message: 'Forecast target updated successfully'
    });
  });
});

// Update Achievement
router.put('/achievement/:dealerCode/:year/:month', (req, res) => {
  const { dealerCode, year, month } = req.params;
  const { achievement_amount } = req.body;
  const normalizedCode = normalizeDealerCode(dealerCode);
  
  if (achievement_amount === undefined || achievement_amount < 0) {
    return res.status(400).json({ error: 'Invalid achievement amount' });
  }
  
  const query = 'UPDATE achievements SET achievement_amount = ? WHERE dealer_code = ? AND year = ? AND month = ?';
  db.query(query, [parseFloat(achievement_amount), normalizedCode, parseInt(year), parseInt(month)], (err, result) => {
    if (err) {
      console.error('Error updating achievement:', err);
      return res.status(500).json({ error: 'Failed to update achievement', details: err.message });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    
    res.json({
      success: true,
      message: 'Achievement updated successfully'
    });
  });
});

// Upload Sales Register and store date-wise sales data (for closing balance calculation)
router.post('/sales/daily-upload', upload.single('file'), (req, res) => {
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
    console.log('Daily Sales Upload - File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'File buffer is empty. Please try uploading the file again.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length < 9) {
      return res.status(400).json({ error: 'Invalid file format. Expected headers in row 8 and data starting from row 9.' });
    }
    
    // Row 8 (index 7) contains headers
    const headerRow = data[7] || [];
    
    // Find required columns
    const findColumn = (headers, possibleNames) => {
      for (const name of possibleNames) {
        const index = headers.findIndex(h => {
          if (!h) return false;
          const header = String(h).trim().toLowerCase();
          const searchName = name.toLowerCase();
          return header === searchName || 
                 header.includes(searchName) || 
                 searchName.includes(header) ||
                 header.replace(/[\s_\-\.]/g, '') === searchName.replace(/[\s_\-\.]/g, '');
        });
        if (index !== -1) return index;
      }
      return -1;
    };
    
    const dealerCodeIndex = findColumn(headerRow, ['customer code', 'dealer code', 'dealer_code', 'dealerco', 'erp id', 'erp_id', 'erpid', 'code', 'dealer']);
    const orderDateIndex = findColumn(headerRow, ['order date', 'order_date', 'date', 'invoice date', 'orderdate']);
    // Prioritize "actual invoice amount" - must contain "actual" to avoid matching regular "invoice amount"
    let amountIndex = findColumn(headerRow, ['actual invoice amount', 'actual_invoice_amount']);
    if (amountIndex === -1) {
      // Fallback to regular invoice amount if actual not found
      amountIndex = findColumn(headerRow, ['invoice amount', 'invoice_amount', 'amount']);
      if (amountIndex !== -1) {
        console.warn('Daily Sales Upload - Warning: Using "Invoice Amount" instead of "Actual Invoice Amount"');
      }
    }
    const quantityIndex = findColumn(headerRow, ['actual invoice quantity', 'actual_invoice_qunatity', 'actual_invoice_quantity']);
    const applicationUnitIndex = findColumn(headerRow, ['application name', 'application unit', 'application_unit', 'application', 'unit', 'app unit']);
    
    if (dealerCodeIndex === -1) {
      return res.status(400).json({ 
        error: 'Dealer Code or Customer Code column not found',
        foundColumns: headerRow.filter(h => h)
      });
    }
    
    if (orderDateIndex === -1) {
      return res.status(400).json({ 
        error: 'Order Date column not found',
        foundColumns: headerRow.filter(h => h)
      });
    }
    
    if (amountIndex === -1) {
      return res.status(400).json({ 
        error: 'Invoice Amount or Actual Invoice Amount column not found',
        foundColumns: headerRow.filter(h => h)
      });
    }
    
    console.log('Daily Sales Upload - Columns found:');
    console.log('  Dealer Code:', dealerCodeIndex, headerRow[dealerCodeIndex]);
    console.log('  Order Date:', orderDateIndex, headerRow[orderDateIndex]);
    console.log('  Amount:', amountIndex, headerRow[amountIndex]);
    if (quantityIndex !== -1) {
      console.log('  Quantity:', quantityIndex, headerRow[quantityIndex]);
    }
    if (applicationUnitIndex !== -1) {
      console.log('  Application Unit:', applicationUnitIndex, headerRow[applicationUnitIndex]);
    }
    
    // Process data rows starting from row 9 (index 8)
    const dailySales = [];
    const missingDealers = [];
    const errors = [];
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
      
      // Get order date
      const orderDateRaw = row[orderDateIndex];
      if (!orderDateRaw) continue;
      
      const orderDate = excelDateToJSDate(orderDateRaw);
      if (!orderDate || isNaN(orderDate.getTime())) {
        continue;
      }
      
      const transactionDate = orderDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Get sales amount
      const salesAmount = parseFloat(row[amountIndex]) || 0;
      if (salesAmount <= 0) continue; // Skip zero or negative amounts
      
      // Get quantity (optional)
      const salesQuantity = quantityIndex !== -1 ? (parseFloat(row[quantityIndex]) || 0) : 0;
      
      // Get application unit (optional)
      const applicationUnit = applicationUnitIndex !== -1 && row[applicationUnitIndex] 
        ? String(row[applicationUnitIndex]).trim() 
        : null;
      
      rowsWithData++;
      
      dailySales.push({
        dealerCode,
        originalCode: String(dealerCodeRaw || '').trim(),
        transactionDate,
        salesAmount,
        salesQuantity,
        applicationUnit,
        rowIndex: i + 1
      });
    }
    
    if (dailySales.length === 0) {
      return res.status(400).json({ 
        error: 'No valid sales data found in Excel file.',
        totalRowsProcessed: totalRowsProcessed,
        suggestion: 'Check that Order Date and Actual Invoice Amount columns have valid data.'
      });
    }
    
    console.log(`Daily Sales Upload - Found ${dailySales.length} sales transactions from ${totalRowsProcessed} rows`);
    
    // Verify dealers exist and insert daily sales
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
      
      // Filter valid sales and use actual dealer codes from DB
      const validSales = [];
      dailySales.forEach(sale => {
        if (dealerCodeMap[sale.dealerCode]) {
          validSales.push({
            ...sale,
            dealer_code: dealerCodeMap[sale.dealerCode] // Use actual format from DB
          });
        } else {
          if (missingDealers.length < 20) {
            missingDealers.push(sale.dealerCode);
          }
        }
      });
      
      if (validSales.length === 0) {
        return res.status(400).json({
          error: 'No valid sales found. All dealer codes in the file do not exist in the system',
          missingDealers: [...new Set(missingDealers)],
          suggestion: 'Please add these dealers to the system first, or check if the dealer codes are correct.'
        });
      }
      
      // Group by dealer_code, transaction_date, and application_unit to sum amounts
      // This handles cases where same dealer has multiple transactions on same date
      const groupedSales = {};
      validSales.forEach(sale => {
        const key = `${sale.dealer_code}-${sale.transactionDate}-${sale.applicationUnit || 'Total'}`;
        if (!groupedSales[key]) {
          groupedSales[key] = {
            dealer_code: sale.dealer_code,
            transaction_date: sale.transactionDate,
            sales_amount: 0,
            sales_quantity: 0,
            application_unit: sale.applicationUnit || null
          };
        }
        groupedSales[key].sales_amount += sale.salesAmount;
        groupedSales[key].sales_quantity += sale.salesQuantity;
      });
      
      const salesToInsert = Object.values(groupedSales);
      
      // Insert daily sales - each record represents total sales for a dealer on a specific date
      // Use ON DUPLICATE KEY UPDATE to handle re-uploads (sum amounts)
      const insertQuery = `
        INSERT INTO daily_sales 
        (dealer_code, transaction_date, sales_amount, sales_quantity, application_unit) 
        VALUES ?
        ON DUPLICATE KEY UPDATE
          sales_amount = sales_amount + VALUES(sales_amount),
          sales_quantity = sales_quantity + VALUES(sales_quantity),
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const values = salesToInsert.map(s => [
        s.dealer_code,
        s.transaction_date,
        s.sales_amount,
        s.sales_quantity,
        s.application_unit
      ]);
      
      db.query(insertQuery, [values], (err, result) => {
        if (err) {
          console.error('Error inserting daily sales:', err);
          return res.status(500).json({ error: 'Failed to upload daily sales', details: err.message });
        }
        
        // Count unique dealers
        const uniqueDealers = new Set(salesToInsert.map(s => s.dealer_code));
        
        const response = {
          success: true,
          message: `Daily sales data uploaded successfully.`,
          summary: {
            total_transactions: dailySales.length,
            unique_daily_records: salesToInsert.length,
            inserted: result.affectedRows,
            dealers: uniqueDealers.size,
            date_range: {
              from: salesToInsert.length > 0 ? Math.min(...salesToInsert.map(s => s.transaction_date)) : null,
              to: salesToInsert.length > 0 ? Math.max(...salesToInsert.map(s => s.transaction_date)) : null
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
    console.error('Error processing daily sales upload:', error);
    res.status(500).json({ 
      error: 'Failed to process file', 
      details: error.message 
    });
  }
});

module.exports = router;

