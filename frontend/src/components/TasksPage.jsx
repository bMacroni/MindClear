import React, { useState, useEffect } from 'react';
import TaskList from './TaskList';
import AutoScheduledTasksTable from './AutoScheduledTasksTable';
import { tasksAPI } from '../services/api';

function TasksPage({ showSuccess }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPreferencesForm, setShowPreferencesForm] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [allTasks, setAllTasks] = useState([]);

  // Load dashboard data and preferences
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [dashboardResponse, preferencesResponse, tasksResponse] = await Promise.all([
          tasksAPI.getAutoSchedulingDashboard(),
          tasksAPI.getUserSchedulingPreferences(),
          tasksAPI.getAll()
        ]);
        setDashboardData(dashboardResponse.data);
        setPreferences(preferencesResponse.data);
        setAllTasks(Array.isArray(tasksResponse.data) ? tasksResponse.data : []);
      } catch (error) {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleTriggerAutoScheduling = async () => {
    setTriggering(true);
    try {
      await tasksAPI.triggerAutoScheduling();
      showSuccess('Auto-scheduling triggered successfully!');
      
      // Reload dashboard data and tasks
      const [dashboardResponse, tasksResponse] = await Promise.all([
        tasksAPI.getAutoSchedulingDashboard(),
        tasksAPI.getAll()
      ]);
      setDashboardData(dashboardResponse.data);
      setAllTasks(Array.isArray(tasksResponse.data) ? tasksResponse.data : []);
    } catch (error) {
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

  const refreshDashboardData = async () => {
    try {
      const [dashboardResponse, tasksResponse] = await Promise.all([
        tasksAPI.getAutoSchedulingDashboard(),
        tasksAPI.getAll()
      ]);
      setDashboardData(dashboardResponse.data);
      setAllTasks(Array.isArray(tasksResponse.data) ? tasksResponse.data : []);
    } catch (error) {
      // Silent fail for dashboard refresh
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    return timeString.substring(0, 5); // Remove seconds, show HH:MM
  };

  // Filter tasks for the table (auto-scheduled tasks)
  const autoScheduledTasks = allTasks.filter(task => task.auto_schedule_enabled);

  // Filter tasks for the swim lanes (non-auto-scheduled tasks)
  const swimLaneTasks = allTasks.filter(task => !task.auto_schedule_enabled);

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Compact Auto-Scheduling Dashboard */}
      <div className="bg-white/90 rounded-md border border-gray-200 shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Auto-Scheduling Dashboard</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowPreferencesForm(true)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              Edit Preferences
            </button>
            <button
              onClick={handleTriggerAutoScheduling}
              disabled={triggering}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {triggering ? 'Scheduling...' : 'Trigger Auto-Scheduling'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Task Stats */}
          <div className="bg-blue-50 rounded-md p-3">
            <div className="text-xl font-bold text-blue-600">
              {loading ? '...' : (dashboardData?.total_tasks || 0)}
            </div>
            <div className="text-xs text-blue-700">Total Tasks</div>
          </div>
          <div className="bg-green-50 rounded-md p-3">
            <div className="text-xl font-bold text-green-600">
              {loading ? '...' : (dashboardData?.auto_scheduled_tasks || 0)}
            </div>
            <div className="text-xs text-green-700">Auto-Scheduled</div>
          </div>
          <div className="bg-yellow-50 rounded-md p-3">
            <div className="text-xl font-bold text-orange-600">
              {loading ? '...' : (dashboardData?.weather_dependent_tasks || 0)}
            </div>
            <div className="text-xs text-orange-700">Weather Dependent</div>
          </div>
          <div className="bg-purple-50 rounded-md p-3">
            <div className="text-xl font-bold text-purple-600">
              {loading ? '...' : (dashboardData?.pending_auto_schedule || 0)}
            </div>
            <div className="text-xs text-purple-700">Pending Schedule</div>
          </div>
        </div>

        {/* Compact Preferences Display */}
        {preferences && (
          <div className="bg-gray-50 rounded-md p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Work Hours:</span>
                <div className="text-gray-800">
                  {formatTime(preferences.preferred_start_time)} - {formatTime(preferences.preferred_end_time)}
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
      </div>

      {/* Auto-Scheduled Tasks Table */}
      <AutoScheduledTasksTable 
        tasks={autoScheduledTasks}
        onTaskUpdate={refreshDashboardData}
        showSuccess={showSuccess}
      />

      {/* Tasks Section */}
      <div className="flex-1 bg-white/90 rounded-md border border-gray-200 shadow">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg text-left font-semibold text-gray-900">One-off Tasks</h3>
          <p className="text-sm text-left text-gray-600 mt-1">
            Manage your one-off tasks, so you can focus on what matters most.
          </p>
        </div>
        <div className="p-4">
          <TaskList 
            showSuccess={showSuccess} 
            onTaskChange={refreshDashboardData}
            tasks={swimLaneTasks} // Pass filtered tasks to TaskList
          />
        </div>
      </div>

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
}

// Preferences Form Component (reused from AutoSchedulingDashboard)
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

export default TasksPage; 