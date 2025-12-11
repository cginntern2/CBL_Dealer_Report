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

// Helper function to calculate months between two dates
function monthsBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const years = d2.getFullYear() - d1.getFullYear();
  const months = d2.getMonth() - d1.getMonth();
  return years * 12 + months;
}

// Helper function to categorize months inactive
function categorizeMonths(months) {
  if (months >= 1 && months <= 4) {
    return `${months} month${months > 1 ? 's' : ''} inactive`;
  } else if (months > 4) {
    return 'More than 4 months inactive';
  } else {
    return 'Active (less than 1 month)';
  }
}

// Get all delinquent dealers with pagination
router.get('/', (req, res) => {
  const { page = 1, limit, showAll = 'false', category } = req.query;
  const showAllFlag = showAll === 'true';
  const defaultLimit = 10;
  const limitValue = limit ? parseInt(limit) : defaultLimit;
  
  // Build WHERE clause for category filter
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (category && category !== 'all') {
    whereClause += ' AND del.category LIKE ?';
    queryParams.push(`%${category}%`);
  }
  
  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM delinquent del
    INNER JOIN dealers d ON del.dealer_code = d.dealer_code
    ${whereClause}
  `;
  
  db.query(countQuery, queryParams, (err, countResults) => {
    if (err) {
      console.error('Error counting delinquent dealers:', err);
      return res.status(500).json({ error: 'Failed to fetch delinquent dealers' });
    }
    
    const total = countResults[0].total;
    
    // Build main query with pagination
    let query = `
      SELECT 
        d.id,
        d.dealer_code,
        d.dealer_name,
        d.contact_person,
        d.email,
        d.phone,
        del.last_order_date,
        del.months_inactive,
        del.category,
        del.created_at,
        del.updated_at
      FROM delinquent del
      INNER JOIN dealers d ON del.dealer_code = d.dealer_code
      ${whereClause}
      ORDER BY del.months_inactive DESC, d.dealer_name ASC
    `;
    
    const finalQueryParams = [...queryParams];
    
    // Apply pagination only if showAll is false
    if (!showAllFlag) {
      const offset = (parseInt(page) - 1) * limitValue;
      query += ` LIMIT ? OFFSET ?`;
      finalQueryParams.push(limitValue, offset);
    }
    
    db.query(query, finalQueryParams, (err, results) => {
      if (err) {
        console.error('Error fetching delinquent dealers:', err);
        return res.status(500).json({ error: 'Failed to fetch delinquent dealers' });
      }
      res.json({ 
        delinquentDealers: results,
        total: total,
        page: parseInt(page),
        limit: showAllFlag ? total : limitValue,
        showAll: showAllFlag
      });
    });
  });
});

// Get delinquent dealers by category (deprecated - use query param instead)
router.get('/category/:category', (req, res) => {
  const { category } = req.params;
  const { page = 1, limit, showAll = 'false' } = req.query;
  const showAllFlag = showAll === 'true';
  const defaultLimit = 10;
  const limitValue = limit ? parseInt(limit) : defaultLimit;
  
  const whereClause = 'WHERE del.category LIKE ?';
  const queryParams = [`%${category}%`];
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM delinquent del
    INNER JOIN dealers d ON del.dealer_code = d.dealer_code
    ${whereClause}
  `;
  
  db.query(countQuery, queryParams, (err, countResults) => {
    if (err) {
      console.error('Error counting delinquent dealers:', err);
      return res.status(500).json({ error: 'Failed to fetch delinquent dealers' });
    }
    
    const total = countResults[0].total;
    
    let query = `
      SELECT 
        d.id,
        d.dealer_code,
        d.dealer_name,
        d.contact_person,
        d.email,
        d.phone,
        del.last_order_date,
        del.months_inactive,
        del.category
      FROM delinquent del
      INNER JOIN dealers d ON del.dealer_code = d.dealer_code
      ${whereClause}
      ORDER BY del.months_inactive DESC, d.dealer_name ASC
    `;
    
    const finalQueryParams = [...queryParams];
    
    if (!showAllFlag) {
      const offset = (parseInt(page) - 1) * limitValue;
      query += ` LIMIT ? OFFSET ?`;
      finalQueryParams.push(limitValue, offset);
    }
    
    db.query(query, finalQueryParams, (err, results) => {
      if (err) {
        console.error('Error fetching delinquent dealers by category:', err);
        return res.status(500).json({ error: 'Failed to fetch delinquent dealers' });
      }
      res.json({ 
        delinquentDealers: results,
        total: total,
        page: parseInt(page),
        limit: showAllFlag ? total : limitValue,
        showAll: showAllFlag
      });
    });
  });
});

