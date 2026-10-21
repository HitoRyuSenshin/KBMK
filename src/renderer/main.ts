import './styles.css';
import type { KbmkApi } from '../preload/types';
import { DEFAULT_STATE, type AppState, type Language } from '../shared/types';
import {
  LANGUAGES,
  searchLanguages,
  sourceChipLabel,
  targetChipLabel,
} from '../shared/languages';
import { mergeLanguageLists } from '../shared/languageCatalog';
import { statusText } from '../shared/state';

declare global {
  interface Window {
    kbmk?: KbmkApi;
  }
}

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const view = new URLSearchParams(window.location.search).get('view');

/* ------------------------------------------------------------------ */
/* Settings view: key profiles (M3) + privacy notice                   */
/* ------------------------------------------------------------------ */
import type { PreferencesView, ProfilesView, SafeProfileView } from '../shared/types';
import { DEFAULT_ACCENT, activeIndicatorColor, hexToHsv, hsvToHex, hsvToRgb, type Hsv } from '../shared/color';
import supportQrBinance from './assets/support-qr-binance.png';
import supportQrPay from './assets/support-qr-pay.png';
import supportQrBybit from './assets/support-qr-bybit.png';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSettings(root: HTMLElement): void {
  root.innerHTML = `
    <main class="settings">
      <div class="titlebar">
        <span class="titlebar-title">KBMK — Settings</span>
        <div class="titlebar-btns">
          <button id="win-min" aria-label="Minimize">–</button>
          <button id="win-close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="settings-body">
      <p class="status-line" id="set-status"></p>
      <div class="notice" id="keystore-warning" hidden>
        Secure key storage (<span data-keystore-name>Windows Credential Manager</span>)
        is unavailable on this device, so API keys cannot be added.
        <span data-keystore-hint>If <code>npm install</code> showed a keytar build
        error, install Visual Studio Build Tools 2022 ("Desktop development
        with C++") and Python, then run <code>npm install</code> again.</span>
        The experimental keyless provider below still works.
      </div>

      <h2>About</h2>
      <div class="about-card">
        <div class="about-kicker">KBMK · Kotha Bolo Mon Khule</div>
        <p class="about-lede">Language should never be a wall between human souls; it should be an open door.</p>
        <p>KBMK is a real-time, on-screen translation tool designed to dissolve the
        boundaries of geography and culture, so people can connect with complete authenticity.</p>
        <p>By translating words as they flow, KBMK removes hesitation and
        misunderstanding — empowering individuals across the globe to speak their
        truth, share their stories, and listen with empathy.</p>
        <p class="about-signoff">More than software, KBMK is a bridge — built so
        every voice can be heard, and every heart can be understood.</p>
      </div>

      <h2>Appearance</h2>
      <p class="help">Glass accent colour — the pill and this window re-tint instantly.
      The default is KBMK red. Drag on the colour wheel (centre = pale, edge = vivid),
      adjust brightness, or tap a preset.</p>
      <div class="accent-row">
        <div class="wheel-wrap">
          <canvas id="accent-wheel" width="132" height="132"></canvas>
          <div class="wheel-marker" id="wheel-marker"></div>
        </div>
        <div class="accent-side">
          <div class="swatches" id="swatches">
            <button class="swatch" data-color="#e24b4a" style="background:#e24b4a" title="KBMK red (default)"></button>
            <button class="swatch" data-color="#f59e0b" style="background:#f59e0b" title="Amber"></button>
            <button class="swatch" data-color="#22a06b" style="background:#22a06b" title="Green"></button>
            <button class="swatch" data-color="#14b8a6" style="background:#14b8a6" title="Teal"></button>
            <button class="swatch" data-color="#3b82f6" style="background:#3b82f6" title="Blue"></button>
            <button class="swatch" data-color="#8b5cf6" style="background:#8b5cf6" title="Purple"></button>
            <button class="swatch" data-color="#ec4899" style="background:#ec4899" title="Pink"></button>
          </div>
          <label class="help" for="accent-bright">Brightness</label>
          <input type="range" id="accent-bright" min="20" max="100" value="89" />
          <div class="accent-current"><span class="accent-dot" id="accent-dot"></span><code id="accent-hex">#e24b4a</code></div>
          <div><button class="btn small" id="accent-reset">Reset to KBMK red</button></div>
        </div>
      </div>
      <div class="opacity-row">
        <label class="help" for="glass-opacity">Glass opacity — how see-through the pill and panels are</label>
        <div class="opacity-controls">
          <input type="range" id="glass-opacity" min="35" max="100" value="100" />
          <code id="opacity-value">100%</code>
          <button class="btn small" id="opacity-reset">Reset</button>
        </div>
      </div>

      <h2>Translation provider</h2>
      <label class="radio-row"><input type="radio" name="provider-mode" id="mode-google" />
        API key profiles — Google Cloud, Azure or DeepL, chosen per key below</label>
      <label class="radio-row"><input type="radio" name="provider-mode" id="mode-gtx" />
        Experimental keyless provider (free, may be rate limited)</label>

      <div id="wizard" hidden>
        <h2>First run: add a Google Cloud key</h2>
        <div class="notice">
          <ol>
            <li>Open <strong>console.cloud.google.com</strong> and create (or pick) a project.</li>
            <li>Enable the <strong>Cloud Translation API</strong> for that project.</li>
            <li>Go to <strong>APIs &amp; Services → Credentials → Create credentials → API key</strong>.</li>
            <li>Restrict the key to the Cloud Translation API, and set a budget alert on the project.</li>
            <li>Copy the key and add it below. It is stored only in <span data-keystore-name>Windows Credential Manager</span>.</li>
          </ol>
          <p>Or skip all of this for now:</p>
          <button class="btn" id="wizard-keyless">Continue with the experimental keyless provider</button>
          <p>Using Azure instead? Create a <strong>Translator</strong> resource in the Azure
          portal (the free F0 tier includes 2M characters/month), then under
          <strong>Keys and Endpoint</strong> copy <strong>Key 1</strong> and the
          <strong>Location/region</strong> — you will need both below, and you pick
          "Azure" in the Add key form.</p>
          <p>Using DeepL instead? Create a free account at <strong>deepl.com</strong>
          (Your profile → API Keys) and copy the key — free keys end in
          <strong>:fx</strong> and KBMK picks the free endpoint automatically.
          Note DeepL covers ~35 languages and does not include Bengali.</p>
        </div>
      </div>

      <h2>API key profiles</h2>
      <div id="profile-list"></div>

      <div class="add-key">
        <input type="text" id="new-label" placeholder="Label, e.g. My key / Rafi's key" />
        <select id="new-provider" aria-label="Key provider">
          <option value="google">Google Cloud</option>
          <option value="azure">Azure Translator</option>
          <option value="deepl">DeepL</option>
        </select>
        <input type="password" id="new-secret" placeholder="API key" autocomplete="off" />
        <input type="text" id="new-region" placeholder="Azure region, e.g. southeastasia (or 'global')" hidden />
        <button class="btn primary" id="add-key">Add key</button>
      </div>
      <p class="help">Anyone you use a key from pays for your usage. Restrict the key to the
      Cloud Translation API, set a budget alert, and use a separate key for this app.</p>

      <h2>Key fallback</h2>
      <label class="radio-row"><input type="checkbox" id="fallback-toggle" />
        Fall back to the next key if quota is reached (off by default). Switching is
        never silent — the pill announces the new key.</label>
      <div id="fallback-order"></div>

      <h2>App behaviour</h2>
      <label class="radio-row"><input type="checkbox" id="launch-login" />
        Start KBMK when I sign in to Windows
        <span class="help" id="launch-unsupported" hidden>(login items are not supported on this platform)</span></label>
      <label class="radio-row"><input type="checkbox" id="sentence-offers" />
        Sentence offers — when I finish a sentence, offer its full translation
        (grammar and word order fixed) above the pill: Space replaces, Esc keeps my words</label>

      <h2>Blocked apps</h2>
      <p class="help">In these apps KBMK does nothing at all — nothing is captured, translated
      or replaced. Pre-filled with common password managers. Use process names
      (Task Manager → Details shows them), e.g. <code>notepad.exe</code>.</p>
      <div id="block-list"></div>
      <div class="add-key">
        <select id="block-picker" aria-label="Pick from open windows"></select>
        <button class="btn" id="block-refresh">Refresh</button>
        <button class="btn primary" id="block-pick-add">Block selected</button>
      </div>
      <p class="help">Pick any window that's open right now (like OBS Studio's window
      list), or type a process name below — an app doesn't have to be running to block it.</p>
      <div class="add-key">
        <input type="text" id="block-input" placeholder="Process name, e.g. notepad or notepad.exe" />
        <button class="btn" id="block-add">Block app</button>
      </div>

      <h2>Hotkeys</h2>
      <p class="help"><strong>Ctrl+Alt+T</strong> — pause / resume KBMK anywhere.<br />
      <strong>Ctrl+Alt+Z</strong> — undo the last replacement.<br />
      <strong>Paste text</strong> (Ctrl+V, or right-click → Paste) — KBMK offers its translation above the pill:
      <strong>Space</strong> replaces the pasted text, <strong>Esc</strong> keeps it.
      One line at a time, up to 300 characters.<br />
      <strong>Finish a sentence</strong> (., !, ?, । or Enter) — KBMK offers the whole sentence's
      translation above the pill, with grammar and word order fixed:
      <strong>Space</strong> replaces the sentence, <strong>Esc</strong> keeps it as typed.
      Turn this off under App behaviour.</p>

      <h2>Export</h2>
      <p>Export settings metadata (labels, counters, statuses). <strong>Never includes keys.</strong></p>
      <button class="btn" id="export-btn">Export settings</button>
      <button class="btn" id="export-copy">Copy JSON</button>
      <pre id="export-out" hidden></pre>

      <h2>Privacy</h2>
      <div class="notice">
        <p>KBMK reads the words you type <strong>locally, on this PC</strong>, one word at a
        time. Only a finished word is sent to the translation provider you chose — and, for
        sentence offers, the finished sentence, to that same provider. Keystrokes
        are never written to disk, logged, or sent anywhere else. API keys live only in
        <span data-keystore-name>Windows Credential Manager</span>; this window never sees a full key — only its last
        4 characters. There is no telemetry.</p>
      </div>

      <h2>Support</h2>
      <div class="about-card support-card">
        <p class="support-thanks">Thanks for using KBMK.</p>
        <div class="support-qrs">
          <figure class="support-qr"><img src="${supportQrBinance}" alt="Binance support QR code" /></figure>
          <figure class="support-qr"><img src="${supportQrPay}" alt="Support QR code" /></figure>
          <figure class="support-qr"><img src="${supportQrBybit}" alt="Bybit support QR code" /></figure>
        </div>
      </div>

      <h2>Start over</h2>
      <p>Remove every API key on this PC — including its secret in
      <span data-keystore-name>Windows Credential Manager</span> — and reset all settings (block list, glass colour
      and opacity, launch at login) to their defaults.</p>
      <button class="btn danger" id="reset-all">Remove all keys and settings</button>
      <span id="reset-confirm" hidden>
        <span class="help">Really remove everything?</span>
        <button class="btn danger" id="reset-yes">Yes, remove all</button>
        <button class="btn" id="reset-no">Cancel</button>
      </span>
      </div>
    </main>`;

  const statusLine = root.querySelector<HTMLElement>('#set-status')!;
  const warning = root.querySelector<HTMLElement>('#keystore-warning')!;
  const wizard = root.querySelector<HTMLElement>('#wizard')!;
  const list = root.querySelector<HTMLDivElement>('#profile-list')!;
  const labelInput = root.querySelector<HTMLInputElement>('#new-label')!;
  const secretInput = root.querySelector<HTMLInputElement>('#new-secret')!;
  const providerSelect = root.querySelector<HTMLSelectElement>('#new-provider')!;
  const regionInput = root.querySelector<HTMLInputElement>('#new-region')!;
  const addBtn = root.querySelector<HTMLButtonElement>('#add-key')!;
  const modeGoogle = root.querySelector<HTMLInputElement>('#mode-google')!;
  const modeGtx = root.querySelector<HTMLInputElement>('#mode-gtx')!;
  const keylessBtn = root.querySelector<HTMLButtonElement>('#wizard-keyless')!;
  const fallbackToggle = root.querySelector<HTMLInputElement>('#fallback-toggle')!;
  const fallbackOrder = root.querySelector<HTMLDivElement>('#fallback-order')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#reset-all')!;
  const resetConfirm = root.querySelector<HTMLElement>('#reset-confirm')!;
  const resetYes = root.querySelector<HTMLButtonElement>('#reset-yes')!;
  const resetNo = root.querySelector<HTMLButtonElement>('#reset-no')!;
  const exportBtn = root.querySelector<HTMLButtonElement>('#export-btn')!;
  const exportOut = root.querySelector<HTMLPreElement>('#export-out')!;
  const launchLogin = root.querySelector<HTMLInputElement>('#launch-login')!;
  const sentenceOffersToggle = root.querySelector<HTMLInputElement>('#sentence-offers')!;
  root.querySelector('#win-close')!.addEventListener('click', () => {
    void window.kbmk?.closeWindow();
  });
  root.querySelector('#win-min')!.addEventListener('click', () => {
    void window.kbmk?.minimizeWindow();
  });
  const launchUnsupported = root.querySelector<HTMLElement>('#launch-unsupported')!;
  const blockListEl = root.querySelector<HTMLDivElement>('#block-list')!;
  const blockInput = root.querySelector<HTMLInputElement>('#block-input')!;
  const blockAdd = root.querySelector<HTMLButtonElement>('#block-add')!;
  const blockPicker = root.querySelector<HTMLSelectElement>('#block-picker')!;
  const blockRefresh = root.querySelector<HTMLButtonElement>('#block-refresh')!;
  const blockPickAdd = root.querySelector<HTMLButtonElement>('#block-pick-add')!;
  const wheel = root.querySelector<HTMLCanvasElement>('#accent-wheel')!;
  const wheelMarker = root.querySelector<HTMLDivElement>('#wheel-marker')!;
  const bright = root.querySelector<HTMLInputElement>('#accent-bright')!;
  const accentHex = root.querySelector<HTMLElement>('#accent-hex')!;
  const accentDot = root.querySelector<HTMLElement>('#accent-dot')!;
  const swatchesEl = root.querySelector<HTMLDivElement>('#swatches')!;
  const accentReset = root.querySelector<HTMLButtonElement>('#accent-reset')!;
  const opacitySlider = root.querySelector<HTMLInputElement>('#glass-opacity')!;
  const opacityValue = root.querySelector<HTMLElement>('#opacity-value')!;
  const opacityReset = root.querySelector<HTMLButtonElement>('#opacity-reset')!;
  const exportCopy = root.querySelector<HTMLButtonElement>('#export-copy')!;

  let view: ProfilesView | null = null;

  function say(text: string): void {
    statusLine.textContent = text;
  }

  function badge(status: SafeProfileView['status']): HTMLElement {
    const labels = { unknown: 'Not tested', valid: 'Valid', invalid: 'Invalid', quota: 'Quota reached' };
    const span = el('span', `badge badge-${status}`, labels[status]);
    return span;
  }

  function paint(next: ProfilesView): void {
    view = next;
    warning.hidden = next.keyStoreAvailable;
    root.querySelectorAll('[data-keystore-name]').forEach((el) => {
      el.textContent = next.keyStoreName;
    });
    const hintEl = root.querySelector('[data-keystore-hint]');
    if (hintEl) hintEl.textContent = next.keyStoreHint;
    secretInput.placeholder = `API key (stored in ${next.keyStoreName})`;
    wizard.hidden = next.profiles.length > 0;
    modeGoogle.checked = next.providerMode === 'google';
    modeGtx.checked = next.providerMode === 'gtx';
    fallbackToggle.checked = next.fallbackEnabled;

    list.innerHTML = '';
    if (next.profiles.length === 0) {
      list.appendChild(el('p', 'help', 'No keys yet. Add one below, or use the keyless provider.'));
    }
    for (const profile of next.profiles) {
      const row = el('div', 'profile-row');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'active-profile';
      radio.checked = profile.isActive;
      radio.title = 'Set active';
      radio.addEventListener('change', () => void act(() => window.kbmk!.setActiveProfile(profile.id), `"${profile.label}" is now the active key.`));
      const main = el('div', 'profile-main');
      const title = el('div', 'profile-title');
      title.append(
        el('strong', '', profile.label),
        document.createTextNode(`  ••••${profile.last4}  `),
        badge(profile.status),
        el('span', 'badge', profile.provider === 'azure' ? 'Azure' : profile.provider === 'deepl' ? 'DeepL' : 'Google'),
      );
      const sub = el('div', 'help', `${profile.provider === 'azure' ? `Azure · ${profile.region ?? ''} · ` : ''}${profile.monthlyCount} translation${profile.monthlyCount === 1 ? '' : 's'} this month${profile.isActive ? ' · Active' : ''}`);
      main.append(title, sub);
      const actions = el('div', 'profile-actions');
      const test = el('button', 'btn small', 'Test connection');
      test.addEventListener('click', () => void act(() => window.kbmk!.testProfile(profile.id), `Tested "${profile.label}".`));
      const rename = el('button', 'btn small', 'Rename');
      rename.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = profile.label;
        const save = el('button', 'btn small primary', 'Save');
        save.addEventListener('click', () => void act(() => window.kbmk!.renameProfile(profile.id, input.value), 'Renamed.'));
        title.replaceChildren(input, save);
        input.focus();
      });
      const remove = el('button', 'btn small danger', 'Remove');
      remove.addEventListener('click', () => {
        if (window.confirm(`Remove the key "${profile.label}" (••••${profile.last4})? This deletes it from ${view?.keyStoreName ?? 'the secure key store'}.`)) {
          void act(() => window.kbmk!.removeProfile(profile.id), `Removed "${profile.label}".`);
        }
      });
      actions.append(test, rename, remove);
      row.append(radio, main, actions);
      list.appendChild(row);
    }

    fallbackOrder.innerHTML = '';
    if (next.fallbackEnabled) {
      const byId = new Map(next.profiles.map((p) => [p.id, p]));
      const ordered = next.fallbackOrder.map((id) => byId.get(id)).filter(Boolean) as SafeProfileView[];
      ordered.forEach((profile, index) => {
        const row = el('div', 'order-row');
        row.append(el('span', '', `${index + 1}. ${profile.label}`));
        const up = el('button', 'btn small', '↑');
        up.disabled = index === 0;
        up.addEventListener('click', () => {
          const order = [...next.fallbackOrder];
          [order[index - 1], order[index]] = [order[index], order[index - 1]];
          void act(() => window.kbmk!.setKeyFallback(true, order), 'Fallback order updated.');
        });
        const down = el('button', 'btn small', '↓');
        down.disabled = index === ordered.length - 1;
        down.addEventListener('click', () => {
          const order = [...next.fallbackOrder];
          [order[index + 1], order[index]] = [order[index], order[index + 1]];
          void act(() => window.kbmk!.setKeyFallback(true, order), 'Fallback order updated.');
        });
        row.append(up, down);
        fallbackOrder.appendChild(row);
      });
    }
  }

  async function act(fn: () => Promise<ProfilesView>, doneText: string): Promise<void> {
    try {
      const next = await fn();
      paint(next);
      say(doneText);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  providerSelect.addEventListener('change', () => {
    regionInput.hidden = providerSelect.value !== 'azure';
  });
  addBtn.addEventListener('click', () => {
    const chosen =
      providerSelect.value === 'azure'
        ? 'azure'
        : providerSelect.value === 'deepl'
          ? 'deepl'
          : 'google';
    // A key ending in ":fx" is unmistakably a DeepL FREE key (no other
    // provider uses that suffix) — save it as DeepL even if the dropdown
    // was left on another provider, and say so in the status message.
    const looksDeepl = secretInput.value.trim().endsWith(':fx') && chosen !== 'deepl';
    const effective = looksDeepl ? 'deepl' : chosen;
    void act(async () => {
      const next = await window.kbmk!.addProfile(
        labelInput.value,
        secretInput.value,
        effective,
        effective === 'azure' ? regionInput.value : undefined,
      );
      labelInput.value = '';
      secretInput.value = '';
      regionInput.value = '';
      return next;
    }, looksDeepl
      ? `That key ends in ":fx", so it was saved as a DeepL key. It is stored only in ${view?.keyStoreName ?? 'the secure key store'}.`
      : `Key added. It is stored only in ${view?.keyStoreName ?? 'the secure key store'}.`);
  });
  modeGoogle.addEventListener('change', () => void act(() => window.kbmk!.setProviderMode('google'), 'Using your API key profiles (Google Cloud / Azure / DeepL).'));
  modeGtx.addEventListener('change', () => void act(() => window.kbmk!.setProviderMode('gtx'), 'Using the experimental keyless provider.'));
  keylessBtn.addEventListener('click', () => void act(() => window.kbmk!.setProviderMode('gtx'), 'Using the experimental keyless provider. You can add a key any time.'));
  fallbackToggle.addEventListener('change', () => {
    if (!view) return;
    void act(() => window.kbmk!.setKeyFallback(fallbackToggle.checked, view!.fallbackOrder), fallbackToggle.checked ? 'Key fallback is ON.' : 'Key fallback is OFF.');
  });
  exportBtn.addEventListener('click', () => {
    void window.kbmk!.exportSettings().then((data) => {
      exportOut.hidden = false;
      exportOut.textContent = JSON.stringify(data, null, 2);
      say('Exported. It contains no keys — check for yourself.');
    });
  });
  exportCopy.addEventListener('click', () => {
    void window.kbmk!.exportSettings().then(async (data) => {
      const text = JSON.stringify(data, null, 2);
      exportOut.hidden = false;
      exportOut.textContent = text;
      try {
        await navigator.clipboard.writeText(text);
        say('Export copied to the clipboard. It contains no keys.');
      } catch {
        // Clipboard blocked: leave the JSON selected for a manual Ctrl+C.
        const range = document.createRange();
        range.selectNodeContents(exportOut);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        say('Clipboard was blocked — the JSON is selected, press Ctrl+C to copy it.');
      }
    });
  });

  /* ---- App behaviour preferences (M5) ---- */
  let prefs: PreferencesView | null = null;

  function paintPrefs(next: PreferencesView): void {
    prefs = next;
    syncAccentUi(next.accent);
    syncOpacityUi(next.opacity);
    launchLogin.checked = next.launchAtLogin;
    launchLogin.disabled = !next.launchAtLoginSupported;
    launchUnsupported.hidden = next.launchAtLoginSupported;
    sentenceOffersToggle.checked = next.sentenceOffers;
    blockListEl.innerHTML = '';
    if (next.blockList.length === 0) {
      blockListEl.appendChild(el('p', 'help', 'No blocked apps. KBMK is active everywhere.'));
    }
    for (const name of next.blockList) {
      const row = el('div', 'order-row');
      row.append(el('span', '', name));
      const remove = el('button', 'btn small', 'Remove');
      remove.addEventListener('click', () => {
        if (!prefs) return;
        void prefAct(
          () => window.kbmk!.setBlockList(prefs!.blockList.filter((x) => x !== name)),
          `${name} is no longer blocked.`,
        );
      });
      row.append(remove);
      blockListEl.appendChild(row);
    }
  }

  async function prefAct(fn: () => Promise<PreferencesView>, doneText: string): Promise<void> {
    try {
      paintPrefs(await fn());
      say(doneText);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  /* ---- Accent colour wheel (M5.2) ---- */
  const WHEEL = 132;
  const WHEEL_R = WHEEL / 2;
  let hsv: Hsv = hexToHsv(DEFAULT_ACCENT);
  let picking = false;
  let persistTimer: number | undefined;

  function applyAccent(hex: string): void {
    document.documentElement.style.setProperty('--red', hex);
  }

  function drawWheel(): void {
    const ctx = wheel.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(WHEEL, WHEEL);
    for (let y = 0; y < WHEEL; y++) {
      for (let x = 0; x < WHEEL; x++) {
        const dx = x - WHEEL_R + 0.5;
        const dy = y - WHEEL_R + 0.5;
        const dist = Math.hypot(dx, dy) / WHEEL_R;
        const idx = (y * WHEEL + x) * 4;
        if (dist > 1) {
          img.data[idx + 3] = 0;
          continue;
        }
        const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
        const [r, g, b] = hsvToRgb(hue, dist, hsv.v);
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function positionMarker(): void {
    const ang = (hsv.h * Math.PI) / 180;
    const dist = hsv.s * WHEEL_R;
    wheelMarker.style.left = `${WHEEL_R + Math.cos(ang) * dist}px`;
    wheelMarker.style.top = `${WHEEL_R + Math.sin(ang) * dist}px`;
  }

  function commitAccent(): void {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    applyAccent(hex);
    accentHex.textContent = hex;
    accentDot.style.background = hex;
    positionMarker();
    paintSwatchStates(hex);
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      if (!window.kbmk) return;
      void window.kbmk
        .setAccent(hex)
        .then((view) => {
          prefs = view;
        })
        .catch(() => undefined);
    }, 200);
  }

  function paintSwatchStates(activeHex: string): void {
    swatchesEl.querySelectorAll<HTMLButtonElement>('.swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.color === activeHex);
    });
  }

  /** Sync the wheel UI from a stored accent (not while the user drags). */
  function syncAccentUi(hex: string): void {
    applyAccent(hex);
    accentHex.textContent = hex;
    accentDot.style.background = hex;
    paintSwatchStates(hex);
    if (picking) return;
    hsv = hexToHsv(hex);
    bright.value = String(Math.round(hsv.v * 100));
    drawWheel();
    positionMarker();
  }

  function pickFromEvent(event: PointerEvent): void {
    const rect = wheel.getBoundingClientRect();
    const dx = event.clientX - rect.left - WHEEL_R;
    const dy = event.clientY - rect.top - WHEEL_R;
    hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / WHEEL_R);
    commitAccent();
  }

  wheel.addEventListener('pointerdown', (event) => {
    picking = true;
    wheel.setPointerCapture(event.pointerId);
    pickFromEvent(event);
  });
  wheel.addEventListener('pointermove', (event) => {
    if (picking) pickFromEvent(event);
  });
  wheel.addEventListener('pointerup', () => {
    picking = false;
  });
  bright.addEventListener('input', () => {
    hsv.v = Number(bright.value) / 100;
    drawWheel();
    commitAccent();
  });
  swatchesEl.querySelectorAll<HTMLButtonElement>('.swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      hsv = hexToHsv(btn.dataset.color ?? DEFAULT_ACCENT);
      bright.value = String(Math.round(hsv.v * 100));
      drawWheel();
      commitAccent();
    });
  });
  accentReset.addEventListener('click', () => {
    hsv = hexToHsv(DEFAULT_ACCENT);
    bright.value = String(Math.round(hsv.v * 100));
    drawWheel();
    commitAccent();
  });
  drawWheel();
  positionMarker();

  /* ---- Glass opacity (M5.10) ---- */
  let opacityPicking = false;
  let opacityTimer: number | undefined;

  function applyOpacity(value: number): void {
    document.documentElement.style.setProperty('--glass-opacity', String(value));
    opacityValue.textContent = `${Math.round(value * 100)}%`;
  }

  function commitOpacity(value: number): void {
    applyOpacity(value);
    window.clearTimeout(opacityTimer);
    opacityTimer = window.setTimeout(() => {
      if (!window.kbmk) return;
      void window.kbmk
        .setOpacity(value)
        .then((view) => {
          prefs = view;
        })
        .catch(() => undefined);
    }, 200);
  }

  /** Sync the slider from stored preferences (not while the user drags). */
  function syncOpacityUi(value: number): void {
    applyOpacity(value);
    if (!opacityPicking) opacitySlider.value = String(Math.round(value * 100));
  }

  opacitySlider.addEventListener('pointerdown', () => {
    opacityPicking = true;
  });
  opacitySlider.addEventListener('pointerup', () => {
    opacityPicking = false;
  });
  opacitySlider.addEventListener('input', () => {
    commitOpacity(Number(opacitySlider.value) / 100);
  });
  opacityReset.addEventListener('click', () => {
    opacitySlider.value = '100';
    commitOpacity(1);
  });

  launchLogin.addEventListener('change', () => {
    void prefAct(
      () => window.kbmk!.setLaunchAtLogin(launchLogin.checked),
      launchLogin.checked ? 'KBMK will start when you sign in.' : 'KBMK will no longer start at sign-in.',
    );
  });
  sentenceOffersToggle.addEventListener('change', () => {
    void prefAct(
      () => window.kbmk!.setSentenceOffers(sentenceOffersToggle.checked),
      sentenceOffersToggle.checked
        ? 'Sentence offers are on.'
        : 'Sentence offers are off — sentences keep their word-by-word translation.',
    );
  });
  blockAdd.addEventListener('click', () => {
    const value = blockInput.value.trim();
    if (!value || !prefs) return;
    const next = [...prefs.blockList, value];
    blockInput.value = '';
    void prefAct(() => window.kbmk!.setBlockList(next), 'App blocked.');
  });

  /** OBS-style picker: list the windows open right now. */
  async function refreshOpenWindows(announce = false): Promise<void> {
    if (!window.kbmk) return;
    try {
      const windows = await window.kbmk.getOpenWindows();
      blockPicker.innerHTML = '';
      if (windows.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No open windows found — open the app, then Refresh';
        option.value = '';
        blockPicker.appendChild(option);
        if (announce) say('No open windows found. Open the app first, then Refresh.');
        return;
      }
      for (const win of windows) {
        const option = document.createElement('option');
        option.value = win.processName;
        option.textContent = `${win.processName} — ${win.title}`;
        blockPicker.appendChild(option);
      }
      if (announce) say(`${windows.length} open app(s) listed. Pick one and press “Block selected”.`);
    } catch {
      if (announce) say('Could not list open windows on this system — typing a process name still works.');
    }
  }
  blockRefresh.addEventListener('click', () => void refreshOpenWindows(true));
  blockPickAdd.addEventListener('click', () => {
    const value = blockPicker.value;
    if (!value) {
      say('Pick an app from the list first (Refresh if it is empty).');
      return;
    }
    if (!prefs) {
      say('Preferences are still loading — try again in a moment.');
      return;
    }
    if (prefs.blockList.includes(value)) {
      say(`${value} is already blocked.`);
      return;
    }
    void prefAct(
      () => window.kbmk!.setBlockList([...prefs!.blockList, value]),
      `${value} blocked.`,
    );
  });

  if (window.kbmk) {
    void window.kbmk
      .getProfilesView()
      .then(paint)
      .catch((error) => say(error instanceof Error ? error.message : 'Could not load profiles.'));
    void window.kbmk
      .getPreferences()
      .then(paintPrefs)
      .catch(() => undefined);
    void refreshOpenWindows();
  } else {
    say('Preview only — open this window from the app to manage keys.');
  }

  // Factory reset (M6.1): two-step confirm, then everything is wiped
  // and both views repaint from the fresh, empty state.
  resetBtn.addEventListener('click', () => {
    resetConfirm.hidden = false;
    resetBtn.hidden = true;
  });
  resetNo.addEventListener('click', () => {
    resetConfirm.hidden = true;
    resetBtn.hidden = false;
  });
  resetYes.addEventListener('click', () => {
    void (async () => {
      try {
        const prefs = await window.kbmk!.resetAll();
        paintPrefs(prefs);
        paint(await window.kbmk!.getProfilesView());
        resetConfirm.hidden = true;
        resetBtn.hidden = false;
        say('All keys and settings were removed. KBMK is back to a fresh start.');
      } catch (error) {
        say(error instanceof Error ? error.message : 'Reset failed.');
      }
    })();
  });
}

