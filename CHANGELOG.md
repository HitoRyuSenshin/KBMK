# KBMK — Changelog & development notes

**Language should never be a wall between human souls; it should be an open door.**

KBMK is a small Windows 10/11 system-tray app that translates the words you
type — in *any* app — the moment you finish them. Type a word, press space,
and its translation takes its place. Paste text instead, and KBMK offers the
translation in a little glass pill above the tray widget: one keypress swaps
it in, another keeps your text untouched.

It speaks Bengali (including text typed with Avro Keyboard) and 100+
languages, through your own API key from Google Cloud Translation,
Microsoft Azure Translator, or DeepL — plus an experimental keyless mode.

---

## Install

**Option A — build the installer (Windows):**

```bat
npm install
npm run dist
```

This produces `release\KBMK Setup 0.6.1.exe` — a per-user installer (no
admin rights needed) with Start Menu and desktop shortcuts — **and**
`release\KBMK-Portable.exe`, a true single-file build: carry it anywhere
and run it as-is, no installation (it unpacks itself to a temp folder on
first launch, so the first start takes a few seconds). Note the app exe
inside `release\win-unpacked` (from `npm run pack`) is *not* movable on
its own — it needs the files beside it; that's what the installer and
the portable build are for. The installer
is **unsigned**, so Windows SmartScreen will warn on first run: choose
**More info → Run anyway**. The app itself is exactly the code in this
repository.

**Option B — run from source:**

```bat
npm install
npm start
```

Either way, KBMK lives in the system tray with a small glass pill at the
bottom-right of your screen. Closing the pill doesn't quit; use the tray
menu to exit.

**Linux:** `npm run dist:linux` produces `release\KBMK-0.6.3.AppImage`
— a single file; make it executable (`chmod +x`) and run it. No install.

**macOS:** `npm run dist:mac` (run it **on a Mac**) produces a `.dmg`
and a `.zip` containing `KBMK.app`. The build is unsigned, so on first
open right-click the app → **Open** to pass Gatekeeper.

> **Platform note:** KBMK's heart — global key capture, in-place text
> replacement, the per-app block list — is Windows machinery today.
> The Linux and macOS builds run the full interface, settings and
> translation providers, and degrade gracefully where a Windows-only
> piece is missing (they say so in the log), but typing/paste
> replacement is Windows-only for now.

> **Size note:** an installed KBMK is ~250 MB. Almost all of it is the
> Chromium runtime every Electron app carries (Discord, Slack and
> VS Code are the same); KBMK's own code is ~3 MB. The downloadable
> files are far smaller than the installed folder — the Windows
> installer compresses to roughly a third of the unpacked size.

## First run: add a translation key

The first-run wizard walks you through it. In short:

- **Google Cloud** — create a project, enable the Cloud Translation API,
  create an API key, and paste it into Settings → Add key.
- **Azure** — create a Translator resource, then copy **Key 1** and the
  **Location/region** from "Keys and Endpoint".
- **DeepL** — copy a key from deepl.com → API Keys. Free keys end in
  `:fx` and are detected automatically. Note: DeepL covers ~35 languages
  and does **not** include Bengali.
- **Keyless (experimental)** — no key; quality and reliability vary.

Keys are stored **only** in Windows Credential Manager (via keytar) —
never in files, settings exports, or logs. You can keep several keys,
switch the active one, and optionally let KBMK fall back to the next key
when one runs out of quota (it always tells you on the pill when it
switches). A word of care, also shown in the app: *anyone you use a key
from pays for your usage — restrict the key to the translation API, set a
budget alert, and use a separate key for this app.*

## How to use

**Typing.** Just type. When you finish a word with a space or punctuation
(। included), KBMK translates it and swaps it in place — if you keep
typing instead, it leaves your text alone. Repeated words are instant
(they're cached).

**Paste offers.** Copy a word, a phrase, or a short sentence and paste it
— with Ctrl+V, Shift+Insert, or right-click → Paste. A modal above the
pill shows `pasted → translation`:

- **Space** — replace the pasted text with the translation.
- **Esc** — keep the pasted text.
- Doing anything else (typing, clicking, switching apps) dismisses it;
  it also expires on its own. One line at a time, up to 300 characters.

**Hotkeys.**

- **Ctrl+Alt+T** — pause / resume KBMK anywhere.
- **Ctrl+Alt+Z** — undo the last replacement (typed or pasted).

**Per-app block list.** KBMK never captures anything in blocked apps —
password managers are blocked by default. Manage the list in Settings →
Blocked apps, where you can also pick from currently open windows.

**Make it yours.** Settings → Appearance: pick the glass colour from the
colour wheel (the default is KBMK red) and set the glass opacity. The
pill can launch at login (Settings → App behaviour).

## Privacy

- Keystrokes are **never** written to disk, logged, or sent anywhere
  except the single finished word/phrase you trigger a translation for,
  which goes to *your chosen provider* with *your key*.
- No telemetry, no analytics, no accounts.
- API keys live only in Windows Credential Manager. Settings export
  contains labels, counters and statuses — **never keys**.
- Your keys and settings live on *your PC only* (Credential Manager +
  `%APPDATA%`) — never inside the app, the installer, or this code.
  A fresh install on another PC starts empty. To wipe a PC completely,
  use Settings → **Start over** (factory reset).

## Development

```bat
npm install     :: install dependencies
npm test        :: unit tests (Vitest)
npm start       :: build + run in development
npm run pack    :: build an unpacked app (release\win-unpacked)
npm run dist    :: build the Windows installer + portable (release\)
npm run dist:linux :: build the Linux AppImage (release/)
npm run dist:mac   :: build the macOS dmg + zip (run on a Mac)
```

Stack: Electron 35 + TypeScript, Vite + Vitest. Windows-specific pieces
(global hooks, text injection, foreground tracking) sit behind
interfaces (`KeyHook`, `TextInjector`) so all pure logic is unit-tested.
Native modules are prebuilt (koffi, uiohook-napi, keytar) — no compiler
is needed to install or package. If keytar ever fails to load on a PC,
KBMK still runs; it just can't store keys there (the prerequisite is
Visual Studio Build Tools 2022 with the C++ workload).

## Known limitations

- **Unsigned installer** — SmartScreen warns on first run (see Install).
- **Translation takes a moment** on first use of a word (a network round
  trip, typically 150–400 ms). Cached words replace instantly.
