import { createContext } from 'react';
import type { ClientSettings } from './settings.js';

export interface SettingsContextValue {
  settings: ClientSettings;
  updateSettings: (patch: Partial<ClientSettings>) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);
