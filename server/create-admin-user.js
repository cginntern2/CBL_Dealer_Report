const db = require('./db');
const bcrypt = require('bcrypt');

// Create default admin user
const createAdminUser = async () => {
  const username = process.argv[2] || 'admin';
  const email = process.argv[3] || 'admin@cbl.com';
  const password = process.argv[4] || 'admin123';
  const fullName = process.argv[5] || 'Administrator';

  console.log(`Creating admin user: ${username}`);

  // Get admin role_id
  db.query('SELECT id FROM roles WHERE name = ?', ['admin'], async (err, roleResults) => {
    if (err || roleResults.length === 0) {
      console.error('Error: Admin role not found. Please run create-auth-tables.js first.');
      process.exit(1);
    }

    const role_id = roleResults[0].id;

    // Check if user already exists
    db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], async (err, userResults) => {
      if (err) {
        console.error('Error checking user:', err);
        process.exit(1);
      }

      if (userResults.length > 0) {
        console.log(`User ${username} already exists. Skipping creation.`);
        process.exit(0);
      }

      // Hash password
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);

      // Insert admin user
      const insertQuery = `
        INSERT INTO users (username, email, password_hash, full_name, role_id)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.query(insertQuery, [username, email, password_hash, fullName, role_id], (err, result) => {
        if (err) {
          console.error('Error creating admin user:', err);
          process.exit(1);
        }

        console.log('✅ Admin user created successfully!');
        console.log(`   Username: ${username}`);
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        console.log('\n⚠️  Please change the password after first login!');
        process.exit(0);
      });
    });
  });
};

createAdminUser();