- **Paste offers** cover one line, up to 300 characters. Mouse-paste
  detection (right-click → Paste) is a heuristic based on the clipboard
  not changing across the context menu; the terminal logs every time it
  fires. Multi-line text, links, emails and paths are never offered.
- **Replacement restores text clipboard only.** If your clipboard held
  an image or files when a replacement pastes a translation, the
  original non-text content can't be put back (the translation is
  cleared from the clipboard instead of being left there).
- **DeepL has no Bengali** (and ~35 languages total); with a DeepL key
  active, the language menus show DeepL's list only.
- **Bengali input** works through the Win32 capture path (Avro's
  VK_PACKET text and layout-resolved keys). The uiohook fallback path
  maps a US layout only.
- **Launch at login** on a dev (`npm start`) run registers the Electron
  binary; the installed app registers KBMK itself, as expected.
- Windows only for the core features. The glass blur-behind uses a
  Windows DWM accent API (best-effort; on failure the CSS glass look
  remains). Linux/macOS builds (M6.2) run the UI, settings and
  providers, but global capture, text replacement and the block list
  are Windows-only; on Linux, key storage needs libsecret and capture
  needs X11 (libXtst).

---

## Changelog

# KBMK (Kotha Bolo Mon Khule) — M6.3

**Documentation.** Added `USER_MANUAL.md` — a complete user manual
(about, installation for all platforms, key setup for every provider,
everyday use, appearance, privacy, troubleshooting, known
limitations). No code changes.

# KBMK (Kotha Bolo Mon Khule) — M6.2

**Smaller footprint + Linux/macOS builds.** Size: the unpacked Windows
app went 291 MB → 250 MB by shipping only the en-US Chromium locale
(42 MB of language packs removed — KBMK's own UI is custom, and
Bengali text handling lives in ICU data, which is untouched), trimming
other platforms' uiohook binaries per target, dropping sourcemaps from
the package, and maximum installer compression. The rest is the
Electron runtime itself — the floor for any Electron app. Platforms:
`npm run dist:linux` → a single-file AppImage (built and smoke-run in
the build VM: it starts, loads settings, and declines capture cleanly
where X11/libsecret pieces are absent); `npm run dist:mac` → dmg + zip
(unsigned; build on a Mac — the .app bundle itself cross-builds, but
dmg creation and signing belong on macOS). A 1024px icon with
transparent corners was rendered for mac/linux. Core features
(capture, replacement, block list) remain Windows-only; other
platforms run the UI/providers and degrade gracefully.

# KBMK (Kotha Bolo Mon Khule) — M6.1

**Portable build + factory reset.** (1) The builder now also emits
`KBMK-Portable.exe` — a true single-file build that runs from anywhere
(the exe inside win-unpacked is not standalone; it needs its folder).
(2) Settings → Start over: a factory reset that deletes every key —
including its Credential Manager secret — and restores all settings to
defaults. Keys and settings were never stored in the app or installer:
they live per-PC in Credential Manager + %APPDATA%, which is why an
upgraded install on the same PC keeps them and a fresh PC starts with
the first-run wizard. The one personal trace in the repo (a profile
label inside an old sample log line in these notes) has been scrubbed.

# KBMK (Kotha Bolo Mon Khule) — M6

**Packaging and the final README.** electron-builder 26.17.0 (pinned;
npm latest tag still points at 26.15.3, so it is installed by exact
version) with an NSIS per-user installer config: npm run dist
produces release\KBMK Setup 0.6.0.exe (Start Menu + desktop
shortcuts, install directory selectable, KBMK icon throughout);
npm run pack produces the unpacked app. Native modules are bundled
as-is (npmRebuild off — all are prebuilt) and every .node file is
asar-unpacked so koffi/uiohook/keytar load from real paths. Validated
in the build VM up to the final installer step: the win-unpacked app
builds completely with the correct file set; the NSIS finalize step
needs a Windows machine (on Linux it requires Wine), which is where
the installer is meant to be built anyway. This README was
restructured into the product document above; the milestone notes
follow as the changelog.

---

# KBMK (Kotha Bolo Mon Khule) — M5.17

**Paste offers handle phrases and short sentences, not just words.**

