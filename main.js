const path = require("path");
const { app, BrowserWindow } = require("electron");

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "iFactory",
    backgroundColor: "#0b0f14",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  window.once("ready-to-show", () => window.show());
  window.loadFile(path.join(__dirname, "renderer", "index.html"));
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
