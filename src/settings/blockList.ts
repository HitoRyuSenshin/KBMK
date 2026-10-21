/**
 * Per-app block list (M5) — pure logic. Process names, compared
 * case-insensitively ("Notepad.EXE" === "notepad.exe"). In a blocked
 * app KBMK does nothing at all: no capture, no translation, no
 * replacement — the keystrokes are never even buffered.
 */

/** Pre-filled on first run: places nobody should translate passwords. */
export const DEFAULT_BLOCK_LIST: string[] = [
  '1password.exe',
  'keepass.exe',
  'keepassxc.exe',
  'bitwarden.exe',
  'lastpass.exe',
  'dashlane.exe',
  'enpass.exe',
];

/** "  Notepad " -> "notepad.exe"; "code.exe" -> "code.exe";
 *  "notepad exe" -> "notepad.exe" (a space typed instead of the dot);
 *  also repairs "notepad exe.exe", which older builds stored for that
 *  input — it looked right in the list but never matched a real
 *  process name, so the app was never actually blocked (M5.4). */
export function normalizeAppName(name: string): string {
  let clean = name
    .trim()
    .toLowerCase()
    .replace(/\s+\./g, '.')
    .replace(/\.\s+/g, '.');
  if (!clean) return '';
  if (clean.endsWith(' exe.exe')) clean = `${clean.slice(0, -' exe.exe'.length)}.exe`;
  if (!clean.includes('.')) {
    clean = clean.endsWith(' exe') ? `${clean.slice(0, -' exe'.length)}.exe` : `${clean}.exe`;
  }
  return clean;
}

/** Extract the process name from a full image path. */
export function processNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).filter(Boolean).pop() ?? '';
  return base.toLowerCase();
}

export function normalizeBlockList(list: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of list) {
    const normalized = normalizeAppName(entry);
    if (normalized) seen.add(normalized);
  }
  return [...seen].sort();
}

export function isAppBlocked(blockList: string[], processName: string | null): boolean {
  if (!processName) return false;
  return blockList.includes(processName.toLowerCase());
}
