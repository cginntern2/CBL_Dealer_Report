const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdf = require('pdf-parse');
const db = require('../db');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const xlsx = require('xlsx');

// Helper function to normalize dealer code
const normalizeDealerCode = (code) => {
  if (!code) return '';
  const str = String(code).trim();
  return str.replace(/^0+/, '') || '0';
};

// Helper function to parse date from "DD/MM/YYYY" format
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
};

// Helper function to extract month and year from "November 2025" format
const parseMonthYear = (monthStr) => {
  if (!monthStr) return null;
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const lower = monthStr.toLowerCase();
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i])) {
      const yearMatch = monthStr.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      return { month: i + 1, year: year };
    }
  }
  return null;
};

// Upload Credit Days Report from PDF
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Check if user uploaded a lock file
  if (req.file.originalname.startsWith('~$')) {
    return res.status(400).json({ 
      error: 'Lock file detected',
      details: 'You uploaded a temporary lock file (~$). Please close the PDF and upload the actual file.',
      uploadedFile: req.file.originalname
    });
  }

  try {
    console.log('Credit Days Upload - File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');
    
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'File buffer is empty. Please try uploading the file again.' });
    }

    // Parse PDF
    const data = await pdf(req.file.buffer);
    const text = data.text;
    
    console.log('Credit Days Upload - PDF parsed, text length:', text.length);
    
    // Extract Printing Date (To Date)
    const printingDateMatch = text.match(/Printing Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!printingDateMatch) {
      return res.status(400).json({ 
        error: 'Could not find Printing Date in PDF',
        details: 'Please ensure the PDF contains "Printing Date : DD/MM/YYYY" format.'
      });
    }
    
    const printingDateStr = printingDateMatch[1];
    const reportDate = parseDate(printingDateStr);
    if (!reportDate) {
      return res.status(400).json({ 
        error: 'Invalid date format in PDF',
        details: `Found date: ${printingDateStr}, but could not parse it. Expected format: DD/MM/YYYY`
      });
    }
    
    console.log('Credit Days Upload - Printing Date found:', printingDateStr, '->', reportDate);
    
    // Extract Month and Year from "For the Month of : November 2025"
    const monthYearMatch = text.match(/For the Month of\s*:\s*([A-Za-z]+\s+\d{4})/i);
    let reportYear = new Date().getFullYear();
    let reportMonth = new Date().getMonth() + 1;
    
    if (monthYearMatch) {
      const monthYearInfo = parseMonthYear(monthYearMatch[1]);
      if (monthYearInfo) {
        reportYear = monthYearInfo.year;
        reportMonth = monthYearInfo.month;
      }
    } else {
      // Fallback: extract from printing date
      const dateParts = reportDate.split('-');
      reportYear = parseInt(dateParts[0]);
      reportMonth = parseInt(dateParts[1]);
    }
    
    console.log('Credit Days Upload - Report period:', `Year: ${reportYear}, Month: ${reportMonth}`);
    
    // Extract dealer codes and credit days from table
    // PDF has multi-column layout, so we extract codes and credit days separately and match by position
    const lines = text.split('\n');
    const records = [];
    const missingDealers = [];
    const errors = [];
    
    // Strategy: Extract all dealer codes and all credit days, then match by relative position
    const dealerCodes = [];
    const creditDaysList = [];
    
    // First pass: Collect all dealer codes (4-5 digits, not years or addresses)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip headers, dates, addresses, page numbers
      if (!line || 
          line.toLowerCase().includes('page') || 
          line.toLowerCase().includes('printing date') ||
          line.toLowerCase().includes('dealer wise') ||
          line.toLowerCase().includes('dhaka-') ||
          line.match(/^\d+\s*of\s*\d+$/i) ||
          line.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        continue;
      }
      
      // Find dealer codes (4-5 digits)
      const codeMatches = line.match(/\b(\d{4,5})\b/g);
      if (codeMatches) {
        for (const code of codeMatches) {
          // Validate: not a year, reasonable dealer code range
          if (!code.startsWith('19') && !code.startsWith('20') && parseInt(code) >= 100 && parseInt(code) <= 99999) {
            const normalized = normalizeDealerCode(code);
            // Avoid duplicates from same line/area (within 3 lines, not 10)
            // This allows the same code to appear on different pages/sections
            if (!dealerCodes.find(dc => dc.code === normalized && Math.abs(dc.lineIndex - i) < 3)) {
              dealerCodes.push({
                code: normalized,
                lineIndex: i,
                rawLine: line
              });
            }
          }
        }
      }
    }
    
    // Second pass: Collect all credit days (small integers 0-365)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.toLowerCase().includes('page') || line.toLowerCase().includes('printing date')) {
        continue;
      }
      
      // Find small integers that could be credit days
      const numbers = line.match(/\b(\d{1,3})\b/g);
      if (numbers) {
        for (const numStr of numbers) {
          const num = parseInt(numStr);
          // Credit days: 0-365, not part of dates
          if (num >= 0 && num <= 365 && numStr.length <= 3 && 
              !line.match(/\d{2}\/\d{2}\/\d{4}/) &&
              !line.toLowerCase().includes('page')) {
            creditDaysList.push({
              value: num,
              lineIndex: i,
              rawLine: line
            });
          }
        }
      }
    }
    
    console.log(`Credit Days Upload - Found ${dealerCodes.length} dealer codes and ${creditDaysList.length} credit days values`);
    
    // Debug: Log sample codes and credit days
    if (dealerCodes.length > 0) {
      console.log(`Credit Days Upload - Sample dealer codes (first 10):`, dealerCodes.slice(0, 10).map(dc => `${dc.code}@${dc.lineIndex}`));
    }
    if (creditDaysList.length > 0) {
      console.log(`Credit Days Upload - Sample credit days (first 10):`, creditDaysList.slice(0, 10).map(cd => `${cd.value}@${cd.lineIndex}`));
    }
    
    // Match dealer codes with credit days by position
    // Strategy: Match codes with the closest credit days value within a reasonable distance
    const matched = new Map();
    
    // First, try to match codes and credit days on the same line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Find all dealer codes on this line
      const codeMatches = line.match(/\b(\d{4,5})\b/g);
      if (!codeMatches) continue;
      
      // Find all credit days values on this line
      const creditDaysMatches = line.match(/\b(\d{1,3})\b/g);
      const creditDaysOnLine = [];
      if (creditDaysMatches) {
        for (const numStr of creditDaysMatches) {
          const num = parseInt(numStr);
          if (num >= 0 && num <= 365 && numStr.length <= 3) {
            creditDaysOnLine.push(num);
          }
        }
      }
      
      // If we have both codes and credit days on the same line, match them
      for (const code of codeMatches) {
        if (!code.startsWith('19') && !code.startsWith('20') && parseInt(code) >= 100 && parseInt(code) <= 99999) {
          const normalized = normalizeDealerCode(code);
          
          // Try to find credit days on the same line
          if (creditDaysOnLine.length > 0) {
            // Use the last credit days value on the line (usually the rightmost column)
            const creditDays = creditDaysOnLine[creditDaysOnLine.length - 1];
            const key = normalized;
            
            // Only update if we don't have a match or this is a better match (same line)
            if (!matched.has(key) || matched.get(key).distance > 0) {
              matched.set(key, {
                dealerCode: normalized,
                creditDays: creditDays,
                distance: 0, // Same line = distance 0
                codeLine: i
              });
            }
          }
        }
      }
    }
    
    // Second pass: For codes without matches, look for credit days on nearby lines (within 5 lines)
    // Increased from 2 to 5 lines to handle multi-column layouts better
    for (const codeInfo of dealerCodes) {
      const key = codeInfo.code;
      
      // Skip if already matched
      if (matched.has(key)) continue;
      
      // Look for credit days on nearby lines (within 5 lines)
      const nearby = creditDaysList.filter(cd => 
        Math.abs(cd.lineIndex - codeInfo.lineIndex) <= 5
      );
      
      if (nearby.length > 0) {
        // Find the closest credit days value
        const closest = nearby.reduce((prev, curr) => 
          Math.abs(curr.lineIndex - codeInfo.lineIndex) < Math.abs(prev.lineIndex - codeInfo.lineIndex) 
            ? curr : prev
        );
        
        const distance = Math.abs(closest.lineIndex - codeInfo.lineIndex);
        matched.set(key, {
          dealerCode: codeInfo.code,
          creditDays: closest.value,
          distance: distance,
          codeLine: codeInfo.lineIndex
        });
      }
    }
    
    // Third pass: For any remaining unmatched codes, try to find credit days within 10 lines
    // This handles cases where data might be more spread out
    for (const codeInfo of dealerCodes) {
      const key = codeInfo.code;
      
      // Skip if already matched
      if (matched.has(key)) continue;
      
      // Look for credit days within 10 lines
      const nearby = creditDaysList.filter(cd => 
        Math.abs(cd.lineIndex - codeInfo.lineIndex) <= 10
      );
      
      if (nearby.length > 0) {
        // Find the closest credit days value
        const closest = nearby.reduce((prev, curr) => 
          Math.abs(curr.lineIndex - codeInfo.lineIndex) < Math.abs(prev.lineIndex - codeInfo.lineIndex) 
            ? curr : prev
        );
        
        const distance = Math.abs(closest.lineIndex - codeInfo.lineIndex);
        matched.set(key, {
          dealerCode: codeInfo.code,
          creditDays: closest.value,
          distance: distance,
          codeLine: codeInfo.lineIndex
        });
      }
    }
    
    // Convert to records
    matched.forEach((record) => {
      records.push({
        dealerCode: record.dealerCode,
        creditDays: record.creditDays,
        rowIndex: record.codeLine + 1
      });
    });
    
    console.log(`Credit Days Upload - Matched ${records.length} dealer codes with credit days`);
    
    // Debug: Log a few sample matches to verify accuracy
    if (records.length > 0) {
      console.log('Credit Days Upload - Sample matches (first 10):');
      records.slice(0, 10).forEach(r => {
        console.log(`  Dealer ${r.dealerCode}: ${r.creditDays} credit days`);
      });
      
      // Check for dealer 01268 specifically
      const dealer1268 = records.find(r => r.dealerCode === '1268' || r.dealerCode === '01268');
      if (dealer1268) {
        console.log(`Credit Days Upload - Found dealer 01268/1268: ${dealer1268.creditDays} credit days`);
      }
    }
    
    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'No dealer data found in PDF',
        details: 'Could not extract dealer codes and credit days from the PDF. Please ensure the PDF format is correct.'
      });
    }
    
    console.log(`Credit Days Upload - Found ${records.length} records`);
    console.log(`Credit Days Upload - Sample records (first 5):`, records.slice(0, 5));
    
    // Update credit_days_report table
    let successCount = 0;
    let errorCount = 0;
    const updatePromises = [];
    
    records.forEach((record) => {
      const updatePromise = new Promise((resolve) => {
        // Verify dealer exists - try multiple matching strategies like overdue route
        const normalizedCode = record.dealerCode;
        
        // Try multiple matching strategies:
        // 1. Exact match (normalized)
        // 2. Numeric match (CAST to number)
        // 3. Normalized match (TRIM leading zeros)
        // 4. Original code match (if we had it)
        const dealerQuery = `
          SELECT dealer_code 
          FROM dealers 
          WHERE BINARY dealer_code = ?
             OR CAST(dealer_code AS UNSIGNED) = CAST(? AS UNSIGNED)
             OR TRIM(LEADING '0' FROM dealer_code) = ?
          LIMIT 1
        `;
        
        db.query(dealerQuery, [normalizedCode, normalizedCode, normalizedCode], 
          (err, dealerResult) => {
            if (err) {
              console.error(`Error checking dealer ${normalizedCode}:`, err);
              errors.push(`Row ${record.rowIndex}: Database error checking dealer ${normalizedCode}`);
              errorCount++;
              resolve();
              return;
            }
            
            if (dealerResult.length === 0) {
              if (missingDealers.length < 10) {
                console.log(`Credit Days Upload - Dealer "${normalizedCode}" not found in database`);
              }
              missingDealers.push(normalizedCode);
              errorCount++;
              resolve();
              return;
            }
            
            const actualDealerCode = dealerResult[0].dealer_code;
            
            // Check if record exists
            const checkQuery = `SELECT id FROM credit_days_report WHERE dealer_code = ? AND year = ? AND month = ? AND \`report_date\` = ?`;
            
            db.query(checkQuery, [actualDealerCode, reportYear, reportMonth, reportDate], (checkErr, checkResult) => {
              if (checkErr) {
                console.error(`Error checking existing record for dealer ${actualDealerCode}:`, checkErr);
                errors.push(`Row ${record.rowIndex}: Database error checking existing record`);
                errorCount++;
                resolve();
                return;
              }
              
              if (checkResult.length > 0) {
                // Update existing record
                const updateQuery = `
                  UPDATE credit_days_report 
                  SET credit_days = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE dealer_code = ? AND year = ? AND month = ? AND \`report_date\` = ?
                `;
                
                db.query(updateQuery, [record.creditDays, actualDealerCode, reportYear, reportMonth, reportDate], (updateErr) => {
                  if (updateErr) {
                    console.error(`Error updating credit days for dealer ${actualDealerCode}:`, updateErr);
                    errors.push(`Row ${record.rowIndex}: Failed to update dealer ${actualDealerCode}`);
                    errorCount++;
                  } else {
                    console.log(`Credit Days Upload - Successfully updated dealer ${actualDealerCode}`);
                    successCount++;
                  }
                  resolve();
                });
              } else {
                // Insert new record
                const insertQuery = `
                  INSERT INTO credit_days_report 
                  (dealer_code, year, month, credit_days, \`report_date\`, updated_at)
                  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `;
                
                db.query(insertQuery, [actualDealerCode, reportYear, reportMonth, record.creditDays, reportDate], (insertErr) => {
                  if (insertErr) {
                    console.error(`Error inserting credit days for dealer ${actualDealerCode}:`, insertErr);
                    errors.push(`Row ${record.rowIndex}: Failed to insert dealer ${actualDealerCode}`);
                    errorCount++;
                  } else {
                    console.log(`Credit Days Upload - Successfully inserted dealer ${actualDealerCode}`);
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
        message: `Credit days report uploaded successfully.`,
        summary: {
          total_records: records.length,
          success_count: successCount,
          error_count: errorCount,
          missing_dealers_count: missingDealers.length,
          report_date: reportDate,
          year: reportYear,
          month: reportMonth
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
    console.error('Error processing credit days upload:', error);
    res.status(500).json({ 
      error: 'Failed to process PDF file', 
      details: error.message 
    });
  }
});

// Get credit days report
router.get('/report', (req, res) => {
  const { year, month, territory } = req.query;
  
  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (year && year !== '') {
    whereClause += ' AND cdr.year = ?';
    queryParams.push(parseInt(year));
  }
  
  if (month && month !== '') {
    whereClause += ' AND cdr.month = ?';
    queryParams.push(parseInt(month));
  }
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  // First, get the most recent report_date (Printing Date) from credit_days_report
  const getLatestDateQuery = `SELECT MAX(\`report_date\`) as latest_date FROM credit_days_report`;
  
  db.query(getLatestDateQuery, (dateErr, dateResults) => {
    let latestDate = null;
    
    if (dateErr) {
      console.error('Error fetching latest date:', dateErr);
      // Continue even if date query fails
    } else if (dateResults && dateResults.length > 0 && dateResults[0].latest_date) {
      latestDate = dateResults[0].latest_date;
    }
  
    const query = `
      SELECT 
        cdr.dealer_code,
        d.dealer_name,
        t.territory_name,
        cdr.year,
        cdr.month,
        cdr.credit_days,
        cdr.report_date,
        cdr.created_at,
        cdr.updated_at
      FROM credit_days_report cdr
      INNER JOIN dealers d ON BINARY d.dealer_code = BINARY cdr.dealer_code
      LEFT JOIN territories t ON d.territory_id = t.id
      ${whereClause}
      ORDER BY 
        cdr.report_date DESC,
        cdr.year DESC,
        cdr.month DESC,
        d.dealer_name ASC
    `;
    
    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error('Error fetching credit days report:', err);
        return res.status(500).json({ 
          error: 'Failed to fetch credit days report', 
          details: err.message 
        });
      }
      
      res.json({
        success: true,
        data: results,
        latestDate: latestDate // Most recent "Printing Date" from credit_days_report
      });
    });
  });
});

// Export credit days report to Excel
router.get('/export', (req, res) => {
  const { year, month, territory } = req.query;
  
  // Build WHERE clause (same as report endpoint)
  let whereClause = 'WHERE 1=1';
  const queryParams = [];
  
  if (year && year !== '') {
    whereClause += ' AND cdr.year = ?';
    queryParams.push(parseInt(year));
  }
  
  if (month && month !== '') {
    whereClause += ' AND cdr.month = ?';
    queryParams.push(parseInt(month));
  }
  
  if (territory && territory !== 'all') {
    whereClause += ' AND d.territory_id = ?';
    queryParams.push(parseInt(territory));
  }
  
  const query = `
    SELECT 
      cdr.dealer_code,
      d.dealer_name,
      t.territory_name,
      cdr.year,
      cdr.month,
      cdr.credit_days,
      cdr.report_date,
      cdr.created_at,
      cdr.updated_at
    FROM credit_days_report cdr
    INNER JOIN dealers d ON BINARY d.dealer_code = BINARY cdr.dealer_code
    LEFT JOIN territories t ON d.territory_id = t.id
    ${whereClause}
    ORDER BY 
      cdr.report_date DESC,
      cdr.year DESC,
      cdr.month DESC,
      d.dealer_name ASC
  `;
  
  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching credit days report for export:', err);
      return res.status(500).json({ 
        error: 'Failed to fetch credit days report', 
        details: err.message 
      });
    }
    
    // Prepare data for Excel
    const excelData = results.map(row => ({
      'Dealer Code': row.dealer_code,
      'Dealer Name': row.dealer_name || 'N/A',
      'Territory': row.territory_name || 'N/A',
      'Year': row.year,
      'Month': row.month ? new Date(2000, row.month - 1).toLocaleString('default', { month: 'long' }) : 'N/A',
      'Credit Days': row.credit_days,
      'Report Date': row.report_date ? new Date(row.report_date).toLocaleDateString() : 'N/A',
      'Created At': row.created_at ? new Date(row.created_at).toLocaleString() : 'N/A',
      'Updated At': row.updated_at ? new Date(row.updated_at).toLocaleString() : 'N/A'
    }));
    
    // Create workbook and worksheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(excelData);
    
    // Set column widths
    const colWidths = [
      { wch: 12 }, // Dealer Code
      { wch: 30 }, // Dealer Name
      { wch: 20 }, // Territory
      { wch: 8 },  // Year
      { wch: 12 }, // Month
      { wch: 12 }, // Credit Days
      { wch: 15 }, // Report Date
      { wch: 20 }, // Created At
      { wch: 20 }  // Updated At
    ];
    ws['!cols'] = colWidths;
    
    xlsx.utils.book_append_sheet(wb, ws, 'Credit Days Report');
    
    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=credit-days-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    res.send(buffer);
  });
});

module.exports = router;

