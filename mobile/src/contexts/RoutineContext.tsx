import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Routine, CreateRoutinePayload, routineService } from '../services/routineService';
import { useToast } from '../contexts/ToastContext';

interface RoutineContextType {
    routines: Routine[];
    isLoading: boolean;
    isRefreshing: boolean;
    refreshRoutines: () => Promise<void>;
    createRoutine: (payload: CreateRoutinePayload) => Promise<Routine | null>;
    updateRoutine: (id: string, payload: Partial<CreateRoutinePayload>) => Promise<Routine | null>;
    deleteRoutine: (id: string) => Promise<boolean>;
    logCompletion: (id: string, notes?: string) => Promise<any>;
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
    const { showToast } = useToast();

    const fetchRoutines = useCallback(async (background = false) => {
        if (!background) setIsLoading(true);
        try {
            const data = await routineService.getAllRoutines();
            setRoutines(data);
        } catch (error) {
            console.error('Error fetching routines:', error);
            // Don't show toast for background refetch
            if (!background) showToast('error', 'Failed to load routines');
        } finally {
            if (!background) setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchRoutines();
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
                    const newCount = (r.period_status?.completions_count || 0) + 1;
                    const isComplete = newCount >= r.target_count;
                    return {
                        ...r,
                        total_completions: r.total_completions + 1,
                        current_streak: isComplete && !r.period_status?.is_complete ? r.current_streak + 1 : r.current_streak,
                        period_status: {
                            ...r.period_status!,
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
            refreshRoutines,
            createRoutine,
            updateRoutine,
            deleteRoutine,
            logCompletion,
            removeCompletion
        }}>
            {children}
        </RoutineContext.Provider>
    );
};
