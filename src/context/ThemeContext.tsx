import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type PlutoTheme, type ThemeContextValue } from './themeContextValue';

const STORAGE_KEY = 'pluto-theme';

const getSystemTheme = (): PlutoTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const getInitialTheme = (): { theme: PlutoTheme; hasExplicitPreference: boolean } => {
  if (typeof window === 'undefined') {
    return { theme: 'dark', hasExplicitPreference: false };
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return { theme: storedTheme, hasExplicitPreference: true };
  }

  const htmlTheme = document.documentElement.dataset.theme;
  if (htmlTheme === 'dark' || htmlTheme === 'light') {
    return { theme: htmlTheme, hasExplicitPreference: false };
  }

  return { theme: getSystemTheme(), hasExplicitPreference: false };
};

const applyTheme = (theme: PlutoTheme) => {
  document.documentElement.dataset.theme = theme;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(state.theme);
  }, [state.theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || state.hasExplicitPreference) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setState((current) =>
        current.hasExplicitPreference
          ? current
          : {
              theme: mediaQuery.matches ? 'dark' : 'light',
              hasExplicitPreference: false,
            }
      );
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [state.hasExplicitPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: state.theme,
      hasExplicitPreference: state.hasExplicitPreference,
      setTheme: (theme) => {
        window.localStorage.setItem(STORAGE_KEY, theme);
        applyTheme(theme);
        setState({ theme, hasExplicitPreference: true });
      },
      toggleTheme: () => {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        setState({ theme: nextTheme, hasExplicitPreference: true });
      },
    }),
    [state]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
