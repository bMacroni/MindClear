import React, { useState, useEffect } from 'react';
import { tasksAPI, goalsAPI } from '../services/api';

const TaskForm = ({ task = null, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    due_date: task?.due_date ? task.due_date.split('T')[0] : '',
    priority: task?.priority || 'medium',
    goal_id: task?.goal_id || null,
    completed: task?.completed || false,
    preferred_time_of_day: task?.preferred_time_of_day || 'any',
    deadline_type: task?.deadline_type || 'soft',
    travel_time_minutes: task?.travel_time_minutes || '',
    estimated_duration_minutes: task?.estimated_duration_minutes || '',
    // Auto-scheduling fields
    auto_schedule_enabled: task?.auto_schedule_enabled || false,
    weather_dependent: task?.weather_dependent || false,
    location: task?.location || '',
    task_type: task?.task_type || 'other',
    recurrence_pattern: task?.recurrence_pattern || null,
    preferred_time_windows: task?.preferred_time_windows || [],
    buffer_time_minutes: task?.buffer_time_minutes || 15
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [goals, setGoals] = useState([]);
  const [loadingGoals, setLoadingGoals] = useState(true);

  // Fetch goals when component mounts
  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const response = await goalsAPI.getAll();
        setGoals(response.data);
      } catch (err) {
        setError('Failed to load goals');
      } finally {
        setLoadingGoals(false);
      }
    };

    fetchGoals();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (task) {
        // Update existing task
        await tasksAPI.update(task.id, formData);
      } else {
        // Create new task
        await tasksAPI.create(formData);
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">
        {task ? 'Edit Task' : 'Create New Task'}
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter task title"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="3"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter task description"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
              Due Date (Optional)
            </label>
            <input
              type="date"
              id="due_date"
              name="due_date"
              value={formData.due_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Select a due date"
            />
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* New fields for AI scheduling */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="preferred_time_of_day" className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Time of Day
            </label>
            <select
              id="preferred_time_of_day"
              name="preferred_time_of_day"
              value={formData.preferred_time_of_day}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="any">Any</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>
          <div>
            <label htmlFor="deadline_type" className="block text-sm font-medium text-gray-700 mb-1">
              Deadline Type
            </label>
            <select
              id="deadline_type"
              name="deadline_type"
              value={formData.deadline_type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="soft">Soft</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        {/* Duration and Travel Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="estimated_duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              id="estimated_duration_minutes"
              name="estimated_duration_minutes"
              value={formData.estimated_duration_minutes}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="30"
            />
          </div>
          <div>
            <label htmlFor="travel_time_minutes" className="block text-sm font-medium text-gray-700 mb-1">
              Travel Time (minutes)
            </label>
            <input
              type="number"
              id="travel_time_minutes"
              name="travel_time_minutes"
              value={formData.travel_time_minutes}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label htmlFor="goal_id" className="block text-sm font-medium text-gray-700 mb-1">
            Associated Goal (Optional)
          </label>
          <select
            id="goal_id"
            name="goal_id"
            value={formData.goal_id || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loadingGoals}
          >
            <option value="">No goal associated</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          {loadingGoals && (
            <p className="text-sm text-gray-500 mt-1">Loading goals...</p>
          )}
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="completed"
            name="completed"
            checked={formData.completed}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="completed" className="ml-2 block text-sm text-gray-900">
            Mark as completed
          </label>
        </div>

        {/* Auto-Scheduling Section */}
        <div className="border-t pt-6">
          <h4 className="text-md font-semibold mb-4 text-gray-800">Auto-Scheduling Options</h4>
          
          <div className="space-y-4">
            {/* Auto-schedule toggle */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="auto_schedule_enabled"
                name="auto_schedule_enabled"
                checked={formData.auto_schedule_enabled}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="auto_schedule_enabled" className="ml-2 block text-sm text-gray-900">
                Enable automatic scheduling
              </label>
            </div>

            {/* Auto-scheduling fields - only show if enabled */}
            {formData.auto_schedule_enabled && (
              <div className="space-y-4 pl-6 border-l-2 border-blue-200">
                {/* Task Type */}
                <div>
                  <label htmlFor="task_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Task Type
                  </label>
                  <select
                    id="task_type"
                    name="task_type"
                    value={formData.task_type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="other">Other</option>
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="travel">Travel</option>
                    <option value="virtual">Virtual</option>
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                    Location (for weather and travel time)
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Central Park, New York"
                  />
                </div>

                {/* Weather dependent */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="weather_dependent"
                    name="weather_dependent"
                    checked={formData.weather_dependent}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="weather_dependent" className="ml-2 block text-sm text-gray-900">
                    Weather dependent (skip during bad weather)
                  </label>
                </div>

                {/* Buffer time */}
                <div>
                  <label htmlFor="buffer_time_minutes" className="block text-sm font-medium text-gray-700 mb-1">
                    Buffer time between tasks (minutes)
                  </label>
                  <input
                    type="number"
                    id="buffer_time_minutes"
                    name="buffer_time_minutes"
                    value={formData.buffer_time_minutes}
                    onChange={handleChange}
                    min="0"
                    max="120"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="15"
                  />
                </div>

                {/* Recurrence Pattern */}
                <div>
                  <label htmlFor="recurrence_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Recurrence (Optional)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      id="recurrence_type"
                      name="recurrence_type"
                      onChange={(e) => {
                        const type = e.target.value;
                        if (type === 'none') {
                          setFormData(prev => ({ ...prev, recurrence_pattern: null }));
                        } else {
                          setFormData(prev => ({ 
                            ...prev, 
                            recurrence_pattern: { type, interval: 1 }
                          }));
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">No recurrence</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    {formData.recurrence_pattern && formData.recurrence_pattern.type !== 'none' && (
                      <input
                        type="number"
                        name="recurrence_interval"
                        value={formData.recurrence_pattern.interval || 1}
                        onChange={(e) => {
                          setFormData(prev => ({
                            ...prev,
                            recurrence_pattern: {
                              ...prev.recurrence_pattern,
                              interval: parseInt(e.target.value)
                            }
                          }));
                        }}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="1"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
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
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Saving...' : (task ? 'Update Task' : 'Create Task')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskForm; 