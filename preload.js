const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ifactory", {
  getMeta: () => ipcRenderer.invoke("app:getMeta"),
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    updateGitHub: (values) =>
      ipcRenderer.invoke("settings:update", { scope: "github", values })
  },
  github: {
    startDeviceFlow: (scopes) =>
      ipcRenderer.invoke("github:deviceStart", { scopes }),
    pollDeviceFlow: (deviceCode) =>
      ipcRenderer.invoke("github:devicePoll", { deviceCode }),
    disconnect: () => ipcRenderer.invoke("github:disconnect")
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    close: () => ipcRenderer.invoke("window:close")
  },
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  dialog: {
    selectFolder: () => ipcRenderer.invoke("dialog:selectFolder")
  }
});
