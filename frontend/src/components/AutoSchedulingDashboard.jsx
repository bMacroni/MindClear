import React, { useState, useEffect } from 'react';
import { tasksAPI } from '../services/api';

const AutoSchedulingDashboard = ({ showSuccess }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPreferencesForm, setShowPreferencesForm] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchPreferences();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await tasksAPI.getAutoSchedulingDashboard();
      setDashboardData(response.data);
    } catch (err) {
      setError('Failed to load auto-scheduling dashboard');
    }
  };

  const fetchPreferences = async () => {
    try {
      const response = await tasksAPI.getUserSchedulingPreferences();
      setPreferences(response.data);
    } catch (err) {
      // Silent fail for preferences
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAutoScheduling = async () => {
    setTriggering(true);
    try {
      const response = await tasksAPI.triggerAutoScheduling();
      showSuccess(`Auto-scheduling completed! ${response.data.successful} tasks scheduled successfully.`);
      fetchDashboardData(); // Refresh dashboard data
    } catch (err) {
      setError('Failed to trigger auto-scheduling');
    } finally {
      setTriggering(false);
    }
  };

  const handleUpdatePreferences = async (updatedPreferences) => {
    try {
      await tasksAPI.updateUserSchedulingPreferences(updatedPreferences);
      setPreferences(updatedPreferences);
      setShowPreferencesForm(false);
      showSuccess('Scheduling preferences updated successfully!');
    } catch (err) {
      setError('Failed to update preferences');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Auto-Scheduling Dashboard</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowPreferencesForm(true)}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Preferences
          </button>
          <button
            onClick={handleTriggerAutoScheduling}
            disabled={triggering}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {triggering ? 'Scheduling...' : 'Trigger Auto-Scheduling'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg relative group cursor-help">
            <div className="text-2xl font-bold text-blue-600">{dashboardData.total_tasks || 0}</div>
            <div className="text-sm text-blue-800">Total Tasks</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              All tasks in your system
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg relative group cursor-help">
            <div className="text-2xl font-bold text-green-600">{dashboardData.auto_scheduled_tasks || 0}</div>
            <div className="text-sm text-green-800">Auto-Scheduled</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              Tasks with auto-scheduling enabled
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg relative group cursor-help">
            <div className="text-2xl font-bold text-yellow-600">{dashboardData.weather_dependent_tasks || 0}</div>
            <div className="text-sm text-yellow-800">Weather Dependent</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              Tasks that check weather conditions
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg relative group cursor-help">
            <div className="text-2xl font-bold text-purple-600">{dashboardData.pending_auto_schedule || 0}</div>
            <div className="text-sm text-purple-800">Pending Schedule</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              Tasks waiting to be scheduled
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
        </div>
      )}

      {preferences && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Current Preferences</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-600">Work Hours:</span>
              <div className="text-gray-800">
                {preferences.preferred_start_time} - {preferences.preferred_end_time}
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-600">Max Tasks/Day:</span>
              <div className="text-gray-800">{preferences.max_tasks_per_day}</div>
            </div>
            <div>
              <span className="font-medium text-gray-600">Buffer Time:</span>
              <div className="text-gray-800">{preferences.buffer_time_minutes} min</div>
            </div>
            <div>
              <span className="font-medium text-gray-600">Auto-Scheduling:</span>
              <div className="text-gray-800">
                {preferences.auto_scheduling_enabled ? (
                  <span className="text-green-600">Enabled</span>
                ) : (
                  <span className="text-red-600">Disabled</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preferences Form Modal */}
      {showPreferencesForm && (
        <PreferencesForm
          preferences={preferences}
          onSave={handleUpdatePreferences}
          onCancel={() => setShowPreferencesForm(false)}
        />
      )}
    </div>
  );
};

// Preferences Form Component
const PreferencesForm = ({ preferences, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    preferred_start_time: preferences?.preferred_start_time || '09:00:00',
    preferred_end_time: preferences?.preferred_end_time || '17:00:00',
    work_days: preferences?.work_days || [1, 2, 3, 4, 5],
    max_tasks_per_day: preferences?.max_tasks_per_day || 5,
    buffer_time_minutes: preferences?.buffer_time_minutes || 15,
    weather_check_enabled: preferences?.weather_check_enabled !== false,
    travel_time_enabled: preferences?.travel_time_enabled !== false,
    auto_scheduling_enabled: preferences?.auto_scheduling_enabled || false
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleWorkDayChange = (day) => {
    setFormData(prev => ({
      ...prev,
      work_days: prev.work_days.includes(day)
        ? prev.work_days.filter(d => d !== day)
        : [...prev.work_days, day].sort()
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const daysOfWeek = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
    { value: 7, label: 'Sun' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">Scheduling Preferences</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                name="preferred_start_time"
                value={formData.preferred_start_time}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                name="preferred_end_time"
                value={formData.preferred_end_time}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Work Days
            </label>
            <div className="flex space-x-2">
              {daysOfWeek.map(day => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => handleWorkDayChange(day.value)}
                  className={`px-3 py-1 text-sm rounded ${
                    formData.work_days.includes(day.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Tasks/Day
              </label>
              <input
                type="number"
                name="max_tasks_per_day"
                value={formData.max_tasks_per_day}
                onChange={handleChange}
                min="1"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buffer Time (min)
              </label>
              <input
                type="number"
                name="buffer_time_minutes"
                value={formData.buffer_time_minutes}
                onChange={handleChange}
                min="0"
                max="120"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="weather_check_enabled"
                name="weather_check_enabled"
                checked={formData.weather_check_enabled}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="weather_check_enabled" className="ml-2 text-sm text-gray-900">
                Check weather for outdoor tasks
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="travel_time_enabled"
                name="travel_time_enabled"
                checked={formData.travel_time_enabled}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="travel_time_enabled" className="ml-2 text-sm text-gray-900">
                Include travel time in scheduling
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="auto_scheduling_enabled"
                name="auto_scheduling_enabled"
                checked={formData.auto_scheduling_enabled}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="auto_scheduling_enabled" className="ml-2 text-sm text-gray-900">
                Enable auto-scheduling globally
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Save Preferences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AutoSchedulingDashboard; 