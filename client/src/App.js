import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import DealerManagement from './pages/DealerManagement';
import DelinquentDealers from './pages/DelinquentDealers';
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
            <Route path="/target-vs-achievement" element={<div className="page-content"><h1>Target vs Achievement Report</h1><p>Module coming soon...</p></div>} />
            <Route path="/overdue" element={<div className="page-content"><h1>Overdue Report</h1><p>Module coming soon...</p></div>} />
            <Route path="/credit-days" element={<div className="page-content"><h1>Credit Days</h1><p>Module coming soon...</p></div>} />
            <Route path="/delinquent-dealers" element={<DelinquentDealers />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;


