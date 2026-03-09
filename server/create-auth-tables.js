const db = require('./db');

console.log('Creating authentication and authorization tables...');

// Create roles table
const createRolesTable = `
  CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    permissions JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

// Create users table
const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role_id INT NOT NULL,
    dealer_code VARCHAR(50) NULL COMMENT 'Only for Dealers role - links to dealers table',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role_id),
    INDEX idx_dealer_code (dealer_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

db.query(createRolesTable, (err) => {
  if (err) {
    console.error('Error creating roles table:', err);
    process.exit(1);
  }
  console.log('✅ Roles table created');
  
  db.query(createUsersTable, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
      process.exit(1);
    }
    console.log('✅ Users table created');
    
    // Insert default roles
    const insertRoles = `
      INSERT INTO roles (name, description, permissions) VALUES
      ('admin', 'Administrator - Full system access', 
        '{"all": true, "system_changes": true, "database_code": true, "ui_design": true}'),
      ('sales_official', 'Sales Official - All privileges except system changes', 
        '{"all": true, "system_changes": false, "database_code": false, "ui_design": false}'),
      ('sales_manager', 'Sales Manager - Upload data, edit cycles, view reports', 
        '{"upload_sales": true, "upload_collections": true, "edit_cycles": true, "edit_frontend": true, "view_reports": true}'),
      ('dealer', 'Dealer - View own reports only', 
        '{"view_own_reports": true, "download_own_reports": true}')
      ON DUPLICATE KEY UPDATE 
        description = VALUES(description),
        permissions = VALUES(permissions)
    `;
    
    db.query(insertRoles, (err) => {
      if (err) {
        console.error('Error inserting roles:', err);
        process.exit(1);
      }
      console.log('✅ Default roles inserted');
      console.log('\nRoles created:');
      console.log('  1. admin - Full system access');
      console.log('  2. sales_official - All except system changes');
      console.log('  3. sales_manager - Upload data, edit cycles');
      console.log('  4. dealer - View own reports only');
      console.log('\n✅ Authentication tables setup complete!');
      process.exit(0);
    });
  });
});

