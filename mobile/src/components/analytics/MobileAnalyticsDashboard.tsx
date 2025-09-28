import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Octicons';
import { colors } from '../../themes/colors';
import { spacing, borderRadius } from '../../themes/spacing';
import { typography } from '../../themes/typography';
import { apiService, ApiResponse, ApiError } from '../../services/apiService';
import ScreenHeader from '../common/ScreenHeader';

const { width } = Dimensions.get('window');

interface AnalyticsData {
  timeframe: string;
  totalEvents: number;
  activeUsers: number;
  goalCreations: number;
  taskCompletions: number;
  manualGoals: number;
  aiGoals: number;
  eventBreakdown: Array<{ event_name: string; count: number }>;
  recentEvents: Array<{ event_name: string; created_at: string; user_id: string }>;
  aiTokenUsage?: {
    totalTokensUsed: number;
    avgTokensPerUser: number;
    usersWithTokens: number;
  };
  aiMessageStats?: {
    totalAiMessages: number;
    aiMessageEventBreakdown: Array<{ event_name: string; total_action_count: number }>;
    usersWithAiMessages: number;
  };
  perUserStats?: {
    avgGoalsPerUser: number;
    avgTasksPerUser: number;
    avgAiMessagesPerUser: number;
    totalUsersWithGoals: number;
    totalUsersWithTasks: number;
    totalUsersWithAiUsage: number;
  };
}

