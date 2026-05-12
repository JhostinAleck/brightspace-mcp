import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface NavCtx {
  depth: number;
  push: () => void;
  pop: () => void;
}

const NavContext = createContext<NavCtx>({ depth: 0, push: () => {}, pop: () => {} });

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [depth, setDepth] = useState(0);
  const push = useCallback(() => setDepth((d) => d + 1), []);
  const pop = useCallback(() => setDepth((d) => Math.max(0, d - 1)), []);
  return <NavContext.Provider value={{ depth, push, pop }}>{children}</NavContext.Provider>;
}

/** Call inside a component that owns its own Tab navigation (e.g. CourseDetail, ConfigForm). */
export function useSubNavLevel() {
  const { push, pop } = useContext(NavContext);
  useEffect(() => { push(); return () => pop(); }, [push, pop]);
}

export function useNavDepth() {
  return useContext(NavContext).depth;
}
