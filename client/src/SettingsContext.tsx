import { useCallback, useState, type ReactNode } from 'react';
import { loadSettings, saveSettings, type ClientSettings } from './settings.js';
import { SettingsContext } from './settingsContextValue.js';

/** Client-only preferences (volume, keybinds, ...), available anywhere
 * under `<App>` via `useSettings()` (`useSettings.ts`). Backed by
 * `localStorage` — a per-browser convenience, never synced to the server
 * or other players (see settings.ts). */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ClientSettings>(() => loadSettings(window.localStorage));

  const updateSettings = useCallback((patch: Partial<ClientSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(window.localStorage, next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
