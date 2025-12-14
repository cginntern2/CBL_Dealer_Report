const pdf = require('pdf-parse');
const fs = require('fs');

async function examinePDF() {
  const buffer = fs.readFileSync('CR DAYS.PDF');
  const data = await pdf(buffer);
  const lines = data.text.split('\n');
  
  console.log('Examining lines around "Code" headers (lines 87-95):');
  for (let i = 85; i < Math.min(95, lines.length); i++) {
    console.log(`Line ${i + 1}: "${lines[i]}"`);
  }
  
  console.log('\n\nExamining lines around "Credit" headers (lines 170-180):');
  for (let i = 168; i < Math.min(180, lines.length); i++) {
    console.log(`Line ${i + 1}: "${lines[i]}"`);
  }
  
  console.log('\n\nLooking for data rows after headers (lines 180-220):');
  for (let i = 179; i < Math.min(220, lines.length); i++) {
    const line = lines[i].trim();
    if (line && line.match(/\d{4,5}/)) {
      console.log(`Line ${i + 1}: "${line}"`);
    }
  }
}

examinePDF().catch(console.error);

