import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlatList, ListRenderItem, View, ActivityIndicator, Text } from 'react-native';
import { colors } from '../themes/colors';
import { spacing } from '../themes/spacing';
import { typography } from '../themes/typography';

interface LazyListProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  initialLoadSize?: number;
  loadMoreSize?: number;
  threshold?: number;
  onLoadMore?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  loading?: boolean;
  refreshing?: boolean;
  hasMore?: boolean;
  emptyComponent?: React.ComponentType;
  loadingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: string; onRetry: () => void }>;
  style?: any;
  contentContainerStyle?: any;
  [key: string]: any;
}

/**
 * LazyList - A performance-optimized list component with lazy loading
 * 
 * Features:
 * - Virtual scrolling for large datasets
 * - Lazy loading with pagination
 * - Pull-to-refresh support
 * - Loading states and error handling
 * - Memory-efficient rendering
 */
export function LazyList<T>({
  data,
  renderItem,
  keyExtractor,
  initialLoadSize = 20,
  loadMoreSize = 10,
  threshold = 0.5,
  onLoadMore,
  onRefresh,
  loading = false,
  refreshing = false,
  hasMore = true,
  emptyComponent: EmptyComponent,
  loadingComponent: LoadingComponent,
  errorComponent: ErrorComponent,
  style,
  contentContainerStyle,
  ...props
}: LazyListProps<T>) {
  const [displayedData, setDisplayedData] = useState<T[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Initialize displayed data
  useEffect(() => {
    const initialData = data.slice(0, initialLoadSize);
    setDisplayedData(initialData);
    setCurrentIndex(initialLoadSize);
  }, [data, initialLoadSize]);

  // Load more data when needed
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || currentIndex >= data.length) return;

    try {
      setError(null);
      
      // Load more from local data first
      const nextIndex = Math.min(currentIndex + loadMoreSize, data.length);
      const newData = data.slice(currentIndex, nextIndex);
      
      if (newData.length > 0) {
        setDisplayedData(prev => [...prev, ...newData]);
        setCurrentIndex(nextIndex);
      }

      // If we've reached the end of local data, try to load more from server
      if (nextIndex >= data.length && onLoadMore) {
        await onLoadMore();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more data');
    }
  }, [hasMore, loading, currentIndex, data.length, loadMoreSize, data, onLoadMore]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      try {
        setError(null);
        await onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
      }
    }
  }, [onRefresh]);

  // Memoized render item for performance
  const memoizedRenderItem = useCallback(({ item, index, separators }: { item: T; index: number; separators: any }) => {
    return renderItem({ item, index, separators });
  }, [renderItem]);

  // Memoized key extractor for performance
  const memoizedKeyExtractor = useCallback((item: T, index: number) => {
    return keyExtractor(item, index);
  }, [keyExtractor]);

  // Handle end reached
  const handleEndReached = useCallback(() => {
    if (hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  // Default empty component
  const DefaultEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No items found</Text>
    </View>
  );

  // Default loading component
  const DefaultLoadingComponent = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.loadingText}>Loading more...</Text>
    </View>
  );

  // Default error component
  const DefaultErrorComponent = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>{error}</Text>
      <Text style={styles.retryText} onPress={onRetry}>Tap to retry</Text>
    </View>
  );

  // List footer component
  const ListFooterComponent = useMemo(() => {
    if (error) {
      const ErrorComp = ErrorComponent || DefaultErrorComponent;
      return <ErrorComp error={error} onRetry={loadMore} />;
    }
    
    if (loading && hasMore) {
      const LoadingComp = LoadingComponent || DefaultLoadingComponent;
      return <LoadingComp />;
    }
    
    return null;
  }, [error, loading, hasMore, ErrorComponent, LoadingComponent, loadMore]);

  // Empty component
  const EmptyComp = EmptyComponent || DefaultEmptyComponent;

  return (
    <FlatList
      data={displayedData}
      renderItem={memoizedRenderItem}
      keyExtractor={memoizedKeyExtractor}
      onEndReached={handleEndReached}
      onEndReachedThreshold={threshold}
      onRefresh={onRefresh ? handleRefresh : undefined}
      refreshing={refreshing}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={displayedData.length === 0 ? EmptyComp : null}
      style={style}
      contentContainerStyle={contentContainerStyle}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={initialLoadSize}
      windowSize={10}
      getItemLayout={undefined} // Let FlatList calculate automatically
      {...props}
    />
  );
}

const styles = {
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center' as const,
  },
  loadingContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  errorContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center' as const,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error,
    textAlign: 'center' as const,
    marginBottom: spacing.xs,
  },
  retryText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    textDecorationLine: 'underline' as const,
  },
};

/**
 * Hook for managing lazy list state
 */
export function useLazyList<T>(
  initialData: T[] = [],
  options: {
    initialLoadSize?: number;
    loadMoreSize?: number;
    onLoadMore?: () => Promise<T[]>;
    onRefresh?: () => Promise<T[]>;
  } = {}
) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { initialLoadSize = 20, loadMoreSize = 10, onLoadMore, onRefresh } = options;

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMore || loading || !hasMore) return;

    try {
      setLoading(true);
      setError(null);
      const newData = await onLoadMore();
      
      if (newData.length === 0) {
        setHasMore(false);
      } else {
        setData(prev => [...prev, ...newData]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more data');
    } finally {
      setLoading(false);
    }
  }, [onLoadMore, loading, hasMore]);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;

    try {
      setRefreshing(true);
      setError(null);
      const newData = await onRefresh();
      setData(newData);
      setHasMore(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return {
    data,
    loading,
    refreshing,
    hasMore,
    error,
    loadMore: handleLoadMore,
    refresh: handleRefresh,
    setData,
    setError,
  };
}
