import { createContext } from 'react';

export type PlutoTheme = 'dark' | 'light';
export type PlutoThemePreference = 'white' | 'black' | 'system';

export interface ThemeContextValue {
  theme: PlutoTheme;
  preference: PlutoThemePreference;
  hasExplicitPreference: boolean;
  setThemePreference: (theme: PlutoThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
