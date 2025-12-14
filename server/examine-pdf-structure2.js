const pdf = require('pdf-parse');
const fs = require('fs');

async function examinePDF() {
  const buffer = fs.readFileSync('CR DAYS.PDF');
  const data = await pdf(buffer);
  const text = data.text;
  const lines = data.text.split('\n');
  
  // Look for pattern: dealer code followed by credit days
  // Based on the image, we need: Code column and Credit Days column
  
  console.log('Looking for table data structure...\n');
  console.log('Lines 85-200 (around headers and data):');
  for (let i = 84; i < Math.min(200, lines.length); i++) {
    const line = lines[i].trim();
    if (line) {
      // Show lines that might contain table data
      if (line.match(/\d{4,5}/) || line.toLowerCase().includes('code') || 
          line.toLowerCase().includes('credit') || line.match(/^\d+$/)) {
        console.log(`Line ${i + 1}: "${line}"`);
      }
    }
  }
  
  // Try to find patterns: dealer code (4-5 digits) near credit days (small integer)
  console.log('\n\nTrying to find Code + Credit Days pairs:');
  const allText = text.replace(/\n/g, ' ');
  const codeMatches = [...allText.matchAll(/\b(\d{4,5})\b/g)];
  
  console.log(`Found ${codeMatches.length} potential dealer codes`);
  console.log('First 20 matches with context:');
  for (let i = 0; i < Math.min(20, codeMatches.length); i++) {
    const match = codeMatches[i];
    const start = Math.max(0, match.index - 50);
    const end = Math.min(allText.length, match.index + 100);
    const context = allText.substring(start, end);
    console.log(`\nMatch ${i + 1} at position ${match.index}:`);
    console.log(`  Code: ${match[1]}`);
    console.log(`  Context: "...${context}..."`);
  }
}

examinePDF().catch(console.error);

