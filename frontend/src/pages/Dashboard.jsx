import React, { useState, useEffect } from 'react'
import GoalList from '../components/GoalList'
import TaskList from '../components/TaskList'
import TasksPage from '../components/TasksPage'
import CalendarStatus from '../components/CalendarStatus'
import CalendarEvents from '../components/CalendarEvents'
import AIChat from '../components/AIChat'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import AssistantThread from '../components/assistant-ui/AssistantThread'
import FeedbackModal from '../components/FeedbackModal';
import SidebarNav from '../components/SidebarNav';
import analyticsService from '../services/analyticsService';

function Dashboard({ showSuccess }) {
  const [activeTab, setActiveTab] = useState('ai');
  const [useAssistantThread, setUseAssistantThread] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Track screen views
  useEffect(() => {
    analyticsService.trackScreenView('dashboard', { tab: activeTab });
  }, [activeTab]);

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar Navigation */}
      <SidebarNav 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        onShowFeedback={() => setShowFeedbackModal(true)}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative lg:ml-16">
        {/* Mobile Hamburger (top left) */}
        <button
          className="lg:hidden absolute top-4 left-4 z-20 p-2 rounded-md bg-white/80 shadow border border-gray-200"
          onClick={() => setShowMobileSidebar(true)}
        >
          <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Content Area */}
        <div className={`flex-1 ${activeTab === 'ai' ? 'p-0' : 'p-4 lg:p-6'}`}
          style={{ maxWidth: '100vw' }}
        >
          {activeTab === 'ai' && (
            <div className="h-full">
              {/* Assistant UI runtime provider for chat streaming */}
              <AssistantRuntimeProvider runtime={useChatRuntime({ api: '/api/chat' })}>
                <AIChatOrAssistantThread
                  onNavigateToTab={setActiveTab}
                  useAssistantThread={useAssistantThread}
                  onToggle={() => setUseAssistantThread(v => !v)}
                />
              </AssistantRuntimeProvider>
            </div>
          )}
          {activeTab !== 'ai' && (
            <div className="h-full flex flex-col">
              {/* Tab Header */}
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl lg:text-2xl font-bold text-black capitalize">
                  {activeTab === 'goals' ? 'Goals' : 
                   activeTab === 'tasks' ? 'Tasks' : 
                   activeTab === 'calendar' ? 'Calendar' : activeTab}
                </h2>
                {/* Removed Back to AI button */}
              </div>
              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'goals' && <GoalList showSuccess={showSuccess} />}
                {activeTab === 'tasks' && <TasksPage showSuccess={showSuccess} />}
                {activeTab === 'calendar' && (
                  <div className="space-y-6">
                    <CalendarStatus />
                    <CalendarEvents />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Sidebar Drawer */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden">
          <div className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl z-50 flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Mind Clear</h2>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-4 flex-1">
              <div className="space-y-2">
                {[
                  { id: 'ai', label: 'AI Chat' },
                  { id: 'goals', label: 'Goals' },
                  { id: 'tasks', label: 'Tasks' },
                  { id: 'calendar', label: 'Calendar' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMobileSidebar(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
            </nav>
            {/* Mobile Help and Logout */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              <button
                onClick={() => {
                  setShowFeedbackModal(true);
                  setShowMobileSidebar(false);
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <span className="font-medium">Help</span>
              </button>
              <button
                onClick={() => {
                  handleLogout();
                  setShowMobileSidebar(false);
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
              >
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
      )}
    </div>
  );
}

export default Dashboard 

function AIChatOrAssistantThread({ onNavigateToTab, useAssistantThread, onToggle }) {
  return (
    <div className="h-full flex flex-col relative">
      {/* Floating toggle in the top-right to ensure visibility */}
      <div className="absolute top-3 right-4 z-20">
        <button
          onClick={onToggle}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white/90 hover:bg-gray-50 shadow-sm"
          aria-pressed={useAssistantThread}
          title={useAssistantThread ? 'Use legacy AI chat' : 'Try new Assistant UI thread'}
        >
          {useAssistantThread ? 'Use Legacy Chat' : 'Try Assistant UI'}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {useAssistantThread ? (
          <AssistantThread />
        ) : (
          <AIChat onNavigateToTab={onNavigateToTab} />
        )}
      </div>
    </div>
  )
}