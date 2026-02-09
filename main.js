const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const https = require("https");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const pkg = require("./package.json");
const core = require("./lib/ifact-core");

const isCliMode = process.argv.includes("--ifact");

const {
  getDepsConfig,
  getDepsBuildPath,
  copyDirectory,
  findDoxygenExecutable,
  checkDoxygenInstalled,
  getTemplateIPlugRoot,
  getOutOfSourceRoot,
  patchPostbuildScript,
  patchCreateBundleScript,
  renameTemplateContents,
  formatTemplateName,
  listTemplatesForProject,
  addResourceToPlugin,
  listProjectItems,
  detectGraphicsBackend,
  setGraphicsBackend,
  runDoxygenGenerate,
  runDoxygenFind,
  runDoxygenLookup,
  createPluginFromTemplate,
} = core;

if (isCliMode) {
  const { run } = require("./ifact");
  const startIndex = process.argv.indexOf("--ifact");
  const cliArgs = startIndex >= 0 ? process.argv.slice(startIndex + 1) : [];
  run(["node", "ifact", ...cliArgs]);
}

const defaultSettings = {
  integrations: {
    github: {
      username: "",
      updatedAt: null,
    },
  },
  dependencies: {
    git: {
      installed: false,
      skipped: false,
      version: "",
      checkedAt: null,
    },
    buildTools: {
      installed: false,
      path: "",
      checkedAt: null,
    },
    doxygen: {
      installed: false,
      path: "",
      version: "",
      checkedAt: null,
    },
    edsp: {
      installed: false,
      path: "",
      checkedAt: null,
    },
    vst3: {
      installed: false,
      path: "",
      checkedAt: null,
    },
    skiaDocs: {
      installed: false,
      path: "",
      branch: "",
      checkedAt: null,
    },
  },
  recentProjects: [],
};

const cloneSettings = (value) => JSON.parse(JSON.stringify(value));

const getSettingsPath = () =>
  path.join(app.getPath("userData"), "settings.json");

const getDoxygenInstallDir = () =>
  path.join(app.getPath("userData"), "tools", "doxygen");

const mergeSettings = (settings) => {
  const merged = cloneSettings(defaultSettings);
  if (settings?.integrations?.github) {
    merged.integrations.github.username =
      settings.integrations.github.username || "";
    merged.integrations.github.updatedAt =
      settings.integrations.github.updatedAt || null;
  }
  if (settings?.dependencies?.git) {
    Object.assign(merged.dependencies.git, settings.dependencies.git);
  }
  if (settings?.dependencies?.buildTools) {
    Object.assign(
      merged.dependencies.buildTools,
      settings.dependencies.buildTools,
    );
  }
  if (settings?.dependencies?.doxygen) {
    Object.assign(merged.dependencies.doxygen, settings.dependencies.doxygen);
  }
  if (settings?.dependencies?.edsp) {
    Object.assign(merged.dependencies.edsp, settings.dependencies.edsp);
  }
  if (settings?.dependencies?.vst3) {
    Object.assign(merged.dependencies.vst3, settings.dependencies.vst3);
  }
  if (settings?.dependencies?.skiaDocs) {
    Object.assign(merged.dependencies.skiaDocs, settings.dependencies.skiaDocs);
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

const getAgentVersion = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const firstLine = fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0] || "";
    const match = firstLine.match(/Version\s+(\d+)/i);
    if (!match) {
      return null;
    }
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
};

const copyAgentInstructions = (projectPath) => {
  if (!projectPath) {
    return;
  }
  const sourcePath = path.join(__dirname, "AGENTS.md");
  const destPath = path.join(projectPath, "AGENTS.md");
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  const sourceVersion = getAgentVersion(sourcePath);
  if (fs.existsSync(destPath)) {
    const destVersion = getAgentVersion(destPath);
    if (!destVersion) {
      return;
    }
    if (sourceVersion !== null && sourceVersion <= destVersion) {
      return;
    }
  }
  try {
    fs.copyFileSync(sourcePath, destPath);
  } catch (error) {
    // ignore copy failures
  }
};

const playAgentPingSound = () => {
  const windir = process.env.WINDIR || "C:\\Windows";
  const soundPath = path.join(windir, "Media", "Windows Hardware Fail.wav");
  const command = `(New-Object Media.SoundPlayer '${soundPath.replace(/'/g, "''")}').PlaySync()`;
  spawn("powershell", ["-NoProfile", "-Command", command], {
    windowsHide: true,
    stdio: "ignore",
  });
};

const broadcastProjectItemsUpdated = (projectPath, itemName = "") => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("project:items-updated", {
        projectPath,
        itemName,
      });
    }
  });
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
        headers,
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
              `Request failed (${status}): ${data.slice(0, 200)}`,
            );
            error.status = status;
            error.body = data;
            error.parsed = parsed;
            return reject(error);
          }
          resolve(parsed);
        });
      },
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }
    request.end();
  });

const downloadFile = (
  urlString,
  destPath,
  { headers = {}, redirectCount = 0, onProgress, onRequest, shouldAbort } = {},
) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error("Too many redirects"));
    }
    const url = new URL(urlString);
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
      },
      (response) => {
        const status = response.statusCode || 0;
        if ([301, 302, 307, 308].includes(status)) {
          const location = response.headers.location;
          if (!location) {
            return reject(new Error("Redirect missing location"));
          }
          return resolve(
            downloadFile(location, destPath, {
              headers,
              redirectCount: redirectCount + 1,
              onProgress,
              onRequest,
              shouldAbort,
            }),
          );
        }
        if (status < 200 || status >= 300) {
          return reject(new Error(`Download failed (${status})`));
        }
        const total = Number(response.headers["content-length"] || 0);
        let received = 0;
        if (onRequest) {
          onRequest(request);
        }
        const file = fs.createWriteStream(destPath);
        response.on("data", (chunk) => {
          if (shouldAbort && shouldAbort()) {
            request.destroy(new Error("cancelled"));
            return;
          }
          received += chunk.length;
          if (total > 0 && onProgress) {
            onProgress(received / total);
          }
        });
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      },
    );

    request.on("error", reject);
    request.end();
  });

const expandArchive = (zipPath, destDir, onChild) =>
  new Promise((resolve, reject) => {
    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedDest = destDir.replace(/'/g, "''");
    const command = `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`;
    const child = spawn("powershell", ["-NoProfile", "-Command", command], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (onChild) {
      onChild(child);
    }
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || "Failed to extract archive"));
      }
    });
  });

const requestText = (urlString) =>
  new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
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
              new Error(`Request failed (${status}): ${data.slice(0, 200)}`),
            );
          }
          resolve(data);
        });
      },
    );
    request.on("error", reject);
    request.end();
  });

const sanitizeSettings = (settings) => {
  const sanitized = cloneSettings(settings);
  return sanitized;
};

let settings = null;
let activeInstall = null;
let activeBuild = null;
let currentProjectPath = "";

const saveSettings = () => {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const runGit = (args, cwd) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || "Git command failed");
  }
};

const killProcessTree = (pid) => {
  if (!pid) {
    return;
  }
  spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
    windowsHide: true,
  });
};

const findSolutionPath = (folderPath, projectName) => {
  if (!folderPath) {
    return "";
  }
  const direct = projectName ? path.join(folderPath, `${projectName}.sln`) : "";
  if (direct && fs.existsSync(direct)) {
    return direct;
  }
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const sln = entries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sln"),
    );
    return sln ? path.join(folderPath, sln.name) : "";
  } catch (error) {
    return "";
  }
};

const findBuiltExe = ({
  projectRoot,
  name,
  configuration = "Debug",
  platform = "x64",
  itemType = "plugin",
}) => {
  const preferred =
    itemType === "tool"
      ? [
          path.join(projectRoot, platform, configuration, `${name}.exe`),
          path.join(projectRoot, configuration, `${name}.exe`),
          path.join(projectRoot, "bin", platform, configuration, `${name}.exe`),
          path.join(projectRoot, "bin", configuration, `${name}.exe`),
          path.join(projectRoot, `${name}.exe`),
          path.join(
            projectRoot,
            "build-win",
            "app",
            platform,
            configuration,
            `${name}.exe`,
          ),
          path.join(
            projectRoot,
            "build-win",
            platform,
            configuration,
            `${name}.exe`,
          ),
        ]
      : [
          path.join(
            projectRoot,
            "build-win",
            "app",
            platform,
            configuration,
            `${name}.exe`,
          ),
        ];
  for (const candidate of preferred) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const searchRoots =
    itemType === "tool"
      ? [projectRoot, path.join(projectRoot, "build-win")]
      : [path.join(projectRoot, "build-win")];
  const stack = searchRoots.filter((root) => fs.existsSync(root));
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (
        entry.isFile() &&
        entry.name.toLowerCase() === `${name.toLowerCase()}.exe`
      ) {
        return entryPath;
      }
      if (entry.isDirectory()) {
        stack.push(entryPath);
      }
    }
  }
  return "";
};

const escapePowerShellString = (value) =>
  String(value || "").replace(/'/g, "''");

const runGitWithProgress = (args, cwd, onProgress, onChild) =>
  new Promise((resolve, reject) => {
    let stderr = "";
    const child = spawn("git", args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    if (onChild) {
      onChild(child);
    }
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const match = text.match(/(\d+)%/);
      if (match && onProgress) {
        const value = Number.parseInt(match[1], 10);
        if (Number.isFinite(value)) {
          onProgress(value / 100);
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || "Git command failed"));
      }
    });
  });

const isGitRepo = (cwd) => {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
};

const checkGitInstalled = () => {
  const result = spawnSync("git", ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return { installed: false, version: "" };
  }
  const match = String(result.stdout || "").match(/git version ([^\s]+)/i);
  return {
    installed: true,
    version: match ? match[1] : String(result.stdout || "").trim(),
  };
};