- The paste candidate rules now accept any **one line of prose up
  to 300 characters** (~50–60 words): a word, a phrase, a couple of
  sentences. Numbers inside a sentence are fine ("I have 2 cats").
  Still rejected: multi-line or tabbed text, and anything with a
  link/email/path/code-looking token (`@`, `://`, `www.`, `/`, `\`)
  anywhere in it — those are never prose.
- Phrases translate as a whole, punctuation included, exactly as
  the provider returns it (single words keep the older behaviour:
  one trailing punctuation mark rides along with the translation).
- The swap deletes the **exact pasted text** (surrounding spaces
  included), which also removes a small spacing imperfection the
  single-word flow had when a copy came with a trailing space.
- The offer modal now opens at the full menu width so a sentence
  preview has room; very long previews ellipsize in the card, with
  the full `pasted → translation` pair on hover.
- The 300-character cap is deliberate: replacement deletes
  character-by-character, so a whole pasted document would swap
  slowly and riskily. Within the cap, keyboard and mouse pastes
  behave identically.

187 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.16

**Mouse paste works now too (right-click → Paste).**

The keyboard hook can't see a context-menu pick, so KBMK reads the
gesture instead:

- On a **right-click**, it quietly notes the clipboard's content.
- A **left-click shortly after (≤ 2.5 s) and near the same spot**
  (≤ ~420×520 px — a context menu's footprint) is a menu pick.
- If the pick **changed the clipboard, it was Copy or Cut** — no
  offer, ever. If the clipboard is **unchanged**, the pick was
  Paste, and a single-word clipboard gets the usual offer above the
  pill: **Space** replaces, **Esc** keeps.

Same safeguards as keyboard paste (the offer dies on any other
action, nothing in blocked apps or while paused), with a shorter
10-second life for mouse-detected offers. Honest limit: this is a
heuristic — a menu item that neither pastes nor touches the
clipboard (e.g. "Select all") followed instantly by Space could in
principle trigger a swap; Esc dismisses, and the terminal logs
`mouse paste detected` whenever this path fires so it's never
silent.

185 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.15

**Three fixes: the opacity slider's colour, the paste popup, and
the dismiss key.**

- **Glass opacity slider now takes the accent colour.** The
  brightness slider was tinted via `accent-color: var(--red)`; the
  opacity slider never got that rule, so it stayed Chromium's
  default blue no matter what colour you picked. Both Appearance
  sliders now share the rule and follow the wheel.
- **The paste popup is now a true modal twin of the pill** — same
  glass background, same fully-rounded border, same shadow and
  height as the pill itself, floating directly above it:
  `hola → hello` … "Space — replace · Esc — keep".
- **Esc replaces Alt+Space** as the "keep the pasted word" key.
  Alt+Space is a Windows system key (window menu) and is no longer
  used by this feature at all; Esc is swallowed only while an offer
  is on screen, so the app underneath doesn't also act on it.
- **Paste-offer diagnostics in the terminal log**, and the pill
  window's rounded region is now re-clipped synchronously whenever
  the window resizes (the popup lives in exactly the strip a stale
  region could cut). Pasting a word now logs the whole lifecycle:
  the offer line, an "on screen; pill window is WxH" line proving
  the window grew, and a closing line saying how the offer ended
  (accepted / dismissed / expired / cleared). If a popup ever fails
  to appear, those lines say precisely where it stopped.

180 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.14

**Paste a word, get a translation offer.**

Pasted text never passed through the word buffer, so a pasted word
was never translated. Now it gets its own flow:

- **Ctrl+V** (or **Shift+Insert**) of a *single word* → KBMK reads
  the clipboard, translates the word, and a popup appears above the
  pill: **`hola → hello`**, with the hint
  "Space — replace · Alt+Space — keep".
- **Space** accepts: the pasted word is swapped for the translation
  (the space lands after it, exactly like the typing flow). The swap
  is undoable with Ctrl+Alt+Z.
- **Alt+Space** dismisses and keeps the pasted word. While an offer
  is showing, the Win32 hook *swallows* that one keypress so it does
  not also open the focused app's system menu; at all other times
  Alt+Space behaves completely normally.
- One trailing punctuation mark travels with the swap: pasting
  `hola.` offers `hello.` and deletes the whole pasted token.
- Safety, same rules as typing: the offer dies the moment you type
  anything else, click, or switch apps — a later Space is just a
  space. It also expires on its own after 15 seconds. Multi-word
  pastes, links, emails and digit-containing tokens never trigger
  it, and nothing is offered in blocked apps, while paused, or when
  the word already reads as its translation.
- Right-click → Paste cannot be seen by the keyboard hook, so this
  works with keyboard pastes only.

180 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.13

**The pill hugs its content — no more dead gap before the gear.**

- The collapsed pill no longer has a fixed width. The renderer
  measures the row's natural width on every paint (dot + chips +
  swap + usage + gear, fractional widths, scrollWidth so a squeezed
  element reports its true size) and main resizes the window to fit,
  so the empty stretch that used to pool in the spacer is gone —
  in the reference layout the pill ends ~3px after the gear icon.
- Bounds: 264–384px. The language menu keeps its full 384 width;
  toasts keep the pill's content width. Width changes anchor the
  window's **right edge** (clamped to the work area), composing with
  the M5.11 anchor geometry — the pill grows/shrinks without
  wandering from where it was dropped.
- An 8px reporting threshold keeps the window still while only the
  usage counter ticks (99 → 100 doesn't resize anything); switching
  languages re-fits the pill.
- The measurement slack (+12px) was calibrated against a live
  shrink-scan in the VM: at the computed width, "112 used" renders
  in full with ~3px to spare.

167 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.12

**Real Windows blur-behind, and the language chips get their room back.**

- **The blur now comes from Windows itself.** M5.11's stronger CSS
  blur still didn't *feel* like frost over other apps — because CSS
  `backdrop-filter` in a transparent window can only blur what the
  page itself paints; another program behind the menu is out of its
  reach, so the menu read as plain see-through white. The pill
  window now asks the Windows DWM for real blur-behind
  (`SetWindowCompositionAttribute`, `ACCENT_ENABLE_BLURBEHIND`, via
  the existing koffi bridge): everything behind the pill/menu —
  browser, editor, anything — is genuinely blurred, and KBMK's
  translucent glass paints over it. A rounded window region
  (`SetWindowRgn`, refreshed on every resize) keeps the blur hugging
  the pill's silhouette instead of showing square corners.
  Best-effort like the shadow fix: if a Windows build refuses it,
  the app logs one line and keeps the CSS look.
- **Language chips were starved by the narrower pill** (names showed
  as "EN a…", "ES · Span…"). Chips no longer shrink — they hold
  their full name (up to a 140px cap, full text still on hover); the
  pill widens slightly (368 → 384), and the usage readout is the
  element that gives way under pressure. Its text is also shorter:
  `107 used` instead of `107 this month` (DeepL's
  `1.2k/500k chars` is unchanged).

166 tests pass. The blur-behind is Windows-only DWM behaviour —
**needs user test**; the chip layout is verified in the VM.

---

# KBMK (Kotha Bolo Mon Khule) — M5.11

**Position fixes, single-line QRs, a tighter pill, more frost.**

- **Bug fix — the pill teleported home:** dragging the pill anywhere
  and then opening a language menu snapped it back to the default
  bottom-right corner. Cause: expansion recomputed the default
  position from scratch on every open. Now the window grows **from
  where the pill actually is** — the anchor is derived from the
  window's real bounds each time (pure geometry in
  `src/shared/expand.ts`, unit-tested, including a round-trip:
  expand → collapse returns the pill to its exact dragged spot).
- **The menu opens downward near the top of the screen:** when there
  isn't room above the pill but there is below, the menu (and toasts)
  open **under** the pill instead of running off the top edge. Main
  decides per-open from the display's work area; the renderer flips
  the pill shell (`menu-below`) to match.
- **Support QRs on one line:** the three codes no longer wrap 2 + 1.
  Tiles flex to share the row, and the Settings window's default
  width grows 580 → 648 (min 580) to give them room.
- **Tighter pill:** width 400 → 368 now that the ON/OFF switch is
  gone, and the usage readout hugs the language chips (the spacer
  moved behind it), so the dead stretch in the middle is much
  smaller.
- **More frost:** the language dropdown and toast get a stronger
  blur (`blur(30px) saturate(1.9)`), and the Appearance colour wheel
  now sits on a frosted glass disc. (Note: for a transparent window,
  Windows/Chromium blur only what the page itself renders behind an
  element — the frosted translucency is what carries the effect over
  other apps.)

165 tests pass. Drag/expand behaviour on real Windows is
**needs user test**.

---

# KBMK (Kotha Bolo Mon Khule) — M5.10

**Six user-requested changes.**

- **Glass opacity (Appearance):** a slider beside the colour wheel —
  "how see-through the pill and panels are", 35%–100%. Stored as
  `glassOpacity.v1`, applied live to the pill, menus and cards via a
  `--glass-opacity` CSS variable, with a Reset button. Like the
  accent, picking previews instantly and persists debounced.
- **Pill: the ON/OFF switch and label are gone.** Their slot now
  shows the **active key's API usage**: DeepL keys show their real
  character usage from DeepL's `/v2/usage` (e.g. `1.2k/500k chars`,
  refreshed at most every 5 minutes); Google/Azure expose no usage
  endpoint, so they show the local monthly count (`107 this month`);
  keyless mode shows "Keyless", no key shows "No key". While paused
  the slot reads **Paused**. Pause/resume itself is unchanged —
  **Ctrl+Alt+T** or the tray menu.
- **Active-dot colour rule:** the pill's green "active" dot blended
  into the glass whenever the accent was green. Now, when the accent
  hue is green/near-green (~65°–175°), the dot turns **blue**
  (`#0a84ff`); every other accent keeps the green dot. Pure rule in
  `shared/color.ts`, unit-tested against the preset palette.
- **Export:** a **Copy JSON** button beside Export settings — copies
  the exported JSON (still key-free, as always) to the clipboard and
  shows it; if the clipboard is blocked, the JSON is left selected
  for a manual Ctrl+C with a status line saying so.
- **Support:** the extra sentence under "Thanks for using KBMK." is
  removed — just the thanks and the codes. The Binance QR is replaced
  with the user's new one, and a third QR (Bybit) is added.

161 tests pass. Windows behaviour (live opacity over real windows,
DeepL usage with a real key, clipboard) is **needs user test**.

---

# KBMK (Kotha Bolo Mon Khule) — M5.9

**Bug fix (found by the user): a DeepL key added in Settings was saved
as a Google profile** — badged "Google", marked Invalid, and its
translations failed as Google bad-requests.

- **Root cause:** the renderer's dropdown and `ProfileStore` both
  handled `'deepl'` correctly, but the main-process IPC handler for
  add-profile still carried an M4.3-era coercion —
  `provider === 'azure' ? 'azure' : 'google'` — which flattened
  `'deepl'` to `'google'` in between. The M5.8 tests covered the
  store and router but not this hop; that gap is now closed.
- **Fix:** a single shared `normalizeProviderKind()` (in
  `src/shared/types.ts`) is the only way untyped provider strings are
  coerced — `'azure'`/`'deepl'` pass through, anything else defaults
  to `'google'` — and the IPC handler uses it. Regression tests cover
  the function and guard the handler against the old ternary
  returning.
- **Safeguard:** a key ending in **`:fx`** is unmistakably a DeepL
  free key (no other provider uses that suffix). If one is pasted
  while the dropdown sits on another provider, Settings now saves it
  as DeepL anyway and says so in the status line, instead of filing
  it under the wrong API.
- **If you added a DeepL key with M5.8:** it is stored as a Google
  profile and cannot heal itself — **Remove** that profile and add
  the key again; it will now save as DeepL (the `:fx` safeguard
  catches it even if the dropdown is forgotten).

153 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.8

**DeepL added as a third per-key provider type** (beside Google Cloud
and Azure Translator, requested by the user).

- **New `DeepLTranslatorProvider`:** `POST {host}/v2/translate` with
  header `Authorization: DeepL-Auth-Key <key>` and JSON body
  `{text:[...], target_lang, source_lang?}`; result at
  `translations[0].text`. Free keys end in **`:fx`** and are served by
  `api-free.deepl.com`; paid keys use `api.deepl.com` — the host is
  picked automatically from the key itself, no extra setting.
- **Errors, typed like the other providers:** 403 → auth (key marked
  invalid), **456 → quota** (DeepL's character-limit code), 429 →
  quota/rate-limit, 400 → bad-request carrying DeepL's own message
  (this is what an unsupported language produces, said plainly).
- **Language codes** mapped at the boundary both ways
  (`zh-CN↔ZH-HANS`, `zh-TW↔ZH-HANT`, `no↔NB`, `EN-GB/EN-US→en`,
  `PT-PT→pt`, `PT-BR→pt-BR`); `listLanguages()` uses DeepL's
  authenticated `/v2/languages?type=target`, so with a DeepL key
  active the menus show exactly the languages DeepL can do.
- **Wiring:** `ProviderKind` gains `'deepl'`; `ProfileStore.add`
  accepts it (no region needed); `ProfileRouter` dispatches per key
  through a shared `buildProvider()` — translation, Test connection,
  language list, usage counting and quota fallback all work, and
  fallback can cross providers (DeepL quota → Google/Azure key takes
  over, announced on the pill as always). Settings: the Add key
  provider list gains **DeepL**, profile rows show a **DeepL** badge,
  and the first-run wizard explains where to get a key.
- **Coverage honesty:** DeepL supports ~35 languages and **does not
  include Bengali**. DeepL keys are for its strong languages
  (European languages, Japanese, Korean, Chinese…); your Google/Azure
  keys keep covering Bengali in the same profile list.

151 tests pass. DeepL with a real key is **needs user test** on
Windows.

---

# KBMK (Kotha Bolo Mon Khule) — M5.7

**New iconography.**

- **App / tray icon, redesigned in the style the user pointed to:**
  a light glass squircle with a thin deep-teal outline and one bold
  mark — **ক**, the first letter of "Kotha" — in deep teal. Ships as
  `assets/icon.png` (256px), `assets/icon.ico` (nine sizes, 16–256,
  so the Windows tray picks a crisp native size), `assets/tray.png`,
  and the `assets/icon.svg` source. The tray uses the .ico on
  Windows; both windows (pill, Settings) carry the same icon for
  Alt-Tab/taskbar. Verified legible at 16/32/64px on light and dark
  backgrounds.
- **Settings button in the pill:** the stock ⚙ character is replaced
  by a drawn sliders icon (macOS "preferences" style) — three rounded
  lines with ring knobs, in the current text colour, turning accent
  red on hover like everything else.

143 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.6

**Final design pass.**

- **Top gap before About removed:** the empty status line no longer
  reserves a full line (plus its paragraph margins), the body top
  padding shrank, and the first section heading lost its top margin —
  About now starts right under the title bar.
- **The grey rectangle around the pill is gone at the source:** the
  window was already fully transparent in code, but Electron's
  `hasShadow` option is macOS-only — Windows 11's DWM was still
  drawing a soft *rectangular* shadow + hairline border around the
  transparent window. The pill window now disables DWM non-client
  rendering (`DwmSetWindowAttribute`, NCRENDERING_POLICY=DISABLED),
  so the only shadow left is the pill's own CSS shadow, which follows
  the rounded shape. Outside the pill: 100% transparent, as intended
  since M1.2.
- **Support section** at the very bottom of Settings: "Thanks for
  using KBMK." with the two support QR codes on white tiles (kept
  white in both themes — QR codes need the contrast).
- The "packaged installer arrives in M6" line was removed.

143 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.5

**About section.** Settings now opens with an About panel, placed
before Appearance: a quiet macOS-style glass card carrying KBMK's
statement — "Language should never be a wall between human souls; it
should be an open door" — with the full name (Kotha Bolo Mon Khule)
as its kicker and a soft accent glow that follows the chosen glass
colour. The user's text was lightly polished for rhythm (meaning
unchanged).

