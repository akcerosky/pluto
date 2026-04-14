import { createContext } from 'react';
import type { AppContextType } from './appContextTypes';

export const AppContext = createContext<AppContextType | undefined>(undefined);
