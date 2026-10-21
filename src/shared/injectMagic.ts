/**
 * Marker written into dwExtraInfo of every key KBMK injects with
 * SendInput. The low-level keyboard hook receives that same value in
 * KBDLLHOOKSTRUCT.dwExtraInfo, which lets the app recognise — and
 * completely ignore — its own output. Avro and other IMEs inject with
 * extraInfo 0, so their text is never mistaken for ours.
 * ASCII "KBMK".
 */
export const INJECT_MAGIC = 0x4b424d4b;
