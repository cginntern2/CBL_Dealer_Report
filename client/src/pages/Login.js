import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, AlertCircle, User, Lock } from 'lucide-react';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-container">
            <img 
              src={process.env.PUBLIC_URL + '/cbl-logo.png'} 
              alt="CBL Logo" 
              className="company-logo"
              onError={(e) => {
                console.error('Logo failed to load from:', e.target.src);
                e.target.src = '/cbl-logo.png';
              }}
            />
          </div>
          <h1 className="welcome-text">Welcome</h1>
          <p className="welcome-subtitle">Sign in to access your dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <div className="input-wrapper">
              <User className="input-icon" size={18} />
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                spellCheck="false"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                spellCheck="false"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
            <a href="#" className="forgot-password" onClick={(e) => e.preventDefault()}>
              Forgot Password?
            </a>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? (
              'Signing in...'
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p className="copyright">© 2025 CBL. All rights reserved.</p>
          <p className="default-credentials">Default Admin: admin / admin123</p>
        </div>
      </div>
    </div>
  );
};

export default Login;

