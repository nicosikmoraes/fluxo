const desktop = window.__TAURI__?.core;
export const isDesktop = Boolean(desktop);
export const isDesktopWidget = Boolean(desktop && new URLSearchParams(window.location.search).get("desktop") ===
  "widget");

export function desktopCall(command, arguments_ = {}) {
  if (!desktop) return Promise.resolve(null);
  return desktop.invoke(command, arguments_);
}

export const openDesktopWorkspace = (view = "profile") => desktopCall("desktop_open_workspace", {
  view
});
export const hideDesktopWidget = () => desktopCall("desktop_hide");
export const dragDesktopWidget = () => desktopCall("desktop_drag");
