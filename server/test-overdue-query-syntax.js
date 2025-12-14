const db = require('./db');

// Test the query syntax
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
    AND abp.year = 2025 AND abp.month = 12
  LEFT JOIN forecast_targets fc ON BINARY d.dealer_code = BINARY fc.dealer_code 
    AND fc.year = 2025 AND fc.month = 12
  LEFT JOIN achievements ach ON BINARY d.dealer_code = BINARY ach.dealer_code 
    AND ach.year = 2025 AND ach.month = 12
  WHERE ovr.id IN (
    SELECT ovr2.id
    FROM overdue_report ovr2
    WHERE BINARY ovr2.dealer_code = BINARY ovr.dealer_code
    ORDER BY ovr2.\`current_date\` DESC, ovr2.id DESC
    LIMIT 1
  )
  ORDER BY 
    CASE 
      WHEN COALESCE(ovr.lower_limit_overdue, 0) > 0 THEN 0
      ELSE 1
    END,
    d.dealer_name ASC
  LIMIT 5
`;

console.log('Testing query syntax...');
db.query(query, [], (err, results) => {
  if (err) {
    console.error('❌ Query Error:', err.message);
    console.error('Error code:', err.code);
    console.error('SQL State:', err.sqlState);
    process.exit(1);
  } else {
    console.log('✅ Query executed successfully!');
    console.log(`📊 Found ${results.length} records`);
    if (results.length > 0) {
      console.log('Sample record:', JSON.stringify(results[0], null, 2));
    }
    process.exit(0);
  }
});

