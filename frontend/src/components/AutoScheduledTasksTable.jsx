import React, { useState } from 'react';
import { tasksAPI } from '../services/api';

const AutoScheduledTasksTable = ({ tasks, onTaskUpdate, showSuccess }) => {
  const [updatingTask, setUpdatingTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editValues, setEditValues] = useState({});

  const handleToggleAutoSchedule = async (taskId, currentStatus) => {
    setUpdatingTask(taskId);
    try {
      await tasksAPI.update(taskId, { auto_schedule_enabled: !currentStatus });
      showSuccess('Task auto-scheduling updated successfully!');
      onTaskUpdate(); // Refresh the parent component
    } catch (error) {
      showSuccess('Failed to update task auto-scheduling');
    } finally {
      setUpdatingTask(null);
    }
  };

  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return 'Not scheduled';
    const date = new Date(dateTimeString);
    return date.toLocaleString();
  };

  const getScheduledTime = (task) => {
    // Check if task has calendar events
    if (task.calendar_events && task.calendar_events.length > 0) {
      // Get the most recent calendar event
      const latestEvent = task.calendar_events
        .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0];
      return latestEvent.start_time;
    }
    // Fallback to the old scheduled_time field if no calendar events
    return task.scheduled_time;
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatTravelTime = (minutes) => {
    if (!minutes) return '-';
    return `${minutes}m`;
  };

  const handleEditStart = (taskId, field, value) => {
    setEditingTask({ id: taskId, field });
    setEditValues({ [field]: value || '' });
  };

  const handleEditChange = (field, value) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
  };

  const handleEditSave = async (taskId) => {
    try {
      const updates = {};
      
      // Convert duration from "1h 30m" format to minutes
      if (editValues.duration !== undefined) {
        if (editValues.duration === '' || editValues.duration === '-') {
          updates.estimated_duration_minutes = null;
        } else {
          const durationStr = editValues.duration.toLowerCase();
          let minutes = 0;
          
          if (durationStr.includes('h')) {
            const hours = parseInt(durationStr.match(/(\d+)h/)?.[1] || 0);
            const mins = parseInt(durationStr.match(/(\d+)m/)?.[1] || 0);
            minutes = hours * 60 + mins;
          } else if (durationStr.includes('m')) {
            minutes = parseInt(durationStr.match(/(\d+)m/)?.[1] || 0);
          } else {
            minutes = parseInt(durationStr) || 0;
          }
          
          updates.estimated_duration_minutes = minutes;
        }
      }
      
      // Convert travel time from "15m" format to minutes
      if (editValues.travelTime !== undefined) {
        if (editValues.travelTime === '' || editValues.travelTime === '-') {
          updates.travel_time_minutes = null;
        } else {
          const travelStr = editValues.travelTime.toLowerCase();
          let minutes = 0;
          
          if (travelStr.includes('h')) {
            const hours = parseInt(travelStr.match(/(\d+)h/)?.[1] || 0);
            const mins = parseInt(travelStr.match(/(\d+)m/)?.[1] || 0);
            minutes = hours * 60 + mins;
          } else if (travelStr.includes('m')) {
            minutes = parseInt(travelStr.match(/(\d+)m/)?.[1] || 0);
          } else {
            minutes = parseInt(travelStr) || 0;
          }
          
          updates.travel_time_minutes = minutes;
        }
      }
      
      // Handle scheduled time (update on task; calendar events managed separately)
      if (editValues.scheduledTime !== undefined) {
        if (editValues.scheduledTime === '' || editValues.scheduledTime === 'Not scheduled') {
          updates.scheduled_time = null;
        } else {
          updates.scheduled_time = new Date(editValues.scheduledTime).toISOString();
        }
      }
       
       // Handle location
       if (editValues.location !== undefined) {
         if (editValues.location === '' || editValues.location === '-') {
           updates.location = null;
         } else {
           updates.location = editValues.location;
         }
       }
      
      await tasksAPI.update(taskId, updates);
      showSuccess('Task updated successfully!');
      onTaskUpdate();
    } catch (error) {
      showSuccess('Failed to update task');
    } finally {
      setEditingTask(null);
      setEditValues({});
    }
  };

  const handleEditCancel = () => {
    setEditingTask(null);
    setEditValues({});
  };

  const handleKeyPress = (e, taskId) => {
    if (e.key === 'Enter') {
      handleEditSave(taskId);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-white/90 rounded-md border border-gray-200 shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg text-left font-semibold text-gray-900">Auto-Scheduled Tasks</h3>
          <p className="text-sm text-left text-gray-600 mt-1">
            Tasks with auto-scheduling enabled will appear here
          </p>
        </div>
        <div className="p-8 text-center text-gray-500">
          <p>No auto-scheduled tasks found.</p>
          <p className="text-sm mt-1">Enable auto-scheduling on your tasks to see them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/90 rounded-md border border-gray-200 shadow mb-6">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg text-left font-semibold text-gray-900">Auto-Scheduled Tasks</h3>
        <p className="text-sm text-left text-gray-600 mt-1">
          Tasks with auto-scheduling enabled ({tasks.length} tasks)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Task
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Travel Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scheduled Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {task.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {task.title}
                      </div>
                      {task.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {task.description}
                        </div>
                      )}
                      {task.calendar_events && task.calendar_events.length > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          ✓ Auto-scheduled
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingTask?.id === task.id && editingTask?.field === 'duration' ? (
                     <div className="flex items-center space-x-2">
                       <input
                         type="text"
                         value={editValues.duration || ''}
                         onChange={(e) => handleEditChange('duration', e.target.value)}
                         onKeyDown={(e) => handleKeyPress(e, task.id)}
                         onBlur={() => handleEditSave(task.id)}
                         className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                         placeholder="1h 30m"
                         autoFocus
                       />
                       <button
                         onClick={() => handleEditSave(task.id)}
                         className="text-green-600 hover:text-green-800 text-xs"
                       >
                         ✓
                       </button>
                       <button
                         onClick={handleEditCancel}
                         className="text-red-600 hover:text-red-800 text-xs"
                       >
                         ✕
                       </button>
                     </div>
                   ) : (
                     <div
                       onClick={() => handleEditStart(task.id, 'duration', formatDuration(task.estimated_duration_minutes))}
                       className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                       title="Click to edit"
                     >
                       {formatDuration(task.estimated_duration_minutes)}
                     </div>
                   )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingTask?.id === task.id && editingTask?.field === 'travelTime' ? (
                     <div className="flex items-center space-x-2">
                       <input
                         type="text"
                         value={editValues.travelTime || ''}
                         onChange={(e) => handleEditChange('travelTime', e.target.value)}
                         onKeyDown={(e) => handleKeyPress(e, task.id)}
                         onBlur={() => handleEditSave(task.id)}
                         className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                         placeholder="15m"
                         autoFocus
                       />
                       <button
                         onClick={() => handleEditSave(task.id)}
                         className="text-green-600 hover:text-green-800 text-xs"
                       >
                         ✓
                       </button>
                       <button
                         onClick={handleEditCancel}
                         className="text-red-600 hover:text-red-800 text-xs"
                       >
                         ✕
                       </button>
                     </div>
                   ) : (
                     <div
                       onClick={() => handleEditStart(task.id, 'travelTime', formatTravelTime(task.travel_time_minutes))}
                       className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                       title="Click to edit"
                     >
                       {formatTravelTime(task.travel_time_minutes)}
                     </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingTask?.id === task.id && editingTask?.field === 'location' ? (
                     <div className="flex items-center space-x-2">
                       <input
                         type="text"
                         value={editValues.location || ''}
                         onChange={(e) => handleEditChange('location', e.target.value)}
                         onKeyDown={(e) => handleKeyPress(e, task.id)}
                         onBlur={() => handleEditSave(task.id)}
                         className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                         placeholder="Enter location"
                         autoFocus
                       />
                       <button
                         onClick={() => handleEditSave(task.id)}
                         className="text-green-600 hover:text-green-800 text-xs"
                       >
                         ✓
                       </button>
                       <button
                         onClick={handleEditCancel}
                         className="text-red-600 hover:text-red-800 text-xs"
                       >
                         ✕
                       </button>
                     </div>
                   ) : (
                     <div
                       onClick={() => handleEditStart(task.id, 'location', task.location || '')}
                       className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                       title="Click to edit"
                     >
                       {task.location || '-'}
                     </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {editingTask?.id === task.id && editingTask?.field === 'scheduledTime' ? (
                     <div className="flex items-center space-x-2">
                       <input
                         type="datetime-local"
                         value={editValues.scheduledTime || ''}
                         onChange={(e) => handleEditChange('scheduledTime', e.target.value)}
                         onKeyDown={(e) => handleKeyPress(e, task.id)}
                         onBlur={() => handleEditSave(task.id)}
                         className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                         autoFocus
                       />
                       <button
                         onClick={() => handleEditSave(task.id)}
                         className="text-green-600 hover:text-green-800 text-xs"
                       >
                         ✓
                       </button>
                       <button
                         onClick={handleEditCancel}
                         className="text-red-600 hover:text-red-800 text-xs"
                       >
                         ✕
                       </button>
                     </div>
                   ) : (
                     <div
                       onClick={() => handleEditStart(task.id, 'scheduledTime', getScheduledTime(task) ? new Date(getScheduledTime(task)).toISOString().slice(0, 16) : '')}
                       className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                       title="Click to edit"
                     >
                       {formatDateTime(getScheduledTime(task))}
                     </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                     onClick={() => handleToggleAutoSchedule(task.id, task.auto_schedule_enabled)}
                     disabled={updatingTask === task.id}
                     className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                   >
                     {updatingTask === task.id ? 'Updating...' : 'Disable'}
                   </button>
                 </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AutoScheduledTasksTable; 