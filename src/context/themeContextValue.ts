import { createContext } from 'react';

export type PlutoTheme = 'dark' | 'light';

export interface ThemeContextValue {
  theme: PlutoTheme;
  hasExplicitPreference: boolean;
  setTheme: (theme: PlutoTheme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
