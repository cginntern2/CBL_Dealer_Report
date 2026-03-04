const db = require('./db');

console.log('Creating daily_sales and daily_collections tables...');

// Create daily_sales table
const createDailySalesTable = `
  CREATE TABLE IF NOT EXISTS daily_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    sales_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    sales_quantity DECIMAL(15, 2) DEFAULT 0,
    application_unit VARCHAR(255),
    invoice_number VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    INDEX idx_dealer_date (dealer_code, transaction_date),
    INDEX idx_date (transaction_date),
    INDEX idx_dealer_date_app (dealer_code, transaction_date, application_unit)
  )
`;

// Create daily_collections table
const createDailyCollectionsTable = `
  CREATE TABLE IF NOT EXISTS daily_collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    collection_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(100),
    reference_number VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    INDEX idx_dealer_date (dealer_code, transaction_date),
    INDEX idx_date (transaction_date)
  )
`;

// Create dealer_balance_history table to track closing balance day by day
const createBalanceHistoryTable = `
  CREATE TABLE IF NOT EXISTS dealer_balance_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    balance_date DATE NOT NULL,
    opening_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    sales_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    collection_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    closing_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_dealer_date (dealer_code, balance_date),
    INDEX idx_dealer_date (dealer_code, balance_date),
    INDEX idx_date (balance_date)
  )
`;

db.query(createDailySalesTable, (err) => {
  if (err) {
    console.error('Error creating daily_sales table:', err);
    process.exit(1);
  }
  console.log('✅ Created daily_sales table');
  
  db.query(createDailyCollectionsTable, (err) => {
    if (err) {
      console.error('Error creating daily_collections table:', err);
      process.exit(1);
    }
    console.log('✅ Created daily_collections table');
    
    db.query(createBalanceHistoryTable, (err) => {
      if (err) {
        console.error('Error creating dealer_balance_history table:', err);
        process.exit(1);
      }
      console.log('✅ Created dealer_balance_history table');
      console.log('\n✅ All tables created successfully!');
      process.exit(0);
    });
  });
});

