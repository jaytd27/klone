/** Theme mode handling. Graphite is dark by default; light and "follow the OS" are opt-in. */

export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'kw-theme'

export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'system') return saved
  } catch {
    // Storage can be unavailable; fall back to the default.
  }
  return 'dark'
}

/** Sets data-theme on <html> (none for "system") and remembers the choice. */
export function setThemeMode(mode: ThemeMode) {
  if (mode === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Not remembering the choice is fine.
  }
}

export const THEME_LABELS: Record<ThemeMode, string> = { dark: 'Dark', light: 'Light', system: 'System' }
