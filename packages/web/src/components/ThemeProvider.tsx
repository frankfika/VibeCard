import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredTheme, setStoredTheme, applyTheme, type Theme } from '../lib/theme';

interface ThemeContextValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    applyTheme(theme);
    setResolved(theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
    );

    const listener = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        applyTheme('system');
        setResolved(e.matches ? 'dark' : 'light');
      }
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setStoredTheme(next);
    setThemeState(next);
  };

  const toggle = () => {
    const order: Theme[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
