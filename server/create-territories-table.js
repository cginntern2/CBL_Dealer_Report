const db = require('./db');

console.log('Creating territories table and updating dealers table...');

// Step 1: Create territories table
const createTerritoriesTable = `
CREATE TABLE IF NOT EXISTS territories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    territory_code VARCHAR(50),
    territory_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
`;

db.query(createTerritoriesTable, (err) => {
  if (err) {
    console.error('Error creating territories table:', err.message);
    db.end();
    process.exit(1);
  }
  console.log('✅ Territories table created');

  // Step 2: Check if territory_id column exists in dealers
  db.query('DESCRIBE dealers', (err, columns) => {
    if (err) {
      console.error('Error checking dealers table:', err.message);
      db.end();
      process.exit(1);
    }

    const hasTerritoryId = columns.some(col => col.Field === 'territory_id');
    const hasTerritoryColumn = columns.some(col => col.Field === 'territory');

    if (!hasTerritoryId) {
      // Step 3: Add territory_id column to dealers table
      const addTerritoryIdColumn = `
        ALTER TABLE dealers 
        ADD COLUMN territory_id INT AFTER address,
        ADD FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE SET NULL
      `;

      db.query(addTerritoryIdColumn, (err) => {
        if (err) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('✅ Territory_id column already exists');
          } else {
            console.error('Error adding territory_id column:', err.message);
            console.log('Note: You may need to drop the existing territory column first');
            db.end();
            process.exit(1);
          }
        } else {
          console.log('✅ Territory_id column added to dealers table');
        }

        // Keep the territory column for now (we'll migrate data later)
        console.log('✅ Database schema updated successfully');
        db.end();
        process.exit(0);
      });
    } else {
      console.log('✅ Territory_id column already exists in dealers table');
      console.log('✅ Database schema is up to date');
      db.end();
      process.exit(0);
    }
  });
});

