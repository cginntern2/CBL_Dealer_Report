import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, X, Edit2, AlertCircle, TrendingDown, TrendingUp, Calendar, Filter, Save, Download, Upload, RefreshCw } from 'lucide-react';
import './OverdueReport.css';

const OverdueReport = () => {
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSetLimitsModal, setShowSetLimitsModal] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);
  const [selectedDealerCode, setSelectedDealerCode] = useState('');
  const [selectedDealerName, setSelectedDealerName] = useState('');
  const [dealerSearchTerm, setDealerSearchTerm] = useState('');
  const [availableDealers, setAvailableDealers] = useState([]);
  const [lowerLimit, setLowerLimit] = useState('');
  const [upperLimit, setUpperLimit] = useState('');
  const [updateStatus, setUpdateStatus] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [latestDate, setLatestDate] = useState(null);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedTerritory, setSelectedTerritory] = useState('all');
  const [territories, setTerritories] = useState([]);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedYear && selectedYear !== '') params.year = selectedYear;
      if (selectedMonth && selectedMonth !== '') params.month = selectedMonth;
      if (selectedTerritory !== 'all') params.territory = selectedTerritory;
      
      const response = await axios.get('/api/overdue/report', { params });
      setReportData(response.data.data || []);
      setSummary(response.data.summary || {});
      setLatestDate(response.data.latestDate || null);
    } catch (error) {
      console.error('Error fetching overdue report:', error);
      alert('Failed to fetch overdue report: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedTerritory]);

  const fetchTerritories = useCallback(async () => {
    try {
      const response = await axios.get('/api/dealers/territories');
      setTerritories(response.data.territories || []);
    } catch (error) {
      console.error('Error fetching territories:', error);
    }
  }, []);

  useEffect(() => {
    fetchReport();
    fetchTerritories();
  }, [fetchReport, fetchTerritories]);

  const handleRefresh = () => {
    fetchReport();
    fetchTerritories();
  };

  // Fetch all dealers for manual limit setting
  const fetchAllDealers = async () => {
    try {
      const response = await axios.get('/api/dealers');
      setAvailableDealers(response.data.dealers || []);
    } catch (error) {
      console.error('Error fetching dealers:', error);
    }
  };

  // Handle open set limits modal
  const handleOpenSetLimits = () => {
    setShowSetLimitsModal(true);
    setSelectedDealerCode('');
    setSelectedDealerName('');
    setLowerLimit('');
    setUpperLimit('');
    setDealerSearchTerm('');
    setUpdateStatus(null);
    fetchAllDealers();
  };

  // Handle dealer selection
  const handleDealerSelect = (dealer) => {
    setSelectedDealerCode(dealer.dealer_code);
    setSelectedDealerName(dealer.dealer_name);
    setLowerLimit(dealer.lower_limit || '');
    setUpperLimit(dealer.upper_limit || '');
    setDealerSearchTerm('');
  };

  // Save limits for manually selected dealer
  const handleSaveManualLimits = async () => {
    if (!selectedDealerCode) {
      setUpdateStatus({ success: false, message: 'Please select a dealer' });
      return;
    }
    
    const lower = parseFloat(lowerLimit);
    const upper = parseFloat(upperLimit);
    
    if (isNaN(lower) || isNaN(upper)) {
      setUpdateStatus({ success: false, message: 'Please enter valid numbers' });
      return;
    }
    
    if (lower < 0 || upper < 0) {
      setUpdateStatus({ success: false, message: 'Limits must be non-negative' });
      return;
    }
    
    if (lower > upper && upper > 0) {
      setUpdateStatus({ success: false, message: 'Lower limit cannot exceed upper limit' });
      return;
    }
    
    setLoading(true);
    try {
      await axios.put(`/api/overdue/limits/${selectedDealerCode}`, {
        lower_limit: lower,
        upper_limit: upper
      });
      
      setUpdateStatus({ success: true, message: 'Limits set successfully' });
      fetchReport(); // Refresh report
      
      setTimeout(() => {
        setShowSetLimitsModal(false);
        setSelectedDealerCode('');
        setSelectedDealerName('');
        setUpdateStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Error setting limits:', error);
      setUpdateStatus({
        success: false,
        message: error.response?.data?.error || 'Failed to set limits'
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle edit limits
  const handleEditLimits = (dealer) => {
    setEditingDealer(dealer);
    setLowerLimit(dealer.lower_limit || '');
    setUpperLimit(dealer.upper_limit || '');
    setShowEditModal(true);
    setUpdateStatus(null);
  };

  // Save limits
  const handleSaveLimits = async () => {
    if (!editingDealer) return;
    
    const lower = parseFloat(lowerLimit);
    const upper = parseFloat(upperLimit);
    
    if (isNaN(lower) || isNaN(upper)) {
      setUpdateStatus({ success: false, message: 'Please enter valid numbers' });
      return;
    }
    
    if (lower < 0 || upper < 0) {
      setUpdateStatus({ success: false, message: 'Limits must be non-negative' });
      return;
    }
    
    if (lower > upper && upper > 0) {
      setUpdateStatus({ success: false, message: 'Lower limit cannot exceed upper limit' });
      return;
    }
    
    setLoading(true);
    try {
      await axios.put(`/api/overdue/limits/${editingDealer.dealer_code}`, {
        lower_limit: lower,
        upper_limit: upper
      });
      
      setUpdateStatus({ success: true, message: 'Limits updated successfully' });
      fetchReport(); // Refresh report
      
      setTimeout(() => {
        setShowEditModal(false);
        setEditingDealer(null);
        setUpdateStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Error updating limits:', error);
      setUpdateStatus({
        success: false,
        message: error.response?.data?.error || 'Failed to update limits'
      });
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Export report to Excel
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear);
      if (selectedMonth) params.append('month', selectedMonth);
      if (selectedTerritory !== 'all') params.append('territory', selectedTerritory);
      
      const response = await axios.get(`/api/overdue/export?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `overdue_report_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report: ' + (error.response?.data?.error || error.message));
    }
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadFile(file);
      setUploadStatus(null);
    }
  };

  // Upload overdue report
  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadStatus({ success: false, message: 'Please select a file to upload' });
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);

    setLoading(true);
    setUploadStatus(null);

    try {
      const response = await axios.post('/api/overdue/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploadStatus({
        success: true,
        message: response.data.message || 'File uploaded successfully',
        summary: response.data.summary,
        missingDealers: response.data.missing_dealers || [],
        warning: response.data.warning,
        suggestion: response.data.suggestion
      });

      // Refresh report after successful upload
      fetchReport();

      // Clear file input
      setUploadFile(null);
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';

      // Clear status after 30 seconds (longer timeout to allow viewing missing dealers)
      setTimeout(() => {
        setUploadStatus(null);
      }, 30000);
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus({
        success: false,
        message: error.response?.data?.error || 'Failed to upload file',
        details: error.response?.data?.details || error.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter data by search term
  const filteredData = reportData.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    return (
      item.dealer_name?.toLowerCase().includes(searchLower) ||
      item.dealer_code?.toLowerCase().includes(searchLower) ||
      item.territory_name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="overdue-report">
      <div className="page-header">
        <div className="header-content">
          <h1><AlertCircle className="header-icon" /> Overdue Report</h1>
          <p>Monitor lower and upper limit overdue amounts for dealers</p>
          {latestDate && (
            <div className="last-updated">
              <Calendar size={16} />
              <span>Data as of: {new Date(latestDate).toLocaleDateString('en-IN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</span>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={loading} title="Refresh">
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon lower-limit">
            <TrendingDown size={24} />
          </div>
          <div className="stat-content">
            <h3>Lower Limit Overdue</h3>
            <p className="stat-value">{summary.lower_limit_overdue_count || 0} dealers</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon upper-limit">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <h3>Upper Limit Overdue</h3>
            <p className="stat-value">{summary.upper_limit_overdue_count || 0} dealers</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon total">
            <AlertCircle size={24} />
          </div>
          <div className="stat-content">
            <h3>Total Dealers</h3>
            <p className="stat-value">{summary.total_dealers || 0}</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <div className="action-left">
          <button 
            className="btn btn-primary"
            onClick={handleOpenSetLimits}
          >
            <Save size={18} /> Set Limits
          </button>
          <div className="upload-container">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              id="overdue-upload-input"
              style={{ display: 'none' }}
            />
            <label htmlFor="overdue-upload-input" className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              <Upload size={18} /> Upload Report
            </label>
            {uploadFile && (
              <span style={{ marginLeft: '10px', fontSize: '14px', color: '#6b7280' }}>
                {uploadFile.name}
              </span>
            )}
            {uploadFile && (
              <button 
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={loading}
                style={{ marginLeft: '10px' }}
              >
                {loading ? 'Uploading...' : 'Submit'}
              </button>
            )}
          </div>
          <button 
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={loading || filteredData.length === 0}
          >
            <Download size={18} /> Export Excel
          </button>
        </div>
        <div className="action-right">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search dealers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Upload Status */}
      {uploadStatus && (
        <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`} style={{
          padding: '15px',
          marginBottom: '20px',
          borderRadius: '8px',
          backgroundColor: uploadStatus.success ? '#d1fae5' : '#fee2e2',
          color: uploadStatus.success ? '#065f46' : '#991b1b'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{uploadStatus.message}</div>
          {uploadStatus.summary && (
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              <div>Total Records: {uploadStatus.summary.total_records}</div>
              <div>Success: {uploadStatus.summary.success_count} | Errors: {uploadStatus.summary.error_count}</div>
              {uploadStatus.summary.missing_dealers_count > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ color: '#d97706', fontWeight: 'bold', marginBottom: '5px' }}>
                    Missing Dealers: {uploadStatus.summary.missing_dealers_count}
                  </div>
                  {uploadStatus.warning && (
                    <div style={{ color: '#d97706', fontSize: '13px', marginBottom: '8px', fontStyle: 'italic' }}>
                      {uploadStatus.warning}
                    </div>
                  )}
                  {uploadStatus.suggestion && (
                    <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>
                      {uploadStatus.suggestion}
                    </div>
                  )}
                  {uploadStatus.missingDealers && uploadStatus.missingDealers.length > 0 && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ 
                        cursor: 'pointer', 
                        color: '#d97706', 
                        fontWeight: '500',
                        fontSize: '13px',
                        userSelect: 'none'
                      }}>
                        Click to view missing dealer codes ({uploadStatus.missingDealers.length})
                      </summary>
                      <div style={{ 
                        marginTop: '8px', 
                        padding: '10px', 
                        backgroundColor: 'rgba(217, 119, 6, 0.1)', 
                        borderRadius: '6px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                      }}>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
                          gap: '5px' 
                        }}>
                          {uploadStatus.missingDealers.map((code, idx) => (
                            <div key={idx} style={{ 
                              padding: '4px 8px', 
                              backgroundColor: 'white', 
                              borderRadius: '4px',
                              border: '1px solid #fbbf24'
                            }}>
                              {code}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
          {uploadStatus.details && (
            <div style={{ fontSize: '12px', marginTop: '5px', fontStyle: 'italic' }}>
              {uploadStatus.details}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label><Calendar size={16} /> Year:</label>
          <input
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            placeholder="YYYY"
            min="2000"
            max="2100"
          />
        </div>
        <div className="filter-group">
          <label><Calendar size={16} /> Month:</label>
          <input
            type="number"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            placeholder="1-12"
            min="1"
            max="12"
          />
        </div>
        <div className="filter-group">
          <label><Filter size={16} /> Territory:</label>
          <select 
            value={selectedTerritory} 
            onChange={(e) => setSelectedTerritory(e.target.value)}
          >
            <option value="all">All Territories</option>
            {territories.map(territory => (
              <option key={territory.id} value={territory.id}>{territory.territory_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Report Table */}
      <div className="table-container">
        <div className="table-header">
          <h3>Overdue Report</h3>
        </div>
        
        {loading ? (
          <div className="loading">Loading...</div>
        ) : filteredData.length === 0 ? (
          <div className="no-data">No overdue data available. Set dealer limits to see the report.</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Dealer Code</th>
                <th>Dealer Name</th>
                <th>Territory</th>
                {(selectedYear || selectedMonth) && <th>Year</th>}
                {(selectedYear || selectedMonth) && <th>Month</th>}
                <th>Lower Limit</th>
                <th>Upper Limit</th>
                <th>Target</th>
                <th>Achievement</th>
                <th>Lower Limit Overdue</th>
                <th>Upper Limit Overdue</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, index) => {
                const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return (
                  <tr key={index}>
                    <td>{item.dealer_code}</td>
                    <td>{item.dealer_name}</td>
                    <td>{item.territory_name || 'N/A'}</td>
                    {(selectedYear || selectedMonth) && <td>{item.year || selectedYear || '-'}</td>}
                    {(selectedYear || selectedMonth) && <td>{item.month ? monthNames[item.month] || item.month : selectedMonth ? monthNames[parseInt(selectedMonth)] || selectedMonth : '-'}</td>}
                    <td>{formatCurrency(item.lower_limit)}</td>
                    <td>{formatCurrency(item.upper_limit)}</td>
                    <td>{formatCurrency(item.target_amount)}</td>
                    <td>{formatCurrency(item.achievement_amount)}</td>
                    <td className={item.lower_limit_overdue > 0 ? 'overdue' : ''}>
                      {formatCurrency(item.lower_limit_overdue)}
                    </td>
                    <td className={item.upper_limit_overdue > 0 ? 'overdue' : ''}>
                      {formatCurrency(item.upper_limit_overdue)}
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="icon-btn" 
                        onClick={() => handleEditLimits(item)}
                        title="Edit Limits"
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Limits Modal */}
      {showEditModal && editingDealer && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Dealer Limits</h2>
              <button className="modal-close" onClick={() => {
                setShowEditModal(false);
                setEditingDealer(null);
                setUpdateStatus(null);
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="edit-form">
                <div className="form-group">
                  <label>Dealer: {editingDealer.dealer_name} ({editingDealer.dealer_code})</label>
                </div>
                <div className="form-group">
                  <label>Lower Limit:</label>
                  <input
                    type="number"
                    value={lowerLimit}
                    onChange={(e) => setLowerLimit(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="Enter lower limit"
                  />
                  <small>Minimum amount dealer must achieve by end of month</small>
                </div>
                <div className="form-group">
                  <label>Upper Limit:</label>
                  <input
                    type="number"
                    value={upperLimit}
                    onChange={(e) => setUpperLimit(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="Enter upper limit"
                  />
                  <small>Maximum amount dealer should not exceed (0 = no limit)</small>
                </div>
                {updateStatus && (
                  <div className={`update-status ${updateStatus.success ? 'success' : 'error'}`}>
                    {updateStatus.message}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowEditModal(false);
                setEditingDealer(null);
                setUpdateStatus(null);
              }}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveLimits}
                disabled={loading}
              >
                <Save size={18} /> {loading ? 'Saving...' : 'Save Limits'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Limits Modal */}
      {showSetLimitsModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Set Dealer Limits</h2>
              <button className="modal-close" onClick={() => {
                setShowSetLimitsModal(false);
                setSelectedDealerCode('');
                setSelectedDealerName('');
                setUpdateStatus(null);
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="edit-form">
                <div className="form-group">
                  <label>Select Dealer:</label>
                  <div className="dealer-search-container">
                    <input
                      type="text"
                      placeholder="Search dealer by code or name..."
                      value={dealerSearchTerm}
                      onChange={(e) => setDealerSearchTerm(e.target.value)}
                      className="dealer-search-input"
                    />
                    {dealerSearchTerm && (
                      <div className="dealer-search-results">
                        {availableDealers
                          .filter(dealer => 
                            dealer.dealer_code?.toLowerCase().includes(dealerSearchTerm.toLowerCase()) ||
                            dealer.dealer_name?.toLowerCase().includes(dealerSearchTerm.toLowerCase())
                          )
                          .slice(0, 10)
                          .map(dealer => (
                            <div 
                              key={dealer.dealer_code}
                              className="dealer-search-item"
                              onClick={() => handleDealerSelect(dealer)}
                            >
                              <strong>{dealer.dealer_code}</strong> - {dealer.dealer_name}
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                  {selectedDealerCode && (
                    <div className="selected-dealer">
                      Selected: <strong>{selectedDealerName}</strong> ({selectedDealerCode})
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Lower Limit:</label>
                  <input
                    type="number"
                    value={lowerLimit}
                    onChange={(e) => setLowerLimit(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="Enter lower limit"
                    disabled={!selectedDealerCode}
                  />
                  <small>Minimum amount dealer must achieve by end of month</small>
                </div>
                <div className="form-group">
                  <label>Upper Limit:</label>
                  <input
                    type="number"
                    value={upperLimit}
                    onChange={(e) => setUpperLimit(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="Enter upper limit"
                    disabled={!selectedDealerCode}
                  />
                  <small>Maximum amount dealer should not exceed (0 = no limit)</small>
                </div>
                {updateStatus && (
                  <div className={`update-status ${updateStatus.success ? 'success' : 'error'}`}>
                    {updateStatus.message}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowSetLimitsModal(false);
                setSelectedDealerCode('');
                setSelectedDealerName('');
                setUpdateStatus(null);
              }}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveManualLimits}
                disabled={loading || !selectedDealerCode}
              >
                <Save size={18} /> {loading ? 'Saving...' : 'Set Limits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverdueReport;
