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
        message: 'CBL Sales Report API is running',
        database: 'disconnected',
        error: err.message
      });
    } else {
      res.json({ 
        status: 'success', 
        message: 'CBL Sales Report API is running',
        database: 'connected'
      });
    }
  });
});

// Authentication routes (public)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// User management routes (protected)
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

// Home/Welcome route
app.get('/api/welcome', (req, res) => {
  res.json({ 
    message: 'Welcome to CBL Sales Report',
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

// Target vs Achievement routes
const targetRoutes = require('./routes/targets');
app.use('/api/targets', targetRoutes);

// Overdue report routes
const overdueRoutes = require('./routes/overdue');
app.use('/api/overdue', overdueRoutes);

// Credit days routes
const creditDaysRoutes = require('./routes/credit-days');
app.use('/api/credit-days', creditDaysRoutes);

// Billing cycles routes
const billingCyclesRoutes = require('./routes/billing-cycles');
app.use('/api/billing-cycles', billingCyclesRoutes);

// Dashboard statistics endpoint
app.get('/api/dashboard/stats', (req, res) => {
  const stats = {};
  let completedQueries = 0;
  const totalQueries = 5;
  let responseSent = false;

  const sendResponse = () => {
    if (!responseSent && completedQueries === totalQueries) {
      responseSent = true;
      res.json(stats);
    }
  };

  // 1. Total dealers count
  db.query('SELECT COUNT(*) as total FROM dealers', (err, results) => {
    if (!err && results.length > 0) {
      stats.totalDealers = results[0].total;
    } else {
      stats.totalDealers = 0;
    }
    completedQueries++;
    sendResponse();
  });

  // 2. Active dealers count
  db.query('SELECT COUNT(*) as total FROM dealers WHERE status = "active"', (err, results) => {
    if (!err && results.length > 0) {
      stats.activeDealers = results[0].total;
    } else {
      stats.activeDealers = 0;
    }
    completedQueries++;
    sendResponse();
  });

  // 3. Total achievements (current month)
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  db.query(
    `SELECT 
      COALESCE(SUM(achievement_amount), 0) as total_amount,
      COALESCE(SUM(achievement_quantity), 0) as total_quantity,
      COUNT(DISTINCT dealer_code) as dealer_count
    FROM achievements 
    WHERE year = ? AND month = ?`,
    [currentYear, currentMonth],
    (err, results) => {
      if (!err && results.length > 0) {
        stats.currentMonthAchievements = {
          amount: results[0].total_amount || 0,
          quantity: results[0].total_quantity || 0,
          dealers: results[0].dealer_count || 0
        };
      } else {
        stats.currentMonthAchievements = { amount: 0, quantity: 0, dealers: 0 };
      }
      completedQueries++;
      sendResponse();
    }
  );

  // 4. Total overdue amount
  db.query(
    `SELECT 
      COALESCE(SUM(lower_overdue_amount), 0) as lower_total,
      COALESCE(SUM(upper_overdue_amount), 0) as upper_total,
      COUNT(DISTINCT dealer_code) as dealer_count
    FROM overdue_report`,
    (err, results) => {
      if (!err && results.length > 0) {
        stats.overdue = {
          lowerTotal: results[0].lower_total || 0,
          upperTotal: results[0].upper_total || 0,
          dealers: results[0].dealer_count || 0
        };
      } else {
        stats.overdue = { lowerTotal: 0, upperTotal: 0, dealers: 0 };
      }
      completedQueries++;
      sendResponse();
    }
  );

  // 5. Delinquent dealers count
  db.query('SELECT COUNT(*) as total FROM dealers WHERE status = "delinquent"', (err, results) => {
    if (!err && results.length > 0) {
      stats.delinquentDealers = results[0].total;
    } else {
      stats.delinquentDealers = 0;
    }
    completedQueries++;
    sendResponse();
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


