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

  // zoomIn role's default accelerator is "CmdOrCtrl+Plus", which on US/UK
  // layouts physically requires Ctrl+Shift+= — so Ctrl+= alone never fires.
  // Bind Ctrl+= explicitly (and add invisible aliases for Ctrl++ and the
  // numpad +) so all the natural "make it bigger" combos zoom in.
  const zoomInAccel = isMac ? "Cmd+=" : "Ctrl+=";
  const zoomInPlusAccel = isMac ? "Cmd+Shift+=" : "Ctrl+Shift+=";
  const zoomInNumAccel = isMac ? "Cmd+numadd" : "Ctrl+numadd";

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { type: "separator" },
      { role: "resetZoom" },
      { label: "Zoom In", accelerator: zoomInAccel, role: "zoomIn" },
      { label: "Zoom In", accelerator: zoomInPlusAccel, role: "zoomIn", visible: false, acceleratorWorksWhenHidden: true },
      { label: "Zoom In", accelerator: zoomInNumAccel, role: "zoomIn", visible: false, acceleratorWorksWhenHidden: true },
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
        accelerator: isMac ? "Cmd+Shift+H" : "Ctrl+Shift+H",
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
