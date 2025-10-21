import React, { useState } from 'react';
import { tasksAPI } from '../services/api';

const InlineTaskEditor = ({ task, goals, loadingGoals, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    due_date: task?.due_date ? task.due_date.split('T')[0] : '',
    priority: task?.priority || 'medium',
    goal_id: task?.goal_id || null,
    // completed deprecated; use status
    status: task?.status || (task?.completed ? 'completed' : 'not_started'),
    preferred_time_of_day: task?.preferred_time_of_day || 'any',
    deadline_type: task?.deadline_type || 'soft',
    travel_time_minutes: task?.travel_time_minutes || '',
    duration_minutes: task?.duration_minutes || '',
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
      await tasksAPI.update(task.id, formData);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-300 rounded-md shadow-lg p-6 transition-all duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Edit Task</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Title */}
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

        {/* Description */}
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

        {/* Due Date and Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
              Due Date
            </label>
            <input
              type="date"
              id="due_date"
              name="due_date"
              value={formData.due_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {/* Scheduling Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="preferred_time_of_day" className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Time
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
            <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              id="duration_minutes"
              name="duration_minutes"
              value={formData.duration_minutes}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="30"
            />
          </div>
          <div>
            <label htmlFor="travel_time_minutes" className="block text-sm font-medium text-gray-700 mb-1">
              Travel Time (min)
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

        {/* Goal Association */}
        <div>
          <label htmlFor="goal_id" className="block text-sm font-medium text-gray-700 mb-1">
            Associated Goal
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
        </div>

        {/* Status */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Auto-Scheduling Section */}
        <div className="border-t pt-4">
          <div className="flex items-center mb-3">
            <input
              type="checkbox"
              id="auto_schedule_enabled"
              name="auto_schedule_enabled"
              checked={formData.auto_schedule_enabled}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="auto_schedule_enabled" className="ml-2 block text-sm font-medium text-gray-900">
              Enable automatic scheduling
            </label>
          </div>

          {formData.auto_schedule_enabled && (
            <div className="space-y-3 pl-6 border-l-2 border-blue-200">
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
                  Location
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
                  Weather dependent
                </label>
              </div>

              {/* Buffer time */}
              <div>
                <label htmlFor="buffer_time_minutes" className="block text-sm font-medium text-gray-700 mb-1">
                  Buffer time (minutes)
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
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
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
            {loading ? 'Saving...' : 'Update Task'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InlineTaskEditor; 