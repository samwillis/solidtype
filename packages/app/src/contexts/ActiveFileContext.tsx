import { createContext, useContext, useState, ReactNode } from 'react';

interface ActiveFileContextValue {
  activeFilename: string;
  setActiveFilename: (filename: string) => void;
}

const ActiveFileContext = createContext<ActiveFileContextValue | null>(null);

export function ActiveFileProvider({ children }: { children: ReactNode }) {
  const [activeFilename, setActiveFilename] = useState<string>('Part.tsx');

  return (
    <ActiveFileContext.Provider value={{ activeFilename, setActiveFilename }}>
      {children}
    </ActiveFileContext.Provider>
  );
}

export function useActiveFileContext(): ActiveFileContextValue {
  const context = useContext(ActiveFileContext);
  if (!context) {
    throw new Error('useActiveFileContext must be used within an ActiveFileProvider');
  }
  return context;
}
