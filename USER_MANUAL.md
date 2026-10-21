# KBMK — User Manual

**KBMK (Kotha Bolo Mon Khule)** · Version 0.6.x · Windows 10/11 (Linux & macOS builds included)

---

## About KBMK

> *Language should never be a wall between human souls; it should be an
> open door.*

KBMK is a small system-tray application that translates the words you
type — **in any application** — the moment you finish them. There is no
window to switch to, nothing to copy back and forth. You type a word,
press space, and its translation quietly takes its place. If you paste
text instead, KBMK offers you the translation in a small glass pill and
swaps it in only if you say yes.

KBMK was built for people who think in one language and write in
another. It works especially well with **Bengali**, including text typed
with **Avro Keyboard**, and supports 100+ languages through translation
providers you choose yourself: Google Cloud Translation, Microsoft
Azure Translator, DeepL, or an experimental keyless mode.

KBMK is **private by design**: it has no accounts, no telemetry and no
analytics. Your API keys live only in your PC's Windows Credential
Manager. The only text that ever leaves your computer is the word or
short phrase you trigger a translation for, sent to *your* chosen
provider with *your* key.

### What KBMK does at a glance

- **Type-and-translate** — finished words are replaced in place, in any app
- **Paste offers** — paste a word, phrase or short sentence and approve
  the translation with one keypress
- **Sentence offers** — finish a sentence and approve its whole-sentence
  translation, with grammar and word order fixed
- **Undo** — the last replacement can always be taken back
- **Your keys, your choice** — multiple API key profiles across Google,
  Azure and DeepL, with optional quota fallback
- **Per-app block list** — KBMK never captures anything in apps you
  block (password managers are blocked by default)
- **A glass pill you can make yours** — custom glass colour and opacity
- **Honest counters** — see how much you've used this month, right on the pill

---

## System requirements

