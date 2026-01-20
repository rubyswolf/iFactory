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
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url)
});
