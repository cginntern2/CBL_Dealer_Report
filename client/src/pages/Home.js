import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle, Database, TrendingUp } from 'lucide-react';
import './Home.css';

const Home = () => {
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [apiStatus, setApiStatus] = useState('checking');
  const [dbStatus, setDbStatus] = useState('checking');

  useEffect(() => {
    // Fetch welcome message from API
    axios.get('/api/welcome')
      .then(response => {
        setWelcomeMessage(response.data.message);
      })
      .catch(error => {
        console.error('Error fetching welcome message:', error);
        setWelcomeMessage('Welcome to CBL Dealer Report System');
      });

    // Check API health
    axios.get('/api/health')
      .then(response => {
        setApiStatus('connected');
        setDbStatus(response.data.database === 'connected' ? 'connected' : 'disconnected');
      })
      .catch(error => {
        console.error('Error checking API health:', error);
        setApiStatus('disconnected');
        setDbStatus('unknown');
      });
  }, []);

  return (
    <div className="home-page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="welcome-section">
        <div className="welcome-card">
          <h2 className="welcome-title">{welcomeMessage || 'Welcome to CBL Dealer Report System'}</h2>
          <p className="welcome-subtitle">
            Manage and track your dealer reports, achievements, and analytics from one central location.
          </p>
        </div>
      </div>

      <div className="modules-section">
        <h2 className="section-title">Available Modules</h2>
        <div className="modules-grid">
          <div className="module-card">
            <TrendingUp className="module-icon" size={32} />
            <h3 className="module-title">Target vs Achievement Report</h3>
            <p className="module-description">
              Track and compare target performance against actual achievements.
            </p>
          </div>

          <div className="module-card">
            <TrendingUp className="module-icon" size={32} />
            <h3 className="module-title">Overdue Report</h3>
            <p className="module-description">
              Monitor and manage overdue payments and pending transactions.
            </p>
          </div>

          <div className="module-card">
            <TrendingUp className="module-icon" size={32} />
            <h3 className="module-title">Credit Days</h3>
            <p className="module-description">
              View and manage credit day allocations for dealers.
            </p>
          </div>

          <div className="module-card">
            <TrendingUp className="module-icon" size={32} />
            <h3 className="module-title">Delinquent Dealers</h3>
            <p className="module-description">
              Identify and track dealers with outstanding issues or concerns.
            </p>
          </div>
        </div>
      </div>

      <div className="status-section">
        <h2 className="section-title">System Status</h2>
        <div className="status-grid">
          <div className={`status-card ${apiStatus === 'connected' ? 'success' : 'error'}`}>
            <CheckCircle className="status-icon" size={24} />
            <div className="status-content">
              <h3 className="status-title">Backend Connected</h3>
              <p className="status-description">
                {apiStatus === 'connected' 
                  ? 'API server is responding correctly' 
                  : 'API server connection failed'}
              </p>
            </div>
          </div>

          <div className={`status-card ${dbStatus === 'connected' ? 'success' : 'error'}`}>
            <Database className="status-icon" size={24} />
            <div className="status-content">
              <h3 className="status-title">Database Connected</h3>
              <p className="status-description">
                {dbStatus === 'connected' 
                  ? 'MySQL database connection is active' 
                  : dbStatus === 'checking' 
                    ? 'Checking database connection...'
                    : 'Database connection failed'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;


