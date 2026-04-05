-- CBL Sales Report Database Schema
-- Create this database in MySQL Workbench

CREATE DATABASE IF NOT EXISTS cbl_dealer_report;
USE cbl_dealer_report;

-- Territories Table
CREATE TABLE IF NOT EXISTS territories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    territory_code VARCHAR(50),
    territory_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Dealers Table
CREATE TABLE IF NOT EXISTS dealers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_name VARCHAR(255) NOT NULL,
    dealer_code VARCHAR(50) UNIQUE NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    territory_id INT,
    credit_days INT DEFAULT 30,
    status ENUM('active', 'inactive', 'delinquent') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE SET NULL
);

-- Delinquent Dealers Table
CREATE TABLE IF NOT EXISTS delinquent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    last_order_date DATE NOT NULL,
    months_inactive INT NOT NULL,
    category VARCHAR(20) NOT NULL COMMENT '1-4 months inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_dealer_delinquent (dealer_code)
);

-- ABP Targets Table (Annual Business Plan - Yearly target broken down monthly)
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
);

-- Forecast Targets Table (Monthly target - can override ABP)
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
);

-- Achievements Table (Actual sales from software)
CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    achievement_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    achievement_quantity DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_achievement (dealer_code, year, month)
);

-- ABP Target Items (per application)
CREATE TABLE IF NOT EXISTS abp_target_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    application_name VARCHAR(255) NOT NULL,
    qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_abp_item (dealer_code, year, month, application_name),
    INDEX idx_abp_item_dealer_month (dealer_code, year, month)
);

-- Add upper and lower limits to dealers table
-- Note: Run add-dealer-limits-columns.js script instead, or manually add:
-- ALTER TABLE dealers ADD COLUMN lower_limit DECIMAL(15, 2) DEFAULT 0;
-- ALTER TABLE dealers ADD COLUMN upper_limit DECIMAL(15, 2) DEFAULT 0;

-- Overdue Report Table (tracks overdue amounts)
CREATE TABLE IF NOT EXISTS overdue_report (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    lower_limit DECIMAL(15, 2) DEFAULT 0,
    upper_limit DECIMAL(15, 2) DEFAULT 0,
    target_amount DECIMAL(15, 2) DEFAULT 0,
    achievement_amount DECIMAL(15, 2) DEFAULT 0,
    lower_limit_overdue DECIMAL(15, 2) DEFAULT 0 COMMENT 'Carried from previous month if lower limit not met',
    upper_limit_overdue DECIMAL(15, 2) DEFAULT 0 COMMENT 'Excess above upper limit in current month',
    current_date DATE NOT NULL COMMENT 'Date of calculation',
    days_into_month INT NOT NULL COMMENT 'Day of month (1-31)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    INDEX idx_dealer_month (dealer_code, year, month),
    INDEX idx_date (current_date)
);

-- ABP vs Achievement Comparison Table
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_abp_vs_ach (dealer_code, year, month),
    INDEX idx_abp_vs_ach_dealer_month (dealer_code, year, month),
    INDEX idx_abp_vs_ach_year_month (year, month)
);

-- Forecast vs Achievement Comparison Table
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_fc_vs_ach (dealer_code, year, month),
    INDEX idx_fc_vs_ach_dealer_month (dealer_code, year, month),
    INDEX idx_fc_vs_ach_year_month (year, month)
);

-- Credit Days Report Table (stores credit days data from PDF uploads)
CREATE TABLE IF NOT EXISTS credit_days_report (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_code VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    credit_days INT NOT NULL DEFAULT 0,
    report_date DATE NOT NULL COMMENT 'Date from PDF (Printing Date)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_code) REFERENCES dealers(dealer_code) ON DELETE CASCADE,
    UNIQUE KEY unique_credit_days (dealer_code, year, month, report_date),
    INDEX idx_dealer_month_date (dealer_code, year, month, report_date),
    INDEX idx_report_date (report_date)
);


