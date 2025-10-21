import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

/**
 * Generate a deterministic anonymized ID from a user ID
 * Uses SHA-256 hash truncated to 8 characters for consistent anonymization
 */
const generateAnonymizedUserId = async (userId) => {
  // Input validation: ensure userId is a non-empty string
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new TypeError('userId must be a non-empty string');
  }

  try {
    // Convert user ID to Uint8Array
    const encoder = new TextEncoder();
    const data = encoder.encode(userId);
    
    // Generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert to hex string and take first 8 characters
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex.substring(0, 8);
  } catch (error) {
    console.error('Error generating anonymized user ID:', error);
    // Fallback to a simple hash if crypto API fails
    return userId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & 0xffffffff; // Mask to 32 bits
    }, 0).toString(16).padStart(8, '0').substring(0, 8);
  }
};

/**
 * Internal Analytics Dashboard for Product Team
 * Provides basic metrics and insights from user analytics
 */
const AnalyticsDashboard = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState('7d');
  const [anonymizedUserIds, setAnonymizedUserIds] = useState(new Map());

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        // For now, we'll use the existing API to query analytics data
        // In a real implementation, you might want to create specific analytics endpoints
        const response = await api.get('/analytics/dashboard', {
          params: { timeframe: selectedTimeframe }
        });

        if (isMounted) {
          setAnalyticsData(response.data);
        }
      } catch (err) {
        console.error('Error loading analytics:', err);
        if (isMounted) {
          setError('Failed to load analytics data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [selectedTimeframe]);

  // Process analytics data to generate anonymized user IDs
  useEffect(() => {
    if (analyticsData?.recentEvents) {
      processAnonymizedUserIds();
    }
  }, [analyticsData, processAnonymizedUserIds]);

  const processAnonymizedUserIds = useCallback(async () => {
    if (!analyticsData?.recentEvents) return;

    const uniqueUserIds = [...new Set(analyticsData.recentEvents.map(event => event.user_id))];
    const newAnonymizedIds = new Map();

    // Generate anonymized IDs for all unique user IDs
    for (const userId of uniqueUserIds) {
      if (!anonymizedUserIds.has(userId)) {
        const anonymizedId = await generateAnonymizedUserId(userId);
        newAnonymizedIds.set(userId, anonymizedId);
      }
    }

    // Update state with new anonymized IDs
    if (newAnonymizedIds.size > 0) {
      setAnonymizedUserIds(prev => new Map([...prev, ...newAnonymizedIds]));
    }
  }, [analyticsData, anonymizedUserIds, setAnonymizedUserIds]);


  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num?.toString() || '0';
  };

  const getTimeframeLabel = (timeframe) => {
    const labels = {
      '24h': 'Last 24 Hours',
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days',
      '90d': 'Last 90 Days'
    };
    return labels[timeframe] || timeframe;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="p-6">
        <div className="text-gray-500">No analytics data available</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Internal analytics for closed beta</p>
        </div>
        <div className="flex space-x-2">
          {['24h', '7d', '30d', '90d'].map((timeframe) => (
            <button
              key={timeframe}
              onClick={() => setSelectedTimeframe(timeframe)}
              className={`px-3 py-2 text-sm rounded-md ${
                selectedTimeframe === timeframe
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {getTimeframeLabel(timeframe)}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Events"
          value={formatNumber(analyticsData.totalEvents)}
          subtitle={`${getTimeframeLabel(selectedTimeframe)}`}
          icon="📊"
        />
        <MetricCard
          title="Active Users"
          value={formatNumber(analyticsData.activeUsers)}
          subtitle="Unique users"
          icon="👥"
        />
        <MetricCard
          title="Goal Creations"
          value={formatNumber(analyticsData.goalCreations)}
          subtitle="Manual + AI"
          icon="🎯"
        />
        <MetricCard
          title="Task Completions"
          value={formatNumber(analyticsData.taskCompletions)}
          subtitle="Completed tasks"
          icon="✅"
        />
      </div>

      {/* AI Token Usage Metrics */}
      {analyticsData.aiTokenUsage && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Total AI Tokens"
            value={formatNumber(analyticsData.aiTokenUsage.totalTokensUsed)}
            subtitle="Used in timeframe"
            icon="🤖"
          />
          <MetricCard
            title="Avg Tokens/User"
            value={formatNumber(analyticsData.aiTokenUsage.avgTokensPerUser)}
            subtitle="Per active user"
            icon="📝"
          />
          <MetricCard
            title="AI Users"
            value={formatNumber(analyticsData.aiTokenUsage.usersWithTokens)}
            subtitle="Users using AI"
            icon="👤"
          />
        </div>
      )}

      {/* AI Message Statistics */}
      {analyticsData.aiMessageStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Total AI Messages"
            value={formatNumber(analyticsData.aiMessageStats.totalAiMessages)}
            subtitle="AI interactions (with action count)"
            icon="💬"
          />
          <MetricCard
            title="AI Message Users"
            value={formatNumber(analyticsData.aiMessageStats.usersWithAiMessages)}
            subtitle="Users with AI interactions"
            icon="👤"
          />
          <MetricCard
            title="Avg AI Messages/User"
            value={analyticsData.perUserStats?.avgAiMessagesPerUser || 0}
            subtitle="AI interactions per user"
            icon="📊"
          />
        </div>
      )}

      {/* Per-User Statistics */}
      {analyticsData.perUserStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Avg Goals/User"
            value={analyticsData.perUserStats.avgGoalsPerUser}
            subtitle="Goals created per user"
            icon="🎯"
          />
          <MetricCard
            title="Avg Tasks/User"
            value={analyticsData.perUserStats.avgTasksPerUser}
            subtitle="Tasks created per user"
            icon="📋"
          />
          <MetricCard
            title="AI Messages/User"
            value={analyticsData.perUserStats.avgAiMessagesPerUser}
            subtitle="AI interactions per user"
            icon="💬"
          />
        </div>
      )}

      {/* Event Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Types</h3>
          <div className="space-y-3">
            {analyticsData.eventBreakdown?.length ? (
              analyticsData.eventBreakdown.map((event, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-gray-700">{event.event_name}</span>
                  <span className="font-semibold">{formatNumber(event.count)}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No event data available</div>
            )}
          </div>
        </div>

        {/* AI Message Event Breakdown */}
        {analyticsData.aiMessageStats?.aiMessageEventBreakdown && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Message Events</h3>
            <div className="space-y-3">
              {analyticsData.aiMessageStats.aiMessageEventBreakdown.length ? (
                analyticsData.aiMessageStats.aiMessageEventBreakdown.map((event, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-gray-700">{event.event_name}</span>
                    <span className="font-semibold">{formatNumber(event.total_action_count)}</span>
                  </div>
                ))
              ) : (
                <div className="text-gray-500">No AI message event data available</div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Goal Creation Sources</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Manual Goals</span>
              <span className="font-semibold">{formatNumber(analyticsData.manualGoals)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">AI-Generated Goals</span>
              <span className="font-semibold">{formatNumber(analyticsData.aiGoals)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-2">
          {analyticsData.recentEvents?.length ? (
            analyticsData.recentEvents.map((event, index) => (
              <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                <div>
                  <span className="font-medium text-gray-900">{event.event_name}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  User {anonymizedUserIds.get(event.user_id) || 'unknown'}
                </span>
              </div>
            ))
          ) : (
            <div className="text-gray-500">No recent activity</div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Metric Card Component
 */
const MetricCard = ({ title, value, subtitle, icon }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>
      <div className="text-3xl">{icon}</div>
    </div>
  </div>
);

export default AnalyticsDashboard;

