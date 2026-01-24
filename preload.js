const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ifactory", {
  getMeta: () => ipcRenderer.invoke("app:getMeta"),
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    updateGitHub: (values) =>
      ipcRenderer.invoke("settings:update", { scope: "github", values })
  },
  recents: {
    get: () => ipcRenderer.invoke("recents:get"),
    remove: (path) => ipcRenderer.invoke("recents:remove", { path })
  },
  git: {
    check: () => ipcRenderer.invoke("git:check"),
    skip: () => ipcRenderer.invoke("git:skip"),
    status: (payload) => ipcRenderer.invoke("git:status", payload),
    commit: (payload) => ipcRenderer.invoke("git:commit", payload)
  },
  codex: {
    check: () => ipcRenderer.invoke("codex:check"),
    chat: (payload) => ipcRenderer.invoke("codex:chat", payload)
  },
  build: {
    check: () => ipcRenderer.invoke("build:check"),
    run: (payload) => ipcRenderer.invoke("build:run", payload),
    stop: () => ipcRenderer.invoke("build:stop"),
    onOutput: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on("build:output", listener);
      return () => ipcRenderer.removeListener("build:output", listener);
    },
    onState: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on("build:state", listener);
      return () => ipcRenderer.removeListener("build:state", listener);
    }
  },
  iplug: {
    install: (payload) => ipcRenderer.invoke("iplug:install", payload),
    installDependencies: (payload) =>
      ipcRenderer.invoke("iplug:installDependencies", payload),
    cancel: () => ipcRenderer.invoke("iplug:cancel"),
    onProgress: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on("iplug:progress", listener);
      return () => ipcRenderer.removeListener("iplug:progress", listener);
    }
  },
  github: {
    startDeviceFlow: (scopes) =>
      ipcRenderer.invoke("github:deviceStart", { scopes }),
    pollDeviceFlow: (deviceCode) =>
      ipcRenderer.invoke("github:devicePoll", { deviceCode }),
    disconnect: () => ipcRenderer.invoke("github:disconnect"),
    listIPlugForks: () => ipcRenderer.invoke("github:listIPlugForks"),
    listRepoBranches: (fullName) =>
      ipcRenderer.invoke("github:listRepoBranches", { fullName })
  },
  githubDesktop: {
    open: (payload) => ipcRenderer.invoke("github-desktop:open", payload)
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    close: () => ipcRenderer.invoke("window:close")
  },
  project: {
    create: (payload) => ipcRenderer.invoke("project:create", payload),
    open: (payload) => ipcRenderer.invoke("project:open", payload),
    listItems: (payload) => ipcRenderer.invoke("project:listItems", payload)
  },
  session: {
    load: (payload) => ipcRenderer.invoke("session:load", payload),
    append: (payload) => ipcRenderer.invoke("session:append", payload)
  },
  templates: {
    list: (payload) => ipcRenderer.invoke("templates:list", payload),
    copy: (payload) => ipcRenderer.invoke("templates:copy", payload)
  },
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  dialog: {
    selectFolder: () => ipcRenderer.invoke("dialog:selectFolder")
  }
});