/* ------------------------------------------------------------------ */
/* Pill view                                                           */
/* ------------------------------------------------------------------ */
type MenuKind = 'source' | 'target' | null;

function renderPill(root: HTMLElement): void {
  root.innerHTML = `
    <div class="pill-shell">
      <div class="toast" id="toast" role="status"></div>
      <div class="menu" id="menu">
        <input type="search" id="menu-search" placeholder="Search languages…" aria-label="Search languages" />
        <div class="menu-list" id="menu-list"></div>
      </div>
      <div class="offer" id="offer" hidden>
        <span class="offer-text" id="offer-text"></span>
        <span class="offer-hint">Space — replace · Esc — keep</span>
      </div>
      <div class="pill" id="pill">
        <span class="dot" id="dot" title="Ready"></span>
        <button class="chip" id="source-chip" title="Source language"></button>
        <button class="icon-btn" id="swap" title="Swap languages" aria-label="Swap languages">⇄</button>
        <button class="chip" id="target-chip" title="Target language"></button>
        <span class="usage" id="usage"></span>
        <span class="spacer"></span>
        <button class="icon-btn" id="gear" title="Settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3.5" y1="6.5" x2="20.5" y2="6.5"/><circle cx="15" cy="6.5" r="2.5" fill="var(--pill-bg)"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><circle cx="8.5" cy="12" r="2.5" fill="var(--pill-bg)"/><line x1="3.5" y1="17.5" x2="20.5" y2="17.5"/><circle cx="16.5" cy="17.5" r="2.5" fill="var(--pill-bg)"/></svg></button>
      </div>
    </div>`;

  const shell = root.querySelector<HTMLDivElement>('.pill-shell')!;
  const dot = root.querySelector<HTMLSpanElement>('#dot')!;
  const sourceChip = root.querySelector<HTMLButtonElement>('#source-chip')!;
  const targetChip = root.querySelector<HTMLButtonElement>('#target-chip')!;
  const swapBtn = root.querySelector<HTMLButtonElement>('#swap')!;
  const usage = root.querySelector<HTMLSpanElement>('#usage')!;
  const gear = root.querySelector<HTMLButtonElement>('#gear')!;
  const toast = root.querySelector<HTMLDivElement>('#toast')!;
  const offer = root.querySelector<HTMLDivElement>('#offer')!;
  const offerText = root.querySelector<HTMLSpanElement>('#offer-text')!;
  const menu = root.querySelector<HTMLDivElement>('#menu')!;
  const menuSearch = root.querySelector<HTMLInputElement>('#menu-search')!;
  const menuList = root.querySelector<HTMLDivElement>('#menu-list')!;

  let state: AppState = { ...DEFAULT_STATE };
  let openMenu: MenuKind = null;
  let toastTimer: number | undefined;
  let lastNoticeSeq = -1;
  let toastVisible = false;

  let lastSentPillWidth = 0;
  /** Measure the pill row's natural width and tell main, so the
   *  window hugs its content and no dead gap pools before the gear
   *  (M5.13). scrollWidth is used so a momentarily squeezed element
   *  still reports its true size. The 8px threshold keeps the window
   *  from breathing when only the usage counter ticks a digit. */
  function reportPillWidth(): void {
    if (!window.kbmk) return;
    const parts = [dot, sourceChip, swapBtn, targetChip, usage, gear];
    // Fractional rect widths (offsetWidth floors each element and the
    // losses add up to a visible ellipsis), scrollWidth so a squeezed
    // element still confesses its true size, plus a small slack.
    const natural = (el: HTMLElement): number =>
      Math.max(el.getBoundingClientRect().width, el.scrollWidth);
    const content =
      parts.reduce((sum, el) => sum + natural(el), 0) + 6 * (parts.length - 1) + 20 + 12;
    // +12 slack: per-element measurements still miss a few fractional
    // pixels (letter-spacing, borders) — verified against a live
    // shrink-scan; the leftover gap stays at ~3px, invisible.
    const desired = Math.max(264, Math.min(384, Math.ceil(content) + 12));
    if (Math.abs(desired - lastSentPillWidth) >= 8) {
      lastSentPillWidth = desired;
      void window.kbmk.setPillWidth(desired);
    }
  }

  /** The pill window grows for the menu, and briefly for a toast — a
   *  toast rendered inside the plain 56 px window would be clipped and
   *  never seen. Main anchors the growth to the pill's dragged
   *  position and reports which way it opened (M5.11): 'below' flips
   *  the shell so the menu renders under the pill near the screen top. */
  function syncExpanded(): void {
    const apply = (dir?: string): void => {
      shell.classList.toggle('menu-below', dir === 'below');
    };
    if (openMenu) void window.kbmk?.setExpanded(true, 344).then(apply);
    else if (!offer.hidden) void window.kbmk?.setExpanded(true, 116).then(apply);
    else if (toastVisible) void window.kbmk?.setExpanded(true, 104).then(apply);
    else void window.kbmk?.setExpanded(false).then(apply);
  }
  /** Menu languages: the API's supported list once fetched (M4.2);
   *  the built-in list until then / when keyless or offline. */
  let languageList: Language[] = LANGUAGES;

  function refreshLanguages(): void {
    void window.kbmk?.getLanguages().then((result) => {
      if (result.languages.length > 0) {
        languageList = mergeLanguageLists(result.languages);
        paint();
        if (openMenu) paintMenu();
      }
    }).catch(() => undefined);
  }

  function showToast(text: string, warn = false): void {
    toast.textContent = text;
    toast.classList.toggle('warn', warn);
    toast.classList.add('show');
    toastVisible = true;
    syncExpanded();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('show');
      toastVisible = false;
      syncExpanded();
    }, 1600);
  }

  function paint(): void {
    document.documentElement.style.setProperty('--red', state.accent);
    document.documentElement.style.setProperty('--indicator', activeIndicatorColor(state.accent));
    document.documentElement.style.setProperty('--glass-opacity', String(state.opacity));
    sourceChip.textContent = '';
    const sourceLabel = sourceChipLabel(state.source, 'en', languageList);
    sourceChip.title = sourceLabel; // full text on hover even if ellipsised
    const s = document.createElement('span');
    s.textContent = sourceLabel;
    const sc = document.createElement('span');
    sc.className = 'caret';
    sc.textContent = '▾';
    sourceChip.append(s, sc);

    targetChip.textContent = '';
    const targetLabel = targetChipLabel(state.target, languageList);
    targetChip.title = targetLabel;
    const t = document.createElement('span');
    t.textContent = targetLabel;
    const tc = document.createElement('span');
    tc.className = 'caret';
    tc.textContent = '▾';
    targetChip.append(t, tc);

    const paused = !state.enabled || state.status === 'Paused';
    usage.textContent = paused ? 'Paused' : (state.usageText ?? '');
    usage.title = paused
      ? 'Paused — Ctrl+Alt+T or the tray menu resumes'
      : state.usageText
        ? `API usage — active key: ${state.usageText}`
        : '';
    dot.className =
      'dot' +
      (!state.enabled || state.status === 'Paused'
        ? ' paused'
        : state.status === 'Fetching'
          ? ' busy'
          : state.status === 'Offline'
            ? ' offline'
            : '');
    dot.title = statusText(state);
    // Offers (M5.14 paste, M7 sentence): shown while main holds a
    // pending offer; the window grows for it like it does for a toast.
    // A paste offer shows its pair; a sentence offer shows just the
    // improved sentence (the full pair is one hover away).
    const activeOffer = state.pasteOffer
      ? {
          text: `${state.pasteOffer.original} → ${state.pasteOffer.inserted}`,
          title: `${state.pasteOffer.original} → ${state.pasteOffer.inserted}`,
        }
      : state.sentenceOffer
        ? {
            // A reads-well offer shows the translation with a ✓ —
            // it is a confirmation, not a swap candidate.
            text: state.sentenceOffer.identical
              ? `✓ ${state.sentenceOffer.inserted}`
              : state.sentenceOffer.inserted,
            title: `${state.sentenceOffer.original} → ${state.sentenceOffer.inserted}`,
          }
        : null;
    if (activeOffer) {
      offerText.textContent = activeOffer.text;
      // Long phrases ellipsize in the modal; the full pair is one hover away.
      offer.title = activeOffer.title;
      if (offer.hidden) {
        offer.hidden = false;
        syncExpanded();
      }
    } else if (!offer.hidden) {
      offer.hidden = true;
      syncExpanded();
    }
    reportPillWidth();
  }

  function paintMenu(): void {
    const q = menuSearch.value;
    const items =
      openMenu === 'source'
        ? [
            { code: 'auto', label: 'Auto-detect', nativeLabel: '' },
            ...searchLanguages(q, languageList),
          ]
        : searchLanguages(q, languageList);
    menuList.innerHTML = '';
    for (const lang of items) {
      const btn = document.createElement('button');
      btn.className =
        'menu-item' +
        ((openMenu === 'source' && state.source === lang.code) ||
        (openMenu === 'target' && state.target === lang.code)
          ? ' active'
          : '');
      const left = document.createElement('span');
      left.textContent = lang.label;
      const right = document.createElement('span');
      right.className = 'native';
      right.textContent = lang.nativeLabel || lang.code.toUpperCase();
      btn.append(left, right);
      btn.addEventListener('click', async () => {
        if (openMenu === 'source') {
          state = (await window.kbmk?.setLanguages(lang.code, state.target)) ?? {
            ...state,
            source: lang.code,
          };
        } else {
          state = (await window.kbmk?.setLanguages(state.source, lang.code)) ?? {
            ...state,
            target: lang.code,
          };
        }
        paint();
        showToast(statusText(state));
        await setMenu(null);
      });
      menuList.appendChild(btn);
    }
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'menu-item';
      empty.textContent = 'No languages match.';
      menuList.appendChild(empty);
    }
  }

  async function setMenu(kind: MenuKind): Promise<void> {
    openMenu = kind;
    menu.classList.toggle('open', kind !== null);
    if (kind !== null) {
      menuSearch.value = '';
      refreshLanguages();
      paintMenu();
      menuSearch.focus();
    }
    syncExpanded();
  }

  sourceChip.addEventListener('click', () =>
    void setMenu(openMenu === 'source' ? null : 'source'),
  );
  targetChip.addEventListener('click', () =>
    void setMenu(openMenu === 'target' ? null : 'target'),
  );
  menuSearch.addEventListener('input', paintMenu);
  menuSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') void setMenu(null);
  });

  swapBtn.addEventListener('click', async () => {
    state = (await window.kbmk?.swapLanguages()) ?? state;
    paint();
    showToast(`${sourceChipLabel(state.source, 'en', languageList)} → ${targetChipLabel(state.target, languageList)}`);
  });

  gear.addEventListener('click', () => void window.kbmk?.openSettings());

  // Browser-only preview fallback (no preload): paint with mock state so the
  // UI can be eyeballed with `vite` alone. In Electron the real state loads below.
  paint();
  showToast('Ready');

  if (window.kbmk) {
    refreshLanguages();
    void window.kbmk.getState().then((s) => {
      state = s;
      lastNoticeSeq = s.noticeSeq;
      paint();
    });
    window.kbmk.onStateChanged((s) => {
      state = s;
      paint();
      if (s.noticeSeq !== lastNoticeSeq) {
        lastNoticeSeq = s.noticeSeq;
        if (s.notice) showToast(s.notice);
      }
    });
  } else {
    // Keep the mock list import referenced in preview builds.
    void LANGUAGES.length;
  }
}

if (view === 'settings') {
  renderSettings(app);
  document.title = 'KBMK — Settings';
} else {
  renderPill(app);
}
