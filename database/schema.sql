-- CBL Dealer Report Database Schema
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