// Get statistics
router.get('/stats', (req, res) => {
  const query = `
    SELECT 
      category,
      COUNT(*) as count
    FROM delinquent
    GROUP BY category
    ORDER BY 
      CASE 
        WHEN category LIKE '1 month%' THEN 1
        WHEN category LIKE '2 month%' THEN 2
        WHEN category LIKE '3 month%' THEN 3
        WHEN category LIKE '4 month%' THEN 4
        ELSE 5
      END
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching statistics:', err);
      return res.status(500).json({ error: 'Failed to fetch statistics' });
    }
    
    const total = results.reduce((sum, row) => sum + row.count, 0);
    res.json({ 
      stats: results,
      total: total
    });
  });
});

// Upload Sales Register Excel and process delinquent dealers
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Headers are on row 8, so we need to adjust the range to start from row 8
    // Get current range and modify it to start from row 8 (index 7)
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:Z1000');
    const originalStartRow = range.s.r;
    range.s.r = 7; // Start from row 8 (0-indexed, so 7 = row 8)
    worksheet['!ref'] = xlsx.utils.encode_range(range);
    
    // Read data starting from row 8 (headers row)
    const data = xlsx.utils.sheet_to_json(worksheet, { 
      defval: null,
      raw: false
    });
    
    // Restore original range
    range.s.r = originalStartRow;
    worksheet['!ref'] = xlsx.utils.encode_range(range);
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty or no data found starting from row 8. Please check if headers are on row 8.' });
    }
    
    // Log first row to debug column names
    console.log('First row keys:', Object.keys(data[0] || {}));
    console.log('Sample first row:', data[0]);
    
    // Extract dealer_code and order_date columns (flexible column name matching)
    const salesData = data.map(row => {
      // Try various column name variations for dealer code
      // Based on Excel: "Dealer Co" is the column name
      const dealer_code = row['Dealer Co'] || row['Dealer Code'] || row['dealer_code'] || 
                         row['DealerCode'] || row['Code'] || row['Dealer Co'] || '';
      
      // Try various column name variations for order date
      // Based on Excel: "Order Date" is the column name
      let order_date = row['Order Date'] || row['Order Dat'] || row['order_date'] || 
                       row['OrderDate'] || row['Date'] || '';
      
      // Convert Excel date number to date if needed
      if (typeof order_date === 'number') {
        order_date = xlsx.SSF.parse_date_code(order_date);
        order_date = new Date(order_date.y, order_date.m - 1, order_date.d);
      } else if (typeof order_date === 'string' && order_date.trim()) {
        // Try to parse date string (handle formats like "1-Jul-25", "01-JUL-25", etc.)
        // First try standard date parsing
        let parsedDate = new Date(order_date);
        
        // If that fails, try parsing Excel date format (DD-MMM-YY)
        if (isNaN(parsedDate.getTime())) {
          // Try to parse formats like "1-Jul-25" or "01-JUL-25"
          const dateMatch = order_date.match(/(\d{1,2})[-/](\w{3})[-/](\d{2,4})/i);
          if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const monthStr = dateMatch[2].toLowerCase();
            const year = parseInt(dateMatch[3]);
            
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                          'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const month = months.indexOf(monthStr);
            
            if (month !== -1) {
              const fullYear = year < 100 ? 2000 + year : year;
              parsedDate = new Date(fullYear, month, day);
            }
          }
        }
        
        if (!isNaN(parsedDate.getTime())) {
          order_date = parsedDate;
        } else {
          order_date = null;
        }
      } else {
        order_date = null;
      }
      
      // Normalize dealer code - remove leading zeros for consistent matching
      let normalizedCode = dealer_code ? dealer_code.toString().trim() : '';
      // Convert to number first to remove leading zeros, then back to string
      if (normalizedCode && !isNaN(parseInt(normalizedCode))) {
        normalizedCode = parseInt(normalizedCode).toString();
      }
      
      return {
        dealer_code: normalizedCode,
        original_dealer_code: dealer_code ? dealer_code.toString().trim() : '',
        order_date: order_date
      };
    }).filter(row => row.dealer_code && row.order_date);
    
    if (salesData.length === 0) {
      return res.status(400).json({ error: 'No valid sales data found. Please check column names: Dealer Code and Order Date' });
    }
    
    // Helper function to normalize dealer codes for comparison (handles leading zeros)
    // This ensures "00001" matches "1", "00123" matches "123", etc.
    const normalizeDealerCode = (code) => {
      if (!code) return '';
      const codeStr = code.toString().trim();
      // If it's a numeric code, remove leading zeros by converting to number and back
      if (!isNaN(parseInt(codeStr))) {
        return parseInt(codeStr).toString();
      }
      return codeStr;
    };
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Group by normalized dealer_code and find the latest order date for each dealer
    const dealerLastOrder = {};
    salesData.forEach(sale => {
      const code = sale.dealer_code; // Already normalized from the map above
      const orderDate = new Date(sale.order_date);
      orderDate.setHours(0, 0, 0, 0);
      
      if (!dealerLastOrder[code] || orderDate > dealerLastOrder[code]) {
        dealerLastOrder[code] = orderDate;
      }
    });
    
    // Calculate months inactive for each dealer
    const delinquentData = [];
    Object.keys(dealerLastOrder).forEach(dealerCode => {
      const lastOrderDate = dealerLastOrder[dealerCode];
      const monthsInactive = monthsBetween(lastOrderDate, today);
      
      // Only include dealers with 1-4 months inactive
      if (monthsInactive >= 1 && monthsInactive <= 4) {
        delinquentData.push({
          dealer_code: dealerCode,
          last_order_date: lastOrderDate.toISOString().split('T')[0],
          months_inactive: monthsInactive,
          category: categorizeMonths(monthsInactive)
        });
      }
    });
    
    if (delinquentData.length === 0) {
      return res.json({
        message: 'No delinquent dealers found (1-4 months inactive)',
        total: 0,
        inserted: 0
      });
    }
    
    // Get all dealers from database and normalize their codes for matching
    db.query('SELECT dealer_code FROM dealers', (err, allDealers) => {
      if (err) {
        console.error('Error fetching dealers:', err);
        return res.status(500).json({ error: 'Failed to verify dealer codes' });
      }
      
      // Create a map of normalized dealer codes to original dealer codes
      // This handles cases where dealer codes might be "00001" in DB but "1" in sales data
      const normalizedDealerMap = {};
      allDealers.forEach(dealer => {
        const normalized = normalizeDealerCode(dealer.dealer_code);
        normalizedDealerMap[normalized] = dealer.dealer_code;
      });
      
      console.log(`Found ${allDealers.length} dealers in database. Sample normalized mapping:`, 
        Object.entries(normalizedDealerMap).slice(0, 5));
      
      // Match delinquent data with dealers using normalized codes
      const validDelinquentData = [];
      delinquentData.forEach(d => {
        const normalizedCode = normalizeDealerCode(d.dealer_code);
        if (normalizedDealerMap[normalizedCode]) {
          // Use the original dealer_code from database for foreign key
          validDelinquentData.push({
            dealer_code: normalizedDealerMap[normalizedCode], // Use original format from DB (e.g., "00001")
            last_order_date: d.last_order_date,
            months_inactive: d.months_inactive,
            category: d.category
          });
        } else {
          console.log(`Dealer code not found: ${d.dealer_code} (normalized: ${normalizedCode})`);
        }
      });
      
      console.log(`Matched ${validDelinquentData.length} out of ${delinquentData.length} delinquent dealers`);
      
      if (validDelinquentData.length === 0) {
        return res.status(400).json({ 
          error: 'No matching dealer codes found in dealers table. Please upload dealers first.' 
        });
      }
      
      // Insert or update delinquent dealers (using REPLACE to update if exists)
      const insertQuery = `REPLACE INTO delinquent (dealer_code, last_order_date, months_inactive, category) VALUES ?`;
      
      const values = validDelinquentData.map(d => [
        d.dealer_code,
        d.last_order_date,
        d.months_inactive,
        d.category
      ]);
      
      db.query(insertQuery, [values], (err, results) => {
        if (err) {
          console.error('Error inserting delinquent dealers:', err);
          return res.status(500).json({ error: 'Failed to import delinquent dealers' });
        }
        
        res.json({
          message: 'Delinquent dealers processed successfully',
          total: validDelinquentData.length,
          inserted: results.affectedRows,
          skipped: delinquentData.length - validDelinquentData.length
        });
      });
    });
    
  } catch (error) {
    console.error('Error processing Excel file:', error);
    res.status(500).json({ error: 'Failed to process Excel file: ' + error.message });
  }
});

// Clear all delinquent records
router.delete('/clear', (req, res) => {
  const query = 'DELETE FROM delinquent';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error clearing delinquent records:', err);
      return res.status(500).json({ error: 'Failed to clear delinquent records' });
    }
    res.json({ 
      message: 'All delinquent records cleared successfully',
      deleted: results.affectedRows
    });
  });
});

module.exports = router;

