const db = require('./db');

// Get dealer code from command line argument or use a test dealer
const dealerCode = process.argv[2] || null;

if (!dealerCode) {
  console.log('Usage: node server/verify-overdue-calculation.js <dealer_code>');
  console.log('Example: node server/verify-overdue-calculation.js 12345');
  process.exit(1);
}

console.log(`\n🔍 Verifying Overdue Calculation for Dealer: ${dealerCode}\n`);
console.log('='.repeat(80));

// Step 1: Get dealer basic info
db.query(`
  SELECT 
    dealer_code,
    dealer_name,
    opening_balance,
    closing_balance,
    lower_limit,
    upper_limit,
    COALESCE(billing_cycle_start_day, 1) as cycle_start_day
  FROM dealers 
  WHERE dealer_code = ?
`, [dealerCode], (err, dealers) => {
  if (err) {
    console.error('Error fetching dealer:', err);
    process.exit(1);
  }
  
  if (dealers.length === 0) {
    console.error(`❌ Dealer ${dealerCode} not found!`);
    process.exit(1);
  }
  
  const dealer = dealers[0];
  
  console.log('\n📊 DEALER INFORMATION:');
  console.log(`   Code: ${dealer.dealer_code}`);
  console.log(`   Name: ${dealer.dealer_name}`);
  console.log(`   Opening Balance: ${parseFloat(dealer.opening_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`   Closing Balance: ${parseFloat(dealer.closing_balance || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`   Lower Limit: ${parseFloat(dealer.lower_limit || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`   Upper Limit: ${parseFloat(dealer.upper_limit || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`   Billing Cycle: ${dealer.cycle_start_day}th to ${dealer.cycle_start_day === 1 ? 'end of month' : (dealer.cycle_start_day - 1) + 'th'}`);
  
  // Step 2: Get recent sales and collections
  db.query(`
    SELECT 
      transaction_date,
      SUM(sales_amount) as total_sales
    FROM daily_sales
    WHERE dealer_code = ?
    GROUP BY transaction_date
    ORDER BY transaction_date DESC
    LIMIT 10
  `, [dealerCode], (salesErr, sales) => {
    if (salesErr) {
      console.error('Error fetching sales:', salesErr);
      process.exit(1);
    }
    
    db.query(`
      SELECT 
        transaction_date,
        SUM(collection_amount) as total_collection
      FROM daily_collections
      WHERE dealer_code = ?
      GROUP BY transaction_date
      ORDER BY transaction_date DESC
      LIMIT 10
    `, [dealerCode], (collectionsErr, collections) => {
      if (collectionsErr) {
        console.error('Error fetching collections:', collectionsErr);
        process.exit(1);
      }
      
      console.log('\n💰 RECENT TRANSACTIONS (Last 10 days):');
      if (sales.length === 0 && collections.length === 0) {
        console.log('   No transactions found');
      } else {
        const allDates = new Set();
        sales.forEach(s => allDates.add(s.transaction_date));
        collections.forEach(c => allDates.add(c.transaction_date));
        const sortedDates = Array.from(allDates).sort().reverse().slice(0, 10);
        
        sortedDates.forEach(date => {
          const sale = sales.find(s => s.transaction_date === date);
          const collection = collections.find(c => c.transaction_date === date);
          const saleAmt = sale ? parseFloat(sale.total_sales || 0) : 0;
          const collAmt = collection ? parseFloat(collection.total_collection || 0) : 0;
          console.log(`   ${date}: Sales = ${saleAmt.toLocaleString('en-IN', {minimumFractionDigits: 2})}, Collection = ${collAmt.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
        });
      }
      
      // Step 3: Calculate overdue manually
      const closingBalance = parseFloat(dealer.closing_balance || 0);
      const lowerLimit = parseFloat(dealer.lower_limit || 0);
      const upperLimit = parseFloat(dealer.upper_limit || 0);
      
      const lowerOverdue = closingBalance - lowerLimit;
      const upperOverdue = closingBalance - upperLimit;
      
      console.log('\n📈 OVERDUE CALCULATION:');
      console.log(`   Closing Balance: ${closingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      console.log(`   Lower Limit: ${lowerLimit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      console.log(`   Upper Limit: ${upperLimit.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      console.log(`\n   Lower Overdue = Closing Balance - Lower Limit`);
      console.log(`   Lower Overdue = ${closingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})} - ${lowerLimit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      console.log(`   Lower Overdue = ${lowerOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      if (lowerOverdue > 0) {
        console.log(`   ⚠️  VIOLATION: Balance is ${lowerOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2})} above lower limit`);
      } else if (lowerOverdue < 0) {
        console.log(`   ✅ OK: Balance is ${Math.abs(lowerOverdue).toLocaleString('en-IN', {minimumFractionDigits: 2})} below lower limit`);
      } else {
        console.log(`   ✅ OK: Balance exactly at lower limit`);
      }
      
      console.log(`\n   Upper Overdue = Closing Balance - Upper Limit`);
      console.log(`   Upper Overdue = ${closingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})} - ${upperLimit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      console.log(`   Upper Overdue = ${upperOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      if (upperOverdue > 0) {
        console.log(`   ⚠️  VIOLATION: Balance is ${upperOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2})} above upper limit`);
      } else if (upperOverdue < 0) {
        console.log(`   ✅ OK: Balance is ${Math.abs(upperOverdue).toLocaleString('en-IN', {minimumFractionDigits: 2})} below upper limit`);
      } else {
        console.log(`   ✅ OK: Balance exactly at upper limit`);
      }
      
      // Step 4: Check stored overdue report
      db.query(`
        SELECT 
          year,
          month,
          lower_limit_overdue,
          upper_limit_overdue,
          current_date,
          days_into_month
        FROM overdue_report
        WHERE dealer_code = ?
        ORDER BY year DESC, month DESC
        LIMIT 1
      `, [dealerCode], (overdueErr, overdueResults) => {
        if (overdueErr) {
          console.error('Error fetching overdue report:', overdueErr);
          process.exit(1);
        }
        
        console.log('\n📋 STORED OVERDUE REPORT:');
        if (overdueResults.length === 0) {
          console.log('   ⚠️  No overdue report found. Run "Calculate Balance" first.');
        } else {
          const overdue = overdueResults[0];
          console.log(`   Year: ${overdue.year}, Month: ${overdue.month}`);
          console.log(`   Calculation Date: ${overdue.current_date}`);
          console.log(`   Days into Month: ${overdue.days_into_month}`);
          console.log(`   Stored Lower Overdue: ${parseFloat(overdue.lower_limit_overdue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          console.log(`   Stored Upper Overdue: ${parseFloat(overdue.upper_limit_overdue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          
          // Compare
          const storedLower = parseFloat(overdue.lower_limit_overdue || 0);
          const storedUpper = parseFloat(overdue.upper_limit_overdue || 0);
          
          console.log('\n🔍 VERIFICATION:');
          if (Math.abs(storedLower - lowerOverdue) < 0.01) {
            console.log(`   ✅ Lower Overdue matches: ${storedLower.toLocaleString('en-IN', {minimumFractionDigits: 2})} = ${lowerOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          } else {
            console.log(`   ❌ Lower Overdue MISMATCH!`);
            console.log(`      Stored: ${storedLower.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
            console.log(`      Calculated: ${lowerOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
            console.log(`      Difference: ${(storedLower - lowerOverdue).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          }
          
          if (Math.abs(storedUpper - upperOverdue) < 0.01) {
            console.log(`   ✅ Upper Overdue matches: ${storedUpper.toLocaleString('en-IN', {minimumFractionDigits: 2})} = ${upperOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          } else {
            console.log(`   ❌ Upper Overdue MISMATCH!`);
            console.log(`      Stored: ${storedUpper.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
            console.log(`      Calculated: ${upperOverdue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
            console.log(`      Difference: ${(storedUpper - upperOverdue).toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
          }
        }
        
        // Step 5: Check balance history
        db.query(`
          SELECT 
            balance_date,
            opening_balance,
            sales_amount,
            collection_amount,
            closing_balance
          FROM dealer_balance_history
          WHERE dealer_code = ?
          ORDER BY balance_date DESC
          LIMIT 5
        `, [dealerCode], (historyErr, history) => {
          if (historyErr) {
            console.error('Error fetching balance history:', historyErr);
            process.exit(1);
          }
          
          console.log('\n📅 RECENT BALANCE HISTORY (Last 5 days):');
          if (history.length === 0) {
            console.log('   No balance history found. Run "Calculate Balance" first.');
          } else {
            history.forEach(h => {
              const opening = parseFloat(h.opening_balance || 0);
              const sales = parseFloat(h.sales_amount || 0);
              const collection = parseFloat(h.collection_amount || 0);
              const closing = parseFloat(h.closing_balance || 0);
              const calculated = opening + sales - collection;
              
              console.log(`   ${h.balance_date}:`);
              console.log(`      Opening: ${opening.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
              console.log(`      Sales: +${sales.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
              console.log(`      Collection: -${collection.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
              console.log(`      Closing: ${closing.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
              if (Math.abs(calculated - closing) < 0.01) {
                console.log(`      ✅ Formula check: ${opening} + ${sales} - ${collection} = ${calculated} ✓`);
              } else {
                console.log(`      ❌ Formula check FAILED: ${opening} + ${sales} - ${collection} = ${calculated}, but stored = ${closing}`);
              }
            });
          }
          
          console.log('\n' + '='.repeat(80));
          console.log('✅ Verification complete!\n');
          process.exit(0);
        });
      });
    });
  });
});

