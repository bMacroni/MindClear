import React, { useState, useEffect } from 'react';
import { tasksAPI, goalsAPI } from '../services/api';
import analyticsService from '../services/analyticsService';
import TaskForm from './TaskForm';
import InlineTaskEditor from './InlineTaskEditor';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Remove the smokeStyle CSS and related logic

const TaskList = ({ showSuccess, onTaskChange, tasks: propTasks }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [inlineEditingTaskId, setInlineEditingTaskId] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [newTaskId, setNewTaskId] = useState(null); // Track the new task being created

  // Use propTasks if provided, otherwise fetch tasks
  const displayTasks = propTasks !== undefined ? propTasks : tasks;

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await tasksAPI.getAll();
      setTasks(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Fetch goals when component mounts
  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const response = await goalsAPI.getAll();
        setGoals(response.data);
      } catch (err) {
        // Silent fail for goals loading
      } finally {
        setLoadingGoals(false);
      }
    };

    fetchGoals();
  }, []);

  useEffect(() => {
    // Only fetch tasks if propTasks is not provided
    if (propTasks === undefined) {
      fetchTasks();
    } else {
      setLoading(false);
    }
  }, [propTasks]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await tasksAPI.delete(id);
        
        if (propTasks !== undefined) {
          // Controlled mode: notify parent to refresh data
          if (onTaskChange) {
            onTaskChange();
          }
        } else {
          // Uncontrolled mode: update local state
          setTasks(prev => Array.isArray(prev) ? prev.filter(task => task.id !== id) : []);
        }
        
        showSuccess('Task deleted successfully!');
      } catch (err) {
        setError('Failed to delete task');
      }
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  const handleInlineEdit = (taskId) => {
    setInlineEditingTaskId(taskId);
  };

  const handleInlineEditCancel = () => {
    setInlineEditingTaskId(null);
    // If this was a new task being cancelled, remove it from the list
    if (newTaskId) {
      if (propTasks !== undefined) {
        // Controlled mode: notify parent to refresh data
        if (onTaskChange) {
          onTaskChange();
        }
      } else {
        // Uncontrolled mode: update local state
        setTasks(prev => Array.isArray(prev) ? prev.filter(task => task.id !== newTaskId) : []);
      }
      setNewTaskId(null);
    }
  };

  const handleInlineEditSuccess = () => {
    setInlineEditingTaskId(null);
    setNewTaskId(null); // Clear the new task ID
    
    if (propTasks !== undefined) {
      // Controlled mode: notify parent to refresh data
      if (onTaskChange) {
        onTaskChange();
      }
    } else {
      // Uncontrolled mode: fetch tasks to refresh local state
      fetchTasks();
    }
    
    showSuccess('Task updated successfully!');
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingTask(null);
    
    if (propTasks !== undefined) {
      // Controlled mode: notify parent to refresh data
      if (onTaskChange) {
        onTaskChange();
      }
    } else {
      // Uncontrolled mode: fetch tasks to refresh local state
      fetchTasks();
    }
    
    showSuccess(editingTask ? 'Task updated successfully!' : 'Task created successfully!');
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingTask(null);
  };

  // New function to handle adding a new task
  const handleAddNewTask = async () => {
    try {
      // Create a new task with default values
      const newTaskData = {
        title: '',
        description: '',
        status: 'not_started',
        priority: 'medium',
        completed: false,
        preferred_time_of_day: 'any',
        deadline_type: 'soft',
        auto_schedule_enabled: false,
        weather_dependent: false,
        task_type: 'other',
        buffer_time_minutes: 15
      };

      const response = await tasksAPI.create(newTaskData);
      const newTask = response.data;
      
      if (propTasks !== undefined) {
        // Controlled mode: notify parent to refresh data
        if (onTaskChange) {
          onTaskChange();
        }
      } else {
        // Uncontrolled mode: update local state
        setTasks(prev => Array.isArray(prev) ? [newTask, ...prev] : [newTask]);
      }
      
      // Set it for inline editing
      setNewTaskId(newTask.id);
      setInlineEditingTaskId(newTask.id);
      
      showSuccess('New task created!');
    } catch (err) {
      setError('Failed to create new task');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    return new Date(dateString).toLocaleDateString();
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  const getPriorityLabel = (priority) => {
    return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'None';
  };

  // Helper to get border color class based on priority
  const getPriorityBorder = (priority) => {
    switch (priority) {
      case 'high':
        return 'border-orange-400';
      case 'medium':
        return 'border-yellow-300';
      case 'low':
      default:
        return 'border-gray-200';
    }
  };

  // Kanban status columns
  const statusColumns = [
    { key: 'todo', label: 'To Do', status: 'not_started' },
    { key: 'inprogress', label: 'In Progress', status: 'in_progress' },
    { key: 'done', label: 'Done', status: 'completed' }
  ];

  // Group tasks by status
  const groupedTasks = {
    not_started: [],
    in_progress: [],
    completed: []
  };
  (Array.isArray(displayTasks) ? displayTasks : []).forEach(task => {
    if (task.status === 'completed') groupedTasks.completed.push(task);
    else if (task.status === 'in_progress') groupedTasks.in_progress.push(task);
    else groupedTasks.not_started.push(task);
  });

  // Drag-and-drop handler
  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    // Find the task
    const allTasks = [...groupedTasks.not_started, ...groupedTasks.in_progress, ...groupedTasks.completed];
    const task = allTasks.find(t => t.id.toString() === draggableId);
    if (!task) return;
    // Determine new status
    let newStatus = 'not_started';
    if (destination.droppableId === 'inprogress') newStatus = 'in_progress';
    if (destination.droppableId === 'done') newStatus = 'completed';
    // Update status only (DB trigger mirrors completed during transition)
    const updated = { ...task, status: newStatus };
    
    // Optimistically update local state in uncontrolled mode
    if (propTasks === undefined) {
      setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? updated : t));
    }
    
    // Send update to backend
    try {
      await tasksAPI.update(task.id, updated);

      // Only call onTaskChange after successful API update
      if (propTasks !== undefined && onTaskChange) {
        onTaskChange();
      }

      // Track task completion analytics if task was just completed
      if (task.status !== 'completed' && newStatus === 'completed') {
        try {
          analyticsService.trackTaskCompleted({
            taskId: task.id,
            taskTitle: task.title,
            priority: task.priority,
            hasLocation: !!task.location,
            hasEstimatedDuration: !!task.estimated_duration_minutes,
            autoScheduleEnabled: task.auto_schedule_enabled
          });
        } catch (_analyticsErr) {
          // Analytics error - ignore
        }
      }
    } catch (err) {
      // Revert optimistic update if backend update fails
      if (propTasks === undefined) {
        // Uncontrolled mode: revert local state (do not call onTaskChange)
        setTasks(prevTasks => prevTasks.map(t => t.id === task.id ? task : t));
      }
      // In controlled mode, do not call onTaskChange on failure to avoid double refresh
      setError('Failed to update task status.');
    }
  };

  // Find the most urgent To Do or In Progress task for Today’s Focus
  const getTodaysFocusTask = () => {
    const now = new Date();
    const upcoming = [...groupedTasks.not_started, ...groupedTasks.in_progress].filter(
      t => t.status !== 'completed' && t.due_date
    );
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    return upcoming[0];
  };
  const todaysFocus = getTodaysFocusTask();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 bg-white min-h-screen py-8">
      {error && (
        <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {showForm && (
        <TaskForm
          task={editingTask}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      )}

      {(Array.isArray(displayTasks) ? displayTasks : []).length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-black mb-2">No tasks yet</h3>
          <p className="text-gray-500">Create your first task to get organized!</p>        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statusColumns.map(col => (
              <Droppable droppableId={col.key} key={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-md min-h-[200px] p-3 transition-all duration-200 ${snapshot.isDraggingOver ? 'bg-blue-100/60' : 'bg-blue-50/40'}`}
                  >
                    <div className="bg-white border-b-2 border-gray-300 rounded-t-lg px-4 py-3 mb-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {col.label === 'To Do' && (
                            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                          {col.label === 'In Progress' && (
                            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          {col.label === 'Done' && (
                            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className="text-lg font-semibold text-gray-900">{col.label}</span>
                        </div>
                                                 {/* Add plus button only to To Do column */}
                         {col.label === 'To Do' && (
                           <button
                             onClick={handleAddNewTask}
                             className="w-8 h-8 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300/50 transition-all duration-200 flex items-center justify-center border border-gray-200"
                             title="Add new task"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                             </svg>
                           </button>
                         )}
                      </div>
                    </div>
                    {groupedTasks[col.status].map((task, idx) => (
                      <Draggable draggableId={task.id.toString()} index={idx} key={task.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white border ${getPriorityBorder(task.priority)} rounded-md shadow p-4 mb-3 transition-all duration-200 transform ${snapshot.isDragging ? 'scale-105 shadow-lg' : 'hover:shadow-md'} group`}
                          >
                            {inlineEditingTaskId === task.id ? (
                              <InlineTaskEditor
                                task={task}
                                goals={goals}
                                loadingGoals={loadingGoals}
                                onSuccess={handleInlineEditSuccess}
                                onCancel={handleInlineEditCancel}
                              />
                            ) : (
                              <div 
                                className="cursor-pointer"
                                onClick={() => handleInlineEdit(task.id)}
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-3 mb-2">
                                      <h3 className={`text-xl font-bold leading-tight ${task.completed ? 'line-through text-gray-500' : 'text-black'}`}>
                                        {task.title}
                                      </h3>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                                        {getPriorityLabel(task.priority)}
                                      </span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                        task.completed 
                                          ? 'bg-green-100 text-green-800 border-green-200' 
                                          : 'bg-gray-100 text-gray-800 border-gray-200'
                                      }`}>
                                        <div className={`w-2 h-2 rounded-full mr-2 ${
                                          task.completed ? 'bg-gray-500' : 'bg-gray-400'
                                        }`}></div>
                                        {task.completed ? (
                                          <span className="flex items-center">
                                            <svg className="w-4 h-4 text-green-500 animate-bounce-in" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="ml-1">Completed</span>
                                          </span>
                                        ) : 'Pending'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleDelete(task.id)}
                                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors duration-200"
                                      title="Delete task"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                {task.description && (
                                  <p className={`text-gray-600 mb-4 leading-relaxed ${task.completed ? 'line-through opacity-60' : ''}`}>
                                    {task.description}
                                  </p>
                                )}
                                {/* New fields for AI scheduling */}
                                <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-2">
                                  {task.preferred_time_of_day && (
                                    <div className="flex items-center space-x-1">
                                      <span className="font-medium">Preferred Time:</span>
                                      <span className="capitalize">{task.preferred_time_of_day}</span>
                                    </div>
                                  )}
                                  {task.deadline_type && (
                                    <div className="flex items-center space-x-1">
                                      <span className="font-medium">Deadline Type:</span>
                                      <span className="capitalize">{task.deadline_type}</span>
                                    </div>
                                  )}
                                  {task.estimated_duration_minutes !== undefined && task.estimated_duration_minutes !== null && task.estimated_duration_minutes !== '' && (
                                    <div className="flex items-center space-x-1">
                                      <span className="font-medium">Duration:</span>
                                      <span>{task.estimated_duration_minutes} min</span>
                                    </div>
                                  )}
                                  {task.travel_time_minutes !== undefined && task.travel_time_minutes !== null && task.travel_time_minutes !== '' && (
                                    <div className="flex items-center space-x-1">
                                      <span className="font-medium">Travel Time:</span>
                                      <span>{task.travel_time_minutes} min</span>
                                    </div>
                                  )}
                                </div>

                                {/* Auto-scheduling indicators */}
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {task.auto_schedule_enabled && (
                                    <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span>Auto-Scheduled</span>
                                    </div>
                                  )}
                                  {task.weather_dependent && (
                                    <div className="flex items-center space-x-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                      </svg>
                                      <span>Weather Dependent</span>
                                    </div>
                                  )}
                                  {task.recurrence_pattern && (
                                    <div className="flex items-center space-x-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                      <span>Recurring</span>
                                    </div>
                                  )}
                                  {task.task_type && task.task_type !== 'other' && (
                                    <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                                      <span className="capitalize">{task.task_type}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Quick auto-schedule toggle */}
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await tasksAPI.toggleAutoSchedule(task.id, !task.auto_schedule_enabled);
                                          
                                          // Only call onTaskChange after successful API update
                                          if (propTasks !== undefined && onTaskChange) {
                                            onTaskChange();
                                          } else if (propTasks === undefined) {
                                            // Uncontrolled mode: fetch tasks to refresh local state
                                            fetchTasks();
                                          }
                                          
                                          showSuccess(`Auto-scheduling ${!task.auto_schedule_enabled ? 'enabled' : 'disabled'} for "${task.title}"`);
                                        } catch (err) {
                                          setError('Failed to toggle auto-scheduling');
                                        }
                                      }}
                                      disabled={task.status === 'completed'}
                                      className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                        task.status === 'completed'
                                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                          : task.auto_schedule_enabled
                                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span>{task.auto_schedule_enabled ? 'Disable' : 'Enable'} Auto-Schedule</span>
                                    </button>
                                  </div>
                                  {task.location && (
                                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      <span>{task.location}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
};

export default TaskList; 