const db = require('./db');

const createCreditDaysTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS credit_days_report (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      credit_days DECIMAL(10, 2) DEFAULT 0,
      \`report_date\` DATE NOT NULL COMMENT 'Printing Date from PDF (To Date)',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dealer_month (dealer_code, year, month),
      INDEX idx_report_date (\`report_date\`),
      UNIQUE KEY unique_credit_days (dealer_code, year, month, \`report_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error('Error creating credit_days_report table:', err);
      process.exit(1);
    } else {
      console.log('✅ credit_days_report table created successfully!');
      process.exit(0);
    }
  });
};

createCreditDaysTable();

