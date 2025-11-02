export const extractCalendarEvents = (response: any): any[] => {
  const visited = new WeakSet<object>();

  const walk = (value: any): any[] => {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== 'object') {
      return [];
    }

    if (visited.has(value as object)) {
      return [];
    }

    visited.add(value as object);

    if (Array.isArray((value as any).data)) {
      return (value as any).data;
    }

    if (Array.isArray((value as any).events)) {
      return (value as any).events;
    }

    if (Array.isArray((value as any).items)) {
      return (value as any).items;
    }

    if ((value as any).data) {
      const nestedFromData = walk((value as any).data);
      if (nestedFromData.length) {
        return nestedFromData;
      }
    }

    for (const nestedValue of Object.values(value)) {
      const nested = walk(nestedValue);
      if (nested.length) {
        return nested;
      }
    }

    return [];
  };

  return walk(response);
};

