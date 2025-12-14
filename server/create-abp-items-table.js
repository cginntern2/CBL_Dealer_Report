const db = require('./db');

console.log('Creating abp_target_items table...');

const createTableQuery = `
CREATE TABLE IF NOT EXISTS abp_target_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    application_name VARCHAR(255) NOT NULL,
    qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_abp_item (dealer_code, year, month, application_name),
    INDEX idx_abp_item_dealer_month (dealer_code, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

db.query(createTableQuery, (err) => {
  if (err) {
    console.error('Error creating abp_target_items table:', err.message);
    process.exit(1);
  } else {
    console.log('✓ abp_target_items table created successfully');
    console.log('\nDone! Table is ready.');
    process.exit(0);
  }
});

