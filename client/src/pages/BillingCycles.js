import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Calendar, Plus, Trash2, Info, List, Search } from 'lucide-react';
import './BillingCycles.css';

const BillingCycles = () => {
  const [billingCycles, setBillingCycles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [cycleStartDay, setCycleStartDay] = useState('26');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch all billing cycles
  const fetchBillingCycles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/billing-cycles');
      setBillingCycles(response.data.billingCycles || []);
    } catch (error) {
      console.error('Error fetching billing cycles:', error);
      alert('Failed to fetch billing cycles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingCycles();
  }, [fetchBillingCycles]);

  // Search dealers
  const searchDealers = async (term) => {
    if (term.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const response = await axios.get('/api/billing-cycles/search-dealers', {
        params: { q: term }
      });
      setSearchResults(response.data.dealers || []);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error searching dealers:', error);
    }
  };

  // Handle search input
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    searchDealers(value);
  };

  // Select dealer from search results
  const selectDealer = (dealer) => {
    setSelectedDealer(dealer);
    setSearchTerm(`${dealer.dealer_code} - ${dealer.dealer_name}`);
    setShowSearchResults(false);
    if (dealer.has_custom_cycle && dealer.cycle_start_day) {
      setCycleStartDay(dealer.cycle_start_day.toString());
    }
  };

  // Add or update billing cycle
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedDealer) {
      alert('Please select a dealer first');
      return;
    }

    if (!cycleStartDay || parseInt(cycleStartDay) < 1 || parseInt(cycleStartDay) > 28) {
      alert('Cycle start day must be between 1 and 28');
      return;
    }

    setSaving(true);
    try {
      await axios.post('/api/billing-cycles', {
        dealer_code: selectedDealer.dealer_code,
        cycle_start_day: parseInt(cycleStartDay),
        notes: notes || null
      });
      
      // Reset form
      setSelectedDealer(null);
      setSearchTerm('');
      setCycleStartDay('26');
      setNotes('');
      
      // Refresh list
      fetchBillingCycles();
      
      alert('Billing cycle saved successfully!');
    } catch (error) {
      console.error('Error saving billing cycle:', error);
      alert(error.response?.data?.error || 'Failed to save billing cycle');
    } finally {
      setSaving(false);
    }
  };

  // Delete billing cycle
  const handleDelete = async (dealerCode, dealerName) => {
    if (!window.confirm(`Remove custom billing cycle for ${dealerName}? They will revert to standard monthly cycle (1st-30th/31st).`)) {
      return;
    }

    try {
      await axios.delete(`/api/billing-cycles/${dealerCode}`);
      fetchBillingCycles();
      alert('Billing cycle removed successfully!');
    } catch (error) {
      console.error('Error deleting billing cycle:', error);
      alert(error.response?.data?.error || 'Failed to delete billing cycle');
    }
  };

  // Format cycle display
  const formatCycle = (startDay) => {
    const endDay = startDay - 1;
    const startSuffix = getOrdinalSuffix(startDay);
    const endSuffix = getOrdinalSuffix(endDay);
    return `${startDay}${startSuffix} - ${endDay}${endSuffix}`;
  };

  const getOrdinalSuffix = (n) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  return (
    <div className="billing-cycles">
      <div className="page-header">
        <div>
          <h1>
            <Calendar className="header-icon" />
            Dealer Billing Cycles
          </h1>
          <p>Manage billing cycle exceptions for dealers with non-standard payment cycles</p>
        </div>
      </div>

      {/* Info Card */}
      <div className="info-card">
        <h3><Info size={18} /> About Billing Cycles</h3>
        <ul>
          <li><strong>Standard Cycle:</strong> Most dealers (95%+) use monthly cycle from 1st to 30th/31st</li>
          <li><strong>Exception Cycle:</strong> Some dealers have cycles like 26th to 25th</li>
          <li>Only add dealers here who do NOT follow the standard monthly cycle</li>
          <li>This affects how overdue is calculated for these dealers</li>
        </ul>
      </div>

      {/* Add Form */}
      <div className="add-form-card">
        <h3><Plus size={18} /> Add/Update Billing Cycle Exception</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }}>
              <label>Search Dealer</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Type dealer code or name..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => searchTerm.length >= 2 && setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                />
                <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              </div>
              {showSearchResults && searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((dealer) => (
                    <div
                      key={dealer.dealer_code}
                      className="search-result-item"
                      onClick={() => selectDealer(dealer)}
                    >
                      <div className="dealer-code">{dealer.dealer_code}</div>
                      <div className="dealer-name">{dealer.dealer_name} ({dealer.territory_name || 'No Territory'})</div>
                      {dealer.has_custom_cycle ? (
                        <div className="has-cycle">⚠️ Already has custom cycle: {formatCycle(dealer.cycle_start_day)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group" style={{ maxWidth: 150 }}>
              <label>Cycle Start Day</label>
              <select 
                value={cycleStartDay} 
                onChange={(e) => setCycleStartDay(e.target.value)}
              >
                {[...Array(28)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}{getOrdinalSuffix(i + 1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g., 26th-25th billing cycle"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={!selectedDealer || saving}
            >
              <Plus size={16} />
              {saving ? 'Saving...' : 'Save Cycle'}
            </button>
          </div>
        </form>
        
        {selectedDealer && (
          <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, color: '#166534' }}>
            <strong>Selected:</strong> {selectedDealer.dealer_code} - {selectedDealer.dealer_name}
            <br />
            <strong>New Cycle:</strong> {formatCycle(parseInt(cycleStartDay))} (every month)
          </div>
        )}
      </div>

      {/* Billing Cycles Table */}
      <div className="cycles-table-card">
        <h3><List size={18} /> Current Billing Cycle Exceptions ({billingCycles.length})</h3>
        
        {loading ? (
          <div className="no-data">Loading...</div>
        ) : billingCycles.length === 0 ? (
          <div className="no-data">
            No billing cycle exceptions found. All dealers are using standard monthly cycle (1st-30th/31st).
          </div>
        ) : (
          <table className="cycles-table">
            <thead>
              <tr>
                <th>Dealer Code</th>
                <th>Dealer Name</th>
                <th>Territory</th>
                <th>Billing Cycle</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {billingCycles.map((cycle) => (
                <tr key={cycle.dealer_code}>
                  <td><strong>{cycle.dealer_code}</strong></td>
                  <td>{cycle.dealer_name}</td>
                  <td>{cycle.territory_name || '-'}</td>
                  <td>
                    <span className="cycle-badge">
                      {formatCycle(cycle.cycle_start_day)}
                    </span>
                  </td>
                  <td>{cycle.notes || '-'}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(cycle.dealer_code, cycle.dealer_name)}
                      title="Remove custom cycle (revert to standard)"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default BillingCycles;

