const db = require('./db');

console.log('Creating comparison tables (ABP vs Achievement and Forecast vs Achievement)...');

const createABPvsAchievementTable = `
CREATE TABLE IF NOT EXISTS abp_vs_achievement (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    dealer_name VARCHAR(255),
    territory_name VARCHAR(255),
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    abp_target_amount DECIMAL(15, 2) DEFAULT 0,
    abp_target_quantity DECIMAL(15, 2) DEFAULT 0,
    achievement_amount DECIMAL(15, 2) DEFAULT 0,
    achievement_quantity DECIMAL(15, 2) DEFAULT 0,
    amount_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT 'Achievement Amount / ABP Target Amount * 100',
    quantity_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT 'Achievement Quantity / ABP Target Quantity * 100',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_abp_vs_ach (dealer_code, year, month),
    INDEX idx_abp_vs_ach_dealer_month (dealer_code, year, month),
    INDEX idx_abp_vs_ach_year_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const createForecastVsAchievementTable = `
CREATE TABLE IF NOT EXISTS forecast_vs_achievement (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    dealer_name VARCHAR(255),
    territory_name VARCHAR(255),
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    forecast_target_amount DECIMAL(15, 2) DEFAULT 0,
    forecast_target_quantity DECIMAL(15, 2) DEFAULT 0,
    achievement_amount DECIMAL(15, 2) DEFAULT 0,
    achievement_quantity DECIMAL(15, 2) DEFAULT 0,
    amount_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT 'Achievement Amount / Forecast Target Amount * 100',
    quantity_percentage DECIMAL(10, 2) DEFAULT 0 COMMENT 'Achievement Quantity / Forecast Target Quantity * 100',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_fc_vs_ach (dealer_code, year, month),
    INDEX idx_fc_vs_ach_dealer_month (dealer_code, year, month),
    INDEX idx_fc_vs_ach_year_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

db.query(createABPvsAchievementTable, (err) => {
  if (err) {
    console.error('Error creating abp_vs_achievement table:', err.message);
    process.exit(1);
  } else {
    console.log('✓ abp_vs_achievement table created successfully');
    
    db.query(createForecastVsAchievementTable, (err2) => {
      if (err2) {
        console.error('Error creating forecast_vs_achievement table:', err2.message);
        process.exit(1);
      } else {
        console.log('✓ forecast_vs_achievement table created successfully');
        console.log('\nDone! Both tables are ready.');
        process.exit(0);
      }
    });
  }
});

