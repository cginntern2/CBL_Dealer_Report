const db = require('./db');

const createOverdueReportTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS overdue_report (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      lower_limit DECIMAL(15, 2) DEFAULT 0,
      upper_limit DECIMAL(15, 2) DEFAULT 0,
      target_amount DECIMAL(15, 2) DEFAULT 0,
      achievement_amount DECIMAL(15, 2) DEFAULT 0,
      lower_limit_overdue DECIMAL(15, 2) DEFAULT 0 COMMENT 'Carried from previous month if lower limit not met',
      upper_limit_overdue DECIMAL(15, 2) DEFAULT 0 COMMENT 'Excess above upper limit in current month',
      \`current_date\` DATE NOT NULL COMMENT 'Date of calculation',
      days_into_month INT NOT NULL COMMENT 'Day of month (1-31)',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dealer_code (dealer_code),
      INDEX idx_dealer_month (dealer_code, year, month),
      INDEX idx_date (\`current_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error('Error creating overdue_report table:', err);
      process.exit(1);
    } else {
      console.log('✅ overdue_report table created successfully!');
      process.exit(0);
    }
  });
};

createOverdueReportTable();

