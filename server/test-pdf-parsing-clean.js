const pdf = require('pdf-parse');
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
    const data = await pdf(dataBuffer);
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
    
    // Extract dealer codes and credit days using new matching strategy
    const lines = text.split('\n');
    const records = [];
    
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
    console.log(`\n📊 Extraction Results:`);
    console.log(`   Total records extracted: ${records.length}\n`);
    
    if (records.length > 0) {
      console.log('📋 Sample records (first 20):');
      console.log('─'.repeat(80));
      records.slice(0, 20).forEach((record, idx) => {
        console.log(`${idx + 1}. Row ${record.rowIndex}: Code="${record.dealerCode}", Credit Days=${record.creditDays}`);
        console.log(`   Raw line: "${record.rawLine.substring(0, 100)}${record.rawLine.length > 100 ? '...' : ''}"`);
      });
      
      if (records.length > 20) {
        console.log(`\n   ... and ${records.length - 20} more records`);
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
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error testing PDF parsing:', error);
    process.exit(1);
  }
}

testPDFParsing();

