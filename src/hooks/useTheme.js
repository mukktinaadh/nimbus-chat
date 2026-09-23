import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'nimbus.theme';

function readInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Dark/light theme. Follows the OS by default, then remembers an explicit
 * choice. The attribute lands on <html> so tokens apply before React paints.
 */
export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode: theme simply is not remembered.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
