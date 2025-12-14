const pdf = require('pdf-parse');
const fs = require('fs');

async function findPDFStructure() {
  const buffer = fs.readFileSync('CR DAYS.PDF');
  const data = await pdf(buffer);
  const lines = data.text.split('\n');
  
  console.log('Searching for table headers and data...\n');
  
  // Find lines with "Code" or "Credit"
  console.log('Lines containing "Code" or "Credit":');
  for (let i = 0; i < Math.min(200, lines.length); i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().includes('code') || line.toLowerCase().includes('credit')) {
      console.log(`Line ${i + 1}: "${line}"`);
    }
  }
  
  console.log('\n\nLines with 4-5 digit numbers (potential dealer codes):');
  let count = 0;
  for (let i = 0; i < lines.length && count < 30; i++) {
    const line = lines[i].trim();
    if (line.match(/\b\d{4,5}\b/) && line.length > 5 && !line.toLowerCase().includes('page')) {
      console.log(`Line ${i + 1}: "${line.substring(0, 200)}${line.length > 200 ? '...' : ''}"`);
      count++;
    }
  }
}

findPDFStructure().catch(console.error);

