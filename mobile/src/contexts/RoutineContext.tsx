import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Routine, CreateRoutinePayload, routineService } from '../services/routineService';
import { useToast } from '../contexts/ToastContext';
import { authService } from '../services/auth';
interface LogCompletionResult {
    routine: Routine;
    celebration?: any; // Define proper celebration type based on routineService
}

interface RoutineContextType {
    routines: Routine[];
    isLoading: boolean;
    isRefreshing: boolean;
    refreshRoutines: () => Promise<void>;
    createRoutine: (payload: CreateRoutinePayload) => Promise<Routine | null>;
    updateRoutine: (id: string, payload: Partial<CreateRoutinePayload>) => Promise<Routine | null>;
    deleteRoutine: (id: string) => Promise<boolean>;
    logCompletion: (id: string, notes?: string) => Promise<LogCompletionResult>;
    undoCompletion: (id: string) => Promise<void>;
    removeCompletion: (id: string, completionId: string) => Promise<void>;
}

const RoutineContext = createContext<RoutineContextType | undefined>(undefined);

export const useRoutines = () => {
    const context = useContext(RoutineContext);
    if (!context) {
        throw new Error('useRoutines must be used within a RoutineProvider');
    }
    return context;
};

export const RoutineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [routines, setRoutines] = useState<Routine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();

    const fetchRoutines = useCallback(async (background = false) => {
        if (!background) {
            setIsLoading(true);
            setError(null);
        }
        try {
            const data = await routineService.getAllRoutines();
            setRoutines(data);
            setError(null);
        } catch (err: any) {
            console.error('Error fetching routines:', err);
            const message = err.response?.data?.message || 'Failed to load routines';
            setError(message);
            // Don't show toast for background refetch
            if (!background) showToast('error', message);
        } finally {
            if (!background) setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [showToast]);


    useEffect(() => {
        const unsubscribe = authService.subscribe((state) => {
            if (state.isAuthenticated && state.token) {
                // User just logged in or initial load with token
                fetchRoutines(false);
            } else {
                // User logged out
                setRoutines([]);
            }
        });

        // Initial check
        if (authService.isAuthenticated()) {
            fetchRoutines(false);
        } else {
            setIsLoading(false);
        }

        return () => {
            unsubscribe();
        };
    }, [fetchRoutines]);



    const refreshRoutines = async () => {
        setIsRefreshing(true);
        await fetchRoutines(true);
    };

    const createRoutine = async (payload: CreateRoutinePayload) => {
        try {
            const newRoutine = await routineService.createRoutine(payload);
            setRoutines(prev => [newRoutine, ...prev]);
            showToast('success', 'Routine created successfully!');
            return newRoutine;
        } catch (error: any) {
            console.error('Error creating routine:', error);
            const msg = error.response?.data?.message || 'Failed to create routine';
            showToast('error', msg);
            return null;
        }
    };

    const updateRoutine = async (id: string, payload: Partial<CreateRoutinePayload>) => {
        try {
            const updatedRoutine = await routineService.updateRoutine(id, payload);
            setRoutines(prev => prev.map(r => r.id === id ? updatedRoutine : r));
            showToast('success', 'Routine updated');
            return updatedRoutine;
        } catch (error: any) {
            console.error('Error updating routine:', error);
            showToast('error', 'Failed to update routine');
            return null;
        }
    };

    const deleteRoutine = async (id: string) => {
        try {
            await routineService.deleteRoutine(id);
            setRoutines(prev => prev.filter(r => r.id !== id));
            showToast('success', 'Routine deleted');
            return true;
        } catch (error: any) {
            console.error('Error deleting routine:', error);
            showToast('error', 'Failed to delete routine');
            return false;
        }
    };

    const logCompletion = async (id: string, notes?: string) => {
        try {
            // Optimistic update
            const now = new Date();
            setRoutines(prev => prev.map(r => {
                if (r.id === id) {
                    // Simple optimistic logic: increment counts
                    // This is imperfect but provides instant feedback
                    const prevStatus = r.period_status ?? {
                        completions_count: 0,
                        is_complete: false,
                        target_count: r.target_count,
                        period_date: new Date().toISOString()
                    };
                    const newCount = (prevStatus.completions_count || 0) + 1;
                    const isComplete = newCount >= (r.target_count || 0);
                    return {
                        ...r,
                        total_completions: (r.total_completions || 0) + 1,
                        current_streak: isComplete && !prevStatus.is_complete ? (r.current_streak || 0) + 1 : (r.current_streak || 0),
                        period_status: {
                            ...prevStatus,
                            completions_count: newCount,
                            is_complete: isComplete
                        }
                    };
                }
                return r;
            }));

            const { routine, celebration } = await routineService.logCompletion(id, notes);

            // Update with actual server data
            setRoutines(prev => prev.map(r => r.id === id ? routine : r));

            return { routine, celebration };
        } catch (error: any) {
            console.error('Error logging completion:', error);
            showToast('error', 'Failed to complete routine');
            // Revert optimistic update by refreshing
            refreshRoutines();
            throw error;
        }
    };

    const undoCompletion = async (id: string) => {
        try {
            // Optimistic update
            setRoutines(prev => prev.map(r => {
                if (r.id === id) {
                    const prevStatus = r.period_status ?? {
                        completions_count: 0,
                        is_complete: false,
                        target_count: r.target_count,
                        period_date: new Date().toISOString()
                    };
                    const newCount = Math.max(0, (prevStatus.completions_count || 0) - 1);
                    const wasComplete = prevStatus.is_complete;
                    const isComplete = newCount >= (r.target_count || 0);

                    let newStreak = r.current_streak || 0;
                    // Initial heuristic: if we drop from complete -> incomplete, decrement streak if valid
                    if (wasComplete && !isComplete && newStreak > 0) {
                        newStreak -= 1;
                    }

                    return {
                        ...r,
                        total_completions: Math.max(0, (r.total_completions || 0) - 1),
                        current_streak: newStreak,
                        period_status: {
                            ...prevStatus,
                            completions_count: newCount,
                            is_complete: isComplete
                        }
                    };
                }
                return r;
            }));

            const response = await routineService.undoCompletion(id);
            // Ideally we'd get the enriched routine back from undoCompletion too, to confirm state.
            // My backend implementation returns { routine: enrichedRoutine }, checking service..
            // The service returns void right now in the interface, need to update if I want to use the return value.
            // For now, I'll rely on the optimistic update + background refresh if needed or update service to return it.
            // The controller implementation DOES return the routine. 
            // I'll stick to refresh for safety or update service separately. 
            // Let's just trigger a silent refresh to ensure sync.
            // Actually, for better UX, I should just trust my optimistic logic and maybe fetch in background.
            refreshRoutines();
        } catch (error) {
            console.error('Error undoing completion:', error);
            showToast('error', 'Failed to undo completion');
            refreshRoutines();
        }
    };

    const removeCompletion = async (id: string, completionId: string) => {
        try {
            await routineService.removeCompletion(id, completionId);
            refreshRoutines(); // Refresh to get correct stats
        } catch (error) {
            console.error('Error removing completion:', error);
            showToast('error', 'Failed to undo completion');
        }
    };

    return (
        <RoutineContext.Provider value={{
            routines,
            isLoading,
            isRefreshing,
            error,
            refreshRoutines,
            createRoutine,
            updateRoutine,
            deleteRoutine,
            logCompletion,
            undoCompletion,
            removeCompletion
        }}>
            {children}
        </RoutineContext.Provider>
    );
};
