const db = require('./db');

// Test if overdue_report table exists
db.query('SHOW TABLES LIKE "overdue_report"', (err, result) => {
  if (err) {
    console.error('Error checking table:', err.message);
    process.exit(1);
  }
  
  if (result.length === 0) {
    console.log('❌ overdue_report table does not exist!');
    console.log('Please run: node server/create-overdue-report-table.js');
    process.exit(1);
  }
  
  console.log('✅ overdue_report table exists');
  
  // Check row count
  db.query('SELECT COUNT(*) as count FROM overdue_report', (err2, result2) => {
    if (err2) {
      console.error('Error counting rows:', err2.message);
      process.exit(1);
    }
    
    console.log(`📊 Row count: ${result2[0].count}`);
    
    // Test the actual query
    const whereClause = 'WHERE 1=1';
    const queryParams = [];
    
    const currentDate = new Date();
    const reportYear = currentDate.getFullYear();
    const reportMonth = currentDate.getMonth() + 1;
    
    const query = `
      SELECT 
        d.dealer_code,
        d.dealer_name,
        t.territory_name,
        COALESCE(d.lower_limit, 0) as lower_limit,
        COALESCE(d.upper_limit, 0) as upper_limit,
        COALESCE(ovr.lower_limit_overdue, 0) as lower_limit_overdue,
        COALESCE(ovr.upper_limit_overdue, 0) as upper_limit_overdue,
        ovr.year,
        ovr.month,
        ovr.\`current_date\` as report_date,
        ovr.days_into_month,
        COALESCE(fc.target_amount, abp.target_amount, 0) as target_amount,
        COALESCE(ach.achievement_amount, 0) as achievement_amount
      FROM overdue_report ovr
      INNER JOIN dealers d ON BINARY d.dealer_code = BINARY ovr.dealer_code
      LEFT JOIN territories t ON d.territory_id = t.id
      LEFT JOIN abp_targets abp ON BINARY d.dealer_code = BINARY abp.dealer_code
        AND abp.year = ? AND abp.month = ?
      LEFT JOIN forecast_targets fc ON BINARY d.dealer_code = BINARY fc.dealer_code
        AND fc.year = ? AND fc.month = ?
      LEFT JOIN achievements ach ON BINARY d.dealer_code = BINARY ach.dealer_code
        AND ach.year = ? AND ach.month = ?
      ${whereClause}
      ORDER BY 
        ovr.\`current_date\` DESC,
        CASE 
          WHEN COALESCE(ovr.lower_limit_overdue, 0) > 0 THEN 0
          ELSE 1
        END,
        d.dealer_name ASC
      LIMIT 5
    `;
    
    const params = [
      reportYear, reportMonth,
      reportYear, reportMonth,
      reportYear, reportMonth,
      ...queryParams
    ];
    
    console.log('\n🔍 Testing query...');
    db.query(query, params, (err3, result3) => {
      if (err3) {
        console.error('❌ Query error:', err3.message);
        console.error('Error code:', err3.code);
        console.error('SQL State:', err3.sqlState);
        console.error('\nQuery:', query);
        console.error('\nParams:', params);
        process.exit(1);
      }
      
      console.log(`✅ Query successful! Returned ${result3.length} rows`);
      if (result3.length > 0) {
        console.log('\nSample row:');
        console.log(JSON.stringify(result3[0], null, 2));
      } else {
        console.log('\n⚠️  No data returned (table is empty or no matching records)');
      }
      
      process.exit(0);
    });
  });
});
