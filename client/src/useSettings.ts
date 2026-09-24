import { useContext } from 'react';
import { SettingsContext, type SettingsContextValue } from './settingsContextValue.js';

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return value;
}
