import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Upload, Search, X, TrendingUp, TrendingDown, Target, Calendar, Filter, BarChart3, Download, Edit2, ChevronDown, ChevronRight } from 'lucide-react';
import './TargetVsAchievement.css';

const TargetVsAchievement = () => {
  const [reportData, setReportData] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [showABPModal, setShowABPModal] = useState(false);
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editType, setEditType] = useState(''); // 'abp', 'forecast', 'achievement'
  const [editValue, setEditValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [applicationItems, setApplicationItems] = useState({});
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [breakdownType, setBreakdownType] = useState(''); // 'abp' or 'forecast'
  const [breakdownData, setBreakdownData] = useState([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedDealer, setExpandedDealer] = useState(null);
  const [dealerDetails, setDealerDetails] = useState({});
  const [breakdownSearchTerm, setBreakdownSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  // Filters
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedTerritory, setSelectedTerritory] = useState('all');
  const [availableYears, setAvailableYears] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [territories, setTerritories] = useState([]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (!showAll) {
        params.limit = 10;
      }
      params.showAll = showAll.toString();
      
      // Only add params if they have values (not empty strings)
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.year = selectedYear;
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.month = selectedMonth;
      }
      if (selectedTerritory && selectedTerritory !== 'all') {
        params.territory = selectedTerritory;
      }
      
      const response = await axios.get('/api/targets/report', { params });
      setReportData(response.data.data || []);
      setTotalRecords(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching report:', error);
      const errorMessage = error.response?.data?.details || error.response?.data?.error || error.message || 'Failed to fetch target vs achievement report';
      alert(`Failed to fetch target vs achievement report: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [showAll, selectedYear, selectedMonth, selectedTerritory]);

  const fetchStats = useCallback(async () => {
    try {
      const params = {};
      if (selectedYear) params.year = selectedYear;
      if (selectedMonth) params.month = selectedMonth;
      if (selectedTerritory !== 'all') params.territory = selectedTerritory;
      
      const response = await axios.get('/api/targets/stats', { params });
      setStats(response.data.stats || {});
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  }, [selectedYear, selectedMonth, selectedTerritory]);

  const fetchFilters = useCallback(async () => {
    try {
      const response = await axios.get('/api/targets/filters');
      setAvailableYears(response.data.years || []);
      setAvailableMonths(response.data.months || []);
      
      // Set default to current year/month if available
      if (response.data.years && response.data.years.length > 0 && !selectedYear) {
        setSelectedYear(response.data.years[0]);
      }
      if (response.data.months && response.data.months.length > 0 && !selectedMonth) {
        setSelectedMonth(response.data.months[response.data.months.length - 1]);
      }
    } catch (error) {
      console.error('Error fetching filters:', error);
    }
  }, [selectedYear, selectedMonth]);

  const fetchTerritories = useCallback(async () => {
    try {
      const response = await axios.get('/api/dealers/territories');
      setTerritories(response.data.territories || []);
    } catch (error) {
      console.error('Error fetching territories:', error);
    }
  }, []);

  // Fetch report data on mount
  useEffect(() => {
    fetchFilters();
    fetchTerritories();
  }, [fetchFilters, fetchTerritories]);

  // Fetch report and stats when filters change
  useEffect(() => {
    fetchReport();
    fetchStats();
  }, [fetchReport, fetchStats, selectedYear, selectedMonth, selectedTerritory, showAll]);

  // Handle file upload
  const handleFileUpload = async (type) => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setLoading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      let endpoint = '';
      if (type === 'abp') {
        endpoint = '/api/targets/abp/upload';
      } else if (type === 'forecast') {
        endpoint = '/api/targets/forecast/upload';
      } else if (type === 'achievement') {
        endpoint = '/api/targets/achievements/upload';
      }

      const response = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUploadStatus({
        success: true,
        message: response.data.message || 'File uploaded successfully'
      });
      setSelectedFile(null);
      fetchReport();
      fetchStats();
      fetchFilters();
      
      setTimeout(() => {
        if (type === 'abp') setShowABPModal(false);
        if (type === 'forecast') setShowForecastModal(false);
        if (type === 'achievement') setShowAchievementModal(false);
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

  // Export report to Excel
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear);
      if (selectedMonth) params.append('month', selectedMonth);
      if (selectedTerritory !== 'all') params.append('territory', selectedTerritory);
      params.append('showAll', 'true');
      
      const response = await axios.get(`/api/targets/export?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `target_vs_achievement_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report: ' + (error.response?.data?.error || error.message));
    }
  };

  // Handle edit
  const handleEdit = (record, type) => {
    setEditingRecord(record);
    setEditType(type);
    if (type === 'abp') {
      setEditValue(record.abp_target || 0);
    } else if (type === 'forecast') {
      setEditValue(record.forecast_target || 0);
    } else if (type === 'achievement') {
      setEditValue(record.achievement || 0);
    }
    setShowEditModal(true);
  };

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingRecord || !editValue || parseFloat(editValue) < 0) {
      alert('Please enter a valid value');
      return;
    }

    setLoading(true);
    try {
      const endpoint = `/api/targets/${editType}/${editingRecord.dealer_code}/${editingRecord.year}/${editingRecord.month}`;
      const data = editType === 'achievement' 
        ? { achievement_amount: parseFloat(editValue) }
        : { target_amount: parseFloat(editValue) };
      
      await axios.put(endpoint, data);
      setShowEditModal(false);
      setEditingRecord(null);
      setEditValue('');
      fetchReport();
      fetchStats();
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Failed to update: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Fetch dealer-wise breakdown
  const fetchBreakdown = useCallback(async (type) => {
    setBreakdownLoading(true);
    setBreakdownType(type);
    setShowBreakdownModal(true);
    
    try {
      const params = {};
      // Only add params if they have actual values (not empty strings)
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.year = selectedYear;
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.month = selectedMonth;
      }
      if (selectedTerritory && selectedTerritory !== 'all') {
        params.territory = selectedTerritory;
      }
      
      const endpoint = type === 'abp' 
        ? '/api/targets/abp-vs-achievement' 
        : '/api/targets/forecast-vs-achievement';
      
      console.log('Fetching breakdown from:', endpoint, 'with params:', params);
      const response = await axios.get(endpoint, { params });
      console.log('Breakdown response:', response.data);
      console.log('Response.data.data:', response.data.data);
      console.log('Response.data length:', response.data.data ? response.data.data.length : 'N/A');
      
      // Handle different response formats
      const data = response.data?.data || response.data || [];
      console.log('Setting breakdown data:', data.length, 'records');
      setBreakdownData(Array.isArray(data) ? data : []);
      
      // Show helpful message if no data found
      if (data.length === 0 && (params.year || params.month)) {
        alert(`No data found for the selected filters. Available data: ABP (2025 months 6-12, 2026 months 1-6), Forecast (2025 months 6-11). Try clearing filters to see all data.`);
      }
    } catch (error) {
      console.error('Error fetching breakdown:', error);
      console.error('Error details:', error.response?.data);
      alert('Failed to fetch breakdown: ' + (error.response?.data?.error || error.message));
      setShowBreakdownModal(false);
    } finally {
      setBreakdownLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedTerritory]);

  // Toggle row expansion and fetch application items
  const toggleRowExpansion = async (item) => {
    const rowKey = `${item.dealer_code}-${item.year}-${item.month}`;
    const newExpanded = new Set(expandedRows);
    
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey);
      setExpandedRows(newExpanded);
    } else {
      newExpanded.add(rowKey);
      setExpandedRows(newExpanded);
      
      // Fetch application items if not already loaded
      if (!applicationItems[rowKey]) {
        try {
          const response = await axios.get('/api/targets/items', {
            params: {
              dealer_code: item.dealer_code,
              year: item.year,
              month: item.month
            }
          });
          setApplicationItems(prev => ({
            ...prev,
            [rowKey]: response.data.data
          }));
        } catch (error) {
          console.error('Error fetching application items:', error);
        }
      }
    }
  };

  // Toggle dealer details expansion in breakdown modal
  const toggleDealerDetails = async (dealerCode, year, month) => {
    const key = `${dealerCode}-${year}-${month}`;
    
    if (expandedDealer === key) {
      setExpandedDealer(null);
    } else {
      setExpandedDealer(key);
      
      // Fetch application-level items if not already loaded
      if (!dealerDetails[key]) {
        try {
          const response = await axios.get('/api/targets/items', {
            params: {
              dealer_code: dealerCode,
              year: year,
              month: month
            }
          });
          setDealerDetails(prev => ({
            ...prev,
            [key]: response.data.data || {}
          }));
        } catch (error) {
          console.error('Error fetching dealer details:', error);
          setDealerDetails(prev => ({
            ...prev,
            [key]: { error: 'Failed to load details' }
          }));
        }
      }
    }
  };

  // Handle sorting in breakdown table
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get sorted and filtered breakdown data
  const getSortedBreakdownData = () => {
    let filtered = breakdownData;
    
    // Apply search filter
    if (breakdownSearchTerm) {
      const searchLower = breakdownSearchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.dealer_code?.toLowerCase().includes(searchLower) ||
        item.dealer_name?.toLowerCase().includes(searchLower) ||
        item.territory_name?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply sorting
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        // Handle numeric values
        if (sortConfig.key.includes('percentage') || sortConfig.key.includes('amount') || sortConfig.key.includes('quantity')) {
          aVal = parseFloat(aVal || 0);
          bVal = parseFloat(bVal || 0);
        }
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return filtered;
  };


  // Format number (no currency symbol)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Format percentage
  const formatPercentage = (value) => {
    // Convert to number first - handles strings, null, undefined
    const numValue = parseFloat(value);
    // Check if conversion was successful
    if (isNaN(numValue) || numValue === null || numValue === undefined) {
      return '0%';
    }
    // Now we can safely call toFixed on a number
    return `${numValue.toFixed(2)}%`;
  };

  // Get month name
  const getMonthName = (month) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1] || month;
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

  // Per-month comparison (Forecast vs Achievement, ABP vs Forecast) using current filters
  const selectedMonthNum = parseInt(selectedMonth);
  const selectedYearNum = parseInt(selectedYear);
  const matchForSelection = reportData.find(
    (item) =>
      (!selectedYearNum || item.year === selectedYearNum) &&
      (!selectedMonthNum || item.month === selectedMonthNum) &&
      (selectedTerritory === 'all' || String(item.territory_id) === String(selectedTerritory) || item.territory_id === selectedTerritory)
  );

  const comparison = (() => {
    if (!matchForSelection) {
      return {
        forecastVsAchievement: 'Achievement/forecast data does not exist',
        abpVsForecast: 'ABP/forecast data does not exist',
      };
    }
    const { forecast_target = 0, achievement = 0, abp_target = 0 } = matchForSelection;

    const forecastVsAchievement =
      forecast_target > 0 && achievement > 0
        ? `Forecast vs Achievement: ${formatCurrency(forecast_target)} vs ${formatCurrency(achievement)}`
        : 'Achievement/forecast data does not exist';

    const abpVsForecast =
      abp_target > 0 && forecast_target > 0
        ? `ABP vs Forecast: ${formatCurrency(abp_target)} vs ${formatCurrency(forecast_target)}`
        : 'ABP/forecast data does not exist';

    return { forecastVsAchievement, abpVsForecast };
  })();

  return (
    <div className="target-vs-achievement">
      <div className="page-header">
        <div className="header-content">
          <h1><Target className="header-icon" /> Target vs Achievement Report</h1>
          <p>Manage ABP targets, Forecast targets, and track achievements</p>
        </div>
      </div>


      {/* Action Bar */}
      <div className="action-bar">
        <div className="action-left">
          <button 
            className="btn btn-primary"
            onClick={() => setShowABPModal(true)}
          >
            <Upload size={18} /> Upload ABP Targets
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForecastModal(true)}
          >
            <Upload size={18} /> Upload Forecast Targets
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowAchievementModal(true)}
          >
            <Upload size={18} /> Upload Achievements
          </button>
        </div>
        <div className="action-right">
          <button 
            className="btn btn-success"
            onClick={handleExport}
            title="Export to Excel"
          >
            <Download size={18} /> Export Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label><Calendar size={16} /> Year:</label>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">All Years</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label><Calendar size={16} /> Month:</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="">All Months</option>
            {availableMonths.map(month => (
              <option key={month} value={month}>{getMonthName(month)}</option>
            ))}
          </select>
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

      {/* View Options */}
      <div className="view-options" style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '40px', marginBottom: '40px', flexWrap: 'wrap' }}>
        <button 
          className="btn btn-primary"
          onClick={() => fetchBreakdown('abp')}
          style={{ padding: '15px 40px', fontSize: '16px', minWidth: '250px' }}
        >
          <BarChart3 size={20} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
          View ABP vs Achievement
        </button>
        <button 
          className="btn btn-primary"
          onClick={() => fetchBreakdown('forecast')}
          style={{ padding: '15px 40px', fontSize: '16px', minWidth: '250px' }}
        >
          <BarChart3 size={20} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
          View Forecast vs Achievement
        </button>
      </div>

      {/* ABP Upload Modal */}
      {showABPModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Upload ABP Targets</h2>
              <button className="modal-close" onClick={() => {
                setShowABPModal(false);
                setSelectedFile(null);
                setUploadStatus(null);
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>Upload Excel file with ABP (Annual Business Plan) targets. Required columns: Dealer Code, Target Amount. Optional: Year, Month.</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              {uploadStatus && (
                <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`}>
                  {uploadStatus.message}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowABPModal(false);
                setSelectedFile(null);
                setUploadStatus(null);
              }}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={() => handleFileUpload('abp')}
                disabled={!selectedFile || loading}
              >
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Upload Modal */}
      {showForecastModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Upload Forecast Targets</h2>
              <button className="modal-close" onClick={() => {
                setShowForecastModal(false);
                setSelectedFile(null);
                setUploadStatus(null);
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>Upload Excel file with Forecast targets (monthly targets that can override ABP). Required columns: Dealer Code, Target Amount. Optional: Year, Month.</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              {uploadStatus && (
                <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`}>
                  {uploadStatus.message}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowForecastModal(false);
                setSelectedFile(null);
                setUploadStatus(null);
              }}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={() => handleFileUpload('forecast')}
                disabled={!selectedFile || loading}
              >
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Achievement Upload Modal */}
      {showAchievementModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Upload Achievements</h2>
              <button className="modal-close" onClick={() => {
                setShowAchievementModal(false);
                setSelectedFile(null);
                setUploadStatus(null);
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>Upload Excel file with actual sales/achievements from software. Required columns: Dealer Code, Achievement Amount. Optional: Year, Month.</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              {uploadStatus && (
                <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`}>
                  {uploadStatus.message}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowAchievementModal(false);
                setSelectedFile(null);
                setUploadStatus(null);
              }}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={() => handleFileUpload('achievement')}
                disabled={!selectedFile || loading}
              >
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingRecord && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit {editType === 'abp' ? 'ABP Target' : editType === 'forecast' ? 'Forecast Target' : 'Achievement'}</h2>
              <button className="modal-close" onClick={() => {
                setShowEditModal(false);
                setEditingRecord(null);
                setEditValue('');
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="edit-form">
                <div className="form-group">
                  <label>Dealer: {editingRecord.dealer_name} ({editingRecord.dealer_code})</label>
                </div>
                <div className="form-group">
                  <label>Period: {getMonthName(editingRecord.month)} {editingRecord.year}</label>
                </div>
                <div className="form-group">
                  <label>
                    {editType === 'abp' ? 'ABP Target' : editType === 'forecast' ? 'Forecast Target' : 'Achievement'} Amount:
                  </label>
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="Enter amount"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowEditModal(false);
                setEditingRecord(null);
                setEditValue('');
              }}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveEdit}
                disabled={!editValue || parseFloat(editValue) < 0 || loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dealer Breakdown Modal - Enhanced Interactive UI */}
      {showBreakdownModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1200px', width: '95%', maxHeight: '90vh' }}>
            <div className="modal-header">
              <h2>{breakdownType === 'abp' ? 'ABP vs Achievement' : 'Forecast vs Achievement'} - Dealer Breakdown</h2>
              <button className="modal-close" onClick={() => {
                setShowBreakdownModal(false);
                setBreakdownData([]);
                setBreakdownType('');
                setExpandedDealer(null);
                setBreakdownSearchTerm('');
                setSortConfig({ key: null, direction: 'asc' });
              }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Search and Stats Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: '250px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                    <input
                      type="text"
                      placeholder="Search by dealer code, name, or territory..."
                      value={breakdownSearchTerm}
                      onChange={(e) => setBreakdownSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 40px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Showing {getSortedBreakdownData().length} of {breakdownData.length} dealers
                </div>
              </div>

              {breakdownLoading ? (
                <div className="loading">Loading breakdown...</div>
              ) : breakdownData.length === 0 ? (
                <div className="no-data">No data available for selected filters.</div>
              ) : (
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
                  <table className="report-table" style={{ fontSize: '14px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 10 }}>
                      <tr>
                        <th style={{ width: '40px' }}></th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('dealer_code')}
                        >
                          Dealer Code {sortConfig.key === 'dealer_code' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('dealer_name')}
                        >
                          Dealer Name {sortConfig.key === 'dealer_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Territory</th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort(breakdownType === 'abp' ? 'abp_target_amount' : 'forecast_target_amount')}
                        >
                          Target Amount {sortConfig.key === (breakdownType === 'abp' ? 'abp_target_amount' : 'forecast_target_amount') && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('achievement_amount')}
                        >
                          Achievement Amount {sortConfig.key === 'achievement_amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('amount_percentage')}
                        >
                          Amount % {sortConfig.key === 'amount_percentage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort(breakdownType === 'abp' ? 'abp_target_quantity' : 'forecast_target_quantity')}
                        >
                          Target Qty {sortConfig.key === (breakdownType === 'abp' ? 'abp_target_quantity' : 'forecast_target_quantity') && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('achievement_quantity')}
                        >
                          Achievement Qty {sortConfig.key === 'achievement_quantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('quantity_percentage')}
                        >
                          Quantity % {sortConfig.key === 'quantity_percentage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSortedBreakdownData().map((item, index) => {
                        const dealerKey = `${item.dealer_code}-${item.year}-${item.month}`;
                        const isExpanded = expandedDealer === dealerKey;
                        const targetAmount = breakdownType === 'abp' ? (item.abp_target_amount || 0) : (item.forecast_target_amount || 0);
                        const achievementAmount = item.achievement_amount || 0;
                        const amountPercentage = item.amount_percentage || 0;
                        const targetQuantity = breakdownType === 'abp' ? (item.abp_target_quantity || 0) : (item.forecast_target_quantity || 0);
                        const achievementQuantity = item.achievement_quantity || 0;
                        const quantityPercentage = item.quantity_percentage || 0;
                        const details = dealerDetails[dealerKey];
                        
                        return (
                          <React.Fragment key={index}>
                            <tr 
                              style={{ cursor: 'pointer' }}
                              onClick={() => toggleDealerDetails(item.dealer_code, item.year, item.month)}
                              className="dealer-row"
                            >
                              <td>
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              </td>
                              <td><strong>{item.dealer_code}</strong></td>
                              <td>{item.dealer_name}</td>
                              <td>{item.territory_name || 'N/A'}</td>
                              <td>
                                {targetAmount > 0 
                                  ? formatCurrency(targetAmount) 
                                  : <span style={{ color: '#999', fontStyle: 'italic' }}>N/A</span>
                                }
                              </td>
                              <td>
                                {achievementAmount > 0 
                                  ? formatCurrency(achievementAmount) 
                                  : <span style={{ color: '#999', fontStyle: 'italic' }}>No sales</span>
                                }
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className={amountPercentage >= 100 ? 'positive' : amountPercentage >= 80 ? 'warning' : 'negative'}>
                                    {formatPercentage(amountPercentage)}
                                  </span>
                                  <div style={{ 
                                    width: '60px', 
                                    height: '8px', 
                                    background: '#e5e7eb', 
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                  }}>
                                    <div style={{
                                      width: `${Math.min(amountPercentage, 100)}%`,
                                      height: '100%',
                                      background: amountPercentage >= 100 ? '#10b981' : amountPercentage >= 80 ? '#f59e0b' : '#ef4444',
                                      transition: 'width 0.3s'
                                    }} />
                                  </div>
                                </div>
                              </td>
                              <td>
                                {targetQuantity > 0 
                                  ? targetQuantity.toLocaleString() 
                                  : <span style={{ color: '#999', fontStyle: 'italic' }}>N/A</span>
                                }
                              </td>
                              <td>
                                {achievementQuantity > 0 
                                  ? achievementQuantity.toLocaleString() 
                                  : <span style={{ color: '#999', fontStyle: 'italic' }}>No sales</span>
                                }
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className={quantityPercentage >= 100 ? 'positive' : quantityPercentage >= 80 ? 'warning' : 'negative'}>
                                    {formatPercentage(quantityPercentage)}
                                  </span>
                                  <div style={{ 
                                    width: '60px', 
                                    height: '8px', 
                                    background: '#e5e7eb', 
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                  }}>
                                    <div style={{
                                      width: `${Math.min(quantityPercentage, 100)}%`,
                                      height: '100%',
                                      background: quantityPercentage >= 100 ? '#10b981' : quantityPercentage >= 80 ? '#f59e0b' : '#ef4444',
                                      transition: 'width 0.3s'
                                    }} />
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  background: (amountPercentage >= 100 && quantityPercentage >= 100) ? '#d1fae5' : (amountPercentage >= 80 || quantityPercentage >= 80) ? '#fef3c7' : '#fee2e2',
                                  color: (amountPercentage >= 100 && quantityPercentage >= 100) ? '#065f46' : (amountPercentage >= 80 || quantityPercentage >= 80) ? '#92400e' : '#991b1b'
                                }}>
                                  {(amountPercentage >= 100 && quantityPercentage >= 100) ? '✓ On Target' : (amountPercentage >= 80 || quantityPercentage >= 80) ? '⚠ Close' : '✗ Below Target'}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan="11" style={{ padding: '20px', background: '#f9fafb' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {/* Summary Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                      <div style={{ padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Target Quantity</div>
                                        <div style={{ fontSize: '18px', fontWeight: '600' }}>
                                          {formatCurrency(breakdownType === 'abp' ? (item.abp_target_quantity || 0) : (item.forecast_target_quantity || 0))}
                                        </div>
                                      </div>
                                      <div style={{ padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Achievement Quantity</div>
                                        <div style={{ fontSize: '18px', fontWeight: '600' }}>
                                          {formatCurrency(item.achievement_quantity || 0)}
                                        </div>
                                      </div>
                                      <div style={{ padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Quantity %</div>
                                        <div style={{ fontSize: '18px', fontWeight: '600', color: (item.quantity_percentage || 0) >= 100 ? '#10b981' : '#ef4444' }}>
                                          {formatPercentage(item.quantity_percentage || 0)}
                                        </div>
                                      </div>
                                      <div style={{ padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Amount %</div>
                                        <div style={{ fontSize: '18px', fontWeight: '600', color: (item.amount_percentage || 0) >= 100 ? '#10b981' : '#ef4444' }}>
                                          {formatPercentage(item.amount_percentage || 0)}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Application Breakdown */}
                                    {details && !details.error && (
                                      <div>
                                        <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '600' }}>Application-wise Breakdown</h4>
                                        {details.achievement && details.achievement.length > 0 ? (
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
                                            {details.achievement.map((app, idx) => (
                                              <div key={idx} style={{ 
                                                padding: '10px', 
                                                background: 'white', 
                                                borderRadius: '6px', 
                                                border: '1px solid #e5e7eb',
                                                fontSize: '13px'
                                              }}>
                                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{app.application_name || 'Unknown'}</div>
                                                <div style={{ color: '#666', fontSize: '12px' }}>
                                                  Qty: {formatCurrency(app.qty || 0)} | Amount: {formatCurrency(app.amount || 0)}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div style={{ padding: '12px', background: '#fef3c7', borderRadius: '6px', color: '#92400e', fontSize: '13px' }}>
                                            No application-level data available for this dealer.
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {details && details.error && (
                                      <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '6px', color: '#991b1b', fontSize: '13px' }}>
                                        {details.error}
                                      </div>
                                    )}
                                    
                                    {!details && (
                                      <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '6px', color: '#666', fontSize: '13px', textAlign: 'center' }}>
                                        Loading application details...
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowBreakdownModal(false);
                setBreakdownData([]);
                setBreakdownType('');
                setExpandedDealer(null);
                setBreakdownSearchTerm('');
                setSortConfig({ key: null, direction: 'asc' });
              }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TargetVsAchievement;

