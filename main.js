const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const https = require("https");
const os = require("os");
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
  dependencies: {
    git: {
      installed: false,
      skipped: false,
      version: "",
      checkedAt: null
    },
    codex: {
      installed: false,
      version: "",
      checkedAt: null
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
  if (settings?.dependencies?.git) {
    Object.assign(merged.dependencies.git, settings.dependencies.git);
  }
  if (settings?.dependencies?.codex) {
    Object.assign(merged.dependencies.codex, settings.dependencies.codex);
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

const downloadFile = (
  urlString,
  destPath,
  { headers = {}, redirectCount = 0, onProgress, onRequest, shouldAbort } = {}
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
        headers
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
              redirectCount: redirectCount + 1
            })
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
      }
    );

    request.on("error", reject);
    request.end();
  });

const expandArchive = (zipPath, destDir, onChild) =>
  new Promise((resolve, reject) => {
    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedDest = destDir.replace(/'/g, "''");
    const command = `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`;
    const child = spawn(
      "powershell",
      ["-NoProfile", "-Command", command],
      {
        encoding: "utf8",
        windowsHide: true
      }
    );
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

const getDepsConfig = () => {
  const platform = process.platform;
  if (platform === "darwin") {
    return { zipFile: "IPLUG2_DEPS_MAC", folder: "mac" };
  }
  if (platform === "win32") {
    return { zipFile: "IPLUG2_DEPS_WIN", folder: "win" };
  }
  if (platform === "linux") {
    return { zipFile: "", folder: "" };
  }
  return { zipFile: "", folder: "" };
};

const getDepsBuildPath = (iplugPath) => {
  const config = getDepsConfig();
  if (!config.folder) {
    return "";
  }
  return path.join(iplugPath, "Dependencies", "Build", config.folder);
};

const copyDirectory = (source, target, onProgress, isCanceled) => {
  const dirs = [];
  const files = [];

  const walk = (dir) => {
    if (isCanceled?.()) {
      throw new Error("cancelled");
    }
    dirs.push(dir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    });
  };

  walk(source);

  dirs.forEach((dir) => {
    if (isCanceled?.()) {
      throw new Error("cancelled");
    }
    const relative = path.relative(source, dir);
    const targetDir = path.join(target, relative);
    fs.mkdirSync(targetDir, { recursive: true });
  });

  const total = files.length;
  files.forEach((file, index) => {
    if (isCanceled?.()) {
      throw new Error("cancelled");
    }
    const relative = path.relative(source, file);
    const targetFile = path.join(target, relative);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(file, targetFile);
    if (onProgress) {
      const progress = total ? (index + 1) / total : 1;
      onProgress(progress);
    }
  });
};

const FILTERED_FILE_EXTENSIONS = new Set([
  ".ico",
  ".icns",
  ".pdf",
  ".png",
  ".zip",
  ".exe",
  ".wav",
  ".aif"
]);

const SUBFOLDERS_TO_SEARCH = new Set([
  "projects",
  "config",
  "resources",
  "installer",
  "scripts",
  "manual",
  "xcschemes",
  "xcshareddata",
  "xcuserdata",
  "en-osx.lproj",
  "project.xcworkspace",
  "Images.xcassets",
  "web-ui",
  "ui",
  "UI",
  "DSP"
]);

const replaceAll = (value, search, replacement) => {
  if (!search) {
    return value;
  }
  return value.split(search).join(replacement);
};

const extractIPlugRoot = (content) => {
  const lineMatch = content.match(/^\s*IPLUG2_ROOT\s*=\s*(.+)\s*$/m);
  if (lineMatch) {
    return lineMatch[1].trim();
  }
  const xmlMatch = content.match(/<IPLUG2_ROOT>\s*([^<]+)\s*<\/IPLUG2_ROOT>/);
  if (xmlMatch) {
    return xmlMatch[1].trim();
  }
  return "";
};

const getTemplateIPlugRoot = (configDir, templateName) => {
  const candidates = [
    path.join(configDir, `${templateName}-mac.xcconfig`),
    path.join(configDir, `${templateName}-ios.xcconfig`),
    path.join(configDir, `${templateName}-win.props`),
    path.join(configDir, `${templateName}-web.mk`)
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const root = extractIPlugRoot(content);
      if (root) {
        return root;
      }
    } catch (error) {
      // ignore config read errors
    }
  }
  return "";
};

const getOutOfSourceRoot = (projectPath, targetPath) => {
  const configPath = path.join(targetPath, "config");
  const iplugPath = path.join(projectPath, "iPlug2");
  let relativePath = path.relative(configPath, iplugPath);
  if (!relativePath) {
    return "";
  }
  return relativePath.split(path.sep).join("/");
};

const patchPostbuildScript = (projectPath) => {
  const scriptPath = path.join(projectPath, "scripts", "postbuild-win.bat");
  if (!fs.existsSync(scriptPath)) {
    return;
  }
  const content = fs.readFileSync(scriptPath, "utf8");
  const lines = content.split(/\r?\n/);
  const pathVars = new Set([
    "BUILT_BINARY",
    "VST2_ARM64EC_PATH",
    "VST2_X64_PATH",
    "VST3_ARM64EC_PATH",
    "VST3_X64_PATH",
    "AAX_ARM64EC_PATH",
    "AAX_X64_PATH",
    "CLAP_ARM64EC_PATH",
    "CLAP_X64_PATH",
    "BUILD_DIR",
    "VST_ICON",
    "AAX_ICON",
    "CREATE_BUNDLE_SCRIPT",
    "ICUDAT_PATH"
  ]);
  let changed = false;
  const patched = lines.map((line) => {
    let updated = line.replace(/""(%[A-Z0-9_]+%[^"]*)""/g, "\"$1\"");
    updated = updated.replace(
      /^(\s*set\s+)([A-Z0-9_]+)(\s*=\s*)%(\d+)\s*$/i,
      (match, prefix, name, equals, index) => {
        if (!pathVars.has(name.toUpperCase())) {
          return match;
        }
        changed = true;
        return `${prefix}"${name}=%~${index}"`;
      }
    );
    const trimmed = updated.trimLeft();
    if (/^for\s+%%[A-Z]\s+in\s*\(/i.test(trimmed)) {
      updated = updated.replace(
        /for\s+(%%[A-Z])\s+in\s*\(([^)]+)\)\s+do/i,
        (match, iterator, inner) => {
          const innerTrim = inner.trim();
          if (innerTrim.startsWith("\"")) {
            return match;
          }
          return `for ${iterator} in ("${innerTrim}") do`;
        }
      );
    }
    if (!/^(copy|xcopy|call|if\s+exist)\b/i.test(trimmed)) {
      if (updated !== line) {
        changed = true;
      }
      return updated;
    }
    const replaced = updated.replace(
      /%[A-Z0-9_]+%(?:[^\s"]*)/g,
      (token, offset) => {
        const before = updated[offset - 1];
        const after = updated[offset + token.length];
        if (before === "\"" || after === "\"") {
          return token;
        }
        return `"${token}"`;
      }
    );
    if (/^\s*if\s+%[A-Z0-9_]+%\s+==/i.test(updated)) {
      const normalized = updated.replace(
        /^\s*if\s+%([A-Z0-9_]+)%\s+==/i,
        'if "%$1%" =='
      );
      if (normalized !== updated) {
        updated = normalized;
        changed = true;
      }
    }
    if (replaced !== line) {
      changed = true;
    }
    return replaced;
  });
  if (changed) {
    fs.writeFileSync(scriptPath, patched.join(os.EOL));
  }
};

const patchCreateBundleScript = (projectPath) => {
  const scriptPath = path.join(projectPath, "iPlug2", "Scripts", "create_bundle.bat");
  if (!fs.existsSync(scriptPath)) {
    return;
  }
  const content = fs.readFileSync(scriptPath, "utf8");
  let updated = content;

  updated = updated.replace(/SET\s+BundleDir="([^"]*)"/i, "SET \"BundleDir=$1\"");
  updated = updated.replace(/SET\s+IconSource="([^"]*)"/i, "SET \"IconSource=$1\"");
  updated = updated.replace(/SET\s+Format=([^\r\n]+)/i, "SET \"Format=$1\"");

  const replacements = [
    [/IF\s+EXIST\s+%BundleDir%/gi, "IF EXIST \"%BundleDir%\""],
    [/mkdir\s+%BundleDir%/gi, "mkdir \"%BundleDir%\""],
    [/IF\s+EXIST\s+%BundleDir%\\Contents\\%X86%/gi, "IF EXIST \"%BundleDir%\\Contents\\%X86%\""],
    [/mkdir\s+%BundleDir%\\Contents\\%X86%/gi, "mkdir \"%BundleDir%\\Contents\\%X86%\""],
    [/IF\s+EXIST\s+%BundleDir%\\Contents\\%X86_64%/gi, "IF EXIST \"%BundleDir%\\Contents\\%X86_64%\""],
    [/mkdir\s+%BundleDir%\\Contents\\%X86_64%/gi, "mkdir \"%BundleDir%\\Contents\\%X86_64%\""],
    [/IF\s+EXIST\s+%BundleDir%\\Contents\\Resources/gi, "IF EXIST \"%BundleDir%\\Contents\\Resources\""],
    [/mkdir\s+%BundleDir%\\Contents\\Resources/gi, "mkdir \"%BundleDir%\\Contents\\Resources\""],
    [/IF\s+EXIST\s+%BundleDir%\\PlugIn\.ico/gi, "IF EXIST \"%BundleDir%\\PlugIn.ico\""],
    [/copy\s+\/Y\s+%IconSource%\s+%BundleDir%\\PlugIn\.ico/gi, "copy /Y \"%IconSource%\" \"%BundleDir%\\PlugIn.ico\""],
    [/IF\s+EXIST\s+%BundleDir%\\desktop\.ini/gi, "IF EXIST \"%BundleDir%\\desktop.ini\""],
    [/attrib\s+-h\s+-r\s+-s\s+%BundleDir%\\desktop\.ini/gi, "attrib -h -r -s \"%BundleDir%\\desktop.ini\""],
    [/attrib\s+-r\s+%BundleDir%/gi, "attrib -r \"%BundleDir%\""],
    [/echo\s+\[\.ShellClassInfo\]\s+>\s+%BundleDir%\\desktop\.ini/gi, "echo [.ShellClassInfo] > \"%BundleDir%\\desktop.ini\""],
    [/echo\s+IconResource=PlugIn\.ico,0\s+>>\s+%BundleDir%\\desktop\.ini/gi, "echo IconResource=PlugIn.ico,0 >> \"%BundleDir%\\desktop.ini\""],
    [/echo\s+;For compatibility with Windows XP\s+>>\s+%BundleDir%\\desktop\.ini/gi, "echo ;For compatibility with Windows XP >> \"%BundleDir%\\desktop.ini\""],
    [/echo\s+IconFile=PlugIn\.ico\s+>>\s+%BundleDir%\\desktop\.ini/gi, "echo IconFile=PlugIn.ico >> \"%BundleDir%\\desktop.ini\""],
    [/echo\s+IconIndex=0\s+>>\s+%BundleDir%\\desktop\.ini/gi, "echo IconIndex=0 >> \"%BundleDir%\\desktop.ini\""],
    [/attrib\s+\+h\s+\+r\s+\+s\s+%BundleDir%\\PlugIn\.ico/gi, "attrib +h +r +s \"%BundleDir%\\PlugIn.ico\""],
    [/attrib\s+\+h\s+\+r\s+\+s\s+%BundleDir%\\desktop\.ini/gi, "attrib +h +r +s \"%BundleDir%\\desktop.ini\""],
    [/attrib\s+\+r\s+%BundleDir%/gi, "attrib +r \"%BundleDir%\""]
  ];

  replacements.forEach(([pattern, replacement]) => {
    updated = updated.replace(pattern, replacement);
  });

  updated = updated.replace(/if\s+%Format%\s+==/gi, "if \"%Format%\" ==");

  if (updated !== content) {
    fs.writeFileSync(scriptPath, updated);
  }
};

const updateFileContents = (
  filePath,
  searchProject,
  replaceProject,
  searchMan,
  replaceMan,
  oldRoot,
  newRoot
) => {
  const ext = path.extname(filePath).toLowerCase();
  if (FILTERED_FILE_EXTENSIONS.has(ext)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  let updated = content;
  updated = replaceAll(updated, searchProject, replaceProject);
  updated = replaceAll(
    updated,
    searchProject.toUpperCase(),
    replaceProject.toUpperCase()
  );
  updated = replaceAll(updated, searchMan, replaceMan);
  if (oldRoot && newRoot) {
    updated = replaceAll(updated, oldRoot, newRoot);
    updated = replaceAll(
      updated,
      oldRoot.replace(/\//g, "\\"),
      newRoot.replace(/\//g, "\\")
    );
  }
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
  }
};

const renameTemplateContents = (
  dir,
  searchProject,
  replaceProject,
  searchMan,
  replaceMan,
  oldRoot,
  newRoot
) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      let renamedPath = "";
      if (entry.name === `${searchProject}-macOS.xcodeproj`) {
        renamedPath = path.join(dir, `${replaceProject}-macOS.xcodeproj`);
      } else if (entry.name === `${searchProject}-iOS.xcodeproj`) {
        renamedPath = path.join(dir, `${replaceProject}-iOS.xcodeproj`);
      } else if (entry.name === `${searchProject}.xcworkspace`) {
        renamedPath = path.join(dir, `${replaceProject}.xcworkspace`);
      } else if (entry.name === `${searchProject}iOSAppIcon.appiconset`) {
        renamedPath = path.join(
          dir,
          `${replaceProject}iOSAppIcon.appiconset`
        );
      }

      if (renamedPath) {
        fs.renameSync(fullPath, renamedPath);
        renameTemplateContents(
          renamedPath,
          searchProject,
          replaceProject,
          searchMan,
          replaceMan,
          oldRoot,
          newRoot
        );
        return;
      }

      if (SUBFOLDERS_TO_SEARCH.has(entry.name)) {
        renameTemplateContents(
          fullPath,
          searchProject,
          replaceProject,
          searchMan,
          replaceMan,
          oldRoot,
          newRoot
        );
      }
      return;
    }

    if (!entry.isFile()) {
      return;
    }

    updateFileContents(
      fullPath,
      searchProject,
      replaceProject,
      searchMan,
      replaceMan,
      oldRoot,
      newRoot
    );

    const newFilename = entry.name.replace(searchProject, replaceProject);
    if (newFilename !== entry.name) {
      fs.renameSync(fullPath, path.join(dir, newFilename));
    }
  });
};

