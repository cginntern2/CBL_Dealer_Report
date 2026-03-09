import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Home from './pages/Home';
import DealerManagement from './pages/DealerManagement';
import DelinquentDealers from './pages/DelinquentDealers';
import TargetVsAchievement from './pages/TargetVsAchievement';
import OverdueReport from './pages/OverdueReport';
import CreditDays from './pages/CreditDays';
import BillingCycles from './pages/BillingCycles';
import UserManagement from './pages/UserManagement';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

// Main app layout (only shown when authenticated)
const AppLayout = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route 
            path="/dealers" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_official', 'sales_manager']}>
                <DealerManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/target-vs-achievement" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_official', 'sales_manager', 'dealer']}>
                <TargetVsAchievement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/overdue" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_official', 'sales_manager', 'dealer']}>
                <OverdueReport />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/credit-days" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_official', 'sales_manager']}>
                <CreditDays />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/delinquent-dealers" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_official', 'sales_manager']}>
                <DelinquentDealers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/billing-cycles" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_official', 'sales_manager']}>
                <BillingCycles />
              </ProtectedRoute>
            } 
          />
          {/* Manage Routes */}
          <Route 
            path="/manage/dealers" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_manager']}>
                <DealerManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/manage/users" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <UserManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/manage/cycles" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'sales_manager']}>
                <BillingCycles />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;


