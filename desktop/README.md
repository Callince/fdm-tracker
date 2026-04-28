# FDM Tracker — Desktop

Electron 30 + React 18 + TypeScript + Vite (via `electron-vite`). Bundles
for **Windows x64** (NSIS `.exe`) and **macOS** (universal `.dmg`).

## What it tracks

- OS-level idle/active sampled every 10 s (`powerMonitor.getSystemIdleTime()`).
- Keyboard + mouse event **counts** only (via `uiohook-napi`) — never
  keystroke content, never window titles, never screenshots.
- Work sessions (Start → End) and breaks (Start → End).

## Dev

```bash
cp .env.example .env   # optional — set FDM_API_BASE if not localhost:8000
npm install
npm run dev            # launches Electron with HMR
```

The first `npm install` rebuilds `better-sqlite3` and `uiohook-napi`
against your Electron version via `electron-builder install-app-deps`.

### Prerequisites for native modules

- **Windows:** Visual Studio Build Tools 2022 (C++ workload) + Python 3.x.
  `npm install --global windows-build-tools` is no longer maintained — install
  the Build Tools manually from Microsoft's site.
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).

### macOS additional permission

`uiohook-napi` needs **Accessibility** + **Input Monitoring** permissions.
On first run:
1. System Settings → Privacy & Security → Accessibility → add FDM Tracker.
2. System Settings → Privacy & Security → Input Monitoring → add FDM Tracker.

If you skip this, OS-level idle/active still works — only the key/mouse
**counts** stay at zero.

## Build (installer)

```bash
npm run dist:win      # → release/FDM Tracker-<ver>-setup-x64.exe
npm run dist:mac      # → release/FDM Tracker-<ver>.dmg
```

Builds are **unsigned**. Windows SmartScreen and macOS Gatekeeper will warn
on first run. For internal distribution that is acceptable; production code
signing is a follow-up.

### Gatekeeper on macOS

To open the unsigned `.dmg` on a colleague's Mac:
```bash
xattr -d com.apple.quarantine "/Applications/FDM Tracker.app"
```

### SmartScreen on Windows

Users click "More info → Run anyway".

## Layout

```
src/
  shared/        types and IPC channel names shared by main + renderer
  main/          Electron main process
    index.ts     entry, single-instance lock, window + tray lifecycle
    ipc.ts       ipcMain handlers + broadcast helpers
    localDb.ts   better-sqlite3 buffer for 60s activity buckets
    syncWorker.ts  every 60s drains buckets to the server w/ HMAC
    idleMonitor.ts powerMonitor polling
    inputCounter.ts uiohook event counters (drained per bucket)
    api.ts       typed HTTP client, JWT refresh, HMAC signing
    auth.ts      electron-store for tokens + device secret + prefs
    tray.ts      system tray menu
    windows.ts   BrowserWindow creation + minimize-to-tray
    autoStart.ts login-item toggle (opt-in only)
  preload/
    index.ts     contextBridge → window.fdm (typed)
  renderer/      React UI
    src/
      App.tsx    top-level router
      pages/     Login, Signup, VerifyEmail, PrivacyNotice, Dashboard, Calendar, Settings
      components/ui + StatusPill + OfflineBadge + CalendarGrid + DayTimeline
```

## Environment

The backend URL defaults to `http://127.0.0.1:8000`. Override at build time:

```bash
FDM_API_BASE=https://api.fdm-tracker.internal npm run dist:win
```
