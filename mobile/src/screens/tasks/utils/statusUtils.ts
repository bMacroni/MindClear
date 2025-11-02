type LifecycleStatus = 'not_started' | 'in_progress' | 'completed';

const lifecycleStatuses: LifecycleStatus[] = ['not_started', 'in_progress', 'completed'];

export const getLifecycleStatus = (status: string): LifecycleStatus => {
  if (lifecycleStatuses.includes(status as LifecycleStatus)) {
    return status as LifecycleStatus;
  }

  if (status.includes(':')) {
    const parts = status.split(':');
    if (parts.length > 1 && lifecycleStatuses.includes(parts[1] as LifecycleStatus)) {
      return parts[1] as LifecycleStatus;
    }
  }

  return 'not_started';
};

