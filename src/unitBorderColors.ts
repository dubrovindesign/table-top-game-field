const STORAGE_KEY = 'unit-border-colors/v1';

export type BorderColorPreset = { id: string; hex: string; label: string };

export const BORDER_COLOR_PRESETS: BorderColorPreset[] = [
  { id: 'blue', hex: '#3b82f6', label: 'Синий' },
  { id: 'red', hex: '#ef4444', label: 'Красный' },
  { id: 'emerald', hex: '#10b981', label: 'Изумруд' },
  { id: 'amber', hex: '#f59e0b', label: 'Янтарь' },
  { id: 'violet', hex: '#8b5cf6', label: 'Фиолет' },
  { id: 'pink', hex: '#ec4899', label: 'Розовый' },
];

export type BorderColors = { mine: string; opponent: string };

const DEFAULT_COLORS: BorderColors = { mine: '#3b82f6', opponent: '#ef4444' };

function isValidPresetHex(hex: unknown): hex is string {
  return typeof hex === 'string' && BORDER_COLOR_PRESETS.some((p) => p.hex === hex);
}

function readFromStorage(): BorderColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLORS };
    const parsed = JSON.parse(raw) as Partial<BorderColors>;
    return {
      mine: isValidPresetHex(parsed.mine) ? parsed.mine : DEFAULT_COLORS.mine,
      opponent: isValidPresetHex(parsed.opponent) ? parsed.opponent : DEFAULT_COLORS.opponent,
    };
  } catch {
    return { ...DEFAULT_COLORS };
  }
}

let current: BorderColors = readFromStorage();
const listeners = new Set<(c: BorderColors) => void>();

export function getBorderColors(): BorderColors {
  return { ...current };
}

export function setBorderColors(next: Partial<BorderColors>): void {
  const merged: BorderColors = {
    mine: isValidPresetHex(next.mine) ? next.mine : current.mine,
    opponent: isValidPresetHex(next.opponent) ? next.opponent : current.opponent,
  };
  if (merged.mine === current.mine && merged.opponent === current.opponent) return;
  current = merged;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn({ ...current });
}

export function subscribeBorderColors(fn: (c: BorderColors) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
