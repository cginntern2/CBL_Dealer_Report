const db = require('./db');
require('dotenv').config();

const createTables = () => {
  // Create ABP Targets Table
  const createABPTable = `
    CREATE TABLE IF NOT EXISTS abp_targets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      target_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
      UNIQUE KEY unique_abp_target (dealer_code, year, month)
    )
  `;

  // Create Forecast Targets Table
  const createForecastTable = `
    CREATE TABLE IF NOT EXISTS forecast_targets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      target_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
      UNIQUE KEY unique_forecast_target (dealer_code, year, month)
    )
  `;

  // Create Achievements Table
  const createAchievementsTable = `
    CREATE TABLE IF NOT EXISTS achievements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      achievement_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
      UNIQUE KEY unique_achievement (dealer_code, year, month)
    )
  `;

  db.query(createABPTable, (err) => {
    if (err) {
      console.error('Error creating ABP targets table:', err);
      return;
    }
    console.log('✅ ABP targets table created/verified');
  });

  db.query(createForecastTable, (err) => {
    if (err) {
      console.error('Error creating Forecast targets table:', err);
      return;
    }
    console.log('✅ Forecast targets table created/verified');
  });

  db.query(createAchievementsTable, (err) => {
    if (err) {
      console.error('Error creating Achievements table:', err);
      return;
    }
    console.log('✅ Achievements table created/verified');
    console.log('\n🎉 All target vs achievement tables are ready!');
    process.exit(0);
  });
};

createTables();



