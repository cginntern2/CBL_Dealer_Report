import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import DealerManagement from './pages/DealerManagement';
import DelinquentDealers from './pages/DelinquentDealers';
import TargetVsAchievement from './pages/TargetVsAchievement';
import OverdueReport from './pages/OverdueReport';
import CreditDays from './pages/CreditDays';
import BillingCycles from './pages/BillingCycles';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dealers" element={<DealerManagement />} />
            <Route path="/target-vs-achievement" element={<TargetVsAchievement />} />
            <Route path="/overdue" element={<OverdueReport />} />
            <Route path="/credit-days" element={<CreditDays />} />
            <Route path="/delinquent-dealers" element={<DelinquentDealers />} />
            <Route path="/billing-cycles" element={<BillingCycles />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;


