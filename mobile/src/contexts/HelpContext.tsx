import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { LayoutRectangle } from 'react-native';

export type HelpContent = Record<string, string>;

type TargetLayouts = Record<string, LayoutRectangle & { pageX: number; pageY: number }>;
type ScopedTargetLayouts = Record<string, TargetLayouts>; // scope -> helpId -> layout

interface HelpContextValue {
  isHelpOverlayActive: boolean;
  setIsHelpOverlayActive: (active: boolean) => void;
  currentScope: string;
  setHelpScope: (scope: string) => void;
  helpContent: HelpContent;
  setHelpContent: (content: HelpContent) => void;
  registerTargetLayout: (helpId: string, layout: LayoutRectangle & { pageX: number; pageY: number }, scope: string) => void;
  unregisterTargetLayout: (helpId: string, scope: string) => void;
  targetLayouts: TargetLayouts;
}

const HelpContext = createContext<HelpContextValue | undefined>(undefined);
const HelpLocalScopeContext = createContext<string>('default');

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHelpOverlayActive, setIsHelpOverlayActive] = useState<boolean>(false);
  const [helpContent, _setHelpContent] = useState<HelpContent>({});
  const allTargetLayoutsRef = useRef<ScopedTargetLayouts>({});
  const [currentScope, setCurrentScope] = useState<string>('default');
  const [layoutsVersion, setLayoutsVersion] = useState(0);

  const setHelpContent = useCallback((content: HelpContent) => {
    _setHelpContent(content || {});
  }, []);

  const registerTargetLayout = useCallback((helpId: string, layout: LayoutRectangle & { pageX: number; pageY: number }, scope: string) => {
    const scopeMap = allTargetLayoutsRef.current[scope] || {};
    allTargetLayoutsRef.current = { ...allTargetLayoutsRef.current, [scope]: { ...scopeMap, [helpId]: layout } };
    setLayoutsVersion(v => v + 1);
  }, []);

  const unregisterTargetLayout = useCallback((helpId: string, scope: string) => {
    const scopeMap = allTargetLayoutsRef.current[scope] || {};
    if (scopeMap[helpId]) {
      const nextScopeMap = { ...scopeMap };
      delete nextScopeMap[helpId];
      allTargetLayoutsRef.current = { ...allTargetLayoutsRef.current, [scope]: nextScopeMap };
      setLayoutsVersion(v => v + 1);
    }
  }, []);

  const value = useMemo<HelpContextValue>(() => ({
    isHelpOverlayActive,
    setIsHelpOverlayActive,
    currentScope,
    setHelpScope: setCurrentScope,
    helpContent,
    setHelpContent,
    registerTargetLayout,
    unregisterTargetLayout,
    targetLayouts: allTargetLayoutsRef.current[currentScope] || {},
  }), [isHelpOverlayActive, currentScope, helpContent, registerTargetLayout, unregisterTargetLayout, layoutsVersion]);

  return (
    <HelpContext.Provider value={value}>
      <HelpLocalScopeContext.Provider value={currentScope}>
        {children}
      </HelpLocalScopeContext.Provider>
    </HelpContext.Provider>
  );
};

export const useHelp = (): HelpContextValue => {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error('useHelp must be used within a HelpProvider');
  }
  return ctx;
};

export const HelpScope: React.FC<{ scope: string; children: React.ReactNode }> = ({ scope, children }) => {
  // This provider only annotates the subtree with its intended scope. The actual active
  // scope is controlled via setHelpScope in the HelpContext at the screen level.
  return (
    <HelpLocalScopeContext.Provider value={scope}>
      {children}
    </HelpLocalScopeContext.Provider>
  );
};

export const useHelpLocalScope = (): string => {
  return useContext(HelpLocalScopeContext);
};


