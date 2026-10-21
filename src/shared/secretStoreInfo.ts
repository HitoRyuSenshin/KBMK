/**
 * Platform-correct naming and repair guidance for the OS secret store
 * that keytar talks to (M6.4 fix). The store is Windows Credential
 * Manager on Windows, the Keychain on macOS, and a Secret Service
 * keyring (libsecret + gnome-keyring / KWallet) on Linux — the UI and
 * error messages must name the one the user actually has, and on Linux
 * must say what to install when it is missing, because keytar cannot
 * load or cannot reach a daemon there. Pure and unit-tested.
 */

export function secretStoreName(platform: string): string {
  switch (platform) {
    case 'win32':
      return 'Windows Credential Manager';
    case 'darwin':
      return 'macOS Keychain';
    default:
      return 'the Secret Service keychain';
  }
}

export function secretStoreFixHint(platform: string): string {
  switch (platform) {
    case 'win32':
      return (
        'If npm install showed a keytar build error, install Visual Studio ' +
        'Build Tools 2022 ("Desktop development with C++") and Python, then ' +
        'run npm install again.'
      );
    case 'darwin':
      return 'Make sure the login keychain is unlocked, then restart KBMK.';
    default:
      return (
        'Install the Secret Service keyring — Debian/Ubuntu: ' +
        'sudo apt install libsecret-1-0 gnome-keyring ' +
        '(Fedora: sudo dnf install libsecret gnome-keyring) — ' +
        'then restart KBMK.'
      );
  }
}

/** The store module itself could not load / is absent on this device. */
export function secretStoreUnavailableMessage(platform: string): string {
  return (
    `Secure key storage (${secretStoreName(platform)}) is unavailable ` +
    `on this device, so the key cannot be saved. ${secretStoreFixHint(platform)}`
  );
}

/** The store loaded but a call failed (e.g. no keyring daemon running). */
export function secretStoreAccessFailedMessage(platform: string): string {
  return (
    `Secure key storage (${secretStoreName(platform)}) could not be ` +
    `reached, so the key cannot be saved. ${secretStoreFixHint(platform)}`
  );
}
