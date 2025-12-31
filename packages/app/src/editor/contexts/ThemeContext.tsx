import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme; // The actual theme being applied
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    const stored = localStorage.getItem('solidtype-theme-mode') as ThemeMode | null;
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      return stored;
    }
    return 'auto';
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Resolve the actual theme based on mode
  const theme: ResolvedTheme = useMemo(() => {
    if (mode === 'auto') {
      return systemTheme;
    }
    return mode;
  }, [mode, systemTheme]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listen for storage events from other tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'solidtype-theme-mode' && e.newValue) {
        const newMode = e.newValue as ThemeMode;
        if (newMode === 'light' || newMode === 'dark' || newMode === 'auto') {
          setModeState(newMode);
        }
      }
    };

    // Listen for custom theme change events (for same-tab sync)
    const handleThemeChange = (e: CustomEvent<string>) => {
      const newMode = e.detail as ThemeMode;
      if (newMode === 'light' || newMode === 'dark' || newMode === 'auto') {
        setModeState(newMode);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('solidtype-theme-change' as any, handleThemeChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('solidtype-theme-change' as any, handleThemeChange);
    };
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('solidtype-theme-mode', newMode);
    // Dispatch custom event for same-tab sync (storage event only fires in other tabs)
    window.dispatchEvent(new CustomEvent('solidtype-theme-change', { detail: newMode }));
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      localStorage.setItem('solidtype-theme-mode', next);
      // Dispatch custom event for same-tab sync
      window.dispatchEvent(new CustomEvent('solidtype-theme-change', { detail: next }));
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode, cycleMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
