import { app, BrowserWindow, globalShortcut, net, powerMonitor } from "electron";
import { createMainWindow, showMainWindow } from "./windows";
import { ensureTray } from "./tray";
import { registerIpc, ipcOps } from "./ipc";
import { syncWorker } from "./syncWorker";
import { auth } from "./auth";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());

  app.whenReady().then(() => {
    registerIpc();
    createMainWindow();
    ensureTray({
      isSessionActive: ipcOps.isSessionActive,
      isOnBreak: ipcOps.isOnBreak,
      startWork: () => { void ipcOps.doStartWork(); },
      endWork: () => { void ipcOps.doEndWork(); },
      startBreak: () => { void ipcOps.doStartBreak(); },
      endBreak: () => { void ipcOps.doEndBreak(); },
    });

    // Global shortcut: Ctrl+Alt+B (Cmd+Alt+B on macOS) toggles break from anywhere.
    const shortcut = process.platform === "darwin" ? "Cmd+Alt+B" : "Ctrl+Alt+B";
    const registered = globalShortcut.register(shortcut, () => { void ipcOps.toggleBreak(); });
    if (!registered) console.warn(`[shortcut] failed to register ${shortcut}`);

    // Resume tracking if we have saved credentials + device secret.
    const s = auth.get();
    if (s.accessToken && s.profile && s.deviceSecret) {
      syncWorker.start(s.profile.idle_threshold_minutes, () => {
        ipcOps.pushStatus();
        void ipcOps.refreshTodayTotals();
      });
      ipcOps.startTodayPoller();
      ipcOps.startNudgeMonitor();
      ipcOps.startMeetingWatcher();
    }

    setInterval(() => ipcOps.setConnectionOnline(net.isOnline()), 5_000);

    // Sleep / lock detection — close the current bucket so any time the
    // user was away (laptop closed, screen locked, OS suspended) is
    // written into activity_logs as idle instead of disappearing into
    // a gap in the timeline.
    const flush = () => { syncWorker.forceFlushBucket(); };
    powerMonitor.on("suspend", flush);
    powerMonitor.on("resume", flush);
    powerMonitor.on("lock-screen", flush);
    powerMonitor.on("unlock-screen", flush);
    // app.on('before-quit') gives one last chance to write whatever's
    // pending — this covers a clean shutdown started from inside the OS.
    app.on("before-quit", flush);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else showMainWindow();
    });
  });

  app.on("before-quit", () => {
    (globalThis as unknown as { __fdmQuitting?: boolean }).__fdmQuitting = true;
    syncWorker.stop();
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    // Tray keeps the app alive on both platforms until the user picks "Quit".
  });
}
