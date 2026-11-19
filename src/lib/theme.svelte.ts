/**
 * Theme state: 'auto' follows prefers-color-scheme; 'light'/'dark' force it.
 * Persisted to localStorage, reflected on <html data-theme> by the root layout.
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'wp-theme';

function readStored(): ThemeChoice {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

class ThemeState {
  choice = $state<ThemeChoice>(readStored());
  prefersDark = $state(systemPrefersDark());

  resolved = $derived<'light' | 'dark'>(this.choice === 'auto' ? (this.prefersDark ? 'dark' : 'light') : this.choice);

  constructor() {
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.prefersDark = e.matches;
      });
    }
  }

  cycle() {
    this.choice = this.choice === 'auto' ? 'light' : this.choice === 'light' ? 'dark' : 'auto';
    try {
      localStorage.setItem(STORAGE_KEY, this.choice);
    } catch {
      /* private mode */
    }
  }
}

export const theme = new ThemeState();

export function basemapStyle(resolved: 'light' | 'dark'): string {
  return resolved === 'dark'
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
}