const getLatestDoxygenLink = async () => {
  const html = await requestText("https://www.doxygen.nl/download.html");
  const match = html.match(/href="([^"]*windows\.x64\.bin\.zip)"/i);
  if (!match || !match[1]) {
    throw new Error("Doxygen download link not found");
  }
  const href = match[1];
  if (href.startsWith("http")) {
    return href;
  }
  return `https://www.doxygen.nl/${href.replace(/^\/+/, "")}`;
};

const installDoxygen = async (event) => {
  const installDir = getDoxygenInstallDir();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-doxygen-"));
  const zipPath = path.join(tmpDir, "doxygen.zip");
  const extractDir = path.join(tmpDir, "extract");
  fs.mkdirSync(extractDir, { recursive: true });

  const window = BrowserWindow.fromWebContents(event.sender);
  const sendProgress = (progress, stage) => {
    const normalized = Number.isFinite(progress)
      ? Math.max(0, Math.min(progress, 1))
      : null;
    if (window && !window.isDestroyed()) {
      window.setProgressBar(normalized === null ? -1 : normalized);
    }
    event.sender.send("doxygen:progress", {
      progress: normalized,
      stage,
    });
  };

  try {
    sendProgress(0.05, "Fetching latest Doxygen release...");
    const url = await getLatestDoxygenLink();
    sendProgress(0.1, "Downloading Doxygen...");
    await downloadFile(url, zipPath, {
      onProgress: (value) =>
        sendProgress(0.1 + value * 0.6, "Downloading Doxygen..."),
    });
    sendProgress(0.75, "Extracting Doxygen...");
    await expandArchive(zipPath, extractDir);

    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(installDir), { recursive: true });

    const entries = fs.readdirSync(extractDir, { withFileTypes: true });
    const rootDir = entries.find((entry) => entry.isDirectory());
    const sourceRoot = rootDir
      ? path.join(extractDir, rootDir.name)
      : extractDir;

    fs.renameSync(sourceRoot, installDir);

    const exePath = findDoxygenExecutable(installDir);
    if (!exePath) {
      throw new Error("Doxygen executable not found after extraction");
    }
    sendProgress(0.95, "Finalizing...");
    settings.dependencies.doxygen = {
      installed: true,
      path: exePath,
      version: "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    sendProgress(1, "Done");
    return { installed: true, path: exePath };
  } catch (error) {
    return { error: "doxygen_failed", details: error?.message || "" };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
    if (window && !window.isDestroyed()) {
      window.setProgressBar(-1);
    }
  }
};

const removeDoxygen = () => {
  const installDir = getDoxygenInstallDir();
  try {
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    settings.dependencies.doxygen = {
      ...settings.dependencies.doxygen,
      installed: false,
      path: "",
      version: "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return { removed: true };
  } catch (error) {
    return { error: "doxygen_remove_failed", details: error?.message || "" };
  }
};

const checkProjectAddonInstalled = (projectPath, folderName) => {
  const normalizedPath = String(projectPath || "").trim();
  const normalizedFolder = String(folderName || "").trim();
  if (!normalizedPath || !normalizedFolder) {
    return { error: "missing_fields" };
  }
  if (!fs.existsSync(normalizedPath)) {
    return { error: "path_not_found" };
  }
  const targetPath = path.join(normalizedPath, normalizedFolder);
  const installed = fs.existsSync(targetPath);
  return {
    installed,
    path: installed ? targetPath : "",
  };
};

const removeProjectAddon = (projectPath, folderName) => {
  const normalizedPath = String(projectPath || "").trim();
  const normalizedFolder = String(folderName || "").trim();
  if (!normalizedPath || !normalizedFolder) {
    return { error: "missing_fields" };
  }
  if (!fs.existsSync(normalizedPath)) {
    return { error: "path_not_found" };
  }

  const targetPath = path.join(normalizedPath, normalizedFolder);
  const gitState = checkGitInstalled();
  const hasGitFolder = fs.existsSync(path.join(normalizedPath, ".git"));
  const isRepo = gitState.installed ? isGitRepo(normalizedPath) : hasGitFolder;

  if (isRepo && !gitState.installed) {
    return { error: "git_required" };
  }

  try {
    if (isRepo && gitState.installed) {
      try {
        runGit(["submodule", "deinit", "-f", "--", normalizedFolder], normalizedPath);
      } catch (error) {
        // ignore when addon is not registered as a submodule
      }
      try {
        runGit(["rm", "-f", "--", normalizedFolder], normalizedPath);
      } catch (error) {
        // fallback to direct folder deletion below
      }
      try {
        fs.rmSync(path.join(normalizedPath, ".git", "modules", normalizedFolder), {
          recursive: true,
          force: true,
        });
      } catch (error) {
        // ignore cleanup errors
      }
    }

    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    return { removed: true };
  } catch (error) {
    return { error: "remove_failed", details: String(error?.message || "") };
  }
};

const VST3_REQUIRED_SUBMODULES = [
  "pluginterfaces",
  "base",
  "public.sdk",
  "cmake",
  "vstgui4",
];

const parseGitmodulesByPath = (content) => {
  const map = new Map();
  if (!content) {
    return map;
  }
  const lines = String(content).split(/\r?\n/);
  let currentPath = "";
  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[submodule\s+"[^"]+"\]\s*$/);
    if (sectionMatch) {
      currentPath = "";
      continue;
    }
    const pathMatch = line.match(/^\s*path\s*=\s*(.+)\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1].trim();
      if (!map.has(currentPath)) {
        map.set(currentPath, "");
      }
      continue;
    }
    const urlMatch = line.match(/^\s*url\s*=\s*(.+)\s*$/);
    if (urlMatch && currentPath) {
      map.set(currentPath, urlMatch[1].trim());
    }
  }
  return map;
};

const parseGitHubFullName = (urlValue) => {
  const value = String(urlValue || "").trim();
  if (!value) {
    return "";
  }
  const githubUrl = value.match(
    /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?(?:\/)?$/i,
  );
  if (githubUrl && githubUrl[1]) {
    return githubUrl[1];
  }
  const compact = value.replace(/\.git$/i, "").replace(/^\/+/, "");
  const parts = compact.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return "";
};

const resolveSubmoduleRepoFullName = (parentRepoFullName, submoduleUrl) => {
  const value = String(submoduleUrl || "").trim();
  if (!value) {
    return "";
  }
  const parsed = parseGitHubFullName(value);
  if (parsed) {
    return parsed;
  }
  if (value.startsWith("../")) {
    const owner = String(parentRepoFullName || "").split("/")[0] || "";
    const repoName = value.replace(/^(?:\.\.\/)+/, "").replace(/\.git$/i, "");
    if (owner && repoName) {
      return `${owner}/${repoName}`;
    }
  }
  return "";
};

const getGithubHeaders = () => {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "iFactory",
  };
  return headers;
};

const removePathIfExists = (targetPath) => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
};

const removeGitArtifactsOneLevel = (folderPath) => {
  let entries = [];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch (error) {
    return;
  }
  entries.forEach((entry) => {
    if (entry.name.startsWith(".git")) {
      removePathIfExists(path.join(folderPath, entry.name));
    }
  });
};

const cleanupVST3SdkTree = (targetPath) => {
  removePathIfExists(path.join(targetPath, "VST3_BUILD"));
  removePathIfExists(path.join(targetPath, "public.sdk", "samples"));
  removePathIfExists(path.join(targetPath, "vstgui4"));
  removeGitArtifactsOneLevel(targetPath);

  let topEntries = [];
  try {
    topEntries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (error) {
    return;
  }
  topEntries.forEach((entry) => {
    if (entry.isDirectory()) {
      removeGitArtifactsOneLevel(path.join(targetPath, entry.name));
    }
  });
};

const loadVST3SubmoduleRefs = async (repoFullName, branch) => {
  const headers = getGithubHeaders();
  const tree = await requestJson(
    `https://api.github.com/repos/${repoFullName}/git/trees/${encodeURIComponent(
      branch,
    )}?recursive=1`,
    { headers },
  );
  const entries = Array.isArray(tree?.tree) ? tree.tree : [];
  const refs = new Map();
  entries.forEach((entry) => {
    if (!entry?.path || !entry?.sha) {
      return;
    }
    if (entry.mode === "160000" || entry.type === "commit") {
      refs.set(entry.path, entry.sha);
    }
  });
  return refs;
};

const removeVST3Addon = (projectPath) => {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) {
    return { error: "missing_fields" };
  }
  if (!fs.existsSync(normalizedPath)) {
    return { error: "path_not_found" };
  }
  const iplugRoot = path.join(normalizedPath, "iPlug2", "Dependencies", "IPlug");
  const targetPath = path.join(iplugRoot, "VST3_SDK");
  if (!fs.existsSync(iplugRoot)) {
    return { error: "missing_iplug" };
  }
  try {
    removePathIfExists(targetPath);
    return { removed: true };
  } catch (error) {
    return { error: "remove_failed", details: String(error?.message || "") };
  }
};

const getVST3InstallPaths = (projectPath) => {
  const normalizedPath = String(projectPath || "").trim();
  const iplugRoot = path.join(normalizedPath, "iPlug2", "Dependencies", "IPlug");
  return {
    projectPath: normalizedPath,
    iplugRoot,
    targetPath: path.join(iplugRoot, "VST3_SDK"),
  };
};

const isVST3Installed = (targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return false;
  }
  const requiredPaths = [
    path.join(targetPath, "base", "source"),
    path.join(targetPath, "pluginterfaces"),
    path.join(targetPath, "public.sdk", "source"),
  ];
  return requiredPaths.every((entryPath) => fs.existsSync(entryPath));
};