Also confirmed by the user: the M5.4 block-list fixes work.

---

# KBMK (Kotha Bolo Mon Khule) — M5.4

**Block-list fixes, both proven by the user's own console log.**

- *Picker:* window enumeration registered its koffi callback type on
  every call; koffi type names are global, so the first call in a run
  worked and every Refresh after it threw `Duplicate type name
  'KbmkEnumWindowsProc'` and listed nothing. The FFI surface is now
  built once and reused.
- *Enforcement:* foreground tracking itself worked (the log showed
  `foreground app: notepad.exe`) — but a name typed as "notepad exe"
  (space instead of the dot) had been stored as `notepad exe.exe`,
  which looks right in the list yet never equals the real process
  name. The normalizer now maps "name exe" → `name.exe` and repairs
  already-stored bad entries on read; the app logs its exact block
  list at startup and on every change.

142 tests pass.

---

# KBMK (Kotha Bolo Mon Khule) — M5.3

**Block-list fix.** The block list (and the window picker) quietly
never enforced: the foreground tracker's `GetWindowThreadProcessId`
out-parameter was declared to koffi as a typed `uint32 *`, so the pid
never landed in the buffer, every foreground lookup returned "unknown
app", and — the design flaw that hid it — lookups failed *silently*,
so the app behaved exactly as if nothing was blocked.

