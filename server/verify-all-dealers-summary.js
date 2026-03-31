const db = require('./db');

console.log('\n📊 OVERDUE CALCULATION SUMMARY\n');
console.log('='.repeat(80));

// Get summary of all dealers with limits
db.query(`
  SELECT 
    COUNT(*) as total_dealers,
    COUNT(CASE WHEN lower_limit > 0 OR upper_limit > 0 THEN 1 END) as dealers_with_limits,
    COUNT(CASE WHEN opening_balance IS NOT NULL AND opening_balance != 0 THEN 1 END) as dealers_with_balance,
    COUNT(CASE WHEN closing_balance IS NOT NULL AND closing_balance != 0 THEN 1 END) as dealers_with_closing_balance,
    SUM(CASE WHEN closing_balance IS NOT NULL THEN closing_balance ELSE 0 END) as total_closing_balance
  FROM dealers
`, (err, summary) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  const s = summary[0];
  console.log('\n📈 DEALER STATISTICS:');
  console.log(`   Total Dealers: ${s.total_dealers}`);
  console.log(`   Dealers with Limits Set: ${s.dealers_with_limits}`);
  console.log(`   Dealers with Opening Balance: ${s.dealers_with_balance}`);
  console.log(`   Dealers with Closing Balance: ${s.dealers_with_closing_balance}`);
  console.log(`   Total Closing Balance: ${parseFloat(s.total_closing_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
  
  // Get overdue report summary
  db.query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT dealer_code) as unique_dealers,
      SUM(CASE WHEN lower_limit_overdue > 0 THEN 1 ELSE 0 END) as lower_violations,
      SUM(CASE WHEN upper_limit_overdue > 0 THEN 1 ELSE 0 END) as upper_violations,
      SUM(lower_limit_overdue) as total_lower_overdue,
      SUM(upper_limit_overdue) as total_upper_overdue,
      MAX(current_date) as latest_calculation_date
    FROM overdue_report
  `, (overdueErr, overdueSummary) => {
    if (overdueErr) {
      console.error('Error:', overdueErr);
      process.exit(1);
    }
    
    const os = overdueSummary[0];
    console.log('\n📋 OVERDUE REPORT SUMMARY:');
    console.log(`   Total Records: ${os.total_records}`);
    console.log(`   Unique Dealers: ${os.unique_dealers}`);
    console.log(`   Lower Limit Violations: ${os.lower_violations}`);
    console.log(`   Upper Limit Violations: ${os.upper_violations}`);
    console.log(`   Total Lower Overdue: ${parseFloat(os.total_lower_overdue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    console.log(`   Total Upper Overdue: ${parseFloat(os.total_upper_overdue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
    console.log(`   Latest Calculation Date: ${os.latest_calculation_date || 'N/A'}`);
    
    // Get sample dealers with violations
    db.query(`
      SELECT 
        d.dealer_code,
        d.dealer_name,
        d.closing_balance,
        d.lower_limit,
        d.upper_limit,
        ovr.lower_limit_overdue,
        ovr.upper_limit_overdue
      FROM dealers d
      LEFT JOIN overdue_report ovr ON d.dealer_code = ovr.dealer_code
      WHERE (ovr.lower_limit_overdue > 0 OR ovr.upper_limit_overdue > 0)
      ORDER BY ABS(ovr.lower_limit_overdue) + ABS(ovr.upper_limit_overdue) DESC
      LIMIT 10
    `, (sampleErr, samples) => {
      if (sampleErr) {
        console.error('Error:', sampleErr);
        process.exit(1);
      }
      
      if (samples.length > 0) {
        console.log('\n⚠️  TOP 10 DEALERS WITH VIOLATIONS:');
        samples.forEach((dealer, idx) => {
          console.log(`\n   ${idx + 1}. ${dealer.dealer_code} - ${dealer.dealer_name}`);
          console.log(`      Closing Balance: ${parseFloat(dealer.closing_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          console.log(`      Lower Limit: ${parseFloat(dealer.lower_limit || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          console.log(`      Upper Limit: ${parseFloat(dealer.upper_limit || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          console.log(`      Lower Overdue: ${parseFloat(dealer.lower_limit_overdue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          console.log(`      Upper Overdue: ${parseFloat(dealer.upper_limit_overdue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          
          // Verify calculation
          const calculatedLower = parseFloat(dealer.closing_balance || 0) - parseFloat(dealer.lower_limit || 0);
          const calculatedUpper = parseFloat(dealer.closing_balance || 0) - parseFloat(dealer.upper_limit || 0);
          const storedLower = parseFloat(dealer.lower_limit_overdue || 0);
          const storedUpper = parseFloat(dealer.upper_limit_overdue || 0);
          
          if (Math.abs(calculatedLower - storedLower) < 0.01) {
            console.log(`      ✅ Lower Overdue calculation: CORRECT`);
          } else {
            console.log(`      ❌ Lower Overdue calculation: MISMATCH (Stored: ${storedLower}, Calculated: ${calculatedLower})`);
          }
          
          if (Math.abs(calculatedUpper - storedUpper) < 0.01) {
            console.log(`      ✅ Upper Overdue calculation: CORRECT`);
          } else {
            console.log(`      ❌ Upper Overdue calculation: MISMATCH (Stored: ${storedUpper}, Calculated: ${calculatedUpper})`);
          }
        });
      } else {
        console.log('\n✅ No violations found in overdue report.');
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('\n💡 TIP: To verify a specific dealer, run:');
      console.log('   node server/verify-overdue-calculation.js <dealer_code>\n');
      process.exit(0);
    });
  });
});



