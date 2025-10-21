import React, { useState } from 'react';
import { goalsAPI, aiAPI } from '../services/api';
import analyticsService from '../services/analyticsService';

const GoalForm = ({ goal = null, onSuccess, onCancel, isInline = false }) => {
  const [formData, setFormData] = useState({
    title: goal?.title || '',
    description: goal?.description || '',
    target_completion_date: goal?.target_completion_date ? goal.target_completion_date.split('T')[0] : '',
    category: goal?.category || 'other',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsAdded, setSuggestionsAdded] = useState(false);

  // Category options from database schema
  const categoryOptions = [
    { value: 'career', label: 'Career', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6" />
      </svg>
    ) },
    { value: 'health', label: 'Health', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ) },
    { value: 'personal', label: 'Personal', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ) },
    { value: 'education', label: 'Education', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ) },
    { value: 'finance', label: 'Finance', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </svg>
    ) },
    { value: 'relationships', label: 'Relationships', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ) },
    { value: 'other', label: 'Other', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ) },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleGetSuggestions = async () => {
    if (!formData.title.trim()) {
      setError('Please enter a goal title first to get AI suggestions.');
      return;
    }

    setSuggestionsLoading(true);
    setError('');

    try {
      const response = await aiAPI.getGoalSuggestions(formData.title);
      const suggestions = response.data.suggestions;
      
      // Append suggestions to existing description
      const currentDescription = formData.description.trim();
      const separator = currentDescription ? '\n\n**AI Suggestions:**\n' : '**AI Suggestions:**\n';
      const newDescription = currentDescription + separator + suggestions;
      
      setFormData(prev => ({
        ...prev,
        description: newDescription
      }));
      
      // Show success indicator
      setSuggestionsAdded(true);
      setTimeout(() => {
        setSuggestionsAdded(false);
      }, 3000);
      
    } catch (err) {
      setError('Failed to get AI suggestions. Please try again.');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Prepare data for submission - convert empty string to null for target_completion_date
      const submitData = {
        ...formData,
        target_completion_date: formData.target_completion_date || null
      };

      if (goal) {
        // Update existing goal
        await goalsAPI.update(goal.id, submitData);
      } else {
        // Create new goal
        const response = await goalsAPI.create(submitData);

        // Track goal creation analytics
        try {
          const trackingResult = analyticsService.trackGoalCreated('manual', {
            category: submitData.category,
            hasDescription: !!submitData.description,
            hasTargetDate: !!submitData.target_completion_date
          });
          if (trackingResult && typeof trackingResult.catch === 'function') {
            trackingResult.catch((_analyticsError) => {
              // Analytics error - ignore
            });
          }
        } catch (_analyticsError) {
          // Analytics error - ignore
        }
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const insertMarkdown = (syntax) => {
    const textarea = document.getElementById('description');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.description;
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);

    let newText = '';
    switch (syntax) {
      case 'bold':
        newText = before + `**${selected || 'bold text'}**` + after;
        break;
      case 'italic':
        newText = before + `*${selected || 'italic text'}*` + after;
        break;
      case 'bullet':
        newText = before + `\n• ${selected || 'bullet point'}` + after;
        break;
      case 'number':
        newText = before + `\n1. ${selected || 'numbered item'}` + after;
        break;
      case 'link':
        newText = before + `[${selected || 'link text'}](url)` + after;
        break;
      default:
        return;
    }

    setFormData(prev => ({ ...prev, description: newText }));
    
    // Set cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + syntax.length + (selected ? selected.length : 0);
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className={`bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 ${isInline ? 'p-4' : 'p-8'}`}>
      {!isInline && (
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">
            {goal ? 'Edit Goal' : 'Create New Goal'}
          </h3>
        </div>
      )}
      
      {isInline && (
        <div className="flex items-center space-x-3 mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {goal ? 'Edit Goal' : 'Create New Goal'}
          </h3>
        </div>
      )}
      
              <form onSubmit={handleSubmit} className={`${isInline ? 'space-y-3' : 'space-y-4'}`}>
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

        {suggestionsAdded && (
          <div className="bg-green-50/80 backdrop-blur-sm border border-green-200 text-green-700 px-6 py-4 rounded-2xl shadow-sm animate-fadeIn">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">AI suggestions added to your goal description!</span>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
            Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            className={`w-full border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200 ${isInline ? 'px-3 py-2' : 'px-4 py-3'}`}
            placeholder="Enter your goal title"
          />
          <p className="text-xs text-gray-500 mt-1 flex items-center space-x-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>After entering a title, click &quot;Get AI Suggestions&quot; to receive actionable steps for achieving your goal</span>
          </p>
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-2">
            Category
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className={`w-full border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200 ${isInline ? 'px-3 py-2' : 'px-4 py-3'}`}
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="description" className="block text-sm font-semibold text-gray-700">
              Description
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleGetSuggestions}
                disabled={suggestionsLoading || !formData.title.trim()}
                className="px-3 py-1 text-sm bg-black text-white rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all duration-200 flex items-center space-x-1"
              >
                {suggestionsLoading ? (
                  <>
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Getting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>Get AI Suggestions</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>
          
          {!showPreview && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => insertMarkdown('bold')}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-bold"
                  title="Bold"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('italic')}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 italic"
                  title="Italic"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('bullet')}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  title="Bullet List"
                >
                  •
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('number')}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  title="Numbered List"
                >
                  1.
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('link')}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  title="Link"
                >
                  🔗
                </button>
              </div>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={isInline ? "4" : "6"}
                className={`w-full border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200 resize-none font-mono text-sm ${isInline ? 'px-3 py-2' : 'px-4 py-3'}`}
                placeholder="Describe your goal in detail. Use markdown formatting for better structure:
                
**Bold text** for emphasis
• Bullet points for lists
1. Numbered lists
*Italic text* for subtle emphasis"
              />
            </div>
          )}
          
          {showPreview && (
            <div className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl bg-white/80 backdrop-blur-sm shadow-sm min-h-[120px] prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700">
                {formData.description || 'No description provided'}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="target_completion_date" className="block text-sm font-semibold text-gray-700 mb-2">
            Target Completion Date
          </label>
          <input
            type="date"
            id="target_completion_date"
            name="target_completion_date"
            value={formData.target_completion_date}
            onChange={handleChange}
            className={`w-full border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200 ${isInline ? 'px-3 py-2' : 'px-4 py-3'}`}
          />
        </div>

        <div className={`flex justify-end space-x-4 ${isInline ? 'pt-4' : 'pt-6'}`}>
          <button
            type="button"
            onClick={onCancel}
            className={`text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-500/20 transition-all duration-200 font-medium ${isInline ? 'px-4 py-2' : 'px-6 py-3'}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`bg-black text-white rounded-2xl hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-black/20 disabled:opacity-50 shadow-lg transition-all duration-200 transform hover:scale-105 font-medium ${isInline ? 'px-6 py-2' : 'px-8 py-3'}`}
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </span>
            ) : (
              <span className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{goal ? 'Update Goal' : 'Create Goal'}</span>
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GoalForm; 