- Both Win32 helpers (`foregroundApp`, `openWindows`) now declare
  out-parameters as `void *` backed by Buffers — the exact idiom the
  (working) keyboard hook uses.
- A foreground switch now resolves immediately instead of possibly
  serving the previous app's name for up to 250 ms.
- Failures are loud now: the first tracking error, and any window
  enumeration error, prints to the console with its cause; the app
  logs each foreground change (`[KBMK] foreground app: notepad.exe`)
  so enforcement is verifiable at a glance; Refresh / Block selected
  in Settings always answer in the status line.

141 tests pass (incl. a source guard for the FFI idiom).

---

# KBMK (Kotha Bolo Mon Khule) — M5.2

**Customisable glass accent colour.**

- Settings → **Appearance**: a real colour wheel (hue around the
  circle, saturation toward the centre) with a brightness slider, a
  live hex readout, seven preset swatches, and **Reset to KBMK red**.
- The default stays the red-white glass (`#e24b4a`). Picking a colour
  re-tints *everything* driven by the accent — the pill's glass tint
  and toggle, buttons, section headings, badges, focus rings — on the
  pill and in Settings, instantly, and the pill updates live while
  you drag (no restart).
- Implementation: all accent tints in CSS now derive from one
  `--red` variable via `color-mix()`; the choice persists in the
  settings store (`accentColor.v1`, validated hex; a corrupt stored
  value falls back to KBMK red) and reaches the pill through the
  normal state channel.

139 tests pass. The picker on Windows is **needs user test** (it is
plain canvas + DOM, verified visually in the VM build).

---

# KBMK (Kotha Bolo Mon Khule) — M5.1

**UI overhaul + OBS-style block picker + fully frameless windows.**

- **No native title bar anywhere.** The pill was already frameless;
  Settings is now frameless and transparent too, with its own glass
  title bar: the strip drags the window, and it carries working
  minimize / close buttons. If a pale "KBMK" bar ever appears above
  the pill again, it belongs to some other window behind it — after
  this update, no KBMK window can draw one.
- **Drag regions:** the pill moves by dragging its glass body (the
  empty area inside the rounded border, the spacer, the edges) —
  chips, buttons and the ON/OFF text are *not* drag handles, so
  nothing you click can accidentally move the pill. Settings moves by
  its title bar.
- **macOS-style glass pass:** stronger backdrop blur + saturation,
  layered translucency with a hairline top highlight, one spacing
  scale (6/8/12/16), fixed control heights, iOS-style switch, thin
  translucent scrollbars, focus rings. Checked the whole stylesheet
  for errors and rebuilt it clean.
- **No more overlapping/clipped titles:** the pill window widened
  360 → 400 px and chips get the room they need (verified: "EN auto"
  and "ES · Spanish" render in full; longer labels ellipsize with the
  full text on hover). Profile rows are a strict grid — name
  truncates, badges and buttons never collide. Settings has minimum
  window sizes now.
