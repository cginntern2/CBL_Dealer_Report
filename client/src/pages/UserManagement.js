import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Plus, Edit2, Trash2, Search, RefreshCw, X } from 'lucide-react';
import './UserManagement.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role_name: 'sales_manager',
    dealer_code: ''
  });
  const [dealers, setDealers] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchUsers();
    fetchDealers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setStatus({ type: 'error', message: 'Failed to fetch users' });
    } finally {
      setLoading(false);
    }
  };

  const fetchDealers = async () => {
    try {
      const response = await axios.get('/api/dealers');
      setDealers(response.data.dealers || []);
    } catch (error) {
      console.error('Error fetching dealers:', error);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/api/users', formData);
      setStatus({ type: 'success', message: 'User created successfully' });
      setShowAddModal(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.error || 'Failed to create user' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.put(`/api/users/${editingUser.id}`, formData);
      setStatus({ type: 'success', message: 'User updated successfully' });
      setShowEditModal(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.error || 'Failed to update user' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    setLoading(true);
    try {
      await axios.delete(`/api/users/${userId}`);
      setStatus({ type: 'success', message: 'User deleted successfully' });
      fetchUsers();
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.error || 'Failed to delete user' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // Don't pre-fill password
      full_name: user.full_name || '',
      role_name: user.role,
      dealer_code: user.dealer_code || ''
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      full_name: '',
      role_name: 'sales_manager',
      dealer_code: ''
    });
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.username?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.role?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="user-management">
      <div className="page-header">
        <h1 className="page-title">
          <Users size={24} /> User Management
        </h1>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={fetchUsers}
            title="Refresh"
          >
            <RefreshCw size={18} /> Refresh
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
          >
            <Plus size={18} /> Add User
          </button>
        </div>
      </div>

      {status && (
        <div className={`status-message ${status.type}`}>
          {status.message}
          <button onClick={() => setStatus(null)}><X size={16} /></button>
        </div>
      )}

      <div className="search-section">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search users by name, email, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Full Name</th>
              <th>Role</th>
              <th>Dealer Code</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>
                  Loading...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>{user.full_name || '-'}</td>
                  <td>
                    <span className={`role-badge role-${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>{user.dealer_code || '-'}</td>
                  <td>
                    <span className={user.is_active ? 'status-active' : 'status-inactive'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
                  <td className="actions-cell">
                    <button 
                      className="icon-btn edit-btn"
                      onClick={() => handleEditClick(user)}
                      title="Edit User"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      className="icon-btn delete-btn"
                      onClick={() => handleDeleteUser(user.id)}
                      title="Delete User"
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

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New User</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
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
              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select
                  value={formData.role_name}
                  onChange={(e) => setFormData({ ...formData, role_name: e.target.value, dealer_code: e.target.value === 'dealer' ? formData.dealer_code : '' })}
                  required
                >
                  <option value="admin">Admin</option>
                  <option value="sales_official">Sales Official</option>
                  <option value="sales_manager">Sales Manager</option>
                  <option value="dealer">Dealer</option>
                </select>
              </div>
              {formData.role_name === 'dealer' && (
                <div className="form-group">
                  <label>Dealer Code *</label>
                  <select
                    value={formData.dealer_code}
                    onChange={(e) => setFormData({ ...formData, dealer_code: e.target.value })}
                    required
                  >
                    <option value="">Select Dealer</option>
                    {dealers.map(dealer => (
                      <option key={dealer.dealer_code} value={dealer.dealer_code}>
                        {dealer.dealer_code} - {dealer.dealer_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit User</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditUser}>
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
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
              <div className="form-group">
                <label>Password {formData.password && '(leave blank to keep current)'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter new password or leave blank"
                />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select
                  value={formData.role_name}
                  onChange={(e) => setFormData({ ...formData, role_name: e.target.value, dealer_code: e.target.value === 'dealer' ? formData.dealer_code : '' })}
                  required
                >
                  <option value="admin">Admin</option>
                  <option value="sales_official">Sales Official</option>
                  <option value="sales_manager">Sales Manager</option>
                  <option value="dealer">Dealer</option>
                </select>
              </div>
              {formData.role_name === 'dealer' && (
                <div className="form-group">
                  <label>Dealer Code *</label>
                  <select
                    value={formData.dealer_code}
                    onChange={(e) => setFormData({ ...formData, dealer_code: e.target.value })}
                    required
                  >
                    <option value="">Select Dealer</option>
                    {dealers.map(dealer => (
                      <option key={dealer.dealer_code} value={dealer.dealer_code}>
                        {dealer.dealer_code} - {dealer.dealer_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

