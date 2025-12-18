import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, Search, Trash2, X, TrendingDown, Calendar, Users, RefreshCw } from 'lucide-react';
import './DelinquentDealers.css';

const DelinquentDealers = () => {
  const [delinquentDealers, setDelinquentDealers] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [totalDelinquent, setTotalDelinquent] = useState(0);

  // Fetch delinquent dealers
  useEffect(() => {
    fetchDelinquentDealers();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchDelinquentDealers();
  }, [selectedCategory, showAll]);

  const handleRefresh = () => {
    fetchDelinquentDealers();
    fetchStats();
  };

  const fetchDelinquentDealers = async () => {
    setLoading(true);
    try {
      const params = {};
      if (!showAll) {
        params.limit = 10;
      }
      params.showAll = showAll.toString();
      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      
      const response = await axios.get('/api/delinquent', { params });
      setDelinquentDealers(response.data.delinquentDealers || []);
      setTotalDelinquent(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching delinquent dealers:', error);
      alert('Failed to fetch delinquent dealers');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/delinquent/stats');
      setStats(response.data.stats || []);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  // Handle Excel upload
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setLoading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post('/api/delinquent/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUploadStatus({
        success: true,
        message: `Successfully processed ${response.data.inserted} delinquent dealers. ${response.data.skipped || 0} dealers skipped (not found in dealers table).`
      });
      setSelectedFile(null);
      fetchDelinquentDealers();
      fetchStats();
      
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadStatus(null);
      }, 3000);
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus({
        success: false,
        message: error.response?.data?.error || 'Failed to upload file'
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle clear all records
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all delinquent dealer records? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete('/api/delinquent/clear');
      alert('All delinquent records cleared successfully!');
      fetchDelinquentDealers();
      fetchStats();
    } catch (error) {
      console.error('Error clearing records:', error);
      alert(error.response?.data?.error || 'Failed to clear records');
    }
  };

  // Filter dealers based on search term
  const filteredDealers = delinquentDealers.filter(dealer =>
    dealer.dealer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dealer.dealer_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dealer.contact_person && dealer.contact_person.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  return (
    <div className="delinquent-dealers">
      <div className="page-header">
        <h1 className="page-title">Delinquent Dealers</h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={18} /> Refresh
          </button>
          <button 
            className="btn btn-danger"
            onClick={handleClearAll}
            title="Clear all records"
          >
            <Trash2 size={18} /> Clear All
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowUploadModal(true)}
          >
            <Upload size={18} /> Upload Sales Register
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="stats-section">
        <h2 className="section-title">Inactive Dealers Summary</h2>
        <div className="stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="stat-card">
              <div className="stat-icon">
                <TrendingDown size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stat.count}</div>
                <div className="stat-label">{stat.category}</div>
              </div>
            </div>
          ))}
          {stats.length === 0 && (
            <div className="stat-card empty">
              <p>No statistics available. Upload Sales Register to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="filters-section">
        <div className="search-bar">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="Search dealers by name, code, or contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        <div className="category-filter">
          <label>Filter by Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setShowAll(false);
            }}
            className="category-select"
          >
            <option value="all">All Categories</option>
            <option value="1 month">1 Month Inactive</option>
            <option value="2 month">2 Months Inactive</option>
            <option value="3 month">3 Months Inactive</option>
            <option value="4 month">4 Months Inactive</option>
          </select>
        </div>
        <div className="dealer-count">
          Showing: <strong>{filteredDealers.length}</strong> of <strong>{totalDelinquent}</strong>
          {!showAll && totalDelinquent > 10 && (
            <button 
              className="btn-show-all"
              onClick={() => setShowAll(true)}
            >
              Show All
            </button>
          )}
        </div>
      </div>

      {/* Dealers Table */}
      {loading && !delinquentDealers.length ? (
        <div className="loading">Loading delinquent dealers...</div>
      ) : (
        <div className="dealers-table-container">
          <table className="dealers-table">
            <thead>
              <tr>
                <th>Dealer Code</th>
                <th>Dealer Name</th>
                <th>Contact Person</th>
                <th>Last Order Date</th>
                <th>Months Inactive</th>
                <th>Category</th>
                <th>Lower Overdue</th>
                <th>Upper Overdue</th>
              </tr>
            </thead>
            <tbody>
              {filteredDealers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    {searchTerm || selectedCategory !== 'all' 
                      ? 'No dealers found matching your criteria' 
                      : 'No delinquent dealers found. Upload Sales Register Excel file to analyze dealer activity.'}
                  </td>
                </tr>
              ) : (
                filteredDealers.map(dealer => (
                  <tr key={dealer.id}>
                    <td>{dealer.dealer_code}</td>
                    <td>{dealer.dealer_name}</td>
                    <td>{dealer.contact_person || '-'}</td>
                    <td>
                      <div className="date-cell">
                        <Calendar size={14} />
                        {formatDate(dealer.last_order_date)}
                      </div>
                    </td>
                    <td>
                      <span className="months-badge">{dealer.months_inactive}</span>
                    </td>
                    <td>
                      <span className={`category-badge category-${dealer.months_inactive}`}>
                        {dealer.category}
                      </span>
                    </td>
                    <td>
                      {dealer.lower_limit_overdue > 0 
                        ? formatCurrency(dealer.lower_limit_overdue) 
                        : <span style={{ color: '#999' }}>0</span>
                      }
                    </td>
                    <td>
                      {dealer.upper_limit_overdue > 0 
                        ? formatCurrency(dealer.upper_limit_overdue) 
                        : <span style={{ color: '#999' }}>0</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Excel Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload Sales Register</h2>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleFileUpload} className="upload-form">
              <div className="upload-info">
                <p><strong>Excel File Format:</strong></p>
                <p>Your Excel file should contain the following columns:</p>
                <ul>
                  <li><strong>Dealer Code</strong> (required) - Must match dealer codes in the dealers table</li>
                  <li><strong>Order Date</strong> (required) - Date of the order</li>
                </ul>
                <p className="note">
                  <strong>How it works:</strong> The system will find the last order date for each dealer 
                  and calculate how many months they've been inactive. Only dealers with 1-4 months of 
                  inactivity will be categorized as delinquent.
                </p>
                <p className="note">
                  <strong>Note:</strong> Column names are case-insensitive and can have spaces.
                </p>
              </div>
              <div className="form-group">
                <label>Select Excel File (.xlsx, .xls)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  required
                />
                {selectedFile && (
                  <p className="file-name">Selected: {selectedFile.name}</p>
                )}
              </div>
              {uploadStatus && (
                <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`}>
                  {uploadStatus.message}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading || !selectedFile}>
                  {loading ? 'Processing...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DelinquentDealers;

