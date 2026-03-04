import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Users,
  Target, 
  Clock, 
  CreditCard, 
  AlertCircle,
  Calendar,
  ChevronLeft 
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/dealers', label: 'Dealer Management', icon: Users },
    { path: '/target-vs-achievement', label: 'Target vs Achievement Report', icon: Target },
    { path: '/overdue', label: 'Overdue Report', icon: Clock },
    { path: '/credit-days', label: 'Credit Days', icon: CreditCard },
    { path: '/delinquent-dealers', label: 'Delinquent Dealers', icon: AlertCircle },
    { path: '/billing-cycles', label: 'Billing Cycles', icon: Calendar },
  ];

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">CBL Dealer Report</h2>
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon className="nav-icon" size={20} />
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button 
          className="collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={isCollapsed ? 'rotated' : ''} size={20} />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;


