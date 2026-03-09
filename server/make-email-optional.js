const db = require('./db');

console.log('Making email column optional in users table...');

// First, remove the UNIQUE constraint on email (if it exists)
const removeUniqueConstraint = `
  ALTER TABLE users 
  DROP INDEX email
`;

// Then modify the column to allow NULL
const modifyEmailColumn = `
  ALTER TABLE users 
  MODIFY COLUMN email VARCHAR(255) NULL
`;

// Then add back UNIQUE constraint but allow NULL (MySQL allows multiple NULLs with UNIQUE)
const addUniqueConstraint = `
  ALTER TABLE users 
  ADD UNIQUE KEY unique_email (email)
`;

db.query(removeUniqueConstraint, (err) => {
  if (err && !err.message.includes("Can't DROP")) {
    console.log('Note: Email unique constraint may not exist or already removed');
  }
  
  db.query(modifyEmailColumn, (err) => {
    if (err) {
      console.error('Error modifying email column:', err);
      process.exit(1);
    }
    console.log('✅ Email column modified to allow NULL');
    
    db.query(addUniqueConstraint, (err) => {
      if (err) {
        console.error('Error adding unique constraint:', err);
        process.exit(1);
      }
      console.log('✅ Unique constraint on email re-added (allows NULL values)');
      console.log('\n✅ Email field is now optional!');
      process.exit(0);
    });
  });
});

