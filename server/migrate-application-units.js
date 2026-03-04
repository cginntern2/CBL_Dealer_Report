const db = require('./db');
require('dotenv').config();

console.log('Starting migration to add application_unit support...\n');

// Function to check if column exists
const columnExists = (tableName, columnName, callback) => {
  db.query(
    `SELECT COLUMN_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = ? 
     AND COLUMN_NAME = ?`,
    [tableName, columnName],
    (err, results) => {
      if (err) {
        console.error(`Error checking column ${columnName} in ${tableName}:`, err);
        return callback(false);
      }
      callback(results.length > 0);
    }
  );
};

// Function to rename column if it exists, or add it if it doesn't
const migrateColumn = (tableName, oldColumnName, newColumnName, callback) => {
  columnExists(tableName, oldColumnName, (oldExists) => {
    columnExists(tableName, newColumnName, (newExists) => {
      if (newExists) {
        console.log(`✓ ${tableName}.${newColumnName} already exists, skipping...`);
        return callback();
      }
      
      if (oldExists) {
        // Rename the column
        console.log(`Renaming ${tableName}.${oldColumnName} to ${newColumnName}...`);
        db.query(
          `ALTER TABLE ${tableName} CHANGE COLUMN ${oldColumnName} ${newColumnName} VARCHAR(255) NOT NULL`,
          (err) => {
            if (err) {
              console.error(`Error renaming column in ${tableName}:`, err);
              return callback(err);
            }
            console.log(`✓ Renamed ${tableName}.${oldColumnName} to ${newColumnName}`);
            callback();
          }
        );
      } else {
        // Add new column
        console.log(`Adding ${newColumnName} column to ${tableName}...`);
        db.query(
          `ALTER TABLE ${tableName} ADD COLUMN ${newColumnName} VARCHAR(255) NOT NULL DEFAULT '' AFTER month`,
          (err) => {
            if (err) {
              console.error(`Error adding column to ${tableName}:`, err);
              return callback(err);
            }
            console.log(`✓ Added ${newColumnName} column to ${tableName}`);
            callback();
          }
        );
      }
    });
  });
};

// Create forecast_target_items table if it doesn't exist
const createForecastItemsTable = (callback) => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS forecast_target_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      application_unit VARCHAR(255) NOT NULL,
      qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
      amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
      UNIQUE KEY unique_forecast_item (dealer_code, year, month, application_unit),
      INDEX idx_forecast_item_dealer_month (dealer_code, year, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating forecast_target_items table:', err);
      return callback(err);
    }
    console.log('✓ forecast_target_items table ready');
    callback();
  });
};

// Create achievement_items table if it doesn't exist
const createAchievementItemsTable = (callback) => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS achievement_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dealer_code VARCHAR(50) NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL CHECK (month >= 1 AND month <= 12),
      application_unit VARCHAR(255) NOT NULL,
      qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
      amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
      UNIQUE KEY unique_achievement_item (dealer_code, year, month, application_unit),
      INDEX idx_achievement_item_dealer_month (dealer_code, year, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating achievement_items table:', err);
      return callback(err);
    }
    console.log('✓ achievement_items table ready');
    callback();
  });
};

// Main migration
const runMigration = () => {
  console.log('Step 1: Migrating abp_target_items table...');
  migrateColumn('abp_target_items', 'application_name', 'application_unit', (err) => {
    if (err) {
      console.error('Migration failed at abp_target_items');
      process.exit(1);
    }
    
    console.log('\nStep 2: Creating/updating forecast_target_items table...');
    createForecastItemsTable((err) => {
      if (err) {
        console.error('Migration failed at forecast_target_items');
        process.exit(1);
      }
      
      console.log('\nStep 3: Creating/updating achievement_items table...');
      createAchievementItemsTable((err) => {
        if (err) {
          console.error('Migration failed at achievement_items');
          process.exit(1);
        }
        
        console.log('\n✓ Migration completed successfully!');
        console.log('\nAll tables now use "application_unit" column.');
        process.exit(0);
      });
    });
  });
};

// Run migration
runMigration();

