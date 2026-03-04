import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Upload, Search, X, TrendingUp, TrendingDown, Target, Calendar, Filter, BarChart3, Download, Edit2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
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
  const [breakdownType, setBreakdownType] = useState(''); // 'abp' or 'forecast'
  const [breakdownData, setBreakdownData] = useState([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedDealer, setExpandedDealer] = useState(null);
  const [dealerDetails, setDealerDetails] = useState({});
  const [breakdownSearchTerm, setBreakdownSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [expandedTerritories, setExpandedTerritories] = useState(new Set());
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'summary', or 'unit-details'
  const [dashboardComparisonType, setDashboardComparisonType] = useState('abp'); // 'abp' or 'forecast' for dashboard
  const [unitDetailsData, setUnitDetailsData] = useState([]);
  const [unitDetailsLoading, setUnitDetailsLoading] = useState(false);
  const [selectedApplicationUnit, setSelectedApplicationUnit] = useState('all');
  const [unitComparisonType, setUnitComparisonType] = useState('abp'); // 'abp' or 'forecast'
  const [availableApplicationUnits, setAvailableApplicationUnits] = useState([]);
  const [expandedUnitTerritories, setExpandedUnitTerritories] = useState(new Set());
  const [isInitialMount, setIsInitialMount] = useState(true);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedTerritory, setSelectedTerritory] = useState('all');
  const [availableYears, setAvailableYears] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [territories, setTerritories] = useState([]);

  const fetchReport = useCallback(async (forceShowAll = false) => {
    setLoading(true);
    try {
      const params = {};
      // For dashboard, always fetch all data
      const shouldShowAll = forceShowAll || showAll || activeTab === 'dashboard';
      if (!shouldShowAll) {
        params.limit = 10;
      }
      params.showAll = shouldShowAll.toString();
      
      // Only add params if they have values (not empty strings)
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.year = parseInt(selectedYear);
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.month = parseInt(selectedMonth);
      }
      if (selectedTerritory && selectedTerritory !== 'all') {
        params.territory = selectedTerritory;
      }
      
      console.log('Fetching report with params:', params);
      console.log('Selected filters:', { selectedYear, selectedMonth, selectedTerritory, activeTab });
      const response = await axios.get('/api/targets/report', { params });
      console.log('Report response:', response.data);
      const data = response.data.data || [];
      console.log('Report data length:', data.length);
      
      // Debug: Check forecast data in response
      if (selectedMonth) {
        const forecastData = data.filter(item => parseFloat(item.forecast_target) > 0);
        console.log(`Forecast data for month ${selectedMonth}: ${forecastData.length} rows with forecast_target > 0`);
        if (forecastData.length > 0) {
          console.log('Sample forecast data:', forecastData.slice(0, 3).map(item => ({
            dealer_code: item.dealer_code,
            dealer_name: item.dealer_name,
            territory_name: item.territory_name,
            forecast_target: item.forecast_target,
            forecast_quantity: item.forecast_quantity,
            achievement: item.achievement
          })));
        } else {
          console.log('WARNING: No forecast data found in response!');
          console.log('Sample data (first 3):', data.slice(0, 3).map(item => ({
            dealer_code: item.dealer_code,
            forecast_target: item.forecast_target,
            forecast_quantity: item.forecast_quantity,
            abp_target: item.abp_target
          })));
        }
      }
      
      setReportData(data);
      setTotalRecords(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching report:', error);
      const errorMessage = error.response?.data?.details || error.response?.data?.error || error.message || 'Failed to fetch target vs achievement report';
      alert(`Failed to fetch target vs achievement report: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [showAll, selectedYear, selectedMonth, selectedTerritory, activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const params = {};
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.year = parseInt(selectedYear);
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.month = parseInt(selectedMonth);
      }
      if (selectedTerritory && selectedTerritory !== 'all') {
        params.territory = selectedTerritory;
      }
      
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

  // Fetch filters and territories on mount
  useEffect(() => {
    fetchFilters();
    fetchTerritories();
  }, [fetchFilters, fetchTerritories]);

  // Fetch report and stats on mount and when filters/tab change
  useEffect(() => {
    // Always fetch data - on mount and when filters/tab change
    if (activeTab === 'dashboard') {
      fetchReport(true);
    } else {
      fetchReport();
    }
    fetchStats();
  }, [selectedYear, selectedMonth, selectedTerritory, showAll, activeTab, fetchReport, fetchStats]);
  
  // Mark initial mount as complete after first render
  useEffect(() => {
    setIsInitialMount(false);
  }, []);

  const handleRefresh = () => {
    fetchFilters();
    fetchTerritories();
    // Force fetch with current filters
    if (activeTab === 'dashboard') {
      fetchReport(true);
    } else {
      fetchReport();
    }
    fetchStats();
    if (breakdownType) {
      fetchBreakdown(breakdownType);
    }
  };

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
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.append('year', parseInt(selectedYear));
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.append('month', parseInt(selectedMonth));
      }
      if (selectedTerritory && selectedTerritory !== 'all') {
        params.append('territory', selectedTerritory);
      }
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

  // Fetch available application units
  const fetchApplicationUnits = useCallback(async (comparisonType) => {
    try {
      const response = await axios.get('/api/targets/application-units', { 
        params: { comparison_type: comparisonType || 'abp' } 
      });
      setAvailableApplicationUnits(response.data.units || []);
    } catch (error) {
      console.error('Error fetching application units:', error);
      setAvailableApplicationUnits([]);
    }
  }, []);

  // Fetch unit details
  const fetchUnitDetails = useCallback(async (comparisonType = unitComparisonType, applicationUnit = selectedApplicationUnit) => {
    setUnitDetailsLoading(true);
    try {
      const params = {
        comparison_type: comparisonType || 'abp'
      };
      
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.year = parseInt(selectedYear);
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.month = parseInt(selectedMonth);
      }
      if (selectedTerritory && selectedTerritory !== 'all') {
        params.territory = selectedTerritory;
      }
      if (applicationUnit && applicationUnit !== 'all') {
        params.application_unit = applicationUnit;
      }
      
      const response = await axios.get('/api/targets/unit-details', { params });
      setUnitDetailsData(response.data.data || []);
    } catch (error) {
      console.error('Error fetching unit details:', error);
      alert('Failed to fetch unit details: ' + (error.response?.data?.error || error.message));
      setUnitDetailsData([]);
    } finally {
      setUnitDetailsLoading(false);
    }
  }, [unitComparisonType, selectedApplicationUnit, selectedYear, selectedMonth, selectedTerritory]);

  // Fetch dealer-wise breakdown
  const fetchBreakdown = useCallback(async (type) => {
    setBreakdownLoading(true);
    setBreakdownType(type);
    setExpandedDealer(null);
    setExpandedTerritories(new Set());
    setBreakdownSearchTerm('');
    setSortConfig({ key: null, direction: 'asc' });
    
    try {
      const params = {};
      // Only add params if they have actual values (not empty strings)
      if (selectedYear && selectedYear !== '' && selectedYear !== 'all') {
        params.year = parseInt(selectedYear);
      }
      if (selectedMonth && selectedMonth !== '' && selectedMonth !== 'all') {
        params.month = parseInt(selectedMonth);
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
      setBreakdownData([]);
      setBreakdownType('');
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

  // Group breakdown data by territory and calculate averages
  const getTerritoryGroupedData = () => {
    if (!breakdownData || breakdownData.length === 0) return [];
    
    // Group by territory
    const territoryMap = {};
    breakdownData.forEach(item => {
      const territoryName = item.territory_name || 'N/A';
      if (!territoryMap[territoryName]) {
        territoryMap[territoryName] = [];
      }
      territoryMap[territoryName].push(item);
    });
    
    // Calculate averages per territory and create territory objects
    const territories = Object.keys(territoryMap).map(territoryName => {
      const dealers = territoryMap[territoryName];
      
      // Calculate totals first
      const totalTargetAmount = dealers.reduce((sum, d) => {
        const target = breakdownType === 'abp' ? (d.abp_target_amount || 0) : (d.forecast_target_amount || 0);
        return sum + parseFloat(target);
      }, 0);
      
      const totalAchievementAmount = dealers.reduce((sum, d) => sum + parseFloat(d.achievement_amount || 0), 0);
      const totalTargetQty = dealers.reduce((sum, d) => {
        const qty = breakdownType === 'abp' ? (d.abp_target_quantity || 0) : (d.forecast_target_quantity || 0);
        return sum + parseFloat(qty);
      }, 0);
      const totalAchievementQty = dealers.reduce((sum, d) => sum + parseFloat(d.achievement_quantity || 0), 0);
      
      // Calculate actual percentages from totals (not averages)
      const actualAmountPercent = totalTargetAmount > 0 
        ? (totalAchievementAmount / totalTargetAmount) * 100 
        : 0;
      
      const actualQtyPercent = totalTargetQty > 0 
        ? (totalAchievementQty / totalTargetQty) * 100 
        : 0;
      
      return {
        territoryName,
        dealers,
        avgAmountPercent: actualAmountPercent, // Using actual percentage, keeping name for compatibility
        avgQtyPercent: actualQtyPercent, // Using actual percentage, keeping name for compatibility
        totalTargetAmount,
        totalAchievementAmount,
        totalTargetQty,
        totalAchievementQty,
        dealerCount: dealers.length
      };
    });
    
    // Sort territories by territory name
    territories.sort((a, b) => {
      if (a.territoryName === 'N/A') return 1;
      if (b.territoryName === 'N/A') return -1;
      return a.territoryName.localeCompare(b.territoryName);
    });
    
    // Apply search filter to territories and their dealers
    if (breakdownSearchTerm) {
      const searchLower = breakdownSearchTerm.toLowerCase();
      return territories.map(territory => {
        const filteredDealers = territory.dealers.filter(item => 
          item.dealer_code?.toLowerCase().includes(searchLower) ||
          item.dealer_name?.toLowerCase().includes(searchLower) ||
          item.territory_name?.toLowerCase().includes(searchLower)
        );
        
        // Only include territory if it matches search or has matching dealers
        if (territory.territoryName.toLowerCase().includes(searchLower) || filteredDealers.length > 0) {
          return { ...territory, dealers: filteredDealers };
        }
        return null;
      }).filter(t => t !== null);
    }
    
    return territories;
  };

  // Toggle territory expansion
  const toggleTerritory = (territoryName) => {
    const newExpanded = new Set(expandedTerritories);
    if (newExpanded.has(territoryName)) {
      newExpanded.delete(territoryName);
    } else {
      newExpanded.add(territoryName);
    }
    setExpandedTerritories(newExpanded);
  };

  // Toggle territory expansion for unit details
  const toggleUnitTerritory = (territoryName) => {
    const newExpanded = new Set(expandedUnitTerritories);
    if (newExpanded.has(territoryName)) {
      newExpanded.delete(territoryName);
    } else {
      newExpanded.add(territoryName);
    }
    setExpandedUnitTerritories(newExpanded);
  };

  // Group unit details data by territory
  const getUnitDetailsTerritoryGroupedData = () => {
    if (!unitDetailsData || unitDetailsData.length === 0) return [];
    
    // Group by territory
    const territoryMap = {};
    unitDetailsData.forEach(item => {
      const territoryName = item.territory_name || 'N/A';
      if (!territoryMap[territoryName]) {
        territoryMap[territoryName] = [];
      }
      territoryMap[territoryName].push(item);
    });
    
    // Calculate totals per territory
    const territories = Object.keys(territoryMap).map(territoryName => {
      const items = territoryMap[territoryName];
      
      const totalTargetQty = items.reduce((sum, d) => sum + parseFloat(d.target_qty || 0), 0);
      const totalAchievementQty = items.reduce((sum, d) => sum + parseFloat(d.achievement_qty || 0), 0);
      const totalTargetAmount = items.reduce((sum, d) => sum + parseFloat(d.target_amount || 0), 0);
      const totalAchievementAmount = items.reduce((sum, d) => sum + parseFloat(d.achievement_amount || 0), 0);
      
      const qtyPercent = totalTargetQty > 0 ? (totalAchievementQty / totalTargetQty) * 100 : 0;
      const amountPercent = totalTargetAmount > 0 ? (totalAchievementAmount / totalTargetAmount) * 100 : 0;
      
      return {
        territoryName,
        items,
        totalTargetQty,
        totalAchievementQty,
        totalQtyGap: totalAchievementQty - totalTargetQty,
        qtyPercent,
        totalTargetAmount,
        totalAchievementAmount,
        totalAmountGap: totalAchievementAmount - totalTargetAmount,
        amountPercent,
        itemCount: items.length,
        uniqueUnits: [...new Set(items.map(i => i.application_unit))].length
      };
    });
    
    // Sort territories by territory name
    territories.sort((a, b) => {
      if (a.territoryName === 'N/A') return 1;
      if (b.territoryName === 'N/A') return -1;
      return a.territoryName.localeCompare(b.territoryName);
    });
    
    return territories;
  };

  // Get sorted and filtered breakdown data (for backward compatibility, but now we use territory grouping)
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
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleRefresh} title="Refresh">
            <RefreshCw size={18} /> Refresh
          </button>
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

      {/* Tabs */}
      <div className="tabs-container" style={{ marginTop: '20px', marginBottom: '20px' }}>
        <div className="tabs" style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e5e7eb', flexWrap: 'wrap' }}>
          <button
            className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('dashboard');
            }}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'dashboard' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'dashboard' ? '#3b82f6' : '#6b7280',
              fontWeight: activeTab === 'dashboard' ? '600' : '400',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            Dashboard
          </button>
          <button
            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('summary');
              setBreakdownType('');
              setBreakdownData([]);
            }}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'summary' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'summary' ? '#3b82f6' : '#6b7280',
              fontWeight: activeTab === 'summary' ? '600' : '400',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            Detailed Summary
          </button>
          <button
            className={`tab ${activeTab === 'unit-details' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('unit-details');
              fetchApplicationUnits(unitComparisonType);
              fetchUnitDetails();
            }}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'unit-details' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'unit-details' ? '#3b82f6' : '#6b7280',
              fontWeight: activeTab === 'unit-details' ? '600' : '400',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            Application Unit Details
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div style={{ marginTop: '20px' }}>
          {/* Both Comparisons Side by Side - No Selector Needed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '50px' }}>
            {/* ABP vs Achievement Section */}
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '30px', color: '#1f2937', textAlign: 'center' }}>
                ABP vs Achievement
              </h2>
              {(() => {
                // Territory-wise average: Calculate percentage for each territory, then average those percentages
                // Use rows where ABP target exists (no forecast override)
                const abpRows = reportData.filter(item => {
                  const forecastTarget = parseFloat(item.forecast_target) || 0;
                  const abpTarget = parseFloat(item.abp_target) || 0;
                  return forecastTarget === 0 && abpTarget > 0; // Only ABP rows, no forecast
                });

                // Group by territory and calculate percentage for each territory
                const territoryMap = {};
                abpRows.forEach(item => {
                  const territory = item.territory_name || 'N/A';
                  if (!territoryMap[territory]) {
                    territoryMap[territory] = {
                      totalTarget: 0,
                      totalAchievement: 0,
                      totalTargetQty: 0,
                      totalAchievementQty: 0
                    };
                  }
                  territoryMap[territory].totalTarget += parseFloat(item.abp_target) || 0;
                  territoryMap[territory].totalAchievement += parseFloat(item.achievement) || 0;
                  territoryMap[territory].totalTargetQty += parseFloat(item.abp_quantity) || 0;
                  territoryMap[territory].totalAchievementQty += parseFloat(item.achievement_quantity) || 0;
                });

                // Calculate percentage for each territory, then average
                const territoryPercentages = Object.values(territoryMap)
                  .filter(t => t.totalTarget > 0)
                  .map(t => ({
                    salesPercent: (t.totalAchievement / t.totalTarget) * 100,
                    qtyPercent: t.totalTargetQty > 0 ? (t.totalAchievementQty / t.totalTargetQty) * 100 : 0
                  }));

                const abpSalesPercent = territoryPercentages.length > 0
                  ? territoryPercentages.reduce((sum, t) => sum + t.salesPercent, 0) / territoryPercentages.length
                  : 0;

                const abpQuantityPercent = territoryPercentages.length > 0
                  ? territoryPercentages.reduce((sum, t) => sum + t.qtyPercent, 0) / territoryPercentages.length
                  : 0;

                return (
                  <>
                    {/* ABP Percentage Cards */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginBottom: '40px', flexWrap: 'wrap' }}>
                      <div style={{ 
                        background: 'white', 
                        padding: '40px 60px', 
                        borderRadius: '12px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        border: '2px solid #e5e7eb',
                        textAlign: 'center',
                        minWidth: '250px'
                      }}>
                        <div style={{ fontSize: '18px', color: '#6b7280', fontWeight: '500', marginBottom: '15px' }}>
                          Sales Achievement %
                        </div>
                        <div style={{ 
                          fontSize: '48px', 
                          fontWeight: '700', 
                          color: abpSalesPercent >= 100 ? '#10b981' : abpSalesPercent >= 80 ? '#f59e0b' : '#ef4444'
                        }}>
                          {formatPercentage(abpSalesPercent)}
                        </div>
                      </div>

                      <div style={{ 
                        background: 'white', 
                        padding: '40px 60px', 
                        borderRadius: '12px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        border: '2px solid #e5e7eb',
                        textAlign: 'center',
                        minWidth: '250px'
                      }}>
                        <div style={{ fontSize: '18px', color: '#6b7280', fontWeight: '500', marginBottom: '15px' }}>
                          Quantity Achievement %
                        </div>
                        <div style={{ 
                          fontSize: '48px', 
                          fontWeight: '700', 
                          color: abpQuantityPercent >= 100 ? '#10b981' : abpQuantityPercent >= 80 ? '#f59e0b' : '#ef4444'
                        }}>
                          {formatPercentage(abpQuantityPercent)}
                        </div>
                      </div>
                    </div>

                    {/* ABP Charts */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                      {/* ABP Sales Chart */}
                      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Sales Achievement Percentage by Territory (ABP)</h3>
                        {(() => {
                          if (reportData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280' }}>No data available</p>
                              </div>
                            );
                          }

                          // Calculate average percentage per territory (average of individual dealer percentages)
                          const territoryMap = {};
                          reportData.forEach(item => {
                            const territory = item.territory_name || 'N/A';
                            const forecastTarget = parseFloat(item.forecast_target) || 0;
                            const abpTarget = parseFloat(item.abp_target) || 0;
                            const achievement = parseFloat(item.achievement) || 0;
                            
                            // Only process ABP rows (no forecast override)
                            if (forecastTarget === 0 && abpTarget > 0) {
                              if (!territoryMap[territory]) {
                                territoryMap[territory] = { territory: territory, percentages: [] };
                              }
                              const dealerPercent = (achievement / abpTarget) * 100;
                              territoryMap[territory].percentages.push(dealerPercent);
                            }
                          });

                          const territoryData = Object.values(territoryMap)
                            .filter(t => t.percentages.length > 0)
                            .map(t => {
                              const avgPercent = t.percentages.reduce((sum, p) => sum + p, 0) / t.percentages.length;
                              return {
                                name: t.territory.length > 15 ? t.territory.substring(0, 15) + '...' : t.territory,
                                fullName: t.territory,
                                amountPercent: parseFloat(avgPercent.toFixed(2))
                              };
                            });

                          if (territoryData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280' }}>No territory data available</p>
                              </div>
                            );
                          }

                          return (
                            <ResponsiveContainer width="100%" height={350}>
                              <BarChart data={territoryData.sort((a, b) => b.amountPercent - a.amountPercent)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                                <YAxis domain={[0, 120]} />
                                <Tooltip 
                                  formatter={(value) => `${parseFloat(value).toFixed(2)}%`}
                                  labelFormatter={(label, payload) => payload && payload[0] ? payload[0].payload.fullName : label}
                                />
                                <Legend />
                                <Bar dataKey="amountPercent" name="Sales Achievement %">
                                  {territoryData.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.amountPercent >= 100 ? '#10b981' : entry.amountPercent >= 80 ? '#f59e0b' : '#ef4444'} 
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>

                      {/* ABP Quantity Chart */}
                      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Quantity Achievement Percentage by Territory (ABP)</h3>
                        {(() => {
                          if (reportData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280' }}>No data available</p>
                              </div>
                            );
                          }

                          // Calculate average percentage per territory (average of individual dealer percentages)
                          const territoryMap = {};
                          reportData.forEach(item => {
                            const territory = item.territory_name || 'N/A';
                            const forecastTarget = parseFloat(item.forecast_target) || 0;
                            const abpQty = parseFloat(item.abp_quantity) || 0;
                            const achievementQty = parseFloat(item.achievement_quantity) || 0;
                            
                            // Only process ABP rows (no forecast override)
                            if (forecastTarget === 0 && abpQty > 0) {
                              if (!territoryMap[territory]) {
                                territoryMap[territory] = { territory: territory, percentages: [] };
                              }
                              const dealerPercent = (achievementQty / abpQty) * 100;
                              territoryMap[territory].percentages.push(dealerPercent);
                            }
                          });

                          const territoryData = Object.values(territoryMap)
                            .filter(t => t.percentages.length > 0)
                            .map(t => {
                              const avgPercent = t.percentages.reduce((sum, p) => sum + p, 0) / t.percentages.length;
                              return {
                                name: t.territory.length > 15 ? t.territory.substring(0, 15) + '...' : t.territory,
                                fullName: t.territory,
                                qtyPercent: parseFloat(avgPercent.toFixed(2))
                              };
                            });

                          if (territoryData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280' }}>No territory data available</p>
                              </div>
                            );
                          }

                          return (
                            <ResponsiveContainer width="100%" height={350}>
                              <BarChart data={territoryData.sort((a, b) => b.qtyPercent - a.qtyPercent)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                                <YAxis domain={[0, 120]} />
                                <Tooltip 
                                  formatter={(value) => `${parseFloat(value).toFixed(2)}%`}
                                  labelFormatter={(label, payload) => payload && payload[0] ? payload[0].payload.fullName : label}
                                />
                                <Legend />
                                <Bar dataKey="qtyPercent" name="Quantity Achievement %">
                                  {territoryData.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.qtyPercent >= 100 ? '#10b981' : entry.qtyPercent >= 80 ? '#f59e0b' : '#ef4444'} 
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Forecast vs Achievement Section */}
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '30px', color: '#1f2937', textAlign: 'center' }}>
                Forecast vs Achievement
              </h2>
              {(() => {
                // Territory-wise average: Calculate percentage for each territory, then average those percentages
                // Use rows where Forecast target exists
                const forecastRows = reportData.filter(item => {
                  const forecastTarget = parseFloat(item.forecast_target) || 0;
                  return forecastTarget > 0; // Any row with forecast target
                });

                // Group by territory and calculate percentage for each territory
                const territoryMap = {};
                forecastRows.forEach(item => {
                  const territory = item.territory_name || 'N/A';
                  if (!territoryMap[territory]) {
                    territoryMap[territory] = {
                      totalTarget: 0,
                      totalAchievement: 0,
                      totalTargetQty: 0,
                      totalAchievementQty: 0
                    };
                  }
                  territoryMap[territory].totalTarget += parseFloat(item.forecast_target) || 0;
                  territoryMap[territory].totalAchievement += parseFloat(item.achievement) || 0;
                  territoryMap[territory].totalTargetQty += parseFloat(item.forecast_quantity) || 0;
                  territoryMap[territory].totalAchievementQty += parseFloat(item.achievement_quantity) || 0;
                });

                // Calculate percentage for each territory, then average
                const territoryPercentages = Object.values(territoryMap)
                  .filter(t => t.totalTarget > 0)
                  .map(t => ({
                    salesPercent: (t.totalAchievement / t.totalTarget) * 100,
                    qtyPercent: t.totalTargetQty > 0 ? (t.totalAchievementQty / t.totalTargetQty) * 100 : 0
                  }));

                const forecastSalesPercent = territoryPercentages.length > 0
                  ? territoryPercentages.reduce((sum, t) => sum + t.salesPercent, 0) / territoryPercentages.length
                  : 0;

                const forecastQuantityPercent = territoryPercentages.length > 0
                  ? territoryPercentages.reduce((sum, t) => sum + t.qtyPercent, 0) / territoryPercentages.length
                  : 0;

                return (
                  <>
                    {/* Forecast Percentage Cards */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginBottom: '40px', flexWrap: 'wrap' }}>
                      <div style={{ 
                        background: 'white', 
                        padding: '40px 60px', 
                        borderRadius: '12px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        border: '2px solid #e5e7eb',
                        textAlign: 'center',
                        minWidth: '250px'
                      }}>
                        <div style={{ fontSize: '18px', color: '#6b7280', fontWeight: '500', marginBottom: '15px' }}>
                          Sales Achievement %
                        </div>
                        <div style={{ 
                          fontSize: '48px', 
                          fontWeight: '700', 
                          color: forecastSalesPercent >= 100 ? '#10b981' : forecastSalesPercent >= 80 ? '#f59e0b' : '#ef4444'
                        }}>
                          {formatPercentage(forecastSalesPercent)}
                        </div>
                      </div>

                      <div style={{ 
                        background: 'white', 
                        padding: '40px 60px', 
                        borderRadius: '12px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        border: '2px solid #e5e7eb',
                        textAlign: 'center',
                        minWidth: '250px'
                      }}>
                        <div style={{ fontSize: '18px', color: '#6b7280', fontWeight: '500', marginBottom: '15px' }}>
                          Quantity Achievement %
                        </div>
                        <div style={{ 
                          fontSize: '48px', 
                          fontWeight: '700', 
                          color: forecastQuantityPercent >= 100 ? '#10b981' : forecastQuantityPercent >= 80 ? '#f59e0b' : '#ef4444'
                        }}>
                          {formatPercentage(forecastQuantityPercent)}
                        </div>
                      </div>
                    </div>

                    {/* Forecast Charts */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginBottom: '30px' }}>
                      {/* Forecast Sales Chart */}
                      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Sales Achievement Percentage by Territory (Forecast)</h3>
                        {(() => {
                          if (reportData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280' }}>No data available</p>
                              </div>
                            );
                          }

                          // Calculate average percentage per territory (average of individual dealer percentages)
                          const territoryMap = {};
                          reportData.forEach(item => {
                            const territory = item.territory_name || 'N/A';
                            const forecastTarget = parseFloat(item.forecast_target) || 0;
                            const achievement = parseFloat(item.achievement) || 0;
                            
                            // Only process Forecast rows
                            if (forecastTarget > 0) {
                              if (!territoryMap[territory]) {
                                territoryMap[territory] = { territory: territory, percentages: [], totalTarget: 0, totalAchievement: 0 };
                              }
                              const dealerPercent = (achievement / forecastTarget) * 100;
                              territoryMap[territory].percentages.push(dealerPercent);
                              territoryMap[territory].totalTarget += forecastTarget;
                              territoryMap[territory].totalAchievement += achievement;
                            }
                          });

                          // Check if there's any Forecast data at all
                          const hasForecastData = reportData.some(item => parseFloat(item.forecast_target) > 0);
                          
                          const territoryData = Object.values(territoryMap)
                            .filter(t => t.percentages.length > 0)
                            .map(t => {
                              const avgPercent = t.percentages.reduce((sum, p) => sum + p, 0) / t.percentages.length;
                              return {
                                name: t.territory.length > 15 ? t.territory.substring(0, 15) + '...' : t.territory,
                                fullName: t.territory,
                                amountPercent: parseFloat(avgPercent.toFixed(2))
                              };
                            });

                          if (territoryData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '10px' }}>
                                  {hasForecastData 
                                    ? 'No territory data available for the selected filters'
                                    : `No Forecast data available for ${selectedMonth ? `Month ${selectedMonth}` : 'the selected month'}. Please select a different month or check if Forecast data has been uploaded.`}
                                </p>
                                {selectedMonth && (
                                  <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                                    Selected: Year {selectedYear || 'All'}, Month {selectedMonth}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          // Add target and achievement data to territoryData for tooltip
                          const territoryDataWithDetails = territoryData.map(t => {
                            const territoryInfo = territoryMap[t.fullName];
                            return {
                              ...t,
                              target: territoryInfo?.totalTarget || 0,
                              achievement: territoryInfo?.totalAchievement || 0
                            };
                          });

                          return (
                            <ResponsiveContainer width="100%" height={350}>
                              <BarChart data={territoryDataWithDetails.sort((a, b) => b.amountPercent - a.amountPercent)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                                <YAxis domain={[0, 120]} />
                                <Tooltip 
                                  formatter={(value, name, props) => {
                                    const percent = parseFloat(value).toFixed(2);
                                    const target = props.payload?.target || 0;
                                    const achievement = props.payload?.achievement || 0;
                                    return [
                                      `${percent}%`,
                                      `Target: ${target.toLocaleString()}, Achievement: ${achievement.toLocaleString()}`
                                    ];
                                  }}
                                  labelFormatter={(label, payload) => payload && payload[0] ? payload[0].payload.fullName : label}
                                />
                                <Legend />
                                <Bar dataKey="amountPercent" name="Sales Achievement %" minPointSize={1}>
                                  {territoryDataWithDetails.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.amountPercent >= 100 ? '#10b981' : entry.amountPercent >= 80 ? '#f59e0b' : '#ef4444'} 
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>

                      {/* Forecast Quantity Chart */}
                      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>Quantity Achievement Percentage by Territory (Forecast)</h3>
                        {(() => {
                          if (reportData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280' }}>No data available</p>
                              </div>
                            );
                          }

                          // Calculate average percentage per territory (average of individual dealer percentages)
                          const territoryMap = {};
                          reportData.forEach(item => {
                            const territory = item.territory_name || 'N/A';
                            const forecastQty = parseFloat(item.forecast_quantity) || 0;
                            const achievementQty = parseFloat(item.achievement_quantity) || 0;
                            
                            // Only process Forecast rows
                            if (forecastQty > 0) {
                              if (!territoryMap[territory]) {
                                territoryMap[territory] = { territory: territory, percentages: [], totalTargetQty: 0, totalAchievementQty: 0 };
                              }
                              const dealerPercent = (achievementQty / forecastQty) * 100;
                              territoryMap[territory].percentages.push(dealerPercent);
                              territoryMap[territory].totalTargetQty += forecastQty;
                              territoryMap[territory].totalAchievementQty += achievementQty;
                            }
                          });

                          // Check if there's any Forecast quantity data at all
                          const hasForecastQtyData = reportData.some(item => parseFloat(item.forecast_quantity) > 0);
                          
                          const territoryData = Object.values(territoryMap)
                            .filter(t => t.percentages.length > 0)
                            .map(t => {
                              const avgPercent = t.percentages.reduce((sum, p) => sum + p, 0) / t.percentages.length;
                              return {
                                name: t.territory.length > 15 ? t.territory.substring(0, 15) + '...' : t.territory,
                                fullName: t.territory,
                                qtyPercent: parseFloat(avgPercent.toFixed(2))
                              };
                            });

                          if (territoryData.length === 0) {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '10px' }}>
                                  {hasForecastQtyData 
                                    ? 'No territory data available for the selected filters'
                                    : `No Forecast quantity data available for ${selectedMonth ? `Month ${selectedMonth}` : 'the selected month'}. Please select a different month or check if Forecast data has been uploaded.`}
                                </p>
                                {selectedMonth && (
                                  <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                                    Selected: Year {selectedYear || 'All'}, Month {selectedMonth}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          // Add target and achievement data to territoryData for tooltip
                          const territoryDataWithDetails = territoryData.map(t => {
                            const territoryInfo = territoryMap[t.fullName];
                            return {
                              ...t,
                              targetQty: territoryInfo?.totalTargetQty || 0,
                              achievementQty: territoryInfo?.totalAchievementQty || 0
                            };
                          });

                          return (
                            <ResponsiveContainer width="100%" height={350}>
                              <BarChart data={territoryDataWithDetails.sort((a, b) => b.qtyPercent - a.qtyPercent)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                                <YAxis domain={[0, 120]} />
                                <Tooltip 
                                  formatter={(value, name, props) => {
                                    const percent = parseFloat(value).toFixed(2);
                                    const targetQty = props.payload?.targetQty || 0;
                                    const achievementQty = props.payload?.achievementQty || 0;
                                    return [
                                      `${percent}%`,
                                      `Target: ${targetQty.toLocaleString()}, Achievement: ${achievementQty.toLocaleString()}`
                                    ];
                                  }}
                                  labelFormatter={(label, payload) => payload && payload[0] ? payload[0].payload.fullName : label}
                                />
                                <Legend />
                                <Bar dataKey="qtyPercent" name="Quantity Achievement %" minPointSize={1}>
                                  {territoryDataWithDetails.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.qtyPercent >= 100 ? '#10b981' : entry.qtyPercent >= 80 ? '#f59e0b' : '#ef4444'} 
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'summary' && (
        <>
          {/* View Options */}
          <div className="view-options" style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '20px', marginBottom: '40px', flexWrap: 'wrap' }}>
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
        </>
      )}

      {activeTab === 'unit-details' && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="filter-group">
              <label>Comparison Type:</label>
              <select 
                value={unitComparisonType} 
                onChange={(e) => {
                  setUnitComparisonType(e.target.value);
                  fetchApplicationUnits(e.target.value);
                  fetchUnitDetails(e.target.value);
                }}
              >
                <option value="abp">ABP vs Achievement</option>
                <option value="forecast">Forecast vs Achievement</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Application Unit:</label>
              <select 
                value={selectedApplicationUnit} 
                onChange={(e) => {
                  setSelectedApplicationUnit(e.target.value);
                  fetchUnitDetails(unitComparisonType, e.target.value);
                }}
              >
                <option value="all">All Units</option>
                {availableApplicationUnits.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '14px', color: '#666' }}>
              {(() => {
                const territoryData = getUnitDetailsTerritoryGroupedData();
                const totalItems = territoryData.reduce((sum, t) => sum + t.itemCount, 0);
                return `${territoryData.length} territories, ${totalItems} records`;
              })()}
            </div>
          </div>
          
          {unitDetailsLoading ? (
            <div className="loading">Loading unit details...</div>
          ) : unitDetailsData.length === 0 ? (
            <div className="no-data">No unit details available for selected filters.</div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}>
              <table className="report-table" style={{ fontSize: '14px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 10 }}>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Territory / Dealer</th>
                    <th>Application Unit</th>
                    <th>Target Qty</th>
                    <th>Achievement Qty</th>
                    <th>Qty Gap</th>
                    <th>Qty %</th>
                    <th>Target Amount</th>
                    <th>Achievement</th>
                    <th>Amount Gap</th>
                    <th>Amount %</th>
                  </tr>
                </thead>
                <tbody>
                  {getUnitDetailsTerritoryGroupedData().map((territory, territoryIndex) => {
                    const isTerritoryExpanded = expandedUnitTerritories.has(territory.territoryName);
                    
                    return (
                      <React.Fragment key={`unit-territory-${territoryIndex}`}>
                        {/* Territory Row */}
                        <tr
                          style={{ 
                            cursor: 'pointer',
                            backgroundColor: '#e0e7ff',
                            fontWeight: '600'
                          }}
                          onClick={() => toggleUnitTerritory(territory.territoryName)}
                          className="territory-row"
                        >
                          <td>{isTerritoryExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</td>
                          <td colSpan="2">
                            <strong>{territory.territoryName}</strong>
                            <span style={{ marginLeft: '12px', fontSize: '12px', fontWeight: 'normal', color: '#6b7280' }}>
                              ({territory.itemCount} records, {territory.uniqueUnits} units)
                            </span>
                          </td>
                          <td>{territory.totalTargetQty.toLocaleString()}</td>
                          <td>{territory.totalAchievementQty.toLocaleString()}</td>
                          <td style={{ color: territory.totalQtyGap < 0 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                            {territory.totalQtyGap.toLocaleString()}
                          </td>
                          <td>
                            <span className={territory.qtyPercent >= 100 ? 'positive' : territory.qtyPercent >= 80 ? 'warning' : 'negative'}>
                              {territory.qtyPercent.toFixed(2)}%
                            </span>
                          </td>
                          <td>{territory.totalTargetAmount.toLocaleString()}</td>
                          <td>{territory.totalAchievementAmount.toLocaleString()}</td>
                          <td style={{ color: territory.totalAmountGap < 0 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                            {territory.totalAmountGap.toLocaleString()}
                          </td>
                          <td>
                            <span className={territory.amountPercent >= 100 ? 'positive' : territory.amountPercent >= 80 ? 'warning' : 'negative'}>
                              {territory.amountPercent.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                        
                        {/* Items under Territory (when expanded) */}
                        {isTerritoryExpanded && territory.items.map((row, itemIndex) => (
                          <tr key={`unit-item-${territoryIndex}-${itemIndex}`} style={{ backgroundColor: '#f9fafb' }}>
                            <td></td>
                            <td>
                              <div style={{ paddingLeft: '10px' }}>
                                <strong>{row.dealer_code}</strong>
                                <span style={{ marginLeft: '8px', color: '#6b7280' }}>{row.dealer_name}</span>
                              </div>
                            </td>
                            <td>{row.application_unit}</td>
                            <td>{row.target_qty?.toLocaleString() || 0}</td>
                            <td>{row.achievement_qty?.toLocaleString() || 0}</td>
                            <td style={{ color: row.qty_gap < 0 ? '#ef4444' : '#10b981' }}>
                              {row.qty_gap?.toLocaleString() || 0}
                            </td>
                            <td>{typeof row.qty_percentage === 'number' ? row.qty_percentage.toFixed(2) : (parseFloat(row.qty_percentage) || 0).toFixed(2)}%</td>
                            <td>{row.target_amount?.toLocaleString() || 0}</td>
                            <td>{row.achievement_amount?.toLocaleString() || 0}</td>
                            <td style={{ color: row.amount_gap < 0 ? '#ef4444' : '#10b981' }}>
                              {row.amount_gap?.toLocaleString() || 0}
                            </td>
                            <td>{typeof row.amount_percentage === 'number' ? row.amount_percentage.toFixed(2) : (parseFloat(row.amount_percentage) || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Breakdown (inline, no popup) - Only show in Summary tab */}
      {activeTab === 'summary' && breakdownType && (
        <div style={{ marginTop: '10px', marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>
              {breakdownType === 'abp' ? 'ABP vs Achievement' : 'Forecast vs Achievement'} - Dealer Breakdown
            </h2>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setBreakdownType('');
                setBreakdownData([]);
                setExpandedDealer(null);
                setExpandedTerritories(new Set());
                setBreakdownSearchTerm('');
                setSortConfig({ key: null, direction: 'asc' });
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
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
              {(() => {
                const territoryData = getTerritoryGroupedData();
                const totalDealers = territoryData.reduce((sum, t) => sum + t.dealerCount, 0);
                return `Showing ${territoryData.length} territories, ${totalDealers} dealers`;
              })()}
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
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
                      <th>Territory / Dealer Code</th>
                      <th>Dealer Name</th>
                      <th>Target Amount</th>
                      <th>Achievement Amount</th>
                      <th>Amount %</th>
                      <th>Target Qty</th>
                      <th>Achievement Qty</th>
                      <th>Quantity Gap</th>
                      <th>Quantity %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getTerritoryGroupedData().map((territory, territoryIndex) => {
                      const isTerritoryExpanded = expandedTerritories.has(territory.territoryName);
                      
                      return (
                        <React.Fragment key={`territory-${territoryIndex}`}>
                          {/* Territory Row */}
                          <tr
                            style={{ 
                              cursor: 'pointer',
                              backgroundColor: '#e0e7ff',
                              fontWeight: '600'
                            }}
                            onClick={() => toggleTerritory(territory.territoryName)}
                            className="territory-row"
                          >
                            <td>{isTerritoryExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</td>
                            <td colSpan="2">
                              <strong>{territory.territoryName}</strong>
                              <span style={{ marginLeft: '12px', fontSize: '12px', fontWeight: 'normal', color: '#6b7280' }}>
                                ({territory.dealerCount} {territory.dealerCount === 1 ? 'dealer' : 'dealers'})
                              </span>
                            </td>
                            <td>{formatCurrency(territory.totalTargetAmount)}</td>
                            <td>{formatCurrency(territory.totalAchievementAmount)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={territory.avgAmountPercent >= 100 ? 'positive' : territory.avgAmountPercent >= 80 ? 'warning' : 'negative'}>
                                  {formatPercentage(territory.avgAmountPercent)}
                                </span>
                                <div style={{ width: '60px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${Math.min(territory.avgAmountPercent, 100)}%`,
                                    height: '100%',
                                    background: territory.avgAmountPercent >= 100 ? '#10b981' : territory.avgAmountPercent >= 80 ? '#f59e0b' : '#ef4444',
                                    transition: 'width 0.3s'
                                  }} />
                                </div>
                              </div>
                            </td>
                            <td>{formatCurrency(territory.totalTargetQty)}</td>
                            <td>{formatCurrency(territory.totalAchievementQty)}</td>
                            <td style={{ color: '#999', fontStyle: 'italic' }}>-</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={territory.avgQtyPercent >= 100 ? 'positive' : territory.avgQtyPercent >= 80 ? 'warning' : 'negative'}>
                                  {formatPercentage(territory.avgQtyPercent)}
                                </span>
                                <div style={{ width: '60px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${Math.min(territory.avgQtyPercent, 100)}%`,
                                    height: '100%',
                                    background: territory.avgQtyPercent >= 100 ? '#10b981' : territory.avgQtyPercent >= 80 ? '#f59e0b' : '#ef4444',
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
                                background: (territory.avgAmountPercent >= 100 && territory.avgQtyPercent >= 100) ? '#d1fae5' : (territory.avgAmountPercent >= 80 || territory.avgQtyPercent >= 80) ? '#fef3c7' : '#fee2e2',
                                color: (territory.avgAmountPercent >= 100 && territory.avgQtyPercent >= 100) ? '#065f46' : (territory.avgAmountPercent >= 80 || territory.avgQtyPercent >= 80) ? '#92400e' : '#991b1b'
                              }}>
                                {(territory.avgAmountPercent >= 100 && territory.avgQtyPercent >= 100) ? '✓ On Target' : (territory.avgAmountPercent >= 80 || territory.avgQtyPercent >= 80) ? '⚠ Close' : '✗ Below Target'}
                              </span>
                            </td>
                          </tr>
                          
                          {/* Dealers under Territory (when expanded) */}
                          {isTerritoryExpanded && territory.dealers.map((item, dealerIndex) => {
                            const dealerKey = `${item.dealer_code}-${item.year}-${item.month}`;
                            const isExpanded = expandedDealer === dealerKey;
                            const targetAmount = breakdownType === 'abp' ? (item.abp_target_amount || 0) : (item.forecast_target_amount || 0);
                            const achievementAmount = item.achievement_amount || 0;
                            const amountPercentage = item.amount_percentage || 0;
                            const targetQuantity = breakdownType === 'abp' ? (item.abp_target_quantity || 0) : (item.forecast_target_quantity || 0);
                            const achievementQuantity = item.achievement_quantity || 0;
                            const quantityGap = targetQuantity - achievementQuantity;
                            const quantityPercentage = item.quantity_percentage || 0;
                            const details = dealerDetails[dealerKey];

                            return (
                              <React.Fragment key={`dealer-${territoryIndex}-${dealerIndex}`}>
                                <tr
                                  style={{ cursor: 'pointer', backgroundColor: '#f9fafb' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDealerDetails(item.dealer_code, item.year, item.month);
                                  }}
                                  className="dealer-row"
                                >
                                  <td>{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</td>
                                  <td><strong>{item.dealer_code}</strong></td>
                                  <td>{item.dealer_name}</td>
                                  <td>{targetAmount > 0 ? formatCurrency(targetAmount) : <span style={{ color: '#999', fontStyle: 'italic' }}>N/A</span>}</td>
                                  <td>{achievementAmount > 0 ? formatCurrency(achievementAmount) : <span style={{ color: '#999', fontStyle: 'italic' }}>No sales</span>}</td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span className={amountPercentage >= 100 ? 'positive' : amountPercentage >= 80 ? 'warning' : 'negative'}>
                                        {formatPercentage(amountPercentage)}
                                      </span>
                                      <div style={{ width: '60px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                          width: `${Math.min(amountPercentage, 100)}%`,
                                          height: '100%',
                                          background: amountPercentage >= 100 ? '#10b981' : amountPercentage >= 80 ? '#f59e0b' : '#ef4444',
                                          transition: 'width 0.3s'
                                        }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td>{targetQuantity > 0 ? targetQuantity.toLocaleString() : <span style={{ color: '#999', fontStyle: 'italic' }}>N/A</span>}</td>
                                  <td>{achievementQuantity > 0 ? achievementQuantity.toLocaleString() : <span style={{ color: '#999', fontStyle: 'italic' }}>No sales</span>}</td>
                                  <td>
                                    {targetQuantity > 0 ? (
                                      <span style={{ 
                                        color: quantityGap >= 0 ? '#ef4444' : '#10b981',
                                        fontWeight: '600'
                                      }}>
                                        {quantityGap >= 0 ? '-' : '+'}{Math.abs(quantityGap).toLocaleString()}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#999', fontStyle: 'italic' }}>N/A</span>
                                    )}
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span className={quantityPercentage >= 100 ? 'positive' : quantityPercentage >= 80 ? 'warning' : 'negative'}>
                                        {formatPercentage(quantityPercentage)}
                                      </span>
                                      <div style={{ width: '60px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
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
                                    <td colSpan="11" style={{ padding: '20px', background: '#f3f4f6' }}>
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
                                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Quantity Gap</div>
                                      <div style={{ fontSize: '18px', fontWeight: '600', color: quantityGap >= 0 ? '#ef4444' : '#10b981' }}>
                                        {quantityGap >= 0 ? '-' : '+'}{formatCurrency(Math.abs(quantityGap))}
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
                                            <div key={idx} style={{ padding: '10px', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '13px' }}>
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
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

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

    </div>
  );
};

export default TargetVsAchievement;