const formatTemplateName = (folderName) => {
  if (!folderName) {
    return "";
  }
  let name = folderName;
  if (name.startsWith("IPlug")) {
    name = name.slice(5);
  }
  if (!name) {
    return folderName;
  }
  let output = "";
  const lastIndex = name.length - 1;
  for (let i = 0; i < name.length; i += 1) {
    const ch = name[i];
    const next = i < lastIndex ? name[i + 1] : "";
    const prev = i > 0 ? name[i - 1] : "";
    const isUpper = ch >= "A" && ch <= "Z";
    if (i > 0 && isUpper) {
      const isTrailingUI = ch === "U" && next === "I" && i + 1 === lastIndex;
      const isTrailingUIEnd = ch === "I" && prev === "U" && i === lastIndex;
      const isOSCSequence =
        ch === "O" && next === "S" && name[i + 2] === "C";
      const isOSCEnd = ch === "S" && prev === "O" && next === "C";
      const isOSCFinal = ch === "C" && prev === "S";
      if (!isTrailingUI && !isTrailingUIEnd && !isOSCSequence && !isOSCEnd && !isOSCFinal) {
        output += " ";
      }
    }
    output += ch;
  }
  return output.trim() || folderName;
};

const sanitizeSettings = (settings) => {
  const sanitized = cloneSettings(settings);
  const github = sanitized.integrations.github;
  github.tokenStored = Boolean(github.token);
  delete github.token;
  return sanitized;
};

