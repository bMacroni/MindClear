import React from 'react';

export const navigationRef = React.createRef<any>();

export function getCurrentRouteName(): string | undefined {
  try {
    return navigationRef.current?.getCurrentRoute?.()?.name;
  } catch {
    return undefined;
  }
}


