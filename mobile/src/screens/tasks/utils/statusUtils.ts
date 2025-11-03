type LifecycleStatus = 'not_started' | 'in_progress' | 'completed';

const lifecycleStatuses: LifecycleStatus[] = ['not_started', 'in_progress', 'completed'];

export const getLifecycleStatus = (status: string): LifecycleStatus => {
  if (lifecycleStatuses.includes(status as LifecycleStatus)) {
    return status as LifecycleStatus;
  }

  if (status.includes(':')) {
    const parts = status.split(':');
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (lifecycleStatuses.includes(trimmedPart as LifecycleStatus)) {
        return trimmedPart as LifecycleStatus;
      }
    }
  }
  return 'not_started';
};

