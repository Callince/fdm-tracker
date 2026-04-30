/**
 * Application menu. Without setApplicationMenu() Electron uses a default
 * macOS template that includes Help/Edit items the user can't actually use.
 * Replace with a focused FDM-specific menu and the standard
 * Cmd+Q / Cmd+R / DevTools shortcuts macOS users expect.
 */
import { Menu, MenuItemConstructorOptions, app, shell } from "electron";
import { showMainWindow } from "./windows";
import { toggleWidget } from "./widget";

export function buildAppMenu(opts: { onAbout: () => void }): Menu {
  const isMac = process.platform === "darwin";

  const macAppMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { label: "About FDM Tracker", click: opts.onAbout },
      { type: "separator" },
      { role: "services", submenu: [] },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { role: "toggleDevTools" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: [
      {
        label: "Show main window",
        accelerator: isMac ? "Cmd+0" : "Ctrl+0",
        click: () => showMainWindow(),
      },
      {
        label: "Toggle floating widget",
        accelerator: isMac ? "Cmd+Shift+W" : "Ctrl+Shift+W",
        click: () => toggleWidget(),
      },
      { type: "separator" },
      { role: "minimize" },
      { role: "close" },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    submenu: [
      {
        label: "Releases",
        click: () => { void shell.openExternal("https://github.com/Callince/fdm-tracker/releases"); },
      },
      ...(!isMac ? [{ type: "separator" as const }, { label: "About", click: opts.onAbout }] : []),
    ],
  };

  const template: MenuItemConstructorOptions[] = isMac
    ? [macAppMenu, editMenu, viewMenu, windowMenu, helpMenu]
    : [editMenu, viewMenu, windowMenu, helpMenu];

  return Menu.buildFromTemplate(template);
}
