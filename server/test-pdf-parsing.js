const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

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

async function testPDFParsing() {
  try {
    const pdfPath = path.join(__dirname, '..', 'CR DAYS.PDF');
    
    if (!fs.existsSync(pdfPath)) {
      console.error('❌ PDF file not found at:', pdfPath);
      process.exit(1);
    }
    
    console.log('📄 Reading PDF file...');
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('📖 Parsing PDF...');
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    
    console.log(`✅ PDF parsed successfully!`);
    console.log(`📊 Text length: ${text.length} characters`);
    console.log(`📄 Number of pages: ${data.numpages}`);
    console.log('\n' + '='.repeat(80));
    
    // Extract Printing Date
    const printingDateMatch = text.match(/Printing Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (printingDateMatch) {
      const printingDateStr = printingDateMatch[1];
      const reportDate = parseDate(printingDateStr);
      console.log(`\n📅 Printing Date found: "${printingDateStr}" -> ${reportDate}`);
    } else {
      console.log('\n❌ Printing Date not found!');
    }
    
    // Extract Month and Year
    const monthYearMatch = text.match(/For the Month of\s*:\s*([A-Za-z]+\s+\d{4})/i);
    if (monthYearMatch) {
      const monthYearInfo = parseMonthYear(monthYearMatch[1]);
      if (monthYearInfo) {
        console.log(`📆 Month/Year found: "${monthYearMatch[1]}" -> Month: ${monthYearInfo.month}, Year: ${monthYearInfo.year}`);
      }
    }
    
    // Extract dealer codes and credit days
    const lines = text.split('\n');
    const records = [];
    
    // Find the header row - look for "Code" and "Credit" or "Credit Days"
    let codeColumnIndex = -1;
    let creditDaysColumnIndex = -1;
    let headerRowIndex = -1;
    
    console.log('\n🔍 Searching for header row...');
    for (let i = 0; i < Math.min(100, lines.length); i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();
      
      // Look for header row with both "code" and "credit"
      if (lineLower.includes('code') && (lineLower.includes('credit') || lineLower.includes('credit days'))) {
        headerRowIndex = i;
        console.log(`\n📋 Potential header found at row ${i + 1}:`);
        console.log(`   Full line: "${line}"`);
        
        // Try to identify column positions
        // Split by multiple spaces or tabs to get columns
        const headerParts = line.split(/\s{2,}|\t/).filter(p => p.trim() !== '');
        console.log(`   Split into ${headerParts.length} parts:`, headerParts);
        
        // Find Code column
        for (let j = 0; j < headerParts.length; j++) {
          const part = headerParts[j].toLowerCase().trim();
          if (part === 'code' || part.includes('code')) {
            codeColumnIndex = j;
            console.log(`   Found "Code" at column index ${j}`);
          }
          if (part.includes('credit')) {
            creditDaysColumnIndex = j;
            console.log(`   Found "Credit" at column index ${j}`);
          }
        }
        break;
      }
    }
    
    if (headerRowIndex < 0) {
      console.log('⚠️  Header row not found with standard search');
      console.log('\n🔍 Showing first 30 lines to debug:');
      for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i].trim();
        if (line) {
          console.log(`   Line ${i + 1}: "${line.substring(0, 100)}${line.length > 100 ? '...' : ''}"`);
        }
      }
    }
    
    // Use the new matching strategy (same as route)
    // Strategy: Extract all dealer codes and all credit days, then match by position
    const dealerCodes = [];
    const creditDaysList = [];
    
    // First pass: Collect all dealer codes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || 
          line.toLowerCase().includes('page') || 
          line.toLowerCase().includes('printing date') ||
          line.toLowerCase().includes('dealer wise') ||
          line.toLowerCase().includes('dhaka-') ||
          line.match(/^\d+\s*of\s*\d+$/i) ||
          line.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        continue;
      }
      
      const codeMatches = line.match(/\b(\d{4,5})\b/g);
      if (codeMatches) {
        for (const code of codeMatches) {
          if (!code.startsWith('19') && !code.startsWith('20') && parseInt(code) >= 100 && parseInt(code) <= 99999) {
            const normalized = normalizeDealerCode(code);
            if (!dealerCodes.find(dc => dc.code === normalized && Math.abs(dc.lineIndex - i) < 10)) {
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
    
    // Second pass: Collect all credit days
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.toLowerCase().includes('page') || line.toLowerCase().includes('printing date')) {
        continue;
      }
      
      const numbers = line.match(/\b(\d{1,3})\b/g);
      if (numbers) {
        for (const numStr of numbers) {
          const num = parseInt(numStr);
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
    
    console.log(`\n📊 Found ${dealerCodes.length} dealer codes and ${creditDaysList.length} credit days values`);
    
    // Match by position
    const matched = new Map();
    for (const codeInfo of dealerCodes) {
      const nearby = creditDaysList.filter(cd => 
        Math.abs(cd.lineIndex - codeInfo.lineIndex) < 100
      );
      
      if (nearby.length > 0) {
        const closest = nearby.reduce((prev, curr) => 
          Math.abs(curr.lineIndex - codeInfo.lineIndex) < Math.abs(prev.lineIndex - codeInfo.lineIndex) 
            ? curr : prev
        );
        
        if (Math.abs(closest.lineIndex - codeInfo.lineIndex) < 80) {
          const key = codeInfo.code;
          const distance = Math.abs(closest.lineIndex - codeInfo.lineIndex);
          
          if (!matched.has(key) || distance < matched.get(key).distance) {
            matched.set(key, {
              dealerCode: codeInfo.code,
              creditDays: closest.value,
              distance: distance,
              codeLine: codeInfo.lineIndex
            });
          }
        }
      }
    }
    
    // Convert to records
    matched.forEach((record) => {
      records.push({
        dealerCode: record.dealerCode,
        creditDays: record.creditDays,
        rowIndex: record.codeLine + 1,
        rawLine: lines[record.codeLine]
      });
    });
    
    console.log('\n' + '='.repeat(80));
        const line = lines[i].trim();
        
        if (!line || 
            line.toLowerCase().includes('page') || 
            line.toLowerCase().includes('total') || 
            line.toLowerCase().includes('printing date') ||
            line.toLowerCase().includes('dealer wise') ||
            line.match(/^\d+\s*of\s*\d+$/i)) {
          continue;
        }
        
        // Split line by multiple spaces or tabs (table format)
        const columns = line.split(/\s{2,}|\t/).filter(col => col.trim() !== '');
        
        // If that didn't work well, try single space split
        let columns2 = line.split(/\s+/).filter(col => col.trim() !== '');
        
        // Use the split that gives more columns (likely table format)
        const finalColumns = columns.length >= columns2.length ? columns : columns2;
        
        if (finalColumns.length < 2) continue;
        
        let dealerCode = null;
        let creditDays = null;
        
        // Extract Code - look for 4-5 digit number
        // Try both column-based and pattern-based extraction
        if (codeColumnIndex >= 0 && codeColumnIndex < finalColumns.length) {
          const col = finalColumns[codeColumnIndex].trim();
          if (/^\d{4,5}$/.test(col) && !col.startsWith('19') && !col.startsWith('20')) {
            dealerCode = normalizeDealerCode(col);
          }
        }
        
        // If column-based didn't work, search all columns
        if (!dealerCode) {
          for (let j = 0; j < finalColumns.length; j++) {
            const col = finalColumns[j].trim();
            if (/^\d{4,5}$/.test(col) && !col.startsWith('19') && !col.startsWith('20') && parseInt(col) > 100) {
              dealerCode = normalizeDealerCode(col);
              break;
            }
          }
        }
        
        // Extract Credit Days
        if (dealerCode) {
          // Try column-based first
          if (creditDaysColumnIndex >= 0 && creditDaysColumnIndex < finalColumns.length) {
            const col = finalColumns[creditDaysColumnIndex].trim().replace(/,/g, '');
            const num = parseInt(col);
            if (!isNaN(num) && num >= 0 && num <= 365 && Number.isInteger(num) && col.length <= 3) {
              creditDays = num;
            }
          }
          
          // If column-based didn't work, search for small integers (0-365)
          if (creditDays === null) {
            for (let j = 0; j < finalColumns.length; j++) {
              const col = finalColumns[j].trim().replace(/,/g, '');
              const num = parseInt(col);
              // Credit days is a small integer, not a large number with decimals
              if (!isNaN(num) && num >= 0 && num <= 365 && Number.isInteger(num) && col.length <= 3 && !col.includes('.')) {
                // Make sure it's not part of a date or SL number
                if (num < 100 || (num >= 100 && num <= 365)) {
                  creditDays = num;
                  break;
                }
              }
            }
          }
          
          if (dealerCode && creditDays !== null) {
            // Additional validation: dealer code should be reasonable (not from address)
            const codeNum = parseInt(dealerCode);
            if (codeNum >= 100 && codeNum <= 99999) {
              if (!records.find(r => r.dealerCode === dealerCode)) {
                records.push({
                  dealerCode: dealerCode,
                  creditDays: creditDays,
                  rowIndex: i + 1,
                  rawLine: line,
                  columns: finalColumns
                });
              }
            }
          } else if (dealerCode) {
            // Log when we find dealer code but not credit days
            if (records.length < 5) {
              console.log(`   Row ${i + 1}: Found dealer ${dealerCode} but no credit days. Columns:`, finalColumns);
            }
          }
        }
      }
    } else {
      console.log('\n⚠️  Header not found, trying fallback pattern matching...\n');
      
      for (let i = 0; i < Math.min(100, lines.length); i++) {
        const line = lines[i].trim();
        if (!line || line.toLowerCase().includes('page') || line.toLowerCase().includes('printing date')) {
          continue;
        }
        
        const codeMatch = line.match(/\b(\d{4,5})\b/);
        if (codeMatch) {
          const dealerCode = normalizeDealerCode(codeMatch[1]);
          const numbers = line.match(/\b(\d{1,3})\b/g);
          if (numbers && numbers.length > 0) {
            for (let j = Math.max(0, numbers.length - 3); j < numbers.length; j++) {
              const num = parseInt(numbers[j]);
              if (num >= 0 && num <= 365) {
                if (!records.find(r => r.dealerCode === dealerCode)) {
                  records.push({
                    dealerCode: dealerCode,
                    creditDays: num,
                    rowIndex: i + 1,
                    rawLine: line
                  });
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Extraction Results:`);
    console.log(`   Total records extracted: ${records.length}\n`);
    
    if (records.length > 0) {
      console.log('📋 Sample records (first 10):');
      console.log('─'.repeat(80));
      records.slice(0, 10).forEach((record, idx) => {
        console.log(`${idx + 1}. Row ${record.rowIndex}: Code="${record.dealerCode}", Credit Days=${record.creditDays}`);
        console.log(`   Raw line: "${record.rawLine}"`);
      });
      
      if (records.length > 10) {
        console.log(`\n   ... and ${records.length - 10} more records`);
      }
      
      // Show statistics
      const uniqueCodes = new Set(records.map(r => r.dealerCode));
      const creditDaysValues = records.map(r => r.creditDays);
      const minCreditDays = Math.min(...creditDaysValues);
      const maxCreditDays = Math.max(...creditDaysValues);
      const avgCreditDays = creditDaysValues.reduce((a, b) => a + b, 0) / creditDaysValues.length;
      
      console.log('\n📈 Statistics:');
      console.log(`   Unique dealer codes: ${uniqueCodes.size}`);
      console.log(`   Credit Days range: ${minCreditDays} - ${maxCreditDays}`);
      console.log(`   Average Credit Days: ${avgCreditDays.toFixed(2)}`);
    } else {
      console.log('❌ No records extracted!');
      console.log('\n🔍 Debugging: Showing first 20 non-empty lines:');
      let count = 0;
      for (let i = 0; i < lines.length && count < 20; i++) {
        const line = lines[i].trim();
        if (line && !line.toLowerCase().includes('page') && !line.toLowerCase().includes('printing date')) {
          console.log(`   Line ${i + 1}: "${line}"`);
          count++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error testing PDF parsing:', error);
    process.exit(1);
  }
}

testPDFParsing();

