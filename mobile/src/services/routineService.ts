import { apiService } from './apiService';

export interface Routine {
    id: string;
    user_id: string;
    title: string;
    description?: string;
    frequency_type: 'daily' | 'weekly' | 'monthly';
    target_count: number;
    time_window: 'morning' | 'afternoon' | 'evening' | 'anytime';
    icon: string;
    color: string;
    is_active: boolean;
    reminder_enabled: boolean;
    reminder_time?: string;
    timezone: string;
    current_streak: number;
    longest_streak: number;
    total_completions: number;
    grace_periods_remaining: number;
    period_status?: {
        completions_count: number;
        target_count: number;
        is_complete: boolean;
        period_date: string;
    };
}

export interface CreateRoutinePayload {
    title: string;
    description?: string;
    frequency_type?: 'daily' | 'weekly' | 'monthly';
    target_count?: number;
    time_window?: 'morning' | 'afternoon' | 'evening' | 'anytime';
    icon?: string;
    color?: string;
    reminder_enabled?: boolean;
    reminder_time?: string;
    timezone?: string;
}

export const routineService = {
    async getAllRoutines(): Promise<Routine[]> {
        const response = await apiService.get<Routine[]>('/routines');
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to fetch routines');
        return response.data as Routine[];
    },

    async createRoutine(payload: CreateRoutinePayload): Promise<Routine> {
        const response = await apiService.post<Routine>('/routines', payload);
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to create routine');
        return response.data as Routine;
    },

    async updateRoutine(id: string, payload: Partial<CreateRoutinePayload>): Promise<Routine> {
        const response = await apiService.put<Routine>(`/routines/${id}`, payload);
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to update routine');
        return response.data as Routine;
    },

    async deleteRoutine(id: string): Promise<void> {
        const response = await apiService.delete(`/routines/${id}`);
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to delete routine');
    },

    async logCompletion(id: string, notes?: string): Promise<{ routine: Routine; celebration?: any }> {
        const response = await apiService.post<{ routine: Routine; celebration?: any }>(`/routines/${id}/complete`, { notes });
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to complete routine');
        return response.data as { routine: Routine; celebration?: any };
    },

    async undoCompletion(id: string): Promise<void> {
        const response = await apiService.post(`/routines/${id}/undo`, {});
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to undo routine completion');
    },

    async removeCompletion(id: string, completionId: string): Promise<void> {
        const response = await apiService.delete(`/routines/${id}/completions/${completionId}`);
        if (!response.ok) throw new Error((response.data as any)?.error || 'Failed to undo completion');
    }
};
