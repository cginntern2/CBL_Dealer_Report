-- Add Delinquent Table to existing database
-- Run this in MySQL Workbench after the dealers table is created

USE cbl_dealer_report;

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

