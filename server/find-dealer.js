const db = require('./db');

const searchCode = process.argv[2] || '0973';

console.log(`Searching for dealer: ${searchCode}\n`);

// Try multiple formats
db.query(`
  SELECT dealer_code, dealer_name, opening_balance, closing_balance, lower_limit, upper_limit
  FROM dealers 
  WHERE dealer_code = ? 
     OR dealer_code = ?
     OR CAST(dealer_code AS UNSIGNED) = CAST(? AS UNSIGNED)
     OR TRIM(LEADING '0' FROM dealer_code) = ?
  LIMIT 10
`, [searchCode, searchCode.replace(/^0+/, ''), searchCode.replace(/^0+/, ''), searchCode.replace(/^0+/, '')], (err, results) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  if (results.length === 0) {
    console.log('❌ Dealer not found. Showing sample dealers:\n');
    db.query('SELECT dealer_code, dealer_name FROM dealers LIMIT 10', (e, r) => {
      r.forEach(d => console.log(`  ${d.dealer_code} - ${d.dealer_name}`));
      process.exit(0);
    });
  } else {
    console.log(`✅ Found ${results.length} dealer(s):\n`);
    results.forEach(dealer => {
      console.log(`Code: ${dealer.dealer_code}`);
      console.log(`Name: ${dealer.dealer_name}`);
      console.log(`Opening Balance: ${parseFloat(dealer.opening_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      console.log(`Closing Balance: ${parseFloat(dealer.closing_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      console.log(`Lower Limit: ${parseFloat(dealer.lower_limit || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      console.log(`Upper Limit: ${parseFloat(dealer.upper_limit || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      console.log('');
    });
    
    // If found, run verification
    if (results.length === 1) {
      console.log('Running verification...\n');
      const dealerCode = results[0].dealer_code;
      require('child_process').exec(`node server/verify-overdue-calculation.js "${dealerCode}"`, (error, stdout, stderr) => {
        if (error) {
          console.error('Verification error:', error);
        } else {
          console.log(stdout);
        }
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
});