| | |
|---|---|
| **Operating system** | Windows 10 or 11, 64-bit (full features). Linux and macOS builds are included; see *Platform notes* |
| **Disk space** | ~250 MB installed (mostly the app's runtime; KBMK's own code is ~3 MB) |
| **Internet** | Required for translation (your provider's API) |
| **API key** | Your own key from Google, Azure or DeepL — or use the experimental keyless mode |

---

## Getting KBMK

### Windows — installer (recommended)

1. Run **`KBMK Setup 0.6.x.exe`**.
2. The installer is not code-signed, so Windows SmartScreen will warn
   you the first time: click **More info → Run anyway**. (This is
   normal for independent software without a paid signing certificate.)
3. Choose an install folder if you like (per-user install — no admin
   rights needed) and finish. Shortcuts are added to your Start Menu
   and desktop.

### Windows — portable

**`KBMK-Portable.exe`** is a true single file. Put it anywhere — a
folder, a USB stick — and run it. Nothing is installed. The first
launch takes a few seconds while it unpacks itself to a temporary
folder. Your keys and settings are still stored per-PC (Credential
Manager + AppData), not inside the exe, so the file itself never
carries your data.

### Linux

Run **`KBMK-0.6.3.AppImage`**: `chmod +x KBMK-0.6.3.AppImage`, then
launch it. No installation.

### macOS

Open the **`.dmg`** (or unzip the `.zip`) and drag **KBMK** to
Applications. The build is unsigned, so on first launch **right-click
the app → Open** to pass Gatekeeper.

### Platform notes

KBMK's core machinery — global key capture, in-place text replacement
and the per-app block list — is Windows technology. **Typing and
paste replacement also work on Linux under X11** (via XTest). On
Wayland, replacement reaches X11/XWayland apps only — native Wayland
apps cannot receive synthetic keys from any app. The macOS build runs
the full interface, settings and translation providers and logs
translations, but does not replace text yet. Everywhere else the app
degrades gracefully and the log explains what is off.

---

## First run

The first time KBMK starts with no keys configured, a short wizard
appears in Settings:

1. It explains how to create a key for Google, Azure or DeepL.
2. Or choose **Continue with the keyless provider** to try KBMK
   immediately (experimental quality; no key needed).

The glass **pill** appears at the bottom-right of your screen, above the
taskbar. KBMK lives in the **system tray** from then on. Closing the
pill does not quit the app — use the tray icon's menu to pause, open
Settings, or exit.

---

## Adding your API keys

Open **Settings** (the sliders icon on the pill, or the tray menu) →
**API key profiles** → **Add key**: give the key a label, choose its
provider, paste the key, and save. You can hold several keys — even
from different providers — and switch which one is active.

### Google Cloud Translation

1. Go to the Google Cloud Console and create (or pick) a project.
2. Enable the **Cloud Translation API** for it.
3. Under *APIs & Services → Credentials*, create an **API key**.
4. **Restrict the key** to the Cloud Translation API.
5. Paste it into KBMK as a **Google** key.

### Microsoft Azure Translator

1. In the Azure Portal, create a **Translator** resource.
2. Open the resource → **Keys and Endpoint**.
3. Copy **Key 1** and note the **Location/region** (e.g.
   `southeastasia`, or `global`).
4. In KBMK choose **Azure** and enter both the key and the region.

Azure's free (F0) tier includes a generous monthly character
allowance, which makes it a good first key.

### DeepL

1. On deepl.com, open your account's **API Keys** page and copy a key.
2. In KBMK choose **DeepL** and paste it. Free keys end in **`:fx`** —
   KBMK detects those automatically and uses the free API host.

> **DeepL covers ~35 languages and does not include Bengali.** While a
> DeepL key is active, the language menus show DeepL's languages only.

### Keyless (experimental)

No key at all. Translations go through a public experimental endpoint:
quality varies, it can rate-limit, and there is no usage counter. Good
for a first try; a real key is better for daily use.

### Keep your keys safe

This advice is also shown inside the app, because it matters:

- **Anyone you use a key from pays for your usage.** Treat keys like
  money.
- **Restrict** each key to the translation API only.
- Set a **budget alert** in your provider's console.
- Use a **separate key** for KBMK, so you can revoke it without
  breaking anything else.

KBMK stores keys **only** in your operating system's secure key store —
Windows Credential Manager on Windows, the Keychain on macOS, and the
Secret Service keyring on Linux — never in files, never in settings
exports, never in logs, and the Settings window itself only ever sees a
key's last 4 characters. On Linux the keyring must be installed for
keys to save: `sudo apt install libsecret-1-0 gnome-keyring`
(Debian/Ubuntu) or `sudo dnf install libsecret gnome-keyring` (Fedora),
then restart KBMK.

### Managing keys

For each saved key you can:

- **Test connection** — a tiny real translation confirms the key works.
  The result shows as *Valid*, *Invalid* (wrong key/permissions) or
  *Quota* (limit reached).
- **Set active** — choose which key does the translating.
- **Rename** / **Remove** — removal asks for confirmation and deletes
  the secret from the key store too.
- **Usage counter** — successful translations are counted per key, per
  month (the counter resets on the 1st). DeepL keys show DeepL's own
  character usage (e.g. `1.2k/500k chars`); Google and Azure keys show
  the local counter (`112 used`).

### Quota fallback (optional, off by default)

Enable it under **Quota fallback** and arrange your keys in order. If
the active key runs out of quota, KBMK marks it *Quota*, retries with
the next key, makes that key active, and **tells you on the pill**
(e.g. *"Switched to Rafi's key"*). It never switches silently, and an
*Invalid* key never triggers fallback — a wrong key is a mistake to
fix, not to route around.

---

## Everyday use

### The pill

The small glass pill at the bottom-right is the whole interface while
you work:

| Element | What it is |
|---|---|
| **Coloured dot** | Status: green = ready (it turns blue when your glass colour is in the green family, so it never blends in), red = paused |
| **Source chip** (e.g. `EN auto`) | The language you type in. *Auto* detects it for you |
| **⇄** | Swap source and target |
| **Target chip** (e.g. `ES · Spanish`) | The language you translate into |
| **Usage readout** | This month's usage for the active key — or `Paused`, `Keyless`, or `No key` |
| **Sliders icon** | Opens Settings |

Click a chip to open the language menu: scroll the list or type to
search (try `bangla` for Bengali). The list comes from your provider's
own supported-languages list, refreshed daily, so it always matches
what your key can actually do.

You can **drag the pill** anywhere by its empty glass area. Menus open
upward normally — and downward if you've parked the pill near the top
of the screen, so nothing is ever clipped.

### Translating as you type

Just type, in any app — a browser, Word, Notepad, a chat box.

1. Type a word and finish it with a **space**, **Enter**, **Tab**, or
   punctuation: `. , ! ? ; :` — and the Bengali dandas `।` and `॥`.
2. KBMK translates the word and swaps it in place, punctuation
   included, keeping your capital letter if you typed one.
3. If you **keep typing** instead of waiting, KBMK leaves your text
   alone — it will never delete a word out from under you.

Good to know:

- **Repeated words are instant** — translations are cached on your PC.
  The first use of a word takes a network round trip (typically
  150–400 ms).
- **Skipped on purpose:** pure numbers, words containing digits,
  and anything that looks like an email, a URL, a path or code. Type
  normally; KBMK stays out of the way.
- Bengali typed with **Avro Keyboard** is fully supported, including
  words with vowel signs and conjuncts.

### Paste offers

Copy a word, a phrase, or a short sentence and **paste** it —
**Ctrl+V**, **Ctrl+Shift+V**, **Shift+Insert**, or **right-click →
Paste**. A modal appears above the pill, twin to it in style:

```
buenos días a todos → good morning everyone
Space — replace · Esc — keep
```

- **Space** — replace the pasted text with the translation.
- **Esc** — keep the pasted text exactly as it is.
- **Anything else** — typing, clicking, switching apps — dismisses the
  offer, and it expires by itself after a few seconds.

Rules: **one line at a time, up to 300 characters**. Multi-line text,
links, emails, file paths and code never trigger an offer. Mouse-paste
detection is a heuristic (the clipboard doesn't change across a Paste
pick) — every time it fires, the app log says so.

### Sentence offers

Words are translated one at a time, the moment you finish them. That
is fast, but a word on its own doesn't know its sentence — verb forms
(is/am/are), prepositions and word order can come out bent. (Bengali,
for example, puts the verb at the end: "I eat rice" typed word by
word gives আমি খাই ভাত — "I eat rice" in English order — instead of
আমি ভাত খাই.)

So when you **end a sentence** — with `.`, `!`, `?`, the danda `।`,
or **Enter** — KBMK translates the *whole sentence* at once, the way
pasting the sentence into a translator would. If that version reads
differently from the word-by-word draft on screen, a modal above the
pill offers it:

- **Space** — replace the whole sentence with its full translation.
- **Esc** — keep the sentence exactly as typed.
- **Anything else** — typing on, clicking, switching apps — dismisses
  the offer, and it expires by itself after 15 seconds.

Good to know:

- An accepted swap is a normal replacement: **Ctrl+Alt+Z** undoes it
  and restores your word-by-word draft.
- The offer costs **one extra translation call per sentence** (the
  sentence's characters), on top of the word-by-word calls.
- Only a sentence typed **in one go** is tracked: if you click away,
  switch apps, or edit back into the middle of it, tracking restarts
  and that sentence keeps its word-by-word translation.
- Sentences up to **300 characters**; a `.` after a number is read as
  a decimal point, not a sentence end.
- If the whole-sentence translation reads the same as the draft,
  KBMK shows it briefly above the pill with a **✓** — your sentence
  was already right, and nothing is swapped.
- Turn sentence offers off in **Settings → App behaviour** if you
  prefer words only.

### Undo

**Ctrl+Alt+Z** undoes the last replacement — typed, pasted, or a
sentence — putting your original text back. Only the most recent swap can be undone.

### Pausing KBMK

**Ctrl+Alt+T** pauses or resumes KBMK anywhere. The tray menu has the
same switch. While paused, the pill's readout says `Paused`, the dot
turns red, and nothing is captured or translated.

### The block list (apps KBMK never touches)

Some places should never be translated — or even watched. KBMK ships
with the major **password managers blocked by default** (1Password,
KeePass, KeePassXC, Bitwarden, LastPass, Dashlane, Enpass).

Manage it in **Settings → Blocked apps**:

- Type a process name (e.g. `notepad.exe`) and add it, or
- use **Add from open windows** — pick any currently open window from
  the list, exactly like choosing a capture source in OBS.

When you switch into a blocked app, anything half-typed is forgotten,
nothing new is captured, and replacements never happen there. KBMK
shows a one-time note on the pill so you know it stepped aside.

### Launch at login

**Settings → App behaviour → Launch at login.** KBMK starts with
Windows, quietly, in the tray. (When running from source in
development, this registers the development host instead — the
installed app registers KBMK itself.)

---

## Appearance

**Settings → Appearance** makes the glass yours:

- **Colour wheel** — drag around the wheel for hue, in/out for
  saturation; the slider below sets brightness. The whole interface —
  pill, menus, popups, the Settings glass — re-tints instantly. The
  default is KBMK red; **Reset to KBMK red** restores it.
- **Preset swatches** — seven ready-made colours if you'd rather tap.
- **Glass opacity** — a slider from 35% to 100%. Lower is airier;
  higher is more solid and readable.

Behind the scenes, the pill uses real Windows blur-behind, so the
glass genuinely frosts whatever is behind it.

---

## Exporting your settings

**Settings → Export settings** produces a JSON snapshot of your
configuration — key labels, providers, statuses, counters, fallback
order — and **Copy JSON** puts it straight on your clipboard. Handy
for support or for remembering how you had things set up.

It **never contains API keys** — those exist only in Credential
Manager, so an export is always safe to share.

---

## Start over (factory reset)

**Settings → Start over → Remove all keys and settings** wipes this
PC clean: every key (including its secret in the key store), the
block list, your glass colour and opacity, and launch-at-login. KBMK
returns to its first-run state, with the setup wizard waiting. Use it
before handing a PC to someone else — or simply to start fresh.

Your keys and settings are **per-PC**: they are never inside the app,
the installer or the portable exe. A fresh install on another computer
always starts empty.

---

## Privacy

- Keystrokes are **never** written to disk, logged, or analysed. KBMK
  keeps only the current unfinished word in memory, and forgets it the
  moment it completes, you pause, or you switch apps.
- The only network traffic KBMK creates is translation requests to
  **your provider, with your key**, plus one daily request for the
  provider's language list.
- **No telemetry. No analytics. No accounts. No ads.**
- Blocked apps are never captured at all.

---

## Troubleshooting

**Words aren't being replaced.**
Check the dot: red means paused (Ctrl+Alt+T resumes). Are you in a
blocked app? Is a key active and *Valid* (Settings → Test connection)?
First words are slower — allow half a second before typing on.

**Bengali words aren't translating.**
Make sure you finished the word with a space or punctuation (। works
too). If Bengali looks like gibberish in a *terminal window* only,
that's the console's character encoding, not your text: run
`chcp 65001` in that terminal before starting KBMK from it.

**The first word is slow, later ones instant.**
That's the cache working. New words cost one provider round trip
(150–400 ms is typical); repeats are served locally.

**I pasted, but no offer appeared.**
Offers need: KBMK running and unpaused, the app not blocked, and text
that qualifies (one line, ≤ 300 characters, no links/emails/paths).
Right-click → Paste is detected heuristically — if it ever misses,
Ctrl+V always works. The run log narrates the offer's lifecycle
(`[KBMK] paste offer: …`) if you need to see what happened.

**A space replaced text when I didn't expect it.**
If a paste offer was on screen, Space accepts it — that's its job.
Press **Esc** (or just type/click elsewhere) to keep pasted text.
Offers expire on their own within seconds.

**My key says Invalid.**
The provider rejected it: check for typos, that the right API is
enabled (Google), or that the Azure region matches the resource.

**My key says Quota.**
The provider's limit is reached. Either wait for the reset, set the
key aside, or enable **quota fallback** so KBMK moves to your next key
(announcing the switch on the pill).

**DeepL doesn't offer Bengali.**
Correct — DeepL doesn't support Bengali. Use a Google or Azure key
for Bengali; while a DeepL key is active, menus show DeepL's list only.

**The glass blur looks flat.**
KBMK asks Windows for real blur-behind. If it still looks flat, the
run log prints a line beginning `[KBMK] Windows blur-behind was not
applied` — mention that line when asking for help.

**SmartScreen / Gatekeeper blocked the app.**
The builds are unsigned. Windows: **More info → Run anyway**. macOS:
**right-click → Open**. This is a one-time step.

**Settings export doesn't contain my key.**
By design. Keys live only in the operating system's secure key store
and are never exported.

---

## Known limitations

- **Unsigned builds** — one SmartScreen/Gatekeeper click on first run.
- **Translation latency** — first use of a word needs the network;
  cached words are instant.
- **Paste offers** — one line, up to 300 characters; mouse-paste is
  detected heuristically.
- **Clipboard restore is text-only.** If your clipboard held an image
  or files when a replacement happens, KBMK clears the clipboard after
  pasting rather than leaving the translation sitting on it.
- **DeepL** — ~35 languages, no Bengali.
- **Replacement is Windows + Linux/X11** (see *Platform notes*); macOS logs translations only.

---

## Support KBMK

KBMK is free. If it helps you speak across the wall, the **Support**
section at the bottom of Settings carries a few QR codes — and a
simple "thanks" is always enough.

*KBMK — Kotha Bolo Mon Khule. More than software, KBMK is a bridge —
built so every voice can be heard, and every heart can be understood.*
