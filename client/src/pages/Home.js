import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  BarChart3,
  CreditCard,
  UserX,
  Users,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to CBL Dealer Report System');

  const fetchWelcome = () => {
    axios.get('/api/welcome')
      .then(response => {
        setWelcomeMessage(response.data.message);
      })
      .catch(error => {
        console.error('Error fetching welcome message:', error);
        setWelcomeMessage('Welcome to CBL Dealer Report System');
      });
  };

  useEffect(() => {
    // Fetch welcome message from API
    fetchWelcome();
  }, []);

  const handleModuleClick = (path) => {
    navigate(path);
  };

  return (
    <div className="home-page">
      <div className="welcome-section">
        <div className="welcome-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <h2 className="welcome-title">{welcomeMessage}</h2>
              <p className="welcome-subtitle">
                Manage and track your dealer reports, achievements, and analytics from one central location.
              </p>
            </div>
            <button className="refresh-btn" onClick={fetchWelcome}>
              <RefreshCw size={18} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="modules-section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="modules-grid">
          <div 
            className="module-card clickable"
            onClick={() => handleModuleClick('/target-vs-achievement')}
          >
            <BarChart3 className="module-icon" size={32} />
            <h3 className="module-title">Target vs Achievement</h3>
            <p className="module-description">
              Track and compare target performance against actual achievements.
            </p>
            <div className="module-footer">
              <span className="module-link">View Report →</span>
            </div>
          </div>

          <div 
            className="module-card clickable"
            onClick={() => handleModuleClick('/overdue')}
          >
            <AlertCircle className="module-icon" size={32} />
            <h3 className="module-title">Overdue Report</h3>
            <p className="module-description">
              Monitor and manage overdue payments and pending transactions.
            </p>
            <div className="module-footer">
              <span className="module-link">View Report →</span>
            </div>
          </div>

          <div 
            className="module-card clickable"
            onClick={() => handleModuleClick('/credit-days')}
          >
            <CreditCard className="module-icon" size={32} />
            <h3 className="module-title">Credit Days</h3>
            <p className="module-description">
              View and manage credit day allocations for dealers.
            </p>
            <div className="module-footer">
              <span className="module-link">View Report →</span>
            </div>
          </div>

          <div 
            className="module-card clickable"
            onClick={() => handleModuleClick('/delinquent-dealers')}
          >
            <UserX className="module-icon" size={32} />
            <h3 className="module-title">Delinquent Dealers</h3>
            <p className="module-description">
              Identify and track dealers with outstanding issues or concerns.
            </p>
            <div className="module-footer">
              <span className="module-link">View Report →</span>
            </div>
          </div>

          <div 
            className="module-card clickable"
            onClick={() => handleModuleClick('/dealers')}
          >
            <Users className="module-icon" size={32} />
            <h3 className="module-title">Dealer Management</h3>
            <p className="module-description">
              Manage dealer information, add new dealers, and update existing records.
            </p>
            <div className="module-footer">
              <span className="module-link">Manage Dealers →</span>
            </div>
          </div>
        </div>
      </div>

      {/* Version Footer */}
      <div className="version-footer">
        <p>Version 1.0</p>
      </div>
    </div>
  );
};

export default Home;


