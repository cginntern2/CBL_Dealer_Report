const db = require('./db');

const createBillingCyclesTable = () => {
  // First check the charset of dealers table
  const checkCharsetQuery = `
    SELECT TABLE_COLLATION 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() AND table_name = 'dealers'
  `;
  
  db.query(checkCharsetQuery, (err, results) => {
    if (err) {
      console.error('Error checking dealers table charset:', err);
      process.exit(1);
    }
    
    const collation = results.length > 0 ? results[0].TABLE_COLLATION : 'utf8mb4_0900_ai_ci';
    console.log('Dealers table collation:', collation);
    
    // Create table without foreign key first, then add it
    const query = `
      CREATE TABLE IF NOT EXISTS dealer_billing_cycles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dealer_code VARCHAR(50) NOT NULL,
        cycle_start_day INT NOT NULL,
        notes VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_dealer_cycle (dealer_code),
        INDEX idx_cycle_start_day (cycle_start_day)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=${collation};
    `;
    
    runQuery(query);
  });
  
  function runQuery(query) {
    db.query(query, (err, result) => {
      if (err) {
        console.error('Error creating dealer_billing_cycles table:', err);
        process.exit(1);
      } else {
        console.log('✅ dealer_billing_cycles table created successfully!');
        console.log('This table stores billing cycle exceptions for dealers with non-standard cycles (e.g., 26th-25th instead of 1st-31st)');
        process.exit(0);
      }
    });
  }
};

createBillingCyclesTable();

