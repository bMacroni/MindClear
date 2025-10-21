import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { goalsAPI } from '../services/api';
import GoalForm from './GoalForm';
import { milestonesAPI } from '../services/api';
import { stepsAPI } from '../services/api';

const GoalList = ({ showSuccess }) => {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [progressByGoal, setProgressByGoal] = useState({});
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [milestonesByGoal, setMilestonesByGoal] = useState({});
  const [stepsByMilestone, setStepsByMilestone] = useState({});
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [updatingStep, setUpdatingStep] = useState(null);
  const [inlineEditingGoalId, setInlineEditingGoalId] = useState(null);

  // Category configuration with icons and colors
  const categoryConfig = {
    career: { 
      label: 'Career', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6" />        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
    health: { 
      label: 'Health', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
    personal: { 
      label: 'Personal', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
    education: { 
      label: 'Education', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
    finance: { 
      label: 'Finance', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
    relationships: { 
      label: 'Relationships', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
    other: { 
      label: 'Other', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ), 
      color: 'bg-gray-100 text-gray-800 border-gray-200' 
    },
  };

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const response = await goalsAPI.getAll();
      const goalsArray = Array.isArray(response.data) ? response.data : [];
      setGoals(goalsArray);
    } catch (err) {
      setError('Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  // Fetch milestones and steps for each goal to calculate progress
  useEffect(() => {
    const fetchProgress = async () => {
      const progressMap = {};
      for (const goal of goals) {
        try {
          const token = localStorage.getItem('jwt_token') || '';
          const milestones = await milestonesAPI.readAll(goal.id, token);
          let totalSteps = 0;
          let completedSteps = 0;
          for (const milestone of milestones) {
            const steps = await stepsAPI.readAll(milestone.id, token);
            totalSteps += steps.length;
            completedSteps += steps.filter(s => s.completed).length;
          }
          progressMap[goal.id] = {
            total: totalSteps,
            completed: completedSteps,
            percent: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
          };
        } catch (e) {
          progressMap[goal.id] = { total: 0, completed: 0, percent: 0 };
        }
      }
      setProgressByGoal(progressMap);
    };
    if (goals.length > 0) fetchProgress();
  }, [goals]);

  // Add a function to refresh progress for a specific goal
  const refreshProgressForGoal = async (goalId) => {
    try {
      const token = localStorage.getItem('jwt_token') || '';
      const milestones = await milestonesAPI.readAll(goalId, token);
      
      let totalSteps = 0;
      let completedSteps = 0;
      for (const milestone of milestones) {
        const steps = await stepsAPI.readAll(milestone.id, token);
        totalSteps += steps.length;
        completedSteps += steps.filter(s => s.completed).length;
      }
      
      const newProgress = {
        total: totalSteps,
        completed: completedSteps,
        percent: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
      };
      
      setProgressByGoal(prev => ({
        ...prev,
        [goalId]: newProgress
      }));
    } catch (e) {
      // Silent fail for progress refresh
    }
  };

  // Fetch milestones and steps for a goal
  const fetchMilestonesAndSteps = async (goalId) => {
    setLoadingMilestones(true);
    try {
      const token = localStorage.getItem('jwt_token') || '';
      const milestones = await milestonesAPI.readAll(goalId, token);
      setMilestonesByGoal(prev => ({ ...prev, [goalId]: milestones }));
      // Fetch steps for each milestone
      const stepsMap = {};
      for (const milestone of milestones) {
        const steps = await stepsAPI.readAll(milestone.id, token);
        stepsMap[milestone.id] = steps;
      }
      setStepsByMilestone(prev => ({ ...prev, ...stepsMap }));
    } catch (err) {
      // Optionally handle error
    } finally {
      setLoadingMilestones(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this goal?')) {
      try {
        await goalsAPI.delete(id);
        await fetchGoals(); // Refresh from backend after deletion
        showSuccess('Goal deleted successfully!');
      } catch (err) {
        setError('Failed to delete goal');
      }
    }
  };

  const handleEdit = (goal) => {
    setInlineEditingGoalId(goal.id);
    setEditingGoal(goal);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingGoal(null);
    setInlineEditingGoalId(null);
    fetchGoals();
    showSuccess(editingGoal ? 'Goal updated successfully!' : 'Goal created successfully!');
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingGoal(null);
    setInlineEditingGoalId(null);
  };

  // Handle step completion toggle
  const handleStepToggle = async (stepId, currentCompleted, milestoneId, goalId) => {
    try {
      setUpdatingStep(stepId);
      const token = localStorage.getItem('jwt_token') || '';
      
      await stepsAPI.update(stepId, { completed: !currentCompleted }, token);
      
      // Update the local state
      setStepsByMilestone(prev => ({
        ...prev,
        [milestoneId]: prev[milestoneId].map(step => 
          step.id === stepId ? { ...step, completed: !currentCompleted } : step
        )
      }));
      
      // Refresh progress for the goal
      await refreshProgressForGoal(goalId);
      
      showSuccess(`Step ${!currentCompleted ? 'completed' : 'marked as incomplete'}!`);
    } catch (err) {
      setError('Failed to update step');
    } finally {
      setUpdatingStep(null);
    }
  };

  // Check if a milestone should be unlocked (all previous milestones are complete)
  const isMilestoneUnlocked = (milestones, currentMilestoneIndex) => {
    if (currentMilestoneIndex === 0) return true; // First milestone is always unlocked
    
    // Check if all previous milestones have all their steps completed
    for (let i = 0; i < currentMilestoneIndex; i++) {
      const previousMilestone = milestones[i];
      const previousSteps = stepsByMilestone[previousMilestone.id] || [];
      const allStepsCompleted = previousSteps.length > 0 && previousSteps.every(step => step.completed);
      
      if (!allStepsCompleted) {
        return false;
      }
    }
    
    return true;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    return new Date(dateString).toLocaleDateString();
  };

  // Group goals by category
  const goalsArray = Array.isArray(goals) ? goals : [];
  const groupedGoals = goalsArray.reduce((acc, goal) => {
    const category = goal.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(goal);
    return acc;
  }, {});

  // Sort categories in a logical order
  const categoryOrder = ['career', 'health', 'personal', 'education', 'finance', 'relationships', 'other'];

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 justify-between items-center mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md shadow-sm">
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-black text-white rounded-xl font-medium cursor-default">All</button>
          <button className="px-4 py-2 bg-white text-black border border-gray-300 rounded-xl font-medium cursor-not-allowed opacity-60">Filter by Category</button>
          <button className="px-4 py-2 bg-white text-black border border-gray-300 rounded-xl font-medium cursor-not-allowed opacity-60">Sort by Due Date</button>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-black/10 shadow-lg transition-all duration-200 transform hover:scale-105 font-medium"
        >
          <span className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add Goal</span>
          </span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700 px-6 py-4 rounded-md shadow-sm">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {showForm && (
        <GoalForm
          goal={editingGoal}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      )}

      {(Array.isArray(goals) ? goals : []).length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No goals yet</h3>
          <p className="text-gray-600">Create your first goal to start your journey!</p>
        </div>
      ) : (
        <div className="space-y-12">
          {categoryOrder.map(category => {
            const categoryGoals = groupedGoals[category];
            if (!categoryGoals || categoryGoals.length === 0) return null;
            const config = categoryConfig[category];
            return (
              <div key={category}>
                {/* Category Header */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-gray-700">{config.icon}</div>
                  <h3 className="text-lg font-bold text-gray-900">{config.label}</h3>
                  <span className="text-xs text-gray-500">({categoryGoals.length} goal{categoryGoals.length !== 1 ? 's' : ''})</span>
                </div>
                {/* Table-like List */}
                <div className="w-full bg-white/90 rounded-md border border-gray-200 shadow divide-y divide-gray-100">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-gray-500">
                    <div className="col-span-1"> </div>
                    <div className="col-span-3">Title</div>
                    <div className="col-span-3">Description</div>
                    <div className="col-span-2">Due Date</div>
                    <div className="col-span-2">Progress</div>
                    <div className="col-span-1 text-right">Actions</div>
                  </div>
                  {categoryGoals.map(goal => (
                    <React.Fragment key={goal.id}>
                      {inlineEditingGoalId === goal.id ? (
                        // Inline Edit Form
                        <div className="col-span-12 bg-blue-50 border border-blue-200 px-4 py-4 rounded-md" style={{ gridColumn: '1 / span 12' }}>
                          <GoalForm
                            goal={editingGoal}
                            onSuccess={handleFormSuccess}
                            onCancel={handleFormCancel}
                            isInline={true}
                          />
                        </div>
                      ) : (
                        // Normal Goal Row
                        <div
                          className={`grid grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-gray-50 transition cursor-pointer ${expandedGoalId === goal.id ? 'bg-gray-100' : ''}`}
                          onClick={() => {
                            if (expandedGoalId === goal.id) {
                              setExpandedGoalId(null);
                            } else {
                              setExpandedGoalId(goal.id);
                              if (!milestonesByGoal[goal.id]) fetchMilestonesAndSteps(goal.id);
                            }
                          }}
                        >
                          {/* Icon */}
                          <div className="col-span-1 flex justify-center items-center">{config.icon}</div>
                          {/* Title */}
                          <div className="col-span-3 font-medium text-black truncate">{goal.title}</div>
                          {/* Description */}
                          <div className="col-span-3 text-gray-600 truncate">
                            {goal.description ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{ p: ({ children }) => <span>{children}</span> }}
                              >
                                {goal.description.length > 120 ? goal.description.slice(0, 120) + '...' : goal.description}
                              </ReactMarkdown>
                            ) : <span className="italic text-gray-400">No description</span>}
                          </div>
                          {/* Due Date */}
                          <div className="col-span-2 flex items-center gap-2 text-gray-700">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{formatDate(goal.target_completion_date)}</span>
                          </div>
                          {/* Progress */}
                          <div className="col-span-2 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">{progressByGoal[goal.id]?.percent ?? 0}%</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ml-2 ${goal.completed ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                <span className={`w-2 h-2 rounded-full mr-1 ${goal.completed ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                {goal.completed ? 'Completed' : 'In Progress'}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progressByGoal[goal.id]?.percent ?? 0}%` }}
                              ></div>
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="col-span-1 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleEdit(goal)}
                              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-colors duration-200"
                              title="Edit goal"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(goal.id)}
                              className="p-2 text-gray-600 hover:text-black hover:bg-gray-50 rounded-xl transition-colors duration-200"
                              title="Delete goal"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Expanded Milestones/Steps Row */}
                      {expandedGoalId === goal.id && inlineEditingGoalId !== goal.id && (
                        <div className="col-span-12 bg-gray-50 border-t border-gray-200 px-8 py-4 rounded-md" style={{ gridColumn: '1 / span 12' }}>
                          {loadingMilestones ? (
                            <div className="text-gray-400 text-sm">Loading milestones...</div>
                          ) : (
                            <>
                              {(milestonesByGoal[goal.id] && milestonesByGoal[goal.id].length > 0) ? (
                                <div className="space-y-6">
                                  {milestonesByGoal[goal.id].map((milestone, milestoneIndex) => {
                                    const isUnlocked = isMilestoneUnlocked(milestonesByGoal[goal.id], milestoneIndex);
                                    const steps = stepsByMilestone[milestone.id] || [];
                                    const completedSteps = steps.filter(step => step.completed).length;
                                    const totalSteps = steps.length;
                                    
                                    return (
                                      <div key={milestone.id} className={`transition-all duration-300 ${isUnlocked ? 'opacity-100' : 'opacity-40'}`}>
                                        <div className="flex items-center gap-3 mb-3">
                                          {/* Milestone status indicator */}
                                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                                            isUnlocked 
                                              ? completedSteps === totalSteps && totalSteps > 0
                                                ? 'bg-green-500 border-green-500 text-white'
                                                : 'bg-blue-500 border-blue-500 text-white'
                                              : 'bg-gray-300 border-gray-300 text-gray-500'
                                          }`}>
                                            {isUnlocked && completedSteps === totalSteps && totalSteps > 0 ? (
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                            ) : (
                                              <span className="text-xs font-bold">{milestoneIndex + 1}</span>
                                            )}
                                          </div>
                                          
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className={`font-semibold ${isUnlocked ? 'text-gray-800' : 'text-gray-500'}`}>
                                                {milestone.title}
                                              </span>
                                              <span className="text-xs text-gray-500">Milestone {milestoneIndex + 1}</span>
                                            </div>
                                            
                                            {/* Progress indicator */}
                                            {isUnlocked && totalSteps > 0 && (
                                              <div className="flex items-center gap-2 mt-1">
                                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                  <div 
                                                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                                                  ></div>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                  {completedSteps}/{totalSteps} steps
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Lock/unlock indicator */}
                                          {!isUnlocked && (
                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                              </svg>
                                              <span>Complete previous milestone to unlock</span>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Steps */}
                                        {isUnlocked && (
                                          <div className="ml-11">
                                            <div className="text-xs text-gray-500 mb-2 font-semibold text-left">Steps:</div>
                                            <div className="space-y-2">
                                              {totalSteps > 0 ? (
                                                steps.map(step => (
                                                  <div key={step.id} className="flex items-center gap-3 text-sm text-left">
                                                    <button
                                                      onClick={() => handleStepToggle(step.id, step.completed, milestone.id, goal.id)}
                                                      disabled={updatingStep === step.id}
                                                      className={`flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all duration-200 flex-shrink-0 ${
                                                        step.completed
                                                          ? 'bg-green-500 border-green-500 text-white hover:bg-green-600'
                                                          : 'bg-white border-gray-300 hover:border-green-400 hover:bg-green-50'
                                                      } ${updatingStep === step.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                    >
                                                      {step.completed && (
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                      )}
                                                    </button>
                                                    <span className={`flex-1 text-left ${step.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                                      {step.text}
                                                    </span>
                                                    {updatingStep === step.id && (
                                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0"></div>
                                                    )}
                                                  </div>
                                                ))
                                              ) : (
                                                <div className="text-xs text-gray-400 italic text-left">No steps defined</div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-gray-400 text-sm italic">No milestones defined for this goal.</div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GoalList; 