const fs = require("fs");
const https = require("https");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
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
  },
  recentProjects: []
};

const cloneSettings = (value) => JSON.parse(JSON.stringify(value));

const getSettingsPath = () =>
  path.join(app.getPath("userData"), "settings.json");

const mergeSettings = (settings) => {
  const merged = cloneSettings(defaultSettings);
  if (settings?.integrations?.github) {
    Object.assign(merged.integrations.github, settings.integrations.github);
  }
  if (Array.isArray(settings?.recentProjects)) {
    merged.recentProjects = settings.recentProjects;
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
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (error) {
            parsed = null;
          }
          if (status < 200 || status >= 300) {
            const error = new Error(
              `Request failed (${status}): ${data.slice(0, 200)}`
            );
            error.status = status;
            error.body = data;
            error.parsed = parsed;
            return reject(error);
          }
          resolve(parsed);
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

const pushRecentProject = ({ name, projectPath }) => {
  if (!projectPath) {
    return;
  }

  const title = name || path.basename(projectPath);
  const existing = Array.isArray(settings.recentProjects)
    ? settings.recentProjects
    : [];
  const filtered = existing.filter((item) => item?.path !== projectPath);
  filtered.unshift({
    name: title,
    path: projectPath,
    updatedAt: new Date().toISOString()
  });
  settings.recentProjects = filtered.slice(0, 3);
  saveSettings();
};

const registerIpc = () => {
  ipcMain.handle("app:getMeta", () => ({
    name: pkg.productName || pkg.name || app.getName(),
    version: app.getVersion(),
    description: pkg.description || ""
  }));
  ipcMain.handle("settings:get", () => sanitizeSettings(settings));
  ipcMain.handle("recents:get", () =>
    Array.isArray(settings.recentProjects) ? settings.recentProjects : []
  );
  ipcMain.handle("shell:openExternal", (event, url) => {
    if (typeof url !== "string") {
      return false;
    }
    return shell.openExternal(url);
  });
  ipcMain.handle("dialog:selectFolder", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle("project:create", async (event, payload) => {
    try {
      const name = payload?.name?.trim();
      const basePath = payload?.basePath?.trim();
      const createFolder = payload?.createFolder !== false;
      const createRepo = payload?.createRepo === true;
      const privateRepo = payload?.privateRepo !== false;

      if (!name || !basePath) {
        return { error: "missing_fields" };
      }

      const projectPath = createFolder
        ? path.join(basePath, name)
        : basePath;

      if (createFolder && fs.existsSync(projectPath)) {
        return { error: "folder_exists" };
      }

      fs.mkdirSync(projectPath, { recursive: true });

      let repoUrl = null;
      if (createRepo) {
        const token = settings?.integrations?.github?.token;
        if (!token) {
          return { error: "github_not_connected" };
        }
        const repo = await requestJson("https://api.github.com/user/repos", {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "iFactory",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            private: privateRepo
          })
        });
        repoUrl = repo?.html_url || null;
      }

      pushRecentProject({ name, projectPath });

      return {
        path: projectPath,
        repoUrl,
        needsIPlug: true
      };
    } catch (error) {
      return { error: "create_failed" };
    }
  });
  ipcMain.handle("project:open", async (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      if (!projectPath) {
        return { error: "missing_path" };
      }
      if (!fs.existsSync(projectPath)) {
        return { error: "path_not_found" };
      }
      const iPlugPath = path.join(projectPath, "iPlug2");
      const needsIPlug = !fs.existsSync(iPlugPath);
      pushRecentProject({ projectPath });
      return { path: projectPath, needsIPlug };
    } catch (error) {
      return { error: "open_failed" };
    }
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

  ipcMain.handle("github:listIPlugForks", async () => {
    const token = settings?.integrations?.github?.token;
    const username = settings?.integrations?.github?.username || "";
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "iFactory"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      let forks = [];
      let forksError = null;
      try {
        forks = await requestJson(
          "https://api.github.com/repos/iplug2/iplug2/forks?per_page=100&sort=newest",
          { headers }
        );
      } catch (error) {
        forksError = error;
      }

      let userForks = [];
      let userForksError = null;
      if (token) {
        try {
          const repos = await requestJson(
            "https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=updated",
            { headers }
          );
          const forkCandidates = repos.filter((repo) => repo?.fork);
          const isIPlugFork = (repo) => {
            const parent = repo?.parent?.full_name;
            const source = repo?.source?.full_name;
            return parent === "iplug2/iplug2" || source === "iplug2/iplug2";
          };
          const detailNames = forkCandidates
            .filter((repo) => !isIPlugFork(repo) && repo?.full_name)
            .map((repo) => repo.full_name);
          const detailMap = new Map();
          if (detailNames.length > 0) {
            const detailResults = await Promise.all(
              detailNames.map(async (fullName) => {
                try {
                  return await requestJson(
                    `https://api.github.com/repos/${fullName}`,
                    { headers }
                  );
                } catch (error) {
                  return null;
                }
              })
            );
            detailResults.forEach((repo) => {
              if (repo?.full_name) {
                detailMap.set(repo.full_name, repo);
              }
            });
          }

          const seen = new Set();
          forkCandidates.forEach((repo) => {
            const resolved = isIPlugFork(repo)
              ? repo
              : detailMap.get(repo.full_name);
            if (!resolved || !isIPlugFork(resolved)) {
              return;
            }
            const fullName = resolved.full_name;
            if (!fullName || seen.has(fullName)) {
              return;
            }
            seen.add(fullName);
            userForks.push(resolved);
          });
        } catch (error) {
          userForksError = error;
        }
      }

      const userNames = new Set(userForks.map((repo) => repo.full_name));
      const filteredForks = Array.isArray(forks)
        ? forks.filter((repo) => !userNames.has(repo.full_name))
        : [];

      if (forksError && userForksError) {
        return {
          error: "forks_failed",
          connected: Boolean(token),
          details: {
            forksStatus: forksError.status || null,
            forksMessage: forksError.message || null,
            userForksStatus: userForksError.status || null,
            userForksMessage: userForksError.message || null
          }
        };
      }

      return {
        forks: filteredForks,
        userForks,
        connected: Boolean(token),
        username
      };
    } catch (error) {
      return {
        error: "forks_failed",
        connected: Boolean(token),
        username,
        details: {
          status: error?.status || null,
          message: error?.message || null
        }
      };
    }
  });

  ipcMain.handle("github:listRepoBranches", async (event, payload) => {
    const fullName = payload?.fullName?.trim();
    if (!fullName) {
      return { error: "missing_repo" };
    }
    const token = settings?.integrations?.github?.token;
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "iFactory"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const branches = await requestJson(
        `https://api.github.com/repos/${fullName}/branches?per_page=100`,
        { headers }
      );
      return {
        branches: Array.isArray(branches) ? branches : []
      };
    } catch (error) {
      return {
        error: "branches_failed",
        details: {
          status: error?.status || null,
          message: error?.message || null
        }
      };
    }
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