const getSkiaDocsOutputDir = (projectPath) =>
  path.join(String(projectPath || "").trim(), "doxygen", "skia");

const getSkiaDocsDbPath = (projectPath) =>
  path.join(
    getSkiaDocsOutputDir(projectPath),
    "doxygen.sqlite3",
    "doxygen_sqlite3.db",
  );

const checkSkiaDocsInstalled = (projectPath) => {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) {
    return { error: "missing_fields" };
  }
  if (!fs.existsSync(normalizedPath)) {
    return { error: "path_not_found" };
  }
  const dbPath = getSkiaDocsDbPath(normalizedPath);
  const installed = fs.existsSync(dbPath);
  return {
    installed,
    path: installed ? getSkiaDocsOutputDir(normalizedPath) : "",
  };
};

const removeSkiaDocsAddon = (projectPath) => {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) {
    return { error: "missing_fields" };
  }
  if (!fs.existsSync(normalizedPath)) {
    return { error: "path_not_found" };
  }
  try {
    removePathIfExists(getSkiaDocsOutputDir(normalizedPath));
    return { removed: true };
  } catch (error) {
    return { error: "remove_failed", details: String(error?.message || "") };
  }
};

const detectSkiaBranchFromIPlug2 = (projectPath) => {
  const normalizedPath = String(projectPath || "").trim();
  const scriptPath = path.join(
    normalizedPath,
    "iPlug2",
    "Dependencies",
    "IGraphics",
    "download-igraphics-libs.sh",
  );
  if (fs.existsSync(scriptPath)) {
    try {
      const script = fs.readFileSync(scriptPath, "utf8");
      const branchMatch = script.match(/^\s*SKIA_VERSION\s*=\s*([^\r\n#]+)/m);
      if (branchMatch && branchMatch[1]) {
        const candidate = branchMatch[1].trim().replace(/^['"]|['"]$/g, "");
        if (candidate) {
          return candidate;
        }
      }
    } catch (error) {
      // ignore and fall through
    }
  }

  const milestonePath = path.join(
    normalizedPath,
    "iPlug2",
    "Dependencies",
    "Build",
    "src",
    "skia",
    "include",
    "core",
    "SkMilestone.h",
  );
  if (fs.existsSync(milestonePath)) {
    try {
      const milestoneRaw = fs.readFileSync(milestonePath, "utf8");
      const milestoneMatch = milestoneRaw.match(
        /^\s*#define\s+SK_MILESTONE\s+(\d+)/m,
      );
      if (milestoneMatch && milestoneMatch[1]) {
        return `chrome/m${milestoneMatch[1]}`;
      }
    } catch (error) {
      // ignore and fall through
    }
  }

  return "";
};

const updateDoxySetting = (content, key, value) => {
  const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, "gm");
  const line = `${key} = ${value}`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const trimmed = content.replace(/\s*$/, "");
  return `${trimmed}\n${line}\n`;
};

const createPatchedDoxyfileBesideSource = (sourcePath, outputDir) => {
  const raw = fs.readFileSync(sourcePath, "utf8");
  const normalizedOutput = outputDir.replace(/\\/g, "/");
  let next = raw;
  next = updateDoxySetting(next, "GENERATE_HTML", "NO");
  next = updateDoxySetting(next, "GENERATE_SQLITE3", "YES");
  next = updateDoxySetting(next, "SQLITE3_OUTPUT", '"doxygen.sqlite3"');
  next = updateDoxySetting(next, "OUTPUT_DIRECTORY", `"${normalizedOutput}"`);
  const tempName = `.ifactory-doxygen-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.cfg`;
  const tempPath = path.join(path.dirname(sourcePath), tempName);
  fs.writeFileSync(tempPath, next);
  return { tempPath };
};

const runDoxygenWithConfig = ({
  doxygenPath,
  doxyfilePath,
  outputDir,
  cwd,
  onChild,
  onOutput,
}) =>
  new Promise((resolve, reject) => {
    let patched = null;
    try {
      patched = createPatchedDoxyfileBesideSource(doxyfilePath, outputDir);
    } catch (error) {
      reject(error);
      return;
    }
    const tempPath = patched.tempPath;
    let cleaned = false;
    const cleanupPatchedFile = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      try {
        fs.rmSync(tempPath, { force: true });
      } catch (cleanupError) {
        // ignore cleanup errors
      }
    };
    const child = spawn(doxygenPath, [tempPath], {
      cwd: cwd || path.dirname(doxyfilePath),
      windowsHide: true,
    });
    if (onChild) {
      onChild(child);
    }
    let output = "";
    const append = (chunk) => {
      const text = chunk.toString();
      if (onOutput) {
        try {
          onOutput(text);
        } catch (error) {
          // ignore logging callback failures
        }
      }
      output += text;
      if (output.length > 8000) {
        output = output.slice(-8000);
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      cleanupPatchedFile();
      reject(error);
    });
    child.on("close", (code) => {
      cleanupPatchedFile();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(output.trim() || "Doxygen generation failed"));
    });
  });

const checkBuildToolsInstalled = () => {
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const vswherePath = path.join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );

  const normalizePath = (value) => {
    if (!value) {
      return "";
    }
    return String(value).trim();
  };

  if (fs.existsSync(vswherePath)) {
    const result = spawnSync(
      vswherePath,
      [
        "-latest",
        "-requires",
        "Microsoft.Component.MSBuild",
        "-find",
        "MSBuild\\**\\Bin\\MSBuild.exe",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (!result.error && result.status === 0) {
      const output = normalizePath(result.stdout);
      const candidate = output.split(/\r?\n/).find(Boolean);
      if (candidate && fs.existsSync(candidate)) {
        return { installed: true, path: candidate };
      }
    }
  }

  const whereResult = spawnSync("cmd", ["/c", "where", "msbuild"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (!whereResult.error && whereResult.status === 0) {
    const output = normalizePath(whereResult.stdout);
    const candidate = output.split(/\r?\n/).find(Boolean);
    if (candidate) {
      return { installed: true, path: candidate };
    }
    return { installed: true, path: "" };
  }

  return { installed: false, path: "" };
};

const getGithubDesktopCommand = () => {
  const result = spawnSync(
    "reg",
    ["query", "HKCR\\x-github-client\\shell\\open\\command", "/ve"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error || result.status !== 0) {
    return "";
  }
  const output = String(result.stdout || "");
  const match = output.match(/\"([^\"]+GitHubDesktop\.exe)\"/i);
  if (match && match[1]) {
    return match[1];
  }
  const unquoted = output.match(/REG_SZ\s+([^\r\n]+)/i);
  if (unquoted && unquoted[1]) {
    const trimmed = unquoted[1].trim();
    const exeMatch = trimmed.match(/([A-Z]:[^\"]+GitHubDesktop\.exe)/i);
    return exeMatch ? exeMatch[1] : "";
  }
  return "";
};

const isGithubDesktopInstalled = () => Boolean(getGithubDesktopCommand());

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
    updatedAt: new Date().toISOString(),
  });
  settings.recentProjects = filtered.slice(0, 3);
  saveSettings();
};

const registerIpc = () => {
  ipcMain.handle("app:getMeta", () => ({
    name: pkg.productName || pkg.name || app.getName(),
    version: app.getVersion(),
    description: pkg.description || "",
  }));
  ipcMain.handle("settings:get", () => sanitizeSettings(settings));
  ipcMain.handle("recents:get", () =>
    Array.isArray(settings.recentProjects) ? settings.recentProjects : [],
  );
  ipcMain.handle("git:check", () => {
    const result = checkGitInstalled();
    settings.dependencies.git = {
      ...settings.dependencies.git,
      installed: result.installed,
      skipped: false,
      version: result.version || "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.git;
  });
  ipcMain.handle("git:skip", () => {
    settings.dependencies.git = {
      ...settings.dependencies.git,
      installed: false,
      skipped: true,
      version: "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.git;
  });
  ipcMain.handle("git:status", (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      if (!projectPath) {
        return { error: "missing_path" };
      }
      const result = spawnSync("git", ["status", "--porcelain=v1", "-z"], {
        cwd: projectPath,
        encoding: "utf8",
        windowsHide: true,
      });
      if (result.status !== 0) {
        return { error: "status_failed" };
      }
      const output = String(result.stdout || "");
      const entries = output.split("\0").filter(Boolean);
      const changes = entries.map((entry) => {
        let statusPart = entry.slice(0, 2);
        let pathPart = entry.slice(2).trimStart();
        if (/\d/.test(statusPart[1])) {
          const firstSpace = entry.indexOf(" ");
          if (firstSpace !== -1) {
            statusPart = `${entry[0]} `;
            pathPart = entry.slice(firstSpace + 1).trim();
          }
        }
        if (pathPart.includes("->")) {
          pathPart = pathPart.split("->").pop().trim();
        }
        const status = statusPart[0] !== " " ? statusPart[0] : statusPart[1];
        return {
          path: pathPart,
          status: status || "M",
        };
      });
      return { changes };
    } catch (error) {
      return { error: "status_failed" };
    }
  });
  ipcMain.handle("git:commit", (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      const summary = payload?.summary?.trim();
      const description = payload?.description?.trim();
      const files = Array.isArray(payload?.files) ? payload.files : [];
      if (!projectPath) {
        return { error: "missing_path" };
      }
      if (!summary) {
        return { error: "missing_summary" };
      }
      if (files.length === 0) {
        return { error: "missing_files" };
      }
      const addResult = spawnSync("git", ["add", "--", ...files], {
        cwd: projectPath,
        encoding: "utf8",
        windowsHide: true,
      });
      if (addResult.status !== 0) {
        return { error: "add_failed" };
      }
      const commitArgs = ["commit", "-m", summary];
      if (description) {
        commitArgs.push("-m", description);
      }
      const commitResult = spawnSync("git", commitArgs, {
        cwd: projectPath,
        encoding: "utf8",
        windowsHide: true,
      });
      if (commitResult.status !== 0) {
        return { error: "commit_failed" };
      }
      return { success: true };
    } catch (error) {
      return { error: "commit_failed" };
    }
  });
  ipcMain.handle("build:check", () => {
    const result = checkBuildToolsInstalled();
    settings.dependencies.buildTools = {
      ...settings.dependencies.buildTools,
      installed: result.installed,
      path: result.path || "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.buildTools;
  });
  ipcMain.handle("doxygen:check", () => {
    const result = checkDoxygenInstalled(getDoxygenInstallDir());
    settings.dependencies.doxygen = {
      ...settings.dependencies.doxygen,
      installed: result.installed,
      path: result.path || "",
      version: result.version || "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.doxygen;
  });
  ipcMain.handle("doxygen:install", async (event) => {
    const result = await installDoxygen(event);
    if (!result?.error) {
      settings.dependencies.doxygen = {
        ...settings.dependencies.doxygen,
        installed: true,
        path: result.path || "",
        version: "",
        checkedAt: new Date().toISOString(),
      };
      saveSettings();
    }
    return result;
  });
  ipcMain.handle("doxygen:remove", () => removeDoxygen());
  ipcMain.handle("edsp:check", (event, payload) => {
    const projectPath = payload?.projectPath?.trim();
    const result = checkProjectAddonInstalled(projectPath, "eDSP");
    if (result?.error) {
      return result;
    }
    settings.dependencies.edsp = {
      ...settings.dependencies.edsp,
      installed: Boolean(result.installed),
      path: result.path || "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.edsp;
  });
  ipcMain.handle("edsp:remove", (event, payload) => {
    const projectPath = payload?.projectPath?.trim();
    const result = removeProjectAddon(projectPath, "eDSP");
    if (result?.error) {
      return result;
    }
    settings.dependencies.edsp = {
      ...settings.dependencies.edsp,
      installed: false,
      path: "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.edsp;
  });
  ipcMain.handle("vst3:check", (event, payload) => {
    const projectPath = payload?.projectPath?.trim();
    const paths = getVST3InstallPaths(projectPath);
    if (!paths.projectPath) {
      return { error: "missing_fields" };
    }
    if (!fs.existsSync(paths.projectPath)) {
      return { error: "path_not_found" };
    }
    if (!fs.existsSync(paths.iplugRoot)) {
      return { error: "missing_iplug" };
    }
    const installed = isVST3Installed(paths.targetPath);
    settings.dependencies.vst3 = {
      ...settings.dependencies.vst3,
      installed,
      path: installed ? paths.targetPath : "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.vst3;
  });
  ipcMain.handle("vst3:remove", (event, payload) => {
    const projectPath = payload?.projectPath?.trim();
    const result = removeVST3Addon(projectPath);
    if (result?.error) {
      return result;
    }
    settings.dependencies.vst3 = {
      ...settings.dependencies.vst3,
      installed: false,
      path: "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.vst3;
  });
  ipcMain.handle("skiaDocs:check", (event, payload) => {
    const projectPath = payload?.projectPath?.trim();
    const result = checkSkiaDocsInstalled(projectPath);
    if (result?.error) {
      return result;
    }
    settings.dependencies.skiaDocs = {
      ...settings.dependencies.skiaDocs,
      installed: Boolean(result.installed),
      path: result.path || "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.skiaDocs;
  });
  ipcMain.handle("skiaDocs:remove", (event, payload) => {
    const projectPath = payload?.projectPath?.trim();
    const result = removeSkiaDocsAddon(projectPath);
    if (result?.error) {
      return result;
    }
    settings.dependencies.skiaDocs = {
      ...settings.dependencies.skiaDocs,
      installed: false,
      path: "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.skiaDocs;
  });
  ipcMain.handle("build:run", async (event, payload) => {
    if (activeBuild) {
      return { error: "build_in_progress" };
    }
    try {
      const projectPath = payload?.projectPath?.trim();
      const pluginName = payload?.pluginName?.trim();
      const itemType = payload?.itemType === "tool" ? "tool" : "plugin";
      const configuration = payload?.configuration || "Debug";
      const platform = payload?.platform || "x64";
      if (!projectPath || !pluginName) {
        return { error: "missing_fields" };
      }
      if (pluginName !== path.basename(pluginName)) {
        return { error: "invalid_plugin" };
      }
      const pluginPath = path.join(projectPath, pluginName);
      if (!fs.existsSync(pluginPath)) {
        return { error: "plugin_not_found" };
      }

      const buildTools = checkBuildToolsInstalled();
      if (!buildTools.installed) {
        return { error: "build_tools_missing" };
      }

      const slnPath = findSolutionPath(pluginPath, pluginName);
      if (!slnPath) {
        return { error: "solution_not_found" };
      }

      const targetName = itemType === "tool" ? pluginName : `${pluginName}-app`;
      const args = [
        slnPath,
        `/t:${targetName}`,
        `/p:Configuration=${configuration};Platform=${platform}`,
      ];

      const sendState = (state, message) => {
        event.sender.send("build:state", { state, message });
      };
      const sendOutput = (text, stream = "stdout") => {
        event.sender.send("build:output", { text, stream });
      };

      sendState("building", `Building ${targetName}...`);

      const child = spawn(buildTools.path || "msbuild", args, {
        cwd: pluginPath,
        windowsHide: true,
      });
      activeBuild = {
        buildProcess: child,
        exeProcess: null,
        sender: event.sender,
      };

      child.stdout.on("data", (chunk) => {
        sendOutput(chunk.toString(), "stdout");
      });
      child.stderr.on("data", (chunk) => {
        sendOutput(chunk.toString(), "stderr");
      });
      child.on("error", (error) => {
        sendState("error", error.message || "Build failed.");
        activeBuild = null;
      });
      child.on("close", (code) => {
        if (code !== 0) {
          sendState("error", `Build failed with code ${code}.`);
          activeBuild = null;
          return;
        }

        const exePath = findBuiltExe({
          projectRoot: pluginPath,
          name: pluginName,
          configuration,
          platform,
          itemType,
        });
        if (!exePath) {
          sendState("error", "Built app executable not found.");
          activeBuild = null;
          return;
        }

        try {
          if (itemType === "tool") {
            const escapedExe = escapePowerShellString(exePath);
            const escapedCwd = escapePowerShellString(pluginPath);
            const script = `Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedCwd}' -PassThru | Select-Object -ExpandProperty Id`;
            const ps = spawn(
              "powershell.exe",
              ["-NoProfile", "-Command", script],
              {
                windowsHide: true,
              },
            );
            let pidOutput = "";
            ps.stdout.on("data", (chunk) => {
              pidOutput += chunk.toString();
            });
            ps.stderr.on("data", (chunk) => {
              sendOutput(chunk.toString(), "stderr");
            });
            ps.on("close", () => {
              const pid = Number.parseInt(pidOutput.trim(), 10);
              if (!Number.isFinite(pid)) {
                sendState("error", "Failed to launch tool.");
                activeBuild = null;
                return;
              }
              activeBuild.exeProcess = { pid };
              sendState("running", `Running ${pluginName}...`);
            });
          } else {
            const exeProcess = spawn(exePath, [], {
              cwd: pluginPath,
              windowsHide: false,
            });
            activeBuild.exeProcess = exeProcess;
            sendState("running", `Running ${pluginName}...`);
            exeProcess.on("close", () => {
              sendState("complete", "Run finished.");
              activeBuild = null;
            });
          }
        } catch (error) {
          sendState("error", error.message || "Failed to run app.");
          activeBuild = null;
        }
      });

      return { started: true };
    } catch (error) {
      activeBuild = null;
      return { error: "build_failed" };
    }
  });
  ipcMain.handle("solution:open", async (event, payload) => {
    try {
      const projectPath = payload?.projectPath?.trim();
      const pluginName = payload?.pluginName?.trim();
      if (!projectPath || !pluginName) {
        return { error: "missing_fields" };
      }
      if (pluginName !== path.basename(pluginName)) {
        return { error: "invalid_plugin" };
      }
      const pluginPath = path.join(projectPath, pluginName);
      if (!fs.existsSync(pluginPath)) {
        return { error: "plugin_not_found" };
      }
      const slnPath = findSolutionPath(pluginPath, pluginName);
      if (!slnPath) {
        return { error: "solution_not_found" };
      }
      const result = await shell.openPath(slnPath);
      if (result) {
        return { error: "open_failed", details: result };
      }
      return { opened: true };
    } catch (error) {
      return { error: "open_failed" };
    }
  });
  ipcMain.handle("build:stop", () => {
    if (!activeBuild) {
      return { stopped: false };
    }
    try {
      if (activeBuild.buildProcess?.pid) {
        killProcessTree(activeBuild.buildProcess.pid);
      }
      if (activeBuild.exeProcess?.pid) {
        killProcessTree(activeBuild.exeProcess.pid);
      }
    } catch (error) {
      // ignore stop errors
    } finally {
      if (activeBuild.sender) {
        try {
          activeBuild.sender.send("build:state", {
            state: "stopped",
            message: "Build stopped.",
          });
        } catch (error) {
          // ignore send errors
        }
      }
      activeBuild = null;
    }
    return { stopped: true };
  });
  ipcMain.handle("github-desktop:open", async (event, payload) => {
    const projectPath = payload?.path?.trim();
    if (!projectPath) {
      return { error: "missing_path" };
    }
    const command = getGithubDesktopCommand();
    if (command && fs.existsSync(command)) {
      spawn(command, ["--cli-open", projectPath], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      }).unref();
      return { installed: true };
    }
    await shell.openExternal("https://desktop.github.com/download/");
    return { installed: false };
  });
  ipcMain.handle("recents:remove", (event, payload) => {
    const removePath = payload?.path?.trim();
    if (!removePath) {
      return false;
    }
    const existing = Array.isArray(settings.recentProjects)
      ? settings.recentProjects
      : [];
    settings.recentProjects = existing.filter(
      (item) => item?.path !== removePath,
    );
    saveSettings();
    return true;
  });
  ipcMain.handle("shell:openExternal", (event, url) => {
    if (typeof url !== "string") {
      return false;
    }
    return shell.openExternal(url);
  });
  ipcMain.handle("dialog:selectFolder", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
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

      if (!name || !basePath) {
        return { error: "missing_fields" };
      }

      const projectPath = createFolder ? path.join(basePath, name) : basePath;

      if (createFolder && fs.existsSync(projectPath)) {
        return { error: "folder_exists" };
      }

      fs.mkdirSync(projectPath, { recursive: true });
      copyAgentInstructions(projectPath);

      if (createRepo) {
        const gitState = checkGitInstalled();
        if (!gitState.installed) {
          return { error: "git_required" };
        }
        const gitignorePath = path.join(projectPath, ".gitignore");
        if (!fs.existsSync(gitignorePath)) {
          const gitignoreLines = [
            ".DS_Store",
            "xcuserdata",
            "*.RPP-bak",
            "*/build-*/",
            "*.ipch",
            "*.db",
            "*.suo",
            "*/.vs",
            "*.pem",
            "mkcert*",
            ".claude/settings.local.json",
            "__pycache__",
            "doxygen/",
          ];
          fs.writeFileSync(gitignorePath, gitignoreLines.join(os.EOL));
        }
        runGit(["init"], projectPath);
      }

      pushRecentProject({ name, projectPath });
      currentProjectPath = projectPath;

      return {
        path: projectPath,
        needsIPlug: true,
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
      copyAgentInstructions(projectPath);
      const iPlugPath = path.join(projectPath, "iPlug2");
      const needsIPlug = !fs.existsSync(iPlugPath);
      let needsDependencies = false;
      if (!needsIPlug) {
        const depsPath = getDepsBuildPath(iPlugPath);
        needsDependencies = !depsPath || !fs.existsSync(depsPath);
      }
      let isRepo = false;
      try {
        isRepo = fs.existsSync(path.join(projectPath, ".git"))
          ? isGitRepo(projectPath)
          : false;
      } catch (error) {
        isRepo = false;
      }
      pushRecentProject({ projectPath });
      currentProjectPath = projectPath;
      return {
        path: projectPath,
        needsIPlug,
        needsDependencies,
        isGitRepo: isRepo,
      };
    } catch (error) {
      return { error: "open_failed" };
    }
  });
  ipcMain.handle("project:listItems", async (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      return listProjectItems(projectPath);
    } catch (error) {
      return { error: "list_failed" };
    }
  });
  ipcMain.handle("templates:list", async (event, payload) => {
    try {
      const projectPath = payload?.projectPath?.trim();
      if (!projectPath) {
        return { error: "missing_path" };
      }
      const examplesPath = path.join(projectPath, "iPlug2", "Examples");
      if (!fs.existsSync(examplesPath)) {
        return { error: "examples_missing" };
      }
      const entries = fs.readdirSync(examplesPath, { withFileTypes: true });
      const templates = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const folder = entry.name;
          const readmePath = path.join(examplesPath, folder, "README.md");
          let description = "";
          try {
            if (fs.existsSync(readmePath)) {
              const content = fs.readFileSync(readmePath, "utf8");
              const lines = content.split(/\r?\n/);
              if (lines.length > 1) {
                for (let i = 1; i < lines.length; i += 1) {
                  const candidate = lines[i].trim();
                  if (candidate) {
                    description = candidate.replace(
                      /\[([^\]]+)\]\([^)]+\)/g,
                      "$1",
                    );
                    break;
                  }
                }
              }
            }
          } catch (error) {
            description = "";
          }
          return {
            folder,
            name: formatTemplateName(folder),
            description,
          };
        })
        .sort((a, b) => {
          const priority = (item) => {
            if (item.folder === "IPlugEffect") {
              return 0;
            }
            if (item.folder === "IPlugInstrument") {
              return 1;
            }
            return 2;
          };
          const priorityDiff = priority(a) - priority(b);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return a.name.localeCompare(b.name);
        });
      return { templates };
    } catch (error) {
      return { error: "templates_failed" };
    }
  });
  ipcMain.handle("templates:copy", async (event, payload) => {
    if (activeInstall) {
      return { error: "install_in_progress" };
    }
    const projectPath = payload?.projectPath?.trim();
    const templateFolder = payload?.templateFolder?.trim();
    const name = payload?.name?.trim();
    const manufacturer = payload?.manufacturer?.trim() || "AcmeInc";
    if (!projectPath || !templateFolder || !name) {
      return { error: "missing_fields" };
    }
    if (/[^a-zA-Z0-9]/.test(name)) {
      return { error: "invalid_name" };
    }
    const sourcePath = path.join(
      projectPath,
      "iPlug2",
      "Examples",
      templateFolder,
    );
    if (!fs.existsSync(sourcePath)) {
      return { error: "template_missing" };
    }
    const targetPath = path.join(projectPath, name);
    if (fs.existsSync(targetPath)) {
      return { error: "already_exists" };
    }

    const configDir = path.join(sourcePath, "config");
    const oldRoot = getTemplateIPlugRoot(configDir, templateFolder);
    const newRoot = getOutOfSourceRoot(projectPath, targetPath);

    const window = BrowserWindow.fromWebContents(event.sender);
    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(normalized === null ? -1 : normalized);
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage,
      });
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null,
    };

    const cleanupTarget = () => {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } catch (error) {
        // ignore cleanup errors
      }
    };

    try {
      sendProgress(0.05, "Copying template...");
      copyDirectory(
        sourcePath,
        targetPath,
        (progress) =>
          sendProgress(0.05 + progress * 0.6, "Copying template..."),
        () => activeInstall?.canceled,
      );
      if (activeInstall?.canceled) {
        cleanupTarget();
        return { error: "cancelled" };
      }
      const needsRename = templateFolder !== name;
      const needsRootUpdate = Boolean(
        oldRoot && newRoot && oldRoot !== newRoot,
      );
      if (needsRename || needsRootUpdate) {
        sendProgress(
          0.7,
          needsRename
            ? "Renaming project..."
            : "Updating project references...",
        );
        renameTemplateContents(
          targetPath,
          templateFolder,
          name,
          "AcmeInc",
          manufacturer,
          oldRoot,
          newRoot,
        );
      }
      sendProgress(0.9, "Updating build scripts...");
      patchPostbuildScript(targetPath);
      patchCreateBundleScript(projectPath);
      sendProgress(1, "Finished");
      return { path: targetPath };
    } catch (error) {
      cleanupTarget();
      if (activeInstall?.canceled || error?.message === "cancelled") {
        return { error: "cancelled" };
      }
      return { error: "copy_failed" };
    } finally {
      if (window && !window.isDestroyed()) {
        window.setProgressBar(-1);
      }
      activeInstall = null;
    }
  });
  ipcMain.handle("resource:add", async (event, payload) => {
    try {
      const projectPath = payload?.projectPath?.trim();
      const pluginName = payload?.pluginName?.trim();
      const filePath = payload?.filePath?.trim();
      const resourceName = payload?.resourceName?.trim();
      const removeOriginal = Boolean(payload?.removeOriginal);
      return addResourceToPlugin({
        projectPath,
        pluginName,
        filePath,
        resourceName,
        removeOriginal,
      });
    } catch (error) {
      return { error: "resource_failed" };
    }
  });
  ipcMain.handle("graphics:set", async (event, payload) => {
    try {
      const projectPath = payload?.projectPath?.trim();
      const pluginName = payload?.pluginName?.trim();
      const backend = payload?.backend?.trim();
      if (!projectPath || !pluginName || !backend) {
        return { error: "missing_fields" };
      }
      return setGraphicsBackend(projectPath, pluginName, backend);
    } catch (error) {
      return { error: "graphics_failed" };
    }
  });
  ipcMain.handle("graphics:get", async (event, payload) => {
    try {
      const projectPath = payload?.projectPath?.trim();
      const pluginName = payload?.pluginName?.trim();
      if (!projectPath || !pluginName) {
        return { error: "missing_fields" };
      }
      return detectGraphicsBackend(projectPath, pluginName);
    } catch (error) {
      return { error: "graphics_failed" };
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
  ipcMain.handle("github:listIPlugForks", async () => {
    const headers = getGithubHeaders();

    try {
      const forks = await requestJson(
        "https://api.github.com/repos/iplug2/iplug2/forks?per_page=100&sort=newest",
        { headers },
      );
      return {
        forks: Array.isArray(forks) ? forks : [],
      };
    } catch (error) {
      return {
        error: "forks_failed",
        details: {
          status: error?.status || null,
          message: error?.message || null,
        },
      };
    }
  });

  ipcMain.handle("github:listRepoForks", async (event, payload) => {
    const fullName = payload?.fullName?.trim();
    if (!fullName) {
      return { error: "missing_repo" };
    }
    const headers = getGithubHeaders();

    try {
      const forks = await requestJson(
        `https://api.github.com/repos/${fullName}/forks?per_page=100&sort=newest`,
        { headers },
      );
      return {
        forks: Array.isArray(forks) ? forks : [],
      };
    } catch (error) {
      return {
        error: "forks_failed",
        details: {
          status: error?.status || null,
          message: error?.message || null,
        },
      };
    }
  });

  ipcMain.handle("github:listRepoBranches", async (event, payload) => {
    const fullName = payload?.fullName?.trim();
    if (!fullName) {
      return { error: "missing_repo" };
    }
    const headers = getGithubHeaders();

    try {
      const branches = await requestJson(
        `https://api.github.com/repos/${fullName}/branches?per_page=100`,
        { headers },
      );
      return {
        branches: Array.isArray(branches) ? branches : [],
      };
    } catch (error) {
      return {
        error: "branches_failed",
        details: {
          status: error?.status || null,
          message: error?.message || null,
        },
      };
    }
  });

  const installDependencies = async ({ targetPath, event }) => {
    const depsDir = path.join(targetPath, "Dependencies");
    if (!fs.existsSync(depsDir)) {
      throw new Error("Dependencies folder missing");
    }

    const config = getDepsConfig();
    if (!config.zipFile || !config.folder) {
      throw new Error("Unsupported platform");
    }

    const depsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-"));
    const depsZipPath = path.join(depsTmpDir, `${config.zipFile}.zip`);
    const depsExtractDir = path.join(depsTmpDir, "extract");
    fs.mkdirSync(depsExtractDir, { recursive: true });

    event.sendProgress(0.68, "Downloading dependencies...");
    await downloadFile(
      `https://github.com/iPlug2/iPlug2/releases/download/v1.0.0-beta/${config.zipFile}.zip`,
      depsZipPath,
      {
        onProgress: (progress) => {
          event.sendProgress(
            0.68 + progress * 0.2,
            "Downloading dependencies...",
          );
        },
        onRequest: (request) => {
          event.setRequest(request);
        },
        shouldAbort: () => event.isCanceled(),
      },
    );

    if (event.isCanceled()) {
      throw new Error("cancelled");
    }

    event.sendProgress(0.9, "Extracting dependencies...");
    await expandArchive(depsZipPath, depsExtractDir, (child) => {
      event.setChild(child);
    });

    if (event.isCanceled()) {
      throw new Error("cancelled");
    }

    const depsRootEntries = fs.readdirSync(depsExtractDir, {
      withFileTypes: true,
    });
    const depsRootDir = depsRootEntries.find((entry) => entry.isDirectory());
    if (!depsRootDir) {
      throw new Error("Dependencies archive invalid");
    }
    const depsRootPath = path.join(depsExtractDir, depsRootDir.name);
    const buildDir = path.join(depsDir, "Build");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.rmSync(path.join(buildDir, config.folder), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(buildDir, "src"), { recursive: true, force: true });

    const depsEntries = fs.readdirSync(depsRootPath, {
      withFileTypes: true,
    });
    depsEntries.forEach((entry) => {
      const sourcePath = path.join(depsRootPath, entry.name);
      const destPath = path.join(buildDir, entry.name);
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }
      fs.renameSync(sourcePath, destPath);
    });

    fs.rmSync(depsTmpDir, { recursive: true, force: true });
  };

  ipcMain.handle("iplug:install", async (event, payload) => {
    if (activeInstall) {
      return { error: "install_in_progress" };
    }
    const projectPath = payload?.projectPath?.trim();
    const repoFullName = payload?.repoFullName?.trim();
    const branch = payload?.branch?.trim() || "master";
    if (!projectPath || !repoFullName) {
      return { error: "missing_fields" };
    }
    if (!fs.existsSync(projectPath)) {
      return { error: "path_not_found" };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const targetPath = path.join(projectPath, "iPlug2");
    if (fs.existsSync(targetPath)) {
      return { error: "already_exists" };
    }

    const gitState = checkGitInstalled();
    const hasGitFolder = fs.existsSync(path.join(projectPath, ".git"));
    const isRepo = gitState.installed ? isGitRepo(projectPath) : hasGitFolder;
    if (!gitState.installed && isRepo) {
      return { error: "git_required" };
    }

    const authUrl = `https://github.com/${repoFullName}.git`;
    let tmpDir = null;
    let gitmodulesBackup = null;
    let usedSubmodule = false;

    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(normalized === null ? -1 : normalized);
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage,
      });
    };

    const installContext = {
      sendProgress,
      setRequest: (request) => {
        activeInstall.request = request;
      },
      setChild: (child) => {
        activeInstall.child = child;
      },
      isCanceled: () => activeInstall?.canceled,
    };

    const cleanup = () => {
      try {
        if (usedSubmodule && gitState.installed) {
          try {
            runGit(["submodule", "deinit", "-f", "iPlug2"], projectPath);
          } catch (error) {
            // ignore cleanup errors
          }
          try {
            runGit(["rm", "-f", "iPlug2"], projectPath);
          } catch (error) {
            // ignore cleanup errors
          }
          try {
            fs.rmSync(path.join(projectPath, ".git", "modules", "iPlug2"), {
              recursive: true,
              force: true,
            });
          } catch (error) {
            // ignore cleanup errors
          }
          const gitmodulesPath = path.join(projectPath, ".gitmodules");
          if (gitmodulesBackup === null && fs.existsSync(gitmodulesPath)) {
            fs.rmSync(gitmodulesPath, { force: true });
          }
          if (typeof gitmodulesBackup === "string") {
            fs.writeFileSync(gitmodulesPath, gitmodulesBackup);
          }
        }
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
      } catch (error) {
        // ignore cleanup errors
      }
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (error) {
          // ignore cleanup errors
        }
      }
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null,
    };

    try {
      sendProgress(0.02, "Preparing iPlug2...");

      if (gitState.installed) {
        const progressStage = isRepo
          ? "Adding iPlug2 as submodule..."
          : "Cloning iPlug2...";
        sendProgress(0.06, progressStage);

        if (isRepo) {
          usedSubmodule = true;
          const gitmodulesPath = path.join(projectPath, ".gitmodules");
          if (fs.existsSync(gitmodulesPath)) {
            gitmodulesBackup = fs.readFileSync(gitmodulesPath, "utf8");
          }
          await runGitWithProgress(
            ["submodule", "add", "--progress", "-b", branch, authUrl, "iPlug2"],
            projectPath,
            (progress) => {
              sendProgress(0.06 + progress * 0.54, progressStage);
            },
            (child) => {
              activeInstall.child = child;
            },
          );
        } else {
          await runGitWithProgress(
            [
              "clone",
              "--progress",
              "--branch",
              branch,
              "--single-branch",
              authUrl,
              targetPath,
            ],
            projectPath,
            (progress) => {
              sendProgress(0.06 + progress * 0.54, progressStage);
            },
            (child) => {
              activeInstall.child = child;
            },
          );
        }
      } else {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-"));
        const zipPath = path.join(tmpDir, "iplug2.zip");
        const extractDir = path.join(tmpDir, "extract");
        fs.mkdirSync(extractDir, { recursive: true });

        const headers = {
          "User-Agent": "iFactory",
        };
        const zipUrl = `https://github.com/${repoFullName}/archive/refs/heads/${encodeURIComponent(
          branch,
        )}.zip`;

        await downloadFile(zipUrl, zipPath, {
          headers,
          onProgress: (progress) => {
            sendProgress(0.06 + progress * 0.54, "Downloading iPlug2...");
          },
          onRequest: (request) => {
            activeInstall.request = request;
          },
          shouldAbort: () => activeInstall?.canceled,
        });

        sendProgress(0.62, "Extracting iPlug2...");
        await expandArchive(zipPath, extractDir, (child) => {
          activeInstall.child = child;
        });
        const entries = fs.readdirSync(extractDir, { withFileTypes: true });
        const rootDir = entries.find((entry) => entry.isDirectory());
        if (!rootDir) {
          throw new Error("Archive structure invalid");
        }
        const rootPath = path.join(extractDir, rootDir.name);
        fs.renameSync(rootPath, targetPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }

      if (activeInstall.canceled) {
        throw new Error("cancelled");
      }

      await installDependencies({
        targetPath,
        event: installContext,
      });

      sendProgress(0.97, "Finalizing...");
      sendProgress(1, "Finished");
      return {
        path: targetPath,
      };
    } catch (error) {
      if (activeInstall?.canceled || error?.message === "cancelled") {
        cleanup();
        return { error: "cancelled" };
      }
      const message = String(error?.message || "");
      cleanup();
      return {
        error: "install_failed",
        details: message,
      };
    } finally {
      if (window && !window.isDestroyed()) {
        window.setProgressBar(-1);
      }
      activeInstall = null;
    }
  });

  ipcMain.handle("vst3:install", async (event, payload) => {
    if (activeInstall) {
      return { error: "install_in_progress" };
    }
    const projectPath = payload?.projectPath?.trim();
    const repoFullName =
      payload?.repoFullName?.trim() || "steinbergmedia/vst3sdk";
    const branch = payload?.branch?.trim() || "master";
    if (!projectPath || !repoFullName) {
      return { error: "missing_fields" };
    }
    if (!fs.existsSync(projectPath)) {
      return { error: "path_not_found" };
    }

    const paths = getVST3InstallPaths(projectPath);
    if (!fs.existsSync(paths.iplugRoot)) {
      return { error: "missing_iplug" };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const targetPath = paths.targetPath;

    const gitState = checkGitInstalled();
    const authUrl = `https://github.com/${repoFullName}.git`;
    let tmpDir = null;

    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(normalized === null ? -1 : normalized);
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage,
      });
    };

    const cleanup = () => {
      try {
        removePathIfExists(targetPath);
      } catch (error) {
        // ignore cleanup errors
      }
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (error) {
          // ignore cleanup errors
        }
      }
    };

    const installRequiredSubmodulesFromZip = async () => {
      const gitmodulesPath = path.join(targetPath, ".gitmodules");
      let submoduleUrls = new Map();
      if (fs.existsSync(gitmodulesPath)) {
        try {
          const content = fs.readFileSync(gitmodulesPath, "utf8");
          submoduleUrls = parseGitmodulesByPath(content);
        } catch (error) {
          submoduleUrls = new Map();
        }
      }

      let submoduleRefs = new Map();
      try {
        submoduleRefs = await loadVST3SubmoduleRefs(repoFullName, branch);
      } catch (error) {
        submoduleRefs = new Map();
      }

      const headers = getGithubHeaders();
      for (let index = 0; index < VST3_REQUIRED_SUBMODULES.length; index += 1) {
        if (activeInstall?.canceled) {
          throw new Error("cancelled");
        }
        const subPath = VST3_REQUIRED_SUBMODULES[index];
        const subUrl = submoduleUrls.get(subPath) || "";
        const subRepo =
          resolveSubmoduleRepoFullName(repoFullName, subUrl) ||
          (subPath === "vstgui4"
            ? "steinbergmedia/vstgui"
            : `steinbergmedia/vst3_${subPath.replace(/\./g, "_")}`);
        const subRef = submoduleRefs.get(subPath) || branch || "master";

        const subTmpDir = fs.mkdtempSync(path.join(tmpDir, "submodule-"));
        const zipPath = path.join(
          subTmpDir,
          `${subPath.replace(/[^\w.-]/g, "_")}.zip`,
        );
        const extractDir = path.join(subTmpDir, "extract");
        fs.mkdirSync(extractDir, { recursive: true });

        const zipUrl = `https://github.com/${subRepo}/archive/${encodeURIComponent(
          subRef,
        )}.zip`;

        const stagePrefix = `Downloading ${subPath}...`;
        await downloadFile(zipUrl, zipPath, {
          headers,
          onProgress: (progress) => {
            const itemBase = 0.58 + (index / VST3_REQUIRED_SUBMODULES.length) * 0.26;
            const itemSpan = 0.26 / VST3_REQUIRED_SUBMODULES.length;
            sendProgress(itemBase + progress * itemSpan, stagePrefix);
          },
          onRequest: (request) => {
            activeInstall.request = request;
          },
          shouldAbort: () => activeInstall?.canceled,
        });

        if (activeInstall?.canceled) {
          throw new Error("cancelled");
        }

        await expandArchive(zipPath, extractDir, (child) => {
          activeInstall.child = child;
        });
        const entries = fs.readdirSync(extractDir, { withFileTypes: true });
        const rootDir = entries.find((entry) => entry.isDirectory());
        if (!rootDir) {
          throw new Error(`Archive structure invalid for ${subRepo}`);
        }
        const rootPath = path.join(extractDir, rootDir.name);
        const subTarget = path.join(targetPath, subPath);
        fs.mkdirSync(path.dirname(subTarget), { recursive: true });
        removePathIfExists(subTarget);
        fs.renameSync(rootPath, subTarget);
        fs.rmSync(subTmpDir, { recursive: true, force: true });
      }
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null,
    };

    try {
      sendProgress(0.02, "Preparing VST3 SDK...");
      removePathIfExists(targetPath);

      if (gitState.installed) {
        sendProgress(0.08, "Cloning VST3 SDK...");
        await runGitWithProgress(
          [
            "clone",
            "--progress",
            "--branch",
            branch,
            "--single-branch",
            "--depth",
            "1",
            authUrl,
            targetPath,
          ],
          projectPath,
          (progress) => {
            sendProgress(0.08 + progress * 0.52, "Cloning VST3 SDK...");
          },
          (child) => {
            activeInstall.child = child;
          },
        );
        if (activeInstall.canceled) {
          throw new Error("cancelled");
        }

        sendProgress(0.62, "Fetching required VST3 SDK components...");
        await runGitWithProgress(
          [
            "submodule",
            "update",
            "--init",
            "--progress",
            ...VST3_REQUIRED_SUBMODULES,
          ],
          targetPath,
          (progress) => {
            sendProgress(
              0.62 + progress * 0.24,
              "Fetching required VST3 SDK components...",
            );
          },
          (child) => {
            activeInstall.child = child;
          },
        );
      } else {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-"));
        const zipPath = path.join(tmpDir, "vst3sdk.zip");
        const extractDir = path.join(tmpDir, "extract");
        fs.mkdirSync(extractDir, { recursive: true });

        const headers = {
          "User-Agent": "iFactory",
        };
        const zipUrl = `https://github.com/${repoFullName}/archive/refs/heads/${encodeURIComponent(
          branch,
        )}.zip`;

        await downloadFile(zipUrl, zipPath, {
          headers,
          onProgress: (progress) => {
            sendProgress(0.08 + progress * 0.42, "Downloading VST3 SDK...");
          },
          onRequest: (request) => {
            activeInstall.request = request;
          },
          shouldAbort: () => activeInstall?.canceled,
        });

        sendProgress(0.52, "Extracting VST3 SDK...");
        await expandArchive(zipPath, extractDir, (child) => {
          activeInstall.child = child;
        });
        const entries = fs.readdirSync(extractDir, { withFileTypes: true });
        const rootDir = entries.find((entry) => entry.isDirectory());
        if (!rootDir) {
          throw new Error("Archive structure invalid");
        }
        const rootPath = path.join(extractDir, rootDir.name);
        fs.renameSync(rootPath, targetPath);

        await installRequiredSubmodulesFromZip();
      }

      if (activeInstall.canceled) {
        throw new Error("cancelled");
      }

      sendProgress(0.9, "Finalizing VST3 SDK...");
      cleanupVST3SdkTree(targetPath);
      sendProgress(1, "Finished");
      settings.dependencies.vst3 = {
        ...settings.dependencies.vst3,
        installed: true,
        path: targetPath,
        checkedAt: new Date().toISOString(),
      };
      saveSettings();
      return {
        path: targetPath,
      };
    } catch (error) {
      if (activeInstall?.canceled || error?.message === "cancelled") {
        cleanup();
        return { error: "cancelled" };
      }
      const message = String(error?.message || "");
      cleanup();
      return {
        error: "install_failed",
        details: message,
      };
    } finally {
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (error) {
          // ignore cleanup errors
        }
      }
      if (window && !window.isDestroyed()) {
        window.setProgressBar(-1);
      }
      activeInstall = null;
    }
  });

  ipcMain.handle("skiaDocs:install", async (event, payload) => {
    if (activeInstall) {
      return { error: "install_in_progress" };
    }
    const projectPath = payload?.projectPath?.trim();
    if (!projectPath) {
      return { error: "missing_fields" };
    }
    if (!fs.existsSync(projectPath)) {
      return { error: "path_not_found" };
    }

    const iplugPath = path.join(projectPath, "iPlug2");
    if (!fs.existsSync(iplugPath)) {
      return { error: "missing_iplug" };
    }

    const installState = checkDoxygenInstalled(getDoxygenInstallDir());
    if (!installState.installed || !installState.path) {
      return { error: "doxygen_missing" };
    }

    const branch = detectSkiaBranchFromIPlug2(projectPath);
    if (!branch) {
      return { error: "skia_branch_missing" };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const outputDir = getSkiaDocsOutputDir(projectPath);
    const repoFullName = "google/skia";
    const authUrl = `https://github.com/${repoFullName}.git`;
    const gitState = checkGitInstalled();
    let projectTmpDir = null;
    let zipTmpDir = null;

    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(normalized === null ? -1 : normalized);
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage,
      });
    };

    const cleanup = (removeOutput) => {
      if (projectTmpDir) {
        removePathIfExists(projectTmpDir);
        projectTmpDir = null;
      }
      if (zipTmpDir) {
        removePathIfExists(zipTmpDir);
        zipTmpDir = null;
      }
      if (removeOutput) {
        removePathIfExists(outputDir);
      }
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null,
    };

    try {
      sendProgress(0.03, `Detecting Skia branch (${branch})...`);
      removePathIfExists(outputDir);
      projectTmpDir = fs.mkdtempSync(path.join(projectPath, ".ifactory-skia-"));
      const skiaSourcePath = path.join(projectTmpDir, "skia");

      if (gitState.installed) {
        sendProgress(0.08, `Cloning Skia (${branch})...`);
        await runGitWithProgress(
          [
            "clone",
            "--progress",
            "--depth",
            "1",
            "--branch",
            branch,
            "--single-branch",
            authUrl,
            skiaSourcePath,
          ],
          projectPath,
          (progress) => {
            sendProgress(0.08 + progress * 0.48, `Cloning Skia (${branch})...`);
          },
          (child) => {
            activeInstall.child = child;
          },
        );
      } else {
        sendProgress(0.08, `Downloading Skia (${branch})...`);
        zipTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-skia-"));
        const zipPath = path.join(zipTmpDir, "skia.zip");
        const extractDir = path.join(zipTmpDir, "extract");
        fs.mkdirSync(extractDir, { recursive: true });

        const headers = {
          "User-Agent": "iFactory",
        };
        const zipUrl = `https://github.com/${repoFullName}/archive/refs/heads/${encodeURIComponent(
          branch,
        )}.zip`;

        await downloadFile(zipUrl, zipPath, {
          headers,
          onProgress: (progress) => {
            sendProgress(0.08 + progress * 0.42, `Downloading Skia (${branch})...`);
          },
          onRequest: (request) => {
            activeInstall.request = request;
          },
          shouldAbort: () => activeInstall?.canceled,
        });

        if (activeInstall.canceled) {
          throw new Error("cancelled");
        }

        sendProgress(0.52, "Extracting Skia source...");
        await expandArchive(zipPath, extractDir, (child) => {
          activeInstall.child = child;
        });
        const entries = fs.readdirSync(extractDir, { withFileTypes: true });
        const rootDir = entries.find((entry) => entry.isDirectory());
        if (!rootDir) {
          throw new Error("Archive structure invalid");
        }
        fs.renameSync(path.join(extractDir, rootDir.name), skiaSourcePath);
      }

      if (activeInstall.canceled) {
        throw new Error("cancelled");
      }

      const doxyfilePath = path.join(skiaSourcePath, "tools", "doxygen", "Doxyfile");
      if (!fs.existsSync(doxyfilePath)) {
        throw new Error("Skia Doxyfile not found");
      }

      sendProgress(0.64, "Generating Skia docs...");
      await runDoxygenWithConfig({
        doxygenPath: installState.path,
        doxyfilePath,
        outputDir,
        cwd: path.dirname(doxyfilePath),
        onChild: (child) => {
          activeInstall.child = child;
        },
      });

      if (activeInstall.canceled) {
        throw new Error("cancelled");
      }

      let outputEntries = [];
      try {
        outputEntries = fs.existsSync(outputDir)
          ? fs.readdirSync(outputDir)
          : [];
      } catch (error) {
        outputEntries = [];
      }
      const sqliteDbPath = getSkiaDocsDbPath(projectPath);
      if (!fs.existsSync(sqliteDbPath)) {
        throw new Error(
          "Skia docs database was not generated in the expected output path.",
        );
      }

      sendProgress(0.96, "Cleaning temporary Skia source...");
      cleanup(false);
      sendProgress(1, "Finished");
      settings.dependencies.skiaDocs = {
        ...settings.dependencies.skiaDocs,
        installed: true,
        path: outputDir,
        branch,
        checkedAt: new Date().toISOString(),
      };
      saveSettings();
      return {
        path: outputDir,
        branch,
      };
    } catch (error) {
      const message = String(error?.message || "");
      if (activeInstall?.canceled || message === "cancelled") {
        cleanup(true);
        return { error: "cancelled" };
      }
      cleanup(true);
      return {
        error: "install_failed",
        details: message,
      };
    } finally {
      if (window && !window.isDestroyed()) {
        window.setProgressBar(-1);
      }
      activeInstall = null;
    }
  });

  ipcMain.handle("edsp:install", async (event, payload) => {
    if (activeInstall) {
      return { error: "install_in_progress" };
    }
    const projectPath = payload?.projectPath?.trim();
    const repoFullName = payload?.repoFullName?.trim() || "mohabouje/eDSP";
    const branch = payload?.branch?.trim() || "master";
    if (!projectPath || !repoFullName) {
      return { error: "missing_fields" };
    }
    if (!fs.existsSync(projectPath)) {
      return { error: "path_not_found" };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const targetPath = path.join(projectPath, "eDSP");
    if (fs.existsSync(targetPath)) {
      return { error: "already_exists" };
    }

    const gitState = checkGitInstalled();
    const hasGitFolder = fs.existsSync(path.join(projectPath, ".git"));
    const isRepo = gitState.installed ? isGitRepo(projectPath) : hasGitFolder;
    if (!gitState.installed && isRepo) {
      return { error: "git_required" };
    }

    const authUrl = `https://github.com/${repoFullName}.git`;
    let tmpDir = null;
    let gitmodulesBackup = null;
    let usedSubmodule = false;

    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(normalized === null ? -1 : normalized);
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage,
      });
    };

    const cleanup = () => {
      try {
        if (usedSubmodule && gitState.installed) {
          try {
            runGit(["submodule", "deinit", "-f", "eDSP"], projectPath);
          } catch (error) {
            // ignore cleanup errors
          }
          try {
            runGit(["rm", "-f", "eDSP"], projectPath);
          } catch (error) {
            // ignore cleanup errors
          }
          try {
            fs.rmSync(path.join(projectPath, ".git", "modules", "eDSP"), {
              recursive: true,
              force: true,
            });
          } catch (error) {
            // ignore cleanup errors
          }
          const gitmodulesPath = path.join(projectPath, ".gitmodules");
          if (gitmodulesBackup === null && fs.existsSync(gitmodulesPath)) {
            fs.rmSync(gitmodulesPath, { force: true });
          }
          if (typeof gitmodulesBackup === "string") {
            fs.writeFileSync(gitmodulesPath, gitmodulesBackup);
          }
        }
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
      } catch (error) {
        // ignore cleanup errors
      }
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (error) {
          // ignore cleanup errors
        }
      }
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null,
    };

    try {
      sendProgress(0.02, "Preparing eDSP...");

      if (gitState.installed) {
        const progressStage = isRepo
          ? "Adding eDSP as submodule..."
          : "Cloning eDSP...";
        sendProgress(0.06, progressStage);

        if (isRepo) {
          usedSubmodule = true;
          const gitmodulesPath = path.join(projectPath, ".gitmodules");
          if (fs.existsSync(gitmodulesPath)) {
            gitmodulesBackup = fs.readFileSync(gitmodulesPath, "utf8");
          }
          await runGitWithProgress(
            ["submodule", "add", "--progress", "-b", branch, authUrl, "eDSP"],
            projectPath,
            (progress) => {
              sendProgress(0.06 + progress * 0.82, progressStage);
            },
            (child) => {
              activeInstall.child = child;
            },
          );
        } else {
          await runGitWithProgress(
            [
              "clone",
              "--progress",
              "--branch",
              branch,
              "--single-branch",
              authUrl,
              targetPath,
            ],
            projectPath,
            (progress) => {
              sendProgress(0.06 + progress * 0.82, progressStage);
            },
            (child) => {
              activeInstall.child = child;
            },
          );
        }
      } else {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-"));
        const zipPath = path.join(tmpDir, "edsp.zip");
        const extractDir = path.join(tmpDir, "extract");
        fs.mkdirSync(extractDir, { recursive: true });

        const headers = {
          "User-Agent": "iFactory",
        };
        const zipUrl = `https://github.com/${repoFullName}/archive/refs/heads/${encodeURIComponent(
          branch,
        )}.zip`;

        await downloadFile(zipUrl, zipPath, {
          headers,
          onProgress: (progress) => {
            sendProgress(0.06 + progress * 0.82, "Downloading eDSP...");
          },
          onRequest: (request) => {
            activeInstall.request = request;
          },
          shouldAbort: () => activeInstall?.canceled,
        });

        sendProgress(0.9, "Extracting eDSP...");
        await expandArchive(zipPath, extractDir, (child) => {
          activeInstall.child = child;
        });
        const entries = fs.readdirSync(extractDir, { withFileTypes: true });
        const rootDir = entries.find((entry) => entry.isDirectory());
        if (!rootDir) {
          throw new Error("Archive structure invalid");
        }
        const rootPath = path.join(extractDir, rootDir.name);
        fs.renameSync(rootPath, targetPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }

      if (activeInstall.canceled) {
        throw new Error("cancelled");
      }

      sendProgress(0.97, "Finalizing...");
      sendProgress(1, "Finished");
      settings.dependencies.edsp = {
        ...settings.dependencies.edsp,
        installed: true,
        path: targetPath,
        checkedAt: new Date().toISOString(),
      };
      saveSettings();
      return {
        path: targetPath,
      };
    } catch (error) {
      if (activeInstall?.canceled || error?.message === "cancelled") {
        cleanup();
        return { error: "cancelled" };
      }
      const message = String(error?.message || "");
      cleanup();
      return {
        error: "install_failed",
        details: message,
      };
    } finally {
      if (window && !window.isDestroyed()) {
        window.setProgressBar(-1);
      }
      activeInstall = null;
    }
  });

  ipcMain.handle("iplug:installDependencies", async (event, payload) => {
    if (activeInstall) {
      return { error: "install_in_progress" };
    }
    const projectPath = payload?.projectPath?.trim();
    if (!projectPath) {
      return { error: "missing_fields" };
    }
    if (!fs.existsSync(projectPath)) {
      return { error: "path_not_found" };
    }
    const targetPath = path.join(projectPath, "iPlug2");
    if (!fs.existsSync(targetPath)) {
      return { error: "missing_iplug" };
    }
    const depsConfig = getDepsConfig();
    const buildDir = path.join(targetPath, "Dependencies", "Build");

    const cleanupDeps = () => {
      if (!depsConfig.folder) {
        return;
      }
      try {
        fs.rmSync(path.join(buildDir, depsConfig.folder), {
          recursive: true,
          force: true,
        });
        fs.rmSync(path.join(buildDir, "src"), {
          recursive: true,
          force: true,
        });
      } catch (error) {
        // ignore cleanup errors
      }
    };

    const window = BrowserWindow.fromWebContents(event.sender);
    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(normalized === null ? -1 : normalized);
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage,
      });
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null,
    };

    try {
      sendProgress(0.05, "Preparing dependencies...");
      await installDependencies({
        targetPath,
        event: {
          sendProgress,
          setRequest: (request) => {
            activeInstall.request = request;
          },
          setChild: (child) => {
            activeInstall.child = child;
          },
          isCanceled: () => activeInstall?.canceled,
        },
      });
      sendProgress(1, "Finished");
      return { path: targetPath };
    } catch (error) {
      if (activeInstall?.canceled || error?.message === "cancelled") {
        cleanupDeps();
        return { error: "cancelled" };
      }
      cleanupDeps();
      return {
        error: "install_failed",
        details: String(error?.message || ""),
      };
    } finally {
      if (window && !window.isDestroyed()) {
        window.setProgressBar(-1);
      }
      activeInstall = null;
    }
  });

  ipcMain.handle("iplug:cancel", () => {
    if (!activeInstall) {
      return false;
    }
    activeInstall.canceled = true;
    if (activeInstall.request) {
      activeInstall.request.destroy(new Error("cancelled"));
    }
    if (activeInstall.child) {
      activeInstall.child.kill();
    }
    return true;
  });

  ipcMain.handle("settings:update", () => {
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
    icon: path.join(__dirname, "icons", "logo.ico"),
    backgroundColor: "#0b0f14",
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.once("ready-to-show", () => window.show());
  window.loadFile(path.join(__dirname, "renderer", "index.html"));
};

if (!isCliMode) {
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
}
