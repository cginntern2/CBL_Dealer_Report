import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  Users,
  Target, 
  Clock, 
  CreditCard, 
  AlertCircle,
  Calendar,
  Menu,
  X,
  LogOut,
  User,
  Settings,
  ChevronDown
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const manageMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasRole, isDealer } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close manage dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(event.target)) {
        setIsManageOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to log out?')) {
      logout();
      navigate('/login');
    }
  };

  // Manage submenu items
  const manageSubmenuItems = [
    { path: '/manage/dealers', label: 'Manage Dealers', icon: Users, roles: ['admin', 'sales_manager'] },
    { path: '/manage/users', label: 'Manage Users', icon: User, roles: ['admin'] },
    { path: '/manage/cycles', label: 'Manage Cycles', icon: Calendar, roles: ['admin', 'sales_manager'] },
  ];

  const visibleManageItems = manageSubmenuItems.filter(item => 
    item.roles.some(role => hasRole(role))
  );

  const hasManageAccess = visibleManageItems.length > 0;

  // Filter menu items based on user role
  const allMenuItems = [
    { path: '/', label: 'Dashboard', icon: Home, roles: ['admin', 'sales_official', 'sales_manager', 'dealer'] },
    { path: '/target-vs-achievement', label: 'Target vs Achievement', icon: Target, roles: ['admin', 'sales_official', 'sales_manager', 'dealer'] },
    { path: '/overdue', label: 'Overdue', icon: Clock, roles: ['admin', 'sales_official', 'sales_manager', 'dealer'] },
    { path: '/credit-days', label: 'Credit Days', icon: CreditCard, roles: ['admin', 'sales_official', 'sales_manager'] },
    { path: '/delinquent-dealers', label: 'Delinquent', icon: AlertCircle, roles: ['admin', 'sales_official', 'sales_manager'] },
  ];

  const menuItems = allMenuItems.filter(item => 
    item.roles.some(role => hasRole(role))
  );

  return (
    <header className={`topbar ${isScrolled ? 'scrolled' : ''}`}>
      <div className="topbar-container">
        <Link to="/" className="topbar-brand">
          <div className="brand-icon">CBL</div>
          <span className="brand-text">Sales Report</span>
        </Link>
        
        <nav className={`topbar-nav ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" size={16} />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
          
          {/* Manage Dropdown */}
          {hasManageAccess && (
            <div className="nav-dropdown" ref={manageMenuRef}>
              <button
                className={`nav-item dropdown-toggle ${visibleManageItems.some(item => location.pathname === item.path) ? 'active' : ''}`}
                onClick={() => setIsManageOpen(!isManageOpen)}
              >
                <Settings className="nav-icon" size={16} />
                <span className="nav-label">Manage</span>
                <ChevronDown 
                  className={`dropdown-arrow ${isManageOpen ? 'open' : ''}`} 
                  size={14} 
                />
              </button>
              {isManageOpen && (
                <div className="dropdown-menu">
                  {visibleManageItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`dropdown-item ${isActive ? 'active' : ''}`}
                        onClick={() => setIsManageOpen(false)}
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="topbar-user">
          <div className="user-info">
            <User size={18} />
            <span className="user-name">{user?.full_name || user?.username}</span>
            <span className="user-role">({user?.role})</span>
          </div>
          <button 
            className="logout-btn"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>

        <button 
          className="mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </header>
  );
};

export default Sidebar;
