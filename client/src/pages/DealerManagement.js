import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Upload, Plus, Search, Trash2, X, RefreshCw } from 'lucide-react';
import './DealerManagement.css';

const DealerManagement = () => {
  const [dealers, setDealers] = useState([]);
  const [allDealers, setAllDealers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [selectedTerritory, setSelectedTerritory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [territories, setTerritories] = useState([]);
  const [totalDealers, setTotalDealers] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [formData, setFormData] = useState({
    dealer_name: '',
    dealer_code: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    territory_id: null,
    credit_days: 30,
    status: 'active'
  });

  const fetchTerritories = async () => {
    try {
      const response = await axios.get('/api/dealers/territories');
      setTerritories(response.data.territories || []);
    } catch (error) {
      console.error('Error fetching territories:', error);
    }
  };

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        territory: selectedTerritory,
        status: selectedStatus,
        limit: displayLimit
      };
      
      // Only add search if there's a search term
      if (searchTerm && searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      
      const response = await axios.get('/api/dealers', { params });
      setDealers(response.data.dealers || []);
      setTotalDealers(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching dealers:', error);
      alert('Failed to fetch dealers');
    } finally {
      setLoading(false);
    }
  }, [selectedTerritory, selectedStatus, searchTerm, displayLimit]);

  // Fetch territories on mount
  useEffect(() => {
    fetchTerritories();
  }, []);

  // Fetch dealers with filters (debounce search term)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchDealers();
    }, searchTerm ? 500 : 0); // Debounce search by 500ms, no delay for other filters

    return () => clearTimeout(timeoutId);
  }, [fetchDealers, searchTerm]);

  // Handle manual add form submission
  const handleAddDealer = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await axios.post('/api/dealers', formData);
      alert('Dealer added successfully!');
      setShowAddModal(false);
      resetForm();
      fetchDealers();
    } catch (error) {
      console.error('Error adding dealer:', error);
      alert(error.response?.data?.error || 'Failed to add dealer');
    } finally {
      setLoading(false);
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
      const response = await axios.post('/api/dealers/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUploadStatus({
        success: true,
        message: `Successfully imported ${response.data.inserted} dealers. ${response.data.skipped} duplicates skipped.`
      });
      setSelectedFile(null);
      fetchDealers();
      
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

  // Handle delete dealer
  const handleDeleteDealer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this dealer?')) {
      return;
    }

    try {
      await axios.delete(`/api/dealers/${id}`);
      alert('Dealer deleted successfully!');
      fetchDealers();
    } catch (error) {
      console.error('Error deleting dealer:', error);
      alert(error.response?.data?.error || 'Failed to delete dealer');
    }
  };

  // Handle clear all dealers
  const handleClearAll = async () => {
    const confirmMessage = `Are you sure you want to delete ALL dealers?\n\n⚠️ WARNING: This will also delete all delinquent dealer records.\n\nThis action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Double confirmation
    if (!window.confirm('This is your last chance. Delete ALL dealers and delinquent records?')) {
      return;
    }

    try {
      const response = await axios.delete('/api/dealers/clear/all');
      alert(response.data.message + `\nDeleted: ${response.data.deleted} dealers.`);
      fetchDealers();
    } catch (error) {
      console.error('Error clearing all dealers:', error);
      alert(error.response?.data?.error || 'Failed to clear all dealers');
    }
  };

  const resetForm = () => {
    setFormData({
      dealer_name: '',
      dealer_code: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      territory_id: null,
      credit_days: 30,
      status: 'active'
    });
  };

  // Dealers are already filtered by backend, so we can use them directly
  const filteredDealers = dealers;

  return (
    <div className="dealer-management">
      <div className="page-header">
        <h1 className="page-title">Dealer Management</h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              fetchTerritories();
              fetchDealers();
            }}
            title="Refresh"
          >
            <RefreshCw size={18} /> Refresh
          </button>
          <button 
            className="btn btn-danger"
            onClick={handleClearAll}
            title="Delete all dealers (this will also delete all delinquent records)"
          >
            <Trash2 size={18} /> Clear All
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowUploadModal(true)}
          >
            <Upload size={18} /> Upload Excel
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={18} /> Add Dealer
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="filters-row">
          <div className="search-bar">
            <div className="search-input-wrapper">
              <Search className="search-icon" size={20} />
              <input
                type="text"
                placeholder="Search dealers by name, code, contact, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
          <div className="filter-group">
            <label>Territory:</label>
            <select
              value={selectedTerritory}
              onChange={(e) => setSelectedTerritory(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Territories</option>
              {territories.map(territory => (
                <option key={territory.id} value={territory.id}>{territory.territory_name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="delinquent">Delinquent</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Show:</label>
            <select
              value={displayLimit}
              onChange={(e) => setDisplayLimit(parseInt(e.target.value))}
              className="filter-select"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
        <div className="dealer-count">
          Showing: <strong>{filteredDealers.length}</strong> of <strong>{totalDealers}</strong> dealers
          {totalDealers > displayLimit && (
            <span className="limit-warning"> (Limited to {displayLimit} results. Use filters to narrow down.)</span>
          )}
        </div>
      </div>

      {loading && !dealers.length ? (
        <div className="loading">Loading dealers...</div>
      ) : (
        <div className="dealers-table-container">
          <table className="dealers-table">
            <thead>
              <tr>
                <th>Dealer Code</th>
                <th>Dealer Name</th>
                <th>Territory</th>
                <th>Contact Person</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Credit Days</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDealers.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    {searchTerm ? 'No dealers found matching your search' : 'No dealers found. Add your first dealer to get started.'}
                  </td>
                </tr>
              ) : (
                filteredDealers.map(dealer => (
                  <tr key={dealer.id}>
                    <td>{dealer.dealer_code}</td>
                    <td>{dealer.dealer_name}</td>
                    <td>{dealer.territory_name || '-'}</td>
                    <td>{dealer.contact_person || '-'}</td>
                    <td>{dealer.email || '-'}</td>
                    <td>{dealer.phone || '-'}</td>
                    <td>{dealer.credit_days} days</td>
                    <td>
                      <span className={`status-badge status-${dealer.status}`}>
                        {dealer.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => handleDeleteDealer(dealer.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Dealer Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Dealer</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddDealer} className="dealer-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Dealer Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.dealer_name}
                    onChange={(e) => setFormData({ ...formData, dealer_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Dealer Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.dealer_code}
                    onChange={(e) => setFormData({ ...formData, dealer_code: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Territory</label>
                  <select
                    value={formData.territory_id || ''}
                    onChange={(e) => setFormData({ ...formData, territory_id: e.target.value || null })}
                  >
                    <option value="">Select Territory (Optional)</option>
                    {territories.map(territory => (
                      <option key={territory.id} value={territory.id}>{territory.territory_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Credit Days</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.credit_days}
                    onChange={(e) => setFormData({ ...formData, credit_days: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="delinquent">Delinquent</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  rows="3"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Adding...' : 'Add Dealer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Excel Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload Dealers from Excel</h2>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleFileUpload} className="upload-form">
              <div className="upload-info">
                <p><strong>Excel File Format:</strong></p>
                <p>Your Excel file should contain the following columns:</p>
                <ul>
                  <li>Dealer Name / Customer Name (required)</li>
                  <li>Dealer Code / Customer Code (required)</li>
                  <li>Contact Person (optional)</li>
                  <li>Email / Email Address (optional)</li>
                  <li>Phone / Mobile / Contact Number (optional)</li>
                  <li>Address (optional)</li>
                  <li>Credit Days / Credit Limit (optional, default: 30)</li>
                  <li>Status (optional, default: active)</li>
                </ul>
                <p className="note">
                  <strong>Note:</strong> Column names are case-insensitive and can have spaces. 
                  The system will automatically detect common variations like "Dealer Name", "Customer Name", etc.
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
                  {loading ? 'Uploading...' : 'Upload & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealerManagement;