let settings = null;
let activeInstall = null;

const saveSettings = () => {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const runGit = (args, cwd) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || "Git command failed");
  }
};

const runGitWithProgress = (args, cwd, onProgress, onChild) =>
  new Promise((resolve, reject) => {
    let stderr = "";
    const child = spawn("git", args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0"
      }
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
    windowsHide: true
  });
  return result.status === 0;
};

const checkGitInstalled = () => {
  const result = spawnSync("git", ["--version"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    return { installed: false, version: "" };
  }
  const match = String(result.stdout || "").match(/git version ([^\s]+)/i);
  return {
    installed: true,
    version: match ? match[1] : String(result.stdout || "").trim()
  };
};

const checkCodexInstalled = () => {
  const tryResult = (result) => {
    if (result.error || result.status !== 0) {
      return null;
    }
    const output = String(result.stdout || result.stderr || "").trim();
    return {
      installed: true,
      version: output
    };
  };

  const direct = spawnSync("codex", ["--version"], {
    encoding: "utf8",
    windowsHide: true
  });
  const directResult = tryResult(direct);
  if (directResult) {
    return directResult;
  }

  const cmdResult = spawnSync("cmd", ["/c", "codex", "--version"], {
    encoding: "utf8",
    windowsHide: true
  });
  const cmdParsed = tryResult(cmdResult);
  if (cmdParsed) {
    return cmdParsed;
  }

  const whereResult = spawnSync("cmd", ["/c", "where", "codex"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (!whereResult.error && whereResult.status === 0) {
    return { installed: true, version: "" };
  }

  return { installed: false, version: "" };
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
  ipcMain.handle("git:check", () => {
    const result = checkGitInstalled();
    settings.dependencies.git = {
      ...settings.dependencies.git,
      installed: result.installed,
      skipped: false,
      version: result.version || "",
      checkedAt: new Date().toISOString()
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
      checkedAt: new Date().toISOString()
    };
    saveSettings();
    return settings.dependencies.git;
  });
  ipcMain.handle("codex:check", () => {
    const result = checkCodexInstalled();
    settings.dependencies.codex = {
      ...settings.dependencies.codex,
      installed: result.installed,
      version: result.version || "",
      checkedAt: new Date().toISOString()
    };
    saveSettings();
    return settings.dependencies.codex;
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
      (item) => item?.path !== removePath
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

      if (createRepo) {
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
            "__pycache__"
          ];
          fs.writeFileSync(gitignorePath, gitignoreLines.join(os.EOL));
        }
      }

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
        if (repoUrl) {
          runGit(["init"], projectPath);
          runGit(["remote", "add", "origin", repoUrl], projectPath);
        }
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
      let needsDependencies = false;
      if (!needsIPlug) {
        const depsPath = getDepsBuildPath(iPlugPath);
        needsDependencies = !depsPath || !fs.existsSync(depsPath);
      }
      pushRecentProject({ projectPath });
      return { path: projectPath, needsIPlug, needsDependencies };
    } catch (error) {
      return { error: "open_failed" };
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
                      "$1"
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
            description
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
      templateFolder
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
        stage
      });
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null
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
        () => activeInstall?.canceled
      );
      if (activeInstall?.canceled) {
        cleanupTarget();
        return { error: "cancelled" };
      }
      const needsRename = templateFolder !== name;
      const needsRootUpdate = Boolean(oldRoot && newRoot && oldRoot !== newRoot);
      if (needsRename || needsRootUpdate) {
        sendProgress(
          0.7,
          needsRename ? "Renaming project..." : "Updating project references..."
        );
        renameTemplateContents(
          targetPath,
          templateFolder,
          name,
          "AcmeInc",
          manufacturer,
          oldRoot,
          newRoot
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

  const installDependencies = async ({ targetPath, event, token }) => {
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
          event.sendProgress(0.68 + progress * 0.2, "Downloading dependencies...");
        },
        onRequest: (request) => {
          event.setRequest(request);
        },
        shouldAbort: () => event.isCanceled()
      }
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
      withFileTypes: true
    });
    const depsRootDir = depsRootEntries.find((entry) => entry.isDirectory());
    if (!depsRootDir) {
      throw new Error("Dependencies archive invalid");
    }
    const depsRootPath = path.join(depsExtractDir, depsRootDir.name);
    const buildDir = path.join(depsDir, "Build");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.rmSync(path.join(buildDir, config.folder), { recursive: true, force: true });
    fs.rmSync(path.join(buildDir, "src"), { recursive: true, force: true });

    const depsEntries = fs.readdirSync(depsRootPath, {
      withFileTypes: true
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
    const token = settings?.integrations?.github?.token || "";
    const hasGitFolder = fs.existsSync(path.join(projectPath, ".git"));
    const isRepo = gitState.installed
      ? isGitRepo(projectPath)
      : hasGitFolder;
    if (!gitState.installed && isRepo) {
      return { error: "git_required" };
    }

    const sanitizedUrl = `https://github.com/${repoFullName}.git`;
    const tokenValue = token ? encodeURIComponent(token) : "";
    const authUrl = tokenValue
      ? `https://x-access-token:${tokenValue}@github.com/${repoFullName}.git`
      : sanitizedUrl;
    let tmpDir = null;
    let gitmodulesBackup = null;
    let usedSubmodule = false;

    const sendProgress = (progress, stage) => {
      const normalized = Number.isFinite(progress)
        ? Math.max(0, Math.min(progress, 1))
        : null;
      if (window && !window.isDestroyed()) {
        window.setProgressBar(
          normalized === null ? -1 : normalized
        );
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage
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
      isCanceled: () => activeInstall?.canceled
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
            fs.rmSync(
              path.join(projectPath, ".git", "modules", "iPlug2"),
              { recursive: true, force: true }
            );
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
      request: null
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
            [
              "submodule",
              "add",
              "--progress",
              "-b",
              branch,
              authUrl,
              "iPlug2"
            ],
            projectPath,
            (progress) => {
              sendProgress(0.06 + progress * 0.54, progressStage);
            },
            (child) => {
              activeInstall.child = child;
            }
          );
          if (tokenValue) {
            runGit(["submodule", "set-url", "iPlug2", sanitizedUrl], projectPath);
            runGit(["submodule", "sync", "--", "iPlug2"], projectPath);
          }
        } else {
          await runGitWithProgress(
            [
              "clone",
              "--progress",
              "--branch",
              branch,
              "--single-branch",
              authUrl,
              targetPath
            ],
            projectPath,
            (progress) => {
              sendProgress(0.06 + progress * 0.54, progressStage);
            },
            (child) => {
              activeInstall.child = child;
            }
          );
          if (tokenValue) {
            runGit(["remote", "set-url", "origin", sanitizedUrl], targetPath);
          }
        }
      } else {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-"));
        const zipPath = path.join(tmpDir, "iplug2.zip");
        const extractDir = path.join(tmpDir, "extract");
        fs.mkdirSync(extractDir, { recursive: true });

        const headers = {
          "User-Agent": "iFactory"
        };
        let zipUrl = `https://github.com/${repoFullName}/archive/refs/heads/${encodeURIComponent(
          branch
        )}.zip`;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          zipUrl = `https://api.github.com/repos/${repoFullName}/zipball/${encodeURIComponent(
            branch
          )}`;
        }

        try {
          await downloadFile(zipUrl, zipPath, {
            headers,
            onProgress: (progress) => {
              sendProgress(0.06 + progress * 0.54, "Downloading iPlug2...");
            },
            onRequest: (request) => {
              activeInstall.request = request;
            },
            shouldAbort: () => activeInstall?.canceled
          });
        } catch (error) {
          if (!token) {
            return { error: "github_required" };
          }
          throw error;
        }

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
        token
      });

      sendProgress(0.97, "Finalizing...");
      sendProgress(1, "Finished");
      return {
        path: targetPath
      };
    } catch (error) {
      if (activeInstall?.canceled || error?.message === "cancelled") {
        cleanup();
        return { error: "cancelled" };
      }
      const message = String(error?.message || "");
      const authError =
        !token &&
        /authentication|access denied|repository not found|not found|permission|could not read username/i.test(
          message
        );
      if (authError) {
        cleanup();
        return { error: "github_required" };
      }
      cleanup();
      return {
        error: "install_failed",
        details: message
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
          force: true
        });
        fs.rmSync(path.join(buildDir, "src"), {
          recursive: true,
          force: true
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
        window.setProgressBar(
          normalized === null ? -1 : normalized
        );
      }
      event.sender.send("iplug:progress", {
        progress: normalized,
        stage
      });
    };

    activeInstall = {
      canceled: false,
      child: null,
      request: null
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
          isCanceled: () => activeInstall?.canceled
        },
        token: settings?.integrations?.github?.token || ""
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
        details: String(error?.message || "")
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
