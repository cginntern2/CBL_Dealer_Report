import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Upload, Download, Calendar, Filter, AlertCircle, CheckCircle, X } from 'lucide-react';
import './CreditDays.css';

const CreditDays = () => {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
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
      
      const response = await axios.get('/api/credit-days/report', { params });
      setReportData(response.data.data || []);
      setLatestDate(response.data.latestDate || null);
    } catch (error) {
      console.error('Error fetching credit days report:', error);
      if (error.response?.status !== 404) {
        alert('Failed to fetch credit days report: ' + (error.response?.data?.error || error.message));
      }
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

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setUploadFile(file);
        setUploadStatus(null);
      } else {
        alert('Please select a PDF file');
        e.target.value = '';
      }
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!uploadFile) {
      alert('Please select a PDF file to upload');
      return;
    }

    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const response = await axios.post('/api/credit-days/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploadStatus({
        success: true,
        message: 'Upload successful!',
        details: response.data,
      });

      // Clear file input
      setUploadFile(null);
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';

      // Refresh report data
      setTimeout(() => {
        fetchReport();
      }, 1000);

      // Clear status after 30 seconds
      setTimeout(() => {
        setUploadStatus(null);
      }, 30000);
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus({
        success: false,
        message: 'Upload failed: ' + (error.response?.data?.error || error.message),
        details: error.response?.data,
      });
    } finally {
      setUploading(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const params = {};
      if (selectedYear && selectedYear !== '') params.year = selectedYear;
      if (selectedMonth && selectedMonth !== '') params.month = selectedMonth;
      if (selectedTerritory !== 'all') params.territory = selectedTerritory;

      const response = await axios.get('/api/credit-days/export', {
        params,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `credit-days-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report: ' + (error.response?.data?.error || error.message));
    }
  };

  // Filter data based on search term
  const filteredData = reportData.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      item.dealer_code?.toLowerCase().includes(searchLower) ||
      item.dealer_name?.toLowerCase().includes(searchLower) ||
      item.territory_name?.toLowerCase().includes(searchLower)
    );
  });

  // Get unique years and months from data
  const availableYears = [...new Set(reportData.map(item => item.year).filter(Boolean))].sort((a, b) => b - a);
  const availableMonths = [
    { value: '', label: 'All Months' },
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  return (
    <div className="credit-days-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Credit Days Report</h1>
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
          <button className="btn btn-secondary" onClick={handleExport} disabled={loading || reportData.length === 0}>
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="upload-section">
        <div className="upload-container">
          <h3>Upload Credit Days PDF</h3>
          <div className="upload-controls">
            <label className="file-input-label">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <span className="file-input-text">
                {uploadFile ? uploadFile.name : 'Choose PDF File'}
              </span>
            </label>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
            >
              {uploading ? 'Uploading...' : <><Upload size={18} /> Upload</>}
            </button>
          </div>

          {uploadStatus && (
            <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`}>
              <div className="status-header">
                {uploadStatus.success ? (
                  <CheckCircle size={20} className="status-icon" />
                ) : (
                  <AlertCircle size={20} className="status-icon" />
                )}
                <span className="status-message">{uploadStatus.message}</span>
                <button
                  className="close-status"
                  onClick={() => setUploadStatus(null)}
                >
                  <X size={16} />
                </button>
              </div>
              
              {uploadStatus.details && (
                <div className="status-details">
                  {uploadStatus.details.total_records && (
                    <p><strong>Total Records:</strong> {uploadStatus.details.total_records}</p>
                  )}
                  {uploadStatus.details.success_count !== undefined && (
                    <p><strong>Successful:</strong> {uploadStatus.details.success_count}</p>
                  )}
                  {uploadStatus.details.error_count !== undefined && (
                    <p><strong>Errors:</strong> {uploadStatus.details.error_count}</p>
                  )}
                  {uploadStatus.details.missing_dealers && uploadStatus.details.missing_dealers.length > 0 && (
                    <div className="missing-dealers-section">
                      <p><strong>Missing Dealers ({uploadStatus.details.missing_dealers.length}):</strong></p>
                      <div className="missing-dealers-list">
                        {uploadStatus.details.missing_dealers.slice(0, 20).map((code, idx) => (
                          <span key={idx} className="missing-dealer-tag">{code}</span>
                        ))}
                        {uploadStatus.details.missing_dealers.length > 20 && (
                          <span className="missing-dealer-more">
                            +{uploadStatus.details.missing_dealers.length - 20} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>
            <Calendar size={16} />
            Year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            <Calendar size={16} />
            Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {availableMonths.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            <Filter size={16} />
            Territory
          </label>
          <select
            value={selectedTerritory}
            onChange={(e) => setSelectedTerritory(e.target.value)}
          >
            <option value="all">All Territories</option>
            {territories.map((territory) => {
              // Handle both object format {id, territory_name} and string format
              const territoryId = typeof territory === 'object' ? territory.id : null;
              const territoryName = typeof territory === 'object' ? territory.territory_name : territory;
              const value = territoryId || territoryName || territory;
              
              return (
                <option key={territoryId || territoryName || value} value={value}>
                  {territoryName || 'Unknown Territory'}
                </option>
              );
            })}
          </select>
        </div>

        <div className="filter-group search-group">
          <label>
            <Search size={16} />
            Search
          </label>
          <input
            type="text"
            placeholder="Search by dealer code, name, or territory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Report Table */}
      <div className="report-section">
        {loading ? (
          <div className="loading">Loading report data...</div>
        ) : filteredData.length === 0 ? (
          <div className="no-data">
            <AlertCircle size={48} />
            <p>No credit days data available for the selected filters.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Dealer Code</th>
                  <th>Dealer Name</th>
                  <th>Territory</th>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Credit Days</th>
                  <th>Report Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index}>
                    <td>{item.dealer_code}</td>
                    <td>{item.dealer_name || 'N/A'}</td>
                    <td>{item.territory_name || 'N/A'}</td>
                    <td>{item.year}</td>
                    <td>
                      {item.month ? new Date(2000, item.month - 1).toLocaleString('default', { month: 'long' }) : 'N/A'}
                    </td>
                    <td className="credit-days-value">{item.credit_days}</td>
                    <td>{item.report_date ? new Date(item.report_date).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditDays;

