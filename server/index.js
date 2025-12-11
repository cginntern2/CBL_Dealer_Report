const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test route
app.get('/api/health', (req, res) => {
  // Test database connection
  db.query('SELECT 1', (err) => {
    if (err) {
      res.json({ 
        status: 'success', 
        message: 'CBL Dealer Report API is running',
        database: 'disconnected',
        error: err.message
      });
    } else {
      res.json({ 
        status: 'success', 
        message: 'CBL Dealer Report API is running',
        database: 'connected'
      });
    }
  });
});

// Home/Welcome route
app.get('/api/welcome', (req, res) => {
  res.json({ 
    message: 'Welcome to CBL Dealer Report System',
    modules: [
      'Target vs Achievement Report',
      'Overdue Report',
      'Credit Days',
      'Delinquent Dealers'
    ]
  });
});

// Dealer management routes
const dealerRoutes = require('./routes/dealers');
app.use('/api/dealers', dealerRoutes);

// Delinquent dealers routes
const delinquentRoutes = require('./routes/delinquent');
app.use('/api/delinquent', delinquentRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


