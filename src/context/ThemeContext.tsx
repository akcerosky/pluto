import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ThemeContext,
  type PlutoTheme,
  type PlutoThemePreference,
  type ThemeContextValue,
} from './themeContextValue';

const STORAGE_KEY = 'pluto-theme';

const getSystemTheme = (): PlutoTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const resolvePreferenceTheme = (preference: PlutoThemePreference): PlutoTheme => {
  if (preference === 'black') return 'dark';
  if (preference === 'white') return 'light';
  return getSystemTheme();
};

const normalizeStoredPreference = (value: string | null): PlutoThemePreference | null => {
  if (value === 'white' || value === 'black' || value === 'system') {
    return value;
  }
  if (value === 'light') {
    return 'white';
  }
  if (value === 'dark') {
    return 'black';
  }
  return null;
};

const getInitialTheme = (): {
  theme: PlutoTheme;
  preference: PlutoThemePreference;
  hasExplicitPreference: boolean;
} => {
  if (typeof window === 'undefined') {
    return { theme: 'light', preference: 'white', hasExplicitPreference: false };
  }

  const storedPreference = normalizeStoredPreference(window.localStorage.getItem(STORAGE_KEY));
  if (storedPreference) {
    return {
      theme: resolvePreferenceTheme(storedPreference),
      preference: storedPreference,
      hasExplicitPreference: storedPreference !== 'system',
    };
  }

  const htmlTheme = document.documentElement.dataset.theme;
  if (htmlTheme === 'dark' || htmlTheme === 'light') {
    return {
      theme: htmlTheme,
      preference: htmlTheme === 'dark' ? 'black' : 'white',
      hasExplicitPreference: false,
    };
  }

  return { theme: 'light', preference: 'white', hasExplicitPreference: false };
};

const applyTheme = (theme: PlutoTheme) => {
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    return;
  }
  delete document.documentElement.dataset.theme;
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
        current.preference !== 'system'
          ? current
          : {
              theme: mediaQuery.matches ? 'dark' : 'light',
              preference: 'system',
              hasExplicitPreference: false,
            }
      );
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [state.hasExplicitPreference, state.preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: state.theme,
      preference: state.preference,
      hasExplicitPreference: state.hasExplicitPreference,
      setThemePreference: (preference) => {
        window.localStorage.setItem(STORAGE_KEY, preference);
        const nextTheme = resolvePreferenceTheme(preference);
        applyTheme(nextTheme);
        setState({
          theme: nextTheme,
          preference,
          hasExplicitPreference: preference !== 'system',
        });
      },
    }),
    [state.hasExplicitPreference, state.preference, state.theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
