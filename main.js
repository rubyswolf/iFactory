const fs = require("fs");
const https = require("https");
const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const pkg = require("./package.json");

const defaultSettings = {
  integrations: {
    github: {
      username: "",
      token: "",
      connected: false,
      authMethod: "",
      updatedAt: null
    }
  }
};

const cloneSettings = (value) => JSON.parse(JSON.stringify(value));

const getSettingsPath = () =>
  path.join(app.getPath("userData"), "settings.json");

const mergeSettings = (settings) => {
  const merged = cloneSettings(defaultSettings);
  if (settings?.integrations?.github) {
    Object.assign(merged.integrations.github, settings.integrations.github);
  }
  return merged;
};

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    return mergeSettings(JSON.parse(raw));
  } catch (error) {
    return cloneSettings(defaultSettings);
  }
};

const requestJson = (urlString, { method = "GET", headers, body } = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 0;
          if (status < 200 || status >= 300) {
            return reject(
              new Error(`Request failed (${status}): ${data.slice(0, 200)}`)
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error("Invalid JSON response"));
          }
        });
      }
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }
    request.end();
  });

const sanitizeSettings = (settings) => {
  const sanitized = cloneSettings(settings);
  const github = sanitized.integrations.github;
  github.tokenStored = Boolean(github.token);
  delete github.token;
  return sanitized;
};

let settings = null;

const saveSettings = () => {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const registerIpc = () => {
  ipcMain.handle("app:getMeta", () => ({
    name: pkg.productName || pkg.name || app.getName(),
    version: app.getVersion(),
    description: pkg.description || ""
  }));
  ipcMain.handle("settings:get", () => sanitizeSettings(settings));
  ipcMain.handle("shell:openExternal", (event, url) => {
    if (typeof url !== "string") {
      return false;
    }
    return shell.openExternal(url);
  });
  ipcMain.handle("window:minimize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.minimize();
    }
  });
  ipcMain.handle("window:maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && !window.isMaximized()) {
      window.maximize();
    }
  });
  ipcMain.handle("window:toggleMaximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return window.isMaximized();
  });
  ipcMain.handle("window:isMaximized", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window ? window.isMaximized() : false;
  });
  ipcMain.handle("window:close", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.close();
    }
  });
  ipcMain.handle("github:deviceStart", async (event, payload) => {
    const scopes = Array.isArray(payload?.scopes)
      ? payload.scopes.join(" ")
      : "";
    const body = new URLSearchParams({
      client_id: "Ov23liXefQviBroFvVlU",
      scope: scopes
    });

    return requestJson("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
  });

  ipcMain.handle("github:devicePoll", async (event, payload) => {
    if (!payload?.deviceCode) {
      throw new Error("Missing device code");
    }

    const body = new URLSearchParams({
      client_id: "Ov23liXefQviBroFvVlU",
      device_code: payload.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });

    const data = await requestJson(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      }
    );
    if (data.error) {
      return data;
    }

    const token = data.access_token;
    if (!token) {
      return { error: "missing_token" };
    }

    const user = await requestJson("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "iFactory"
      }
    });
    const username = user?.login || "";
    settings.integrations.github = {
      ...settings.integrations.github,
      username,
      token,
      connected: true,
      authMethod: "oauth",
      updatedAt: new Date().toISOString()
    };
    saveSettings();
    return sanitizeSettings(settings);
  });

  ipcMain.handle("github:disconnect", () => {
    settings.integrations.github = {
      ...settings.integrations.github,
      username: "",
      token: "",
      connected: false,
      authMethod: "",
      updatedAt: new Date().toISOString()
    };
    saveSettings();
    return sanitizeSettings(settings);
  });

  ipcMain.handle("settings:update", (event, payload) => {
    if (!payload || payload.scope !== "github") {
      return sanitizeSettings(settings);
    }

    const values = payload.values && typeof payload.values === "object"
      ? payload.values
      : {};
    const current = settings.integrations.github;
    const next = { ...current, ...values };

    if (Object.prototype.hasOwnProperty.call(values, "token")) {
      next.token = values.token;
      if (
        !values.token &&
        !Object.prototype.hasOwnProperty.call(values, "connected")
      ) {
        next.connected = false;
      }
    }

    if (
      values.token &&
      !Object.prototype.hasOwnProperty.call(values, "connected")
    ) {
      next.connected = true;
    }

    next.updatedAt = new Date().toISOString();
    settings.integrations.github = next;
    saveSettings();
    return sanitizeSettings(settings);
  });
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "iFactory",
    backgroundColor: "#0b0f14",
    frame: false,
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
  settings = loadSettings();
  registerIpc();
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