const MobileAnalyticsDashboard: React.FC = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');

  const loadAnalyticsData = async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response: ApiResponse<AnalyticsData> = await apiService.get('/analytics/dashboard', {
        params: { timeframe: selectedTimeframe }
      });

      if (!response.ok) {
        const errorMessage = typeof response.data === 'object' && response.data && 'error' in response.data
          ? (response.data as ApiError).error
          : 'Failed to load analytics data';
        throw new Error(errorMessage);
      }

      setAnalyticsData(response.data as AnalyticsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedTimeframe]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const getTimeframeLabel = (timeframe: string): string => {
    const labels = {
      '24h': '24h',
      '7d': '7d',
      '30d': '30d',
      '90d': '90d'
    };
    return labels[timeframe as keyof typeof labels] || timeframe;
  };

  const MetricCard = ({ title, value, subtitle, icon, color = colors.primary }: {
    title: string;
    value: string;
    subtitle: string;
    icon: 'graph' | 'people' | 'goal' | 'checklist' | 'comment-discussion';
    color?: string;
  }) => (
    <View style={[styles.metricCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <View style={styles.metricContent}>
        <Text style={styles.metricTitle}>{title}</Text>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricSubtitle}>{subtitle}</Text>
      </View>
      <Icon
        name={icon}
        size={24}
        color={color}
        style={styles.metricIcon}
        accessibilityLabel={`metric-${title.toLowerCase().replace(/\s+/g, '-')}-icon`}
      />
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Analytics" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Analytics" />
        <View style={styles.errorContainer}>
          <Icon
            name="alert"
            size={24}
            color={colors.error}
            accessibilityRole="image"
            accessibilityLabel="Analytics load error"
          />
          <Text style={styles.errorTitle}>Error Loading Analytics</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadAnalyticsData()}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Analytics Dashboard" />

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAnalyticsData(true)}
            colors={[colors.primary]}
          />
        }
      >
        {/* Timeframe Selector */}
        <View style={styles.timeframeContainer}>
          {(['24h', '7d', '30d', '90d'] as const).map((timeframe) => (
            <TouchableOpacity
              key={timeframe}
              style={[
                styles.timeframeButton,
                selectedTimeframe === timeframe && styles.timeframeButtonActive
              ]}
              onPress={() => setSelectedTimeframe(timeframe)}
            >
              <Text
                style={[
                  styles.timeframeButtonText,
                  selectedTimeframe === timeframe && styles.timeframeButtonTextActive
                ]}
              >
                {getTimeframeLabel(timeframe)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Key Metrics */}
        {analyticsData && (
          <View style={styles.metricsContainer}>
            <MetricCard
              title="Total Events"
              value={formatNumber(analyticsData.totalEvents)}
              subtitle={getTimeframeLabel(selectedTimeframe)}
              icon="graph"
              color={colors.primary}
            />
            <MetricCard
              title="Active Users"
              value={formatNumber(analyticsData.activeUsers)}
              subtitle="Unique users"
              icon="people"
              color={colors.success}
            />
            <MetricCard
              title="Goal Creations"
              value={formatNumber(analyticsData.goalCreations)}
              subtitle="Manual + AI"
              icon="goal"
              color={colors.warning}
            />
            <MetricCard
              title="Task Completions"
              value={formatNumber(analyticsData.taskCompletions)}
              subtitle="Completed tasks"
              icon="checklist"
              color={colors.info}
            />
          </View>
        )}

        {/* AI Token Usage Metrics */}
        {analyticsData?.aiTokenUsage && (
          <View style={styles.metricsContainer}>
            <MetricCard
              title="AI Tokens Used"
              value={formatNumber(analyticsData.aiTokenUsage.totalTokensUsed)}
              subtitle="Total tokens"
              icon="graph"
              color="#8B5CF6"
            />
            <MetricCard
              title="Avg Tokens/User"
              value={formatNumber(analyticsData.aiTokenUsage.avgTokensPerUser)}
              subtitle="Per user"
              icon="people"
              color="#06B6D4"
            />
            <MetricCard
              title="AI Users"
              value={formatNumber(analyticsData.aiTokenUsage.usersWithTokens)}
              subtitle="Using AI"
              icon="checklist"
              color="#10B981"
            />
          </View>
        )}

        {/* AI Message Statistics */}
        {analyticsData?.aiMessageStats && (
          <View style={styles.metricsContainer}>
            <MetricCard
              title="AI Messages"
              value={formatNumber(analyticsData.aiMessageStats.totalAiMessages)}
              subtitle="Total interactions"
              icon="comment-discussion"
              color="#8B5CF6"
            />
            <MetricCard
              title="AI Users"
              value={formatNumber(analyticsData.aiMessageStats.usersWithAiMessages)}
              subtitle="Active users"
              icon="people"
              color="#06B6D4"
            />
            <MetricCard
              title="Avg Messages/User"
              value={analyticsData.perUserStats?.avgAiMessagesPerUser?.toFixed(1) || '0'}
              subtitle="Per user"
              icon="graph"
              color="#10B981"
            />
          </View>
        )}

        {/* Per-User Statistics */}
        {analyticsData?.perUserStats && (
          <View style={styles.metricsContainer}>
            <MetricCard
              title="Avg Goals/User"
              value={analyticsData.perUserStats.avgGoalsPerUser.toFixed(1)}
              subtitle="Goals created"
              icon="goal"
              color="#F59E0B"
            />
            <MetricCard
              title="Avg Tasks/User"
              value={analyticsData.perUserStats.avgTasksPerUser.toFixed(1)}
              subtitle="Tasks created"
              icon="checklist"
              color="#3B82F6"
            />
            <MetricCard
              title="AI Messages/User"
              value={analyticsData.perUserStats.avgAiMessagesPerUser.toFixed(1)}
              subtitle="AI interactions"
              icon="comment-discussion"
              color="#8B5CF6"
            />
          </View>
        )}

        {/* Event Breakdown */}
        {analyticsData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event Types</Text>
            <View style={styles.breakdownContainer}>
              {analyticsData.eventBreakdown.map((event, index) => (
                <View key={index} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{event.event_name}</Text>
                  <Text style={styles.breakdownValue}>{formatNumber(event.count)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* AI Message Event Breakdown */}
        {analyticsData?.aiMessageStats?.aiMessageEventBreakdown && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Message Events</Text>
            <View style={styles.breakdownContainer}>
              {analyticsData.aiMessageStats.aiMessageEventBreakdown.map((event, index) => (
                <View key={index} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{event.event_name}</Text>
                  <Text style={styles.breakdownValue}>{formatNumber(event.total_action_count)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Goal Creation Sources */}
        {analyticsData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Goal Creation Sources</Text>
            <View style={styles.breakdownContainer}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Manual Goals</Text>
                <Text style={styles.breakdownValue}>{formatNumber(analyticsData.manualGoals)}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>AI-Generated Goals</Text>
                <Text style={styles.breakdownValue}>{formatNumber(analyticsData.aiGoals)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Activity */}
        {analyticsData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.activityContainer}>
              {analyticsData.recentEvents.slice(0, 10).map((event, index) => (
                <View key={index} style={styles.activityRow}>
                  <View style={styles.activityLeft}>
                    <Text style={styles.activityEvent}>{event.event_name}</Text>
                    <Text style={styles.activityTime}>
                      {new Date(event.created_at).toLocaleString()}
                    </Text>
                  </View>
                  <Text style={styles.activityUser}>
                    {event.user_id.slice(0, 8)}...
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.secondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.text.disabled,
    marginTop: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  timeframeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  timeframeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  timeframeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeframeButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  timeframeButtonTextActive: {
    color: colors.secondary,
    fontWeight: typography.fontWeight.semibold as any,
  },
  metricsContainer: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  metricCard: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  metricContent: {
    flex: 1,
  },
  metricTitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  metricValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  metricSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  metricIcon: {
    marginLeft: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  breakdownContainer: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  breakdownLabel: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  breakdownValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.primary,
  },
  activityContainer: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  activityLeft: {
    flex: 1,
  },
  activityEvent: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
  },
  activityTime: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  activityUser: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontFamily: 'monospace',
  },
});

export default MobileAnalyticsDashboard;