- **Bug fix:** pill toasts (e.g. "Switched to …'s key", "KBMK is off
  in keepassxc.exe") were rendered inside the 56 px window and
  clipped off the top — effectively invisible. The window now grows
  briefly (bottom-anchored) while a toast shows.
- **Block list picker (OBS-style):** Settings → Blocked apps now has
  a dropdown of the windows open *right now* — `notepad.exe —
  Untitled - Notepad` — with Refresh and "Block selected" (Win32
  EnumWindows; KBMK's own windows are never listed). Typing a process
  name still works for apps that aren't running.

Window enumeration and the frameless window controls on Windows are
**needs user test**; all collection/filter logic is unit-tested
(134 tests).

---

# KBMK (Kotha Bolo Mon Khule) — M5

**M5 completes Settings and adds the safety behaviours.**

- **Per-app block list.** In a blocked app KBMK does nothing at all —
  keystrokes are not captured, buffered, translated, or replaced.
  Enforced by foreground-app tracking (Win32: GetForegroundWindow →
  process name via koffi, resolved only when the foreground window
  changes). Switching apps abandons any partial word and invalidates
  any translation in flight, so a replacement can never land in the
  wrong app. Entering a blocked app shows a one-time pill notice
  ("KBMK is off in keepassxc.exe (block list)"). Pre-filled with
  common password managers (1Password, KeePass/KeePassXC, Bitwarden,
  LastPass, Dashlane, Enpass); edit it in Settings → Blocked apps
  (process names, e.g. `notepad.exe`; Task Manager → Details shows
  them).
- **Ctrl+Alt+T pause/resume**, working from anywhere — including while
  paused (it is handled before the paused check). The pill toasts the
  new state. Ctrl+Alt+Z undo (M4) remains. As with undo, an AltGr
  character on those keys still types the character.
- **Launch at login** (Settings → App behaviour): uses Electron's
  login item (Windows registry Run key). The toggle always reflects
  the real OS state, read back from Windows. Note for dev runs: under
  `npm start` the registered program is the Electron binary; the M6
  packaged app registers itself.
- Settings is now complete: provider mode + wizard, key profiles
  (Google/Azure, fallback, export), app behaviour, block list, hotkey
  reference, privacy notice.

Everything Windows-specific here (foreground detection, login item)
is **needs user test**; the block-list logic, preference storage and
hotkey detection are unit-tested (128 tests).

---

# KBMK (Kotha Bolo Mon Khule) — M4.3

- **Azure Translator as a second provider type** (user request). Every
  key profile now has a provider — **Google** or **Azure** — chosen in
  the Add key form; Azure also asks for the resource **region** (Azure
  portal → Translator resource → Keys and Endpoint; "global" resources
  omit the region header automatically). Profiles made before M4.3
  read back as Google. The router dispatches per key, the language
  list comes from the active key's provider, and quota fallback can
  cross providers (a Google key at quota can fall back to an Azure key
  and vice versa). Language codes are mapped at the Azure boundary
  (zh-CN ↔ zh-Hans, tl → fil, …) so menus and the cache keep one
  canonical set. Azure's free F0 tier includes 2M characters/month.
- About the pale "KBMK" bar in the user's screenshot: zooming in shows
  a standard Windows title bar of a window titled exactly "KBMK"
  sitting *behind* the pill. The pill window is frameless
  (`frame: false`, verified in code and in every earlier screenshot)
  and cannot draw that bar — it belongs to another window the
  always-on-top pill overlaps. Dragging the pill proves it: the bar
  stays with the window behind.

---

# KBMK (Kotha Bolo Mon Khule) — M4.2 fixes

- **Bengali danda ।** (U+0964, and double danda ॥ U+0965) are now word
  delimiters, like "." in English: `আমি।` completes আমি and translates
  it, and the danda is re-emitted after the translation. Before, it
  was treated as a symbol and silently poisoned the word.
- **Language menus follow the API.** With a Google key configured, the
  pill fetches the key's supported-language list from Google
  (`GET .../languages`), caches it for 24 h, and the menus show exactly
  that — including **Filipino (`fil`)**, which the old hand-written
  24-language list missed. The built-in fallback list also grew (~44
  languages, incl. Filipino/Tagalog and the South & Southeast Asian set)
  for keyless/offline use. API names drive the menu; built-in entries
  still contribute native labels and search aliases ("bangla").
- About the swap delay: it is the provider round trip (your logs show
  ~150–320 ms) plus ~80 ms of clipboard settling. Words translated
  before are in the local cache and swap effectively instantly.

---

# KBMK (Kotha Bolo Mon Khule) — M4

**M4 replaces the word in place.** When a word completes, it is
translated as in M3 — and now, if you haven't typed anything since, the
typed word is swapped for its translation right where you typed it,
followed by the same delimiter. **Ctrl+Alt+Z** undoes the last swap,
restoring your original word. Set the pill OFF to pause everything.

## How replacement works

- `ReplacementCoordinator` (pure logic, unit-tested): translate →
  case-adjust → race check → replace. The race check compares a counter
  that increments on every key event: if you typed, clicked, or pressed
  anything after the word while the translation was in flight, the swap
  is skipped and the log says `not replaced … you kept typing`. A swap
  while you are mid-next-word would delete your new text — it never
  happens.
- `TextInjector` (interface, as specced) → `WindowsTextInjector`:
  **SendInput via koffi** (user32), not nut-js — koffi is already the
  app's FFI layer for the hook and needs no new native module, nothing
  extra to compile or install. Steps per spec: Backspace ×
  (visible characters + 1) → save clipboard → write translation →
  Ctrl+V → restore clipboard → re-emit the delimiter (Space/Enter/Tab
  as real keys; punctuation as a Unicode packet).
- **Backspace counts are UTF-16 code units** (the word's string
  length). M4.0 tried grapheme clusters and the user's Notepad test
  left the first Bengali letters behind (নাম → "ন" remained, শিহাব →
  "শি") — proof that one Backspace there deletes exactly one code
  unit, combining vowel signs included. Fixed in M4.1.
- **Injection guard, two layers:** every synthetic key carries a magic
  `dwExtraInfo` ("KBMK") that the low-level hook checks and ignores, and
  the hooks' `injecting` flag is held for the whole edit (+50 ms tail).
  A pasted translation can therefore never feed back into the word
  buffer and get "translated" itself. Avro's own injected text has no
  magic marker and is captured as before.
- Clipboard honesty note: only *text* clipboard content can be saved and
  restored. If your clipboard held an image or files, pasting still
  works but that content can't be put back (Electron exposes no way to
  snapshot it) — the clipboard is cleared afterwards instead of leaving
  the translation on it.
- Failure at any step leaves your text as typed and logs the reason;
  replacement never blocks or swallows your real keystrokes (the hook
  still passes every key through).

## Log lines to expect

```
[KBMK] Text replacement: active (SendInput). Ctrl+Alt+Z undoes the last replacement.
[KBMK] "hello" -> "Hola" (google, key "My key", 210 ms)
[KBMK] replaced in text: "hello" => "Hola"
[KBMK] undo: "Hola" => "hello" restored
```

Windows behaviour (SendInput, paste, undo) is **needs user test** — it
cannot run in the build VM. The coordinator, key plans, buffer byte
layout, grapheme counts and hotkey detection are unit-tested
(102 tests).

---

# Earlier milestone notes (kept for history)

# KBMK (Kotha Bolo Mon Khule) — M3

**M3 adds the translation layer and key profiles.** Completed words are now
translated in the background (never blocking typing) and logged, e.g.
`[KBMK] "hello" -> "hola" (google, key "My key", 84 ms)` or `(cached, 0 ms)`.
Text is **not replaced yet** — that's M4. Failures leave the word untouched
and log `translation failed … — word left as typed`; the pill shows
Fetching / Cached / Offline states and notices.

## Providers

- `GoogleCloudProvider` (default): Cloud Translation API v2, POST with
  `{"q","source","target","format":"text"}` exactly as specified, source
  omitted for auto-detect, HTML entities decoded.
- `UnofficialGtxProvider`: the keyless `client=gtx` endpoint, labelled
  experimental in Settings. (Live check from this build VM: the endpoint
  answered a real HTTP 429 — datacenter IPs are rate-limited on it — and
  the app mapped it to a clean "rate limited" error. Home connections
  usually fare better; needs user test.)
- `TranslationService`: LRU cache (500 entries, key `word|from|to`),
  in-flight de-duplication, max 5 concurrent requests, 2 s timeout per
  attempt, exactly 1 retry for transient failures. Auth/quota failures are
  never retried at this layer.
- `BrowserProvider` from the original spec is not in M3 (the keyless
  option is GTX); it stays an option for a later milestone.

## Key profiles (per the M3 design update)

- `KeyProfile { id, label, createdAt, lastUsedAt, monthlyCount, status }`
  with status `unknown | valid | invalid | quota`.
- The **secret lives only in keytar** — service `KBMK`, account =
  profile id (Windows Credential Manager). Metadata lives in
  **electron-store** (`electron-store@8.2.0`, the last CommonJS release;
  v9+ are ESM-only). `keytar@7.9.0` is an *optional* dependency: if its
  native binary cannot build/load on a PC, `npm install` still succeeds
  and Settings shows that key storage is unavailable (with the fix: Visual
  Studio Build Tools 2022 C++ workload + Python, then reinstall).
- The renderer only ever receives `{ id, label, last4, status, counters }`.
  Error messages never contain a key or a key-bearing URL — covered by a
  scan test that greps the metadata store, the renderer view, exports,
  results and logs for the test secret.
- Settings window: profile list (active radio, `••••1234`, status badge,
  monthly counter), Add key (label + masked input, with the "anyone you
  use a key from pays…" help text), Test connection (uses the free
  languages endpoint, not a billed translation), Rename, Remove (with
  confirmation), Set active.
- **Fallback (off by default):** if the active key hits quota it is marked
  `quota` and, when fallback is on, the router retries once with the next
  key in the ordered list (reorder with ↑/↓), makes it active, and the
  pill visibly announces `Switched to <label>'s key`. Auth failures mark
  `invalid` and never fall back. Counters reset on the 1st of each month
  (local time). `exportSettings()` in Settings exports metadata only.
- First run with no profiles: the Settings window shows a wizard with the
  Google Cloud key-creation steps and a one-click "Continue with the
  experimental keyless provider" option.

## Known limitations (M3)

- Google provider behaviour with a real key is **needs user test** (no key
  exists in this VM); the request shape, parsing, and error mapping are
  unit-tested against fake responses, and GTX was exercised live.
- Translations are logged and shown as pill states in M3; your typed text
  is only replaced from M4.

---

# Earlier milestone notes (kept for history)

> **M2.2 fix (Bengali / Avro words never completed):** uiohook-napi only
> exposes a layout keycode — never the character — and Avro Keyboard
> delivers finished Bengali as injected Unicode, which libuiohook reports
> as keycode 0. M2.2 adds a Windows capture layer
> (`src/hook/Win32LayoutKeyHook.ts`, FFI via `koffi@3.3.3`, no node-gyp
> build): a `WH_KEYBOARD_LL` hook that reads `KBDLLHOOKSTRUCT` directly.
> `VK_PACKET` keys carry Avro's Unicode characters in their scan code;
> everything else is resolved with `ToUnicodeEx` against the foreground
> window's real keyboard layout. All decisions are pure functions in
> `src/hook/vkChar.ts` (unit-tested with Bengali packet/layout inputs).
> If the Win32 hook cannot start, the app logs
> `Character source: uiohook keycodes (US layout fallback)` and keeps the
> old behaviour; the successful start logs
> `Character source: Windows layout + Avro (Win32 hook)`.
> **Needs user test on Windows** — this layer cannot run in the Linux VM.
> Note on installing `koffi`: its installer downloads a prebuilt binary
> (worked in this VM). If that download is blocked on your network and it
> falls back to a source build, it needs **CMake + Visual Studio Build
> Tools 2022 ("Desktop development with C++")** — paste the error and I
> will fix only that. One more Avro caveat: if Avro is set to its
> clipboard-paste output mode, Bengali arrives as Ctrl+V, not keys; the
> `KBMK_DEBUG_KEYS=1` log (now including `win32 vk=… resolved=…` lines)
> shows that case immediately.

**M2 adds:** the global keyboard hook (`uiohook-napi@1.5.5`, pinned) and the
word buffer. Completed words are logged to the dev console only — the
terminal where you ran `npm start` — like:

```
[KBMK] word: "hello" (delimiter: Space)
```

There is still **no translation and no text replacement** (M3/M4). The hook
only observes keys; it never blocks, alters, or stores them. Nothing about
typing is written to disk, ever. When the pill is OFF (Paused), the buffer
is not fed at all and every key passes through untouched.

## Word buffer rules (implemented + unit-tested)

- Only the current word is kept in memory. It completes on Space, Enter,
  Tab, `, . ! ? ; :` and the buffer clears.
- Cleared without completing on: Esc, arrow keys, Home/End, PageUp/Down,
  Delete/Insert, F-keys, any Ctrl/Alt/Win combo, a mouse click, or a
  window focus change.
- Backspace edits the word. Capitalisation is preserved as typed.
- Words are Unicode letters + combining marks, so Bengali (including vowel
  signs) and Arabic words stay whole; `don't` and `well-known` count as
  one word.
- Skipped: pure numbers, words containing digits, and anything after an
  email/URL symbol (`@`, `/`, …) until the next Space/Enter/Tab — including
  the fragment after the dot in an email address.

## Installing the hook on Windows

`uiohook-napi@1.5.5` ships prebuilt binaries for win32-x64 and win32-arm64
inside the npm package (verified), and its install step (`node-gyp-build`)
uses them — normally **no compiler is needed**. If installation does fall
back to building from source on your machine, the prerequisite is
**Visual Studio Build Tools 2022 with the "Desktop development with C++"
workload**; paste me the exact install error and I will fix only that.
If the native module cannot load at runtime, the app still starts, the
pill and tray work, and the terminal prints
`[KBMK] Global keyboard hook unavailable…` instead of capturing words.

## Known limitations (M2)

- uiohook reports **keycodes, not characters**, so characters are mapped
  with a US keyboard layout table (shift-aware). On a non-US physical
  layout the mapped character follows the key *position*. The word buffer
  itself is fully Unicode; capturing the exact characters a non-Latin
  Windows keyboard layout produces needs a layout-aware mapping and is
  **needs user test** with Bengali/Arabic layouts.
- In `https://…`, the fragment before the `:` (`https`) completes like an
  ordinary word — `:` is a spec delimiter and the URL symbols only appear
  after it. Everything from `//` onward is correctly skipped. In M2 this
  only affects the console log; no text is ever replaced yet.
- Windows hook behaviour in Notepad / Chrome / Word is **needs user test**
  (verified end-to-end in this VM under X11 with synthetic keystrokes:
  `hello ` logged; `wor2ld `, `user@x.co `, Ctrl+C and an arrow-key
  interruption all correctly produced no word).

---

# KBMK — M1 notes (kept for history)

> **M1.2 fix (grey rectangle):** Windows Acrylic (`backgroundMaterial`)
> painted the whole rectangular window grey around the rounded pill. It is
> removed: the window now uses `backgroundColor: '#00000000'` with
> `transparent: true`, so everything outside the pill is 100% transparent
> (corner pixels verified alpha 0) and the glass look comes from the pill's
> own translucent CSS fill. Guarded by `tests/window.test.ts`.

> **M1.1 fix (language dropdown):** the sandboxed preload imported the IPC
> constants from another file at runtime, which throws in Electron's sandbox
> — so `window.kbmk` was undefined, every renderer→main call silently
> no-opped, and the language menu rendered inside a window that never
> expanded to show it. The preload is now self-contained (type-only imports
> + literal channel names, guarded by `tests/preload.test.ts`), and language
> search also matches aliases, so "bang" / "bangla" find Bengali. Verified
> end-to-end against the real app: menu opens (window 56 → 344 px), search
> filters, picking Bengali sets the target chip and closes the menu.

Windows system-tray translation widget. **M1 only:** Electron pill UI + tray
icon, language chips with mock data. No keyboard hook, no translation, and no
text replacement yet — those land in M2–M4 behind the interfaces already in
`src/hook`, `src/inject`, and `src/providers`.

## Run on Windows 10/11

```bat
npm install
npm test
npm start
```

- `npm install` — installs the pinned dependencies below. No native modules
  are used in M1, so no Visual Studio Build Tools are needed yet.
- `npm test` — unit tests for the language list, swap rules, state
  transitions, and the fake KeyHook / TextInjector / MockProvider.
- `npm start` — builds main + renderer, then launches Electron.

## Pinned versions (verified on npm, 2026-10-15)

| Package | Version |
| --- | --- |
| electron | 35.7.5 |
| typescript | 5.9.3 |
| vite | 6.4.1 |
| vitest | 3.2.4 |
| @types/node | 22.18.0 |

These are deliberately not the newest majors: this combination is widely
used and stable on Windows. Upgrading is a separate, tested change.

## What M1 contains

- Frameless, fully transparent, always-on-top pill (360×56 window, ~44 px
  pill), `border-radius: 999px`, draggable, snapped to the bottom-right of
  the work area (above the taskbar). The window background is 100%
  transparent (`#00000000`); only the pill itself is painted.
- Glassy red-white style: translucent white base, `#E24B4A` tint at 16%
  opacity, 1 px translucent white inner border, `#E24B4A` accent.
  Light and dark OS themes via `prefers-color-scheme`. Minimum text 12 px.
- Left to right: status dot, source chip (`EN auto`), swap icon, target chip
  with a searchable dropdown (opens upward, window grows keeping its bottom
  edge fixed), ON/OFF toggle, settings gear.
- Status states as dot + toast: Ready, Fetching, Replaced (ms), Cached,
  Offline, Paused. In M1, toggling and language changes drive Ready/Paused;
  the rest are wired into the state type for M3/M4.
- Tray icon with Show/Hide, Pause/Resume, Settings, Quit. Single instance.
- Settings gear / tray Settings opens a placeholder window containing the
  first-run privacy notice. Full settings arrive in M5.
- Privacy: nothing in M1 reads keystrokes or writes anything about typing
  anywhere. There is no telemetry.

## Known limitations (M1)

- Tray behaviour, always-on-top over the taskbar, and the upward-opening
  menu are **needs user test** on a real Windows machine.
- Some elevated/admin windows and games ignore injected input — that matters
  from M4, not M1, and stays listed here through M6.
- The pill window is rectangular at the OS level (transparent + rounded in
  CSS); clicks on the transparent corners still land on the window.

## Project structure

```
src/main/       window, tray, settings window
src/preload/    contextBridge API (window.kbmk)
src/renderer/   pill UI + settings placeholder (Vite, plain CSS)
src/shared/     types, language list, pure state transitions
src/hook/       KeyHook interface + FakeKeyHook (real hook: M2)
src/inject/     TextInjector interface + fake (real injector: M4)
src/providers/  TranslationProvider interface + MockProvider (real: M3)
tests/          vitest unit tests for the pure logic
assets/         app + tray icons
```
