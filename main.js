const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const https = require("https");
const net = require("net");
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
    codex: {
      installed: false,
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
    Object.assign(merged.integrations.github, settings.integrations.github);
  }
  if (settings?.dependencies?.git) {
    Object.assign(merged.dependencies.git, settings.dependencies.git);
  }
  if (settings?.dependencies?.codex) {
    Object.assign(merged.dependencies.codex, settings.dependencies.codex);
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

const loadPrompts = () => {
  const raw = fs.readFileSync(path.join(__dirname, "prompts.json"), "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed?.codex?.system || !Array.isArray(parsed.codex.system)) {
    throw new Error("prompts.json is missing codex.system");
  }
  return parsed;
};

const getAgentPipePath = () => "\\\\.\\pipe\\ifactory-agent";

const playAgentPingSound = () => {
  const windir = process.env.WINDIR || "C:\\Windows";
  const soundPath = path.join(windir, "Media", "Windows Hardware Fail.wav");
  const command = `(New-Object Media.SoundPlayer '${soundPath.replace(/'/g, "''")}').PlaySync()`;
  spawn("powershell", ["-NoProfile", "-Command", command], {
    windowsHide: true,
    stdio: "ignore",
  });
};

const broadcastAgentPing = () => {
  playAgentPingSound();
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("agent:ping");
    }
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

const startAgentServer = () => {
  if (agentServer) {
    return;
  }
  try {
    agentServer = net.createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk;
        if (!buffer.includes("\n")) {
          return;
        }
        const [line] = buffer.split(/\r?\n/);
        buffer = "";
        const trimmed = line.trim();
        const tabTokens = trimmed.includes("\t")
          ? trimmed.split("\t").map((token) => token.trim())
          : null;
        const cmd = (tabTokens ? tabTokens[0] : trimmed.split(" ")[0] || "")
          .toLowerCase()
          .trim();
        const arg = tabTokens
          ? tabTokens.slice(1)
          : trimmed.slice(cmd.length).trim();
        if (cmd === "ping") {
          broadcastAgentPing();
          socket.write("ok\n");
        } else if (cmd === "templates") {
          const result = listTemplatesForProject(currentProjectPath);
          if (result.error) {
            socket.write(`error:${result.error}\n`);
          } else {
            const lines = result.templates.map((template) => {
              const description = template.description || "";
              return description
                ? `${template.folder}: ${description}`
                : `${template.folder}`;
            });
            socket.write(`${lines.join("\n")}\n`);
          }
        } else if (cmd === "create") {
          if (activeInstall) {
            socket.write("error:install_in_progress\n");
            socket.end();
            return;
          }
          const parts = Array.isArray(arg)
            ? arg.filter(Boolean)
            : arg.split(/\s+/).filter(Boolean);
          const templateInput = parts[0];
          const name = parts[1] || templateInput;
          const resolved = resolveTemplateFolder(
            currentProjectPath,
            templateInput,
          );
          if (resolved.error) {
            socket.write(`error:${resolved.error}\n`);
            socket.end();
            return;
          }
          if (!currentProjectPath || !resolved.folder || !name) {
            socket.write("error:missing_fields\n");
            socket.end();
            return;
          }
          if (/[^a-zA-Z0-9]/.test(name)) {
            socket.write("error:invalid_name\n");
            socket.end();
            return;
          }
          const sourcePath = path.join(
            currentProjectPath,
            "iPlug2",
            "Examples",
            resolved.folder,
          );
          if (!fs.existsSync(sourcePath)) {
            socket.write("error:template_missing\n");
            socket.end();
            return;
          }
          const targetPath = path.join(currentProjectPath, name);
          if (fs.existsSync(targetPath)) {
            socket.write("error:already_exists\n");
            socket.end();
            return;
          }
          const configDir = path.join(sourcePath, "config");
          const oldRoot = getTemplateIPlugRoot(configDir, resolved.folder);
          const newRoot = getOutOfSourceRoot(currentProjectPath, targetPath);
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
            copyDirectory(sourcePath, targetPath, null, () => false);
            const needsRename = resolved.folder !== name;
            const needsRootUpdate = Boolean(
              oldRoot && newRoot && oldRoot !== newRoot,
            );
            if (needsRename || needsRootUpdate) {
              renameTemplateContents(
                targetPath,
                resolved.folder,
                name,
                "AcmeInc",
                "AcmeInc",
                oldRoot,
                newRoot,
              );
            }
            patchPostbuildScript(targetPath);
            patchCreateBundleScript(currentProjectPath);
            broadcastProjectItemsUpdated(currentProjectPath, name);
            socket.write(`ok:${targetPath}\n`);
          } catch (error) {
            cleanupTarget();
            socket.write("error:copy_failed\n");
          } finally {
            activeInstall = null;
            socket.end();
          }
          return;
        } else if (cmd === "resource") {
          const tokens = Array.isArray(arg)
            ? arg.map((item) => (item === undefined ? "" : String(item)))
            : arg.split(/\s+/).filter(Boolean);
          const action = tokens[0];
          if (action !== "add") {
            socket.write("error:unknown_command\n");
            socket.end();
            return;
          }
          const pluginName = tokens[1] || "";
          const filePath = tokens[2] || "";
          let nameTokens = tokens.slice(3);
          let removeOriginal = false;
          if (nameTokens.length > 0) {
            const last = nameTokens[nameTokens.length - 1].toLowerCase();
            if (last === "move" || last === "-m") {
              removeOriginal = true;
              nameTokens = nameTokens.slice(0, -1);
            } else if (last === "copy") {
              nameTokens = nameTokens.slice(0, -1);
            }
          }
          const resourceName = nameTokens.join(" ").trim();
          const result = addResourceToPlugin({
            projectPath: currentProjectPath,
            pluginName,
            filePath,
            resourceName,
            removeOriginal,
          });
          if (result.error) {
            socket.write(`error:${result.error}\n`);
          } else {
            const macro = result.macroName || `${result.resourceName}_FN`;
            socket.write(`ok:${macro}\n`);
          }
          socket.end();
          return;
        } else if (cmd === "info") {
          const topicValue = Array.isArray(arg)
            ? arg.join(" ").trim().toLowerCase()
            : arg.toLowerCase();
          const topics = prompts?.codex?.info || prompts?.codex?.modes || {};
          if (!topicValue) {
            socket.write("error:missing_topic\n");
            socket.end();
            return;
          }
          const lines = Array.isArray(topics?.[topicValue])
            ? topics[topicValue]
            : null;
          if (!lines) {
            socket.write("error:unknown_topic\n");
            socket.end();
            return;
          }
          socket.write(`${lines.join("\n")}\n`);
          socket.end();
          return;
        } else if (cmd === "topics") {
          const topics = Object.keys(
            prompts?.codex?.info || prompts?.codex?.modes || {},
          );
          if (topics.length === 0) {
            socket.write("error:no_topics\n");
          } else {
            socket.write(`${topics.join("\n")}\n`);
          }
          socket.end();
          return;
        } else if (cmd === "list") {
          if (!currentProjectPath) {
            socket.write("error:no_project\n");
            socket.end();
            return;
          }
          const listResult = listProjectItems(currentProjectPath);
          if (listResult.error) {
            socket.write(`error:${listResult.error}\n`);
            socket.end();
            return;
          }
          const items = listResult.items || [];
          if (!items.length) {
            socket.write(
              "No items found, maybe you should create something.\n",
            );
            socket.end();
            return;
          }
          const lines = items.map((item) => {
            const label = item.type === "tool" ? "Tool" : "Plugin";
            return `${label}: ${item.name}`;
          });
          socket.write(`${lines.join("\n")}\n`);
          socket.end();
          return;
        } else if (cmd === "doxy") {
          let action = "";
          let target = "";
          let query = "";
          let limit = "";
          let type = "";
          let noDesc = "";
          let nameOnly = "";
          let symbol = "";
          let feature = "";
          if (Array.isArray(arg)) {
            const tokens = arg.map((item) =>
              item === undefined ? "" : String(item),
            );
            action = (tokens[0] || "").toLowerCase();
            target = tokens[1] || "";
            query = tokens[2] || "";
            limit = tokens[3] || "";
            type = tokens[4] || "";
            noDesc = tokens[5] || "";
            nameOnly = tokens[6] || "";
            symbol = tokens[2] || "";
            feature = tokens[3] || "";
          } else {
            const tokens = arg.split(/\s+/).filter(Boolean);
            action = (tokens[0] || "").toLowerCase();
            target = tokens[1] || "";
            query = tokens[2] || "";
            limit = tokens[3] || "";
            type = tokens[4] || "";
            noDesc = tokens[5] || "";
            nameOnly = tokens[6] || "";
            symbol = tokens[2] || "";
            feature = tokens[3] || "";
          }
          if (action !== "generate" && action !== "find" && action !== "lookup") {
            socket.write("error:unknown_command\n");
            socket.end();
            return;
          }
          if (!currentProjectPath) {
            socket.write("error:no_project\n");
            socket.end();
            return;
          }
          const handler =
            action === "find"
              ? runDoxygenFind
              : action === "lookup"
                ? runDoxygenLookup
                : runDoxygenGenerate;
          const args =
            action === "find"
              ? [currentProjectPath, target, query, limit, type, noDesc, nameOnly]
              : action === "lookup"
                ? [currentProjectPath, target, symbol, feature]
                : [currentProjectPath, target];
          handler(...args)
            .then((result) => {
              if (result?.error) {
                if (result.error === "doxygen_missing") {
                  socket.write(
                    "error:Doxygen is not installed, please let the user know to install it using the Doxygen tab in the sidebar.\n",
                  );
                } else if (result.error === "db_missing") {
                  socket.write(
                    "error:Doxygen database not found. Ask the user for permission to run `ifact doxy generate <target>` first; let them know it may take some time.\n",
                  );
                } else if (result.error === "unknown_feature") {
                  socket.write("error:Unknown lookup feature.\n");
                } else {
                  socket.write(`error:${result.error}\n`);
                }
              } else if (result?.results) {
                if (!result.results.length) {
                  socket.write("No results found.\n");
                } else {
                  const lines = result.results.map((item) => {
                    if (item.description) {
                      return `${item.kind}: ${item.name} - ${item.description}`;
                    }
                    return `${item.kind}: ${item.name}`;
                  });
                  socket.write(`${lines.join("\n")}\n`);
                }
              } else if (result?.lines) {
                socket.write(`${result.lines.join("\n")}\n`);
              } else if (result?.outputDir) {
                socket.write(`ok:${result.outputDir}\n`);
              } else {
                socket.write("ok\n");
              }
            })
            .catch((error) => {
              socket.write(
                `error:${error?.message || String(error) || "doxygen_failed"}\n`,
              );
            })
            .finally(() => {
              socket.end();
            });
          return;
        } else {
          socket.write("error:unknown_command\n");
        }
        socket.end();
      });
    });
    agentServer.on("error", (error) => {
      console.error("Agent pipe server error", error);
    });
    agentServer.listen(getAgentPipePath());
  } catch (error) {
    console.error("Failed to start agent pipe server", error);
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
  ".aif",
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
  "DSP",
]);

const replaceAll = (value, search, replacement) => {
  if (!search) {
    return value;
  }
  return value.split(search).join(replacement);
};

const updateDoxySetting = (content, key, value) => {
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  const line = `${key} = ${value}`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const trimmed = content.replace(/\s*$/, "");
  return `${trimmed}\n${line}\n`;
};

const createPatchedDoxyfile = (sourcePath, outputDir) => {
  const raw = fs.readFileSync(sourcePath, "utf8");
  const normalizedOutput = outputDir.replace(/\\/g, "/");
  let next = raw;
  next = updateDoxySetting(next, "GENERATE_HTML", "NO");
  next = updateDoxySetting(next, "GENERATE_SQLITE3", "YES");
  next = updateDoxySetting(next, "SQLITE3_OUTPUT", '"doxygen.sqlite3"');
  next = updateDoxySetting(next, "OUTPUT_DIRECTORY", `"${normalizedOutput}"`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ifactory-doxyfile-"));
  const tempPath = path.join(tempDir, "Doxyfile");
  fs.writeFileSync(tempPath, next);
  return { tempPath, tempDir };
};

const findDoxygenExecutable = (rootDir, maxDepth = 4) => {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return "";
  }
  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || current.depth > maxDepth) {
      continue;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === "doxygen.exe") {
        return fullPath;
      }
      if (entry.isDirectory()) {
        stack.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }
  return "";
};

const checkDoxygenInstalled = () => {
  const rootDir = getDoxygenInstallDir();
  const exePath = findDoxygenExecutable(rootDir);
  return {
    installed: Boolean(exePath),
    path: exePath || "",
    version: "",
  };
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
    path.join(configDir, `${templateName}-web.mk`),
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
    "ICUDAT_PATH",
  ]);
  let changed = false;
  const patched = lines.map((line) => {
    let updated = line.replace(/""(%[A-Z0-9_]+%[^"]*)""/g, '"$1"');
    updated = updated.replace(
      /^(\s*set\s+)([A-Z0-9_]+)(\s*=\s*)%(\d+)\s*$/i,
      (match, prefix, name, equals, index) => {
        if (!pathVars.has(name.toUpperCase())) {
          return match;
        }
        changed = true;
        return `${prefix}"${name}=%~${index}"`;
      },
    );
    const trimmed = updated.trimLeft();
    if (/^for\s+%%[A-Z]\s+in\s*\(/i.test(trimmed)) {
      updated = updated.replace(
        /for\s+(%%[A-Z])\s+in\s*\(([^)]+)\)\s+do/i,
        (match, iterator, inner) => {
          const innerTrim = inner.trim();
          if (innerTrim.startsWith('"')) {
            return match;
          }
          return `for ${iterator} in ("${innerTrim}") do`;
        },
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
        if (before === '"' || after === '"') {
          return token;
        }
        return `"${token}"`;
      },
    );
    if (/^\s*if\s+%[A-Z0-9_]+%\s+==/i.test(updated)) {
      const normalized = updated.replace(
        /^\s*if\s+%([A-Z0-9_]+)%\s+==/i,
        'if "%$1%" ==',
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
  const patchedContent = patched.join(os.EOL);
  if (patchedContent !== content) {
    fs.writeFileSync(scriptPath, patchedContent);
  }
};

const patchCreateBundleScript = (projectPath) => {
  const scriptPath = path.join(
    projectPath,
    "iPlug2",
    "Scripts",
    "create_bundle.bat",
  );
  if (!fs.existsSync(scriptPath)) {
    return;
  }
  const content = fs.readFileSync(scriptPath, "utf8");
  let updated = content;

  updated = updated.replace(/SET\s+BundleDir="([^"]*)"/i, 'SET "BundleDir=$1"');
  updated = updated.replace(
    /SET\s+IconSource="([^"]*)"/i,
    'SET "IconSource=$1"',
  );
  updated = updated.replace(/SET\s+Format=([^\r\n]+)/i, 'SET "Format=$1"');

  const replacements = [
    [/IF\s+EXIST\s+%BundleDir%/gi, 'IF EXIST "%BundleDir%"'],
    [/mkdir\s+%BundleDir%/gi, 'mkdir "%BundleDir%"'],
    [
      /IF\s+EXIST\s+%BundleDir%\\Contents\\%X86%/gi,
      'IF EXIST "%BundleDir%\\Contents\\%X86%"',
    ],
    [
      /mkdir\s+%BundleDir%\\Contents\\%X86%/gi,
      'mkdir "%BundleDir%\\Contents\\%X86%"',
    ],
    [
      /IF\s+EXIST\s+%BundleDir%\\Contents\\%X86_64%/gi,
      'IF EXIST "%BundleDir%\\Contents\\%X86_64%"',
    ],
    [
      /mkdir\s+%BundleDir%\\Contents\\%X86_64%/gi,
      'mkdir "%BundleDir%\\Contents\\%X86_64%"',
    ],
    [
      /IF\s+EXIST\s+%BundleDir%\\Contents\\Resources/gi,
      'IF EXIST "%BundleDir%\\Contents\\Resources"',
    ],
    [
      /mkdir\s+%BundleDir%\\Contents\\Resources/gi,
      'mkdir "%BundleDir%\\Contents\\Resources"',
    ],
    [
      /IF\s+EXIST\s+%BundleDir%\\PlugIn\.ico/gi,
      'IF EXIST "%BundleDir%\\PlugIn.ico"',
    ],
    [
      /copy\s+\/Y\s+%IconSource%\s+%BundleDir%\\PlugIn\.ico/gi,
      'copy /Y "%IconSource%" "%BundleDir%\\PlugIn.ico"',
    ],
    [
      /IF\s+EXIST\s+%BundleDir%\\desktop\.ini/gi,
      'IF EXIST "%BundleDir%\\desktop.ini"',
    ],
    [
      /attrib\s+-h\s+-r\s+-s\s+%BundleDir%\\desktop\.ini/gi,
      'attrib -h -r -s "%BundleDir%\\desktop.ini"',
    ],
    [/attrib\s+-r\s+%BundleDir%/gi, 'attrib -r "%BundleDir%"'],
    [
      /echo\s+\[\.ShellClassInfo\]\s+>\s+%BundleDir%\\desktop\.ini/gi,
      'echo [.ShellClassInfo] > "%BundleDir%\\desktop.ini"',
    ],
    [
      /echo\s+IconResource=PlugIn\.ico,0\s+>>\s+%BundleDir%\\desktop\.ini/gi,
      'echo IconResource=PlugIn.ico,0 >> "%BundleDir%\\desktop.ini"',
    ],
    [
      /echo\s+;For compatibility with Windows XP\s+>>\s+%BundleDir%\\desktop\.ini/gi,
      'echo ;For compatibility with Windows XP >> "%BundleDir%\\desktop.ini"',
    ],
    [
      /echo\s+IconFile=PlugIn\.ico\s+>>\s+%BundleDir%\\desktop\.ini/gi,
      'echo IconFile=PlugIn.ico >> "%BundleDir%\\desktop.ini"',
    ],
    [
      /echo\s+IconIndex=0\s+>>\s+%BundleDir%\\desktop\.ini/gi,
      'echo IconIndex=0 >> "%BundleDir%\\desktop.ini"',
    ],
    [
      /attrib\s+\+h\s+\+r\s+\+s\s+%BundleDir%\\PlugIn\.ico/gi,
      'attrib +h +r +s "%BundleDir%\\PlugIn.ico"',
    ],
    [
      /attrib\s+\+h\s+\+r\s+\+s\s+%BundleDir%\\desktop\.ini/gi,
      'attrib +h +r +s "%BundleDir%\\desktop.ini"',
    ],
    [/attrib\s+\+r\s+%BundleDir%/gi, 'attrib +r "%BundleDir%"'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    updated = updated.replace(pattern, replacement);
  });

  updated = updated.replace(/if\s+%Format%\s+==/gi, 'if "%Format%" ==');

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
  newRoot,
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
    replaceProject.toUpperCase(),
  );
  updated = replaceAll(updated, searchMan, replaceMan);
  if (oldRoot && newRoot) {
    updated = replaceAll(updated, oldRoot, newRoot);
    updated = replaceAll(
      updated,
      oldRoot.replace(/\//g, "\\"),
      newRoot.replace(/\//g, "\\"),
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
  newRoot,
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
        renamedPath = path.join(dir, `${replaceProject}iOSAppIcon.appiconset`);
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
          newRoot,
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
          newRoot,
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
      newRoot,
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
      const isOSCSequence = ch === "O" && next === "S" && name[i + 2] === "C";
      const isOSCEnd = ch === "S" && prev === "O" && next === "C";
      const isOSCFinal = ch === "C" && prev === "S";
      if (
        !isTrailingUI &&
        !isTrailingUIEnd &&
        !isOSCSequence &&
        !isOSCEnd &&
        !isOSCFinal
      ) {
        output += " ";
      }
    }
    output += ch;
  }
  return output.trim() || folderName;
};

const listTemplatesForProject = (projectPath) => {
  if (!projectPath) {
    return { error: "no_project", templates: [] };
  }
  const examplesPath = path.join(projectPath, "iPlug2", "Examples");
  if (!fs.existsSync(examplesPath)) {
    return { error: "examples_missing", templates: [] };
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
                description = candidate.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
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
      return a.folder.localeCompare(b.folder);
    });
  return { templates };
};

const SUPPORTED_RESOURCE_TYPES = {
  ".svg": { folder: "img", type: "SVG" },
  ".png": { folder: "img", type: "PNG" },
  ".ttf": { folder: "fonts", type: "TTF" },
};

const normalizeResourceName = (value) => {
  const raw = (value || "").trim();
  if (!raw) {
    return { error: "missing_name" };
  }
  if (/[^a-zA-Z0-9 _]/.test(raw)) {
    return { error: "invalid_name" };
  }
  const normalized = raw.replace(/\s+/g, "_").toUpperCase();
  if (!normalized) {
    return { error: "invalid_name" };
  }
  return { name: normalized };
};

const moveFileSafely = (source, destination) => {
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    fs.copyFileSync(source, destination);
    fs.unlinkSync(source);
  }
};

const copyFileSafely = (source, destination) => {
  fs.copyFileSync(source, destination);
};

const updateResourceRcFile = (rcFilePath, resourceName, extUpper) => {
  if (!fs.existsSync(rcFilePath)) {
    return;
  }
  const content = fs.readFileSync(rcFilePath, "utf8");
  const lineBreak = content.includes("\r\n") ? "\r\n" : "\n";
  const endsWithNewline = content.endsWith("\n");
  const lines = content.split(/\r?\n/);
  const updatedLines = [...lines];
  const newLine = `    "${resourceName}_FN ${extUpper} ${resourceName}_FN\\0"`;

  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < updatedLines.length; i += 1) {
    const trimmed = updatedLines[i].trim();
    if (trimmed === "3 TEXTINCLUDE") {
      startIdx = i;
      continue;
    }
    if (startIdx > -1 && trimmed === "END") {
      endIdx = i;
      break;
    }
  }
  if (startIdx > -1 && endIdx > -1) {
    const insertIdx = endIdx - 1;
    if (updatedLines[insertIdx]) {
      updatedLines[insertIdx] = updatedLines[insertIdx].replace(
        /\\0/g,
        "\\r\\n",
      );
    }
    updatedLines.splice(insertIdx + 1, 0, newLine);
  }

  const includeLine = '#include "..\\config.h"';
  let includeIdx = -1;
  for (let i = 0; i < updatedLines.length; i += 1) {
    if (updatedLines[i].trim() === includeLine) {
      includeIdx = i;
      break;
    }
  }
  if (includeIdx > -1) {
    let endifIdx = -1;
    for (let i = includeIdx + 1; i < updatedLines.length; i += 1) {
      if (updatedLines[i].trim().startsWith("#endif")) {
        endifIdx = i;
        break;
      }
    }
    if (endifIdx > 0) {
      let insertLast = endifIdx - 1;
      if (updatedLines[insertLast]?.trim().startsWith("/")) {
        insertLast -= 1;
      }
      const rcDefine = `${resourceName}_FN ${extUpper} ${resourceName}_FN`;
      updatedLines.splice(insertLast + 1, 0, rcDefine);
    }
  }

  const output =
    updatedLines.join(lineBreak) + (endsWithNewline ? lineBreak : "");
  fs.writeFileSync(rcFilePath, output);
};

const addResourceToPlugin = ({
  projectPath,
  pluginName,
  filePath,
  resourceName,
  removeOriginal = false,
}) => {
  if (!projectPath || !pluginName || !filePath || !resourceName) {
    return { error: "missing_fields" };
  }
  if (pluginName !== path.basename(pluginName)) {
    return { error: "invalid_plugin" };
  }
  if (!fs.existsSync(filePath)) {
    return { error: "file_not_found" };
  }
  const ext = path.extname(filePath).toLowerCase();
  const resourceType = SUPPORTED_RESOURCE_TYPES[ext];
  if (!resourceType) {
    return { error: "unsupported_type" };
  }
  const normalized = normalizeResourceName(resourceName);
  if (normalized.error) {
    return { error: normalized.error };
  }
  const pluginPath = path.join(projectPath, pluginName);
  if (!fs.existsSync(pluginPath)) {
    return { error: "plugin_not_found" };
  }

  const fileName = path.basename(filePath);
  const resourcesDir = path.join(pluginPath, "resources");
  const destDir = path.join(resourcesDir, resourceType.folder);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, fileName);
  if (removeOriginal) {
    moveFileSafely(filePath, destPath);
  } else {
    copyFileSafely(filePath, destPath);
  }

  const configFile = path.join(pluginPath, "config.h");
  const defineLine = `#define ${normalized.name}_FN "${fileName}"`;
  fs.appendFileSync(configFile, `${defineLine}${os.EOL}`);

  updateResourceRcFile(
    path.join(resourcesDir, "main.rc"),
    normalized.name,
    resourceType.type,
  );

  const apsFile = path.join(resourcesDir, "main.aps");
  if (fs.existsSync(apsFile)) {
    try {
      fs.unlinkSync(apsFile);
    } catch (error) {
      // ignore delete errors
    }
  }

  return {
    fileName,
    resourceName: normalized.name,
    macroName: `${normalized.name}_FN`,
  };
};

const resolveTemplateFolder = (projectPath, input) => {
  const trimmed = input?.trim();
  if (!trimmed) {
    return { error: "missing_template" };
  }
  const result = listTemplatesForProject(projectPath);
  if (result.error) {
    return { error: result.error };
  }
  const normalized = trimmed.toLowerCase();
  const direct = result.templates.find(
    (template) => template.folder.toLowerCase() === normalized,
  );
  if (direct) {
    return { folder: direct.folder };
  }
  const formatted = result.templates.find(
    (template) =>
      formatTemplateName(template.folder).toLowerCase() === normalized,
  );
  if (formatted) {
    return { folder: formatted.folder };
  }
  return { error: "template_missing" };
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
let activeBuild = null;
let agentServer = null;
let prompts = null;
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

const checkCodexInstalled = () => {
  const tryResult = (result) => {
    if (result.error || result.status !== 0) {
      return null;
    }
    const output = String(result.stdout || result.stderr || "").trim();
    return {
      installed: true,
      version: output,
    };
  };

  const direct = spawnSync("codex", ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const directResult = tryResult(direct);
  if (directResult) {
    return directResult;
  }

  const cmdResult = spawnSync("cmd", ["/c", "codex", "--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const cmdParsed = tryResult(cmdResult);
  if (cmdParsed) {
    return cmdParsed;
  }

  const whereResult = spawnSync("cmd", ["/c", "where", "codex"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (!whereResult.error && whereResult.status === 0) {
    const candidates = String(whereResult.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      let result = null;
      if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
        result = spawnSync("cmd", ["/c", candidate, "--version"], {
          encoding: "utf8",
          windowsHide: true,
        });
      } else if (lower.endsWith(".ps1")) {
        result = spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            candidate,
            "--version",
          ],
          { encoding: "utf8", windowsHide: true },
        );
      } else {
        result = spawnSync(candidate, ["--version"], {
          encoding: "utf8",
          windowsHide: true,
        });
      }
      const parsed = tryResult(result);
      if (parsed) {
        return parsed;
      }
    }
  }

  return { installed: false, version: "" };
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

const runDoxygenGenerate = async (projectPath, target) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  const normalizedTarget = String(target || "").toLowerCase();
  if (!normalizedTarget) {
    return { error: "missing_target" };
  }
  if (normalizedTarget !== "iplug2") {
    return { error: "unknown_target" };
  }
  const installState = checkDoxygenInstalled();
  if (!installState.installed || !installState.path) {
    return { error: "doxygen_missing" };
  }
  const doxyfilePath = path.join(
    projectPath,
    "iPlug2",
    "Documentation",
    "Doxyfile",
  );
  if (!fs.existsSync(doxyfilePath)) {
    return { error: "doxyfile_missing" };
  }
  const outputDir = path.join(projectPath, "doxygen", "iPlug2");
  fs.mkdirSync(outputDir, { recursive: true });
  const { tempPath, tempDir } = createPatchedDoxyfile(doxyfilePath, outputDir);
  try {
    const result = spawnSync(installState.path, [tempPath], {
      cwd: path.dirname(doxyfilePath),
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      return {
        error: "doxygen_failed",
        details: String(
          result.stderr || result.stdout || result.error?.message || "",
        )
          .trim()
          .slice(0, 400),
      };
    }
    try {
      const sqliteFolder = path.join(outputDir, "doxygen.sqlite3");
      const sqliteDbPath = path.join(sqliteFolder, "doxygen_sqlite3.db");
      if (fs.existsSync(sqliteDbPath)) {
        const sqlite3 = require("better-sqlite3");
        const db = sqlite3(sqliteDbPath);
        db.exec(
          [
            "CREATE INDEX IF NOT EXISTS idx_compounddef_name_kind ON compounddef(name, kind);",
            "CREATE INDEX IF NOT EXISTS idx_memberdef_name_kind_scope ON memberdef(name, kind, scope);",
            "CREATE INDEX IF NOT EXISTS idx_memberdef_scope ON memberdef(scope);",
          ].join("\n"),
        );
        db.close();
      }
    } catch (error) {
      // ignore index creation failures
    }
    return { generated: true, outputDir };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  }
};

const runDoxygenFind = async (
  projectPath,
  target,
  query,
  limitInput,
  typeInput,
  noDescInput,
  nameOnlyInput,
) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  const normalizedTarget = String(target || "").toLowerCase();
  if (!normalizedTarget) {
    return { error: "missing_target" };
  }
  const searchQuery = String(query || "").trim();
  if (!searchQuery) {
    return { error: "missing_query" };
  }
  const outputDir = path.join(projectPath, "doxygen", normalizedTarget);
  const sqliteFolder = path.join(outputDir, "doxygen.sqlite3");
  const sqliteDbPath = path.join(sqliteFolder, "doxygen_sqlite3.db");
  if (!fs.existsSync(sqliteDbPath)) {
    return { error: "db_missing" };
  }
  const limitRaw = parseInt(String(limitInput || ""), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
  const maxLimit = 100;
  const cappedLimit = Math.min(limit, maxLimit);
  const normalizedType = String(typeInput || "")
    .trim()
    .toLowerCase();
  const noDesc =
    String(noDescInput || "").trim() === "1" ||
    String(noDescInput || "")
      .trim()
      .toLowerCase() === "true";
  const nameOnly =
    String(nameOnlyInput || "").trim() === "1" ||
    String(nameOnlyInput || "")
      .trim()
      .toLowerCase() === "true";
  const typeAliases = {
    class: ["class", "struct", "union", "interface"],
    struct: ["struct"],
    union: ["union"],
    interface: ["interface"],
    namespace: ["namespace"],
    file: ["file"],
    page: ["page"],
    group: ["group"],
    dir: ["dir"],
    function: ["function"],
    variable: ["variable"],
    enum: ["enum"],
    typedef: ["typedef"],
    define: ["define"],
    property: ["property"],
    signal: ["signal"],
    slot: ["slot"],
    event: ["event"],
    friend: ["friend"],
  };
  let kindFilter = [];
  if (normalizedType) {
    kindFilter = typeAliases[normalizedType] || [];
    if (!kindFilter.length) {
      return { error: "unknown_type" };
    }
  }
  const normalizedQuery = searchQuery;
  const isRegex = true;
  const cleanDescription = (value) => {
    if (!value) {
      return "";
    }
    return String(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const truncate = (value, max = 160) => {
    if (!value) {
      return "";
    }
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, max - 1).trim()}...`;
  };
  const buildWhere = (columns, columnCase) => {
    const parts = [];
    const params = [];
    if (!normalizedQuery) {
      return { clause: "1", params: [] };
    }
    columns.forEach((col) => {
      const expr = columnCase ? `${columnCase}(${col})` : col;
      parts.push(`${expr} REGEXP ?`);
      params.push(normalizedQuery);
    });
    return { clause: `(${parts.join(" OR ")})`, params };
  };
  const buildKindClause = () => {
    if (!kindFilter.length) {
      return { clause: "1", params: [] };
    }
    const placeholders = kindFilter.map(() => "?").join(", ");
    return {
      clause: `kind IN (${placeholders})`,
      params: [...kindFilter],
    };
  };
  try {
    const sqlite3 = require("better-sqlite3");
    const db = sqlite3(sqliteDbPath, { readonly: true });
    if (isRegex) {
      db.function("REGEXP", { deterministic: true }, (pattern, value) => {
        if (value === null || value === undefined) {
          return 0;
        }
        try {
          const regex = new RegExp(pattern, "i");
          return regex.test(String(value)) ? 1 : 0;
        } catch (error) {
          return 0;
        }
      });
    }
    const searchColumns = nameOnly
      ? ["name"]
      : ["name", "briefdescription", "detaileddescription"];
    const compoundWhere = buildWhere(searchColumns, "");
    const memberWhere = buildWhere(searchColumns, "");
    const compoundKind = buildKindClause();
    const memberKind = buildKindClause();
    const sql = `
      SELECT kind, name, '' as scope, briefdescription, detaileddescription,
        CASE
          WHEN kind IN ('class','struct','union','interface') THEN 0
          ELSE 1
        END as kind_rank
      FROM compounddef
      WHERE ${compoundWhere.clause} AND ${compoundKind.clause}
      UNION ALL
      SELECT kind, name, scope, briefdescription, detaileddescription, 2 as kind_rank
      FROM memberdef
      WHERE ${memberWhere.clause} AND ${memberKind.clause}
      ORDER BY kind_rank, name
      LIMIT ?
    `;
    const rows = db
      .prepare(sql)
      .all(
        ...compoundWhere.params,
        ...compoundKind.params,
        ...memberWhere.params,
        ...memberKind.params,
        cappedLimit,
      );
    db.close();
    const results = rows.map((row) => {
      const fullName = row.scope ? `${row.scope}::${row.name}` : row.name;
      const brief = noDesc
        ? ""
        : truncate(
            cleanDescription(
              row.briefdescription || row.detaileddescription || "",
            ),
          );
      return {
        kind: row.kind || "symbol",
        name: fullName,
        description: brief,
      };
    });
    return { results };
  } catch (error) {
    return { error: "find_failed", details: error?.message || "" };
  }
};

const runDoxygenLookup = async (projectPath, target, symbol, featureInput) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  const normalizedTarget = String(target || "").toLowerCase();
  if (!normalizedTarget) {
    return { error: "missing_target" };
  }
  const symbolQuery = String(symbol || "").trim();
  if (!symbolQuery) {
    return { error: "missing_symbol" };
  }
  const outputDir = path.join(projectPath, "doxygen", normalizedTarget);
  const sqliteFolder = path.join(outputDir, "doxygen.sqlite3");
  const sqliteDbPath = path.join(sqliteFolder, "doxygen_sqlite3.db");
  if (!fs.existsSync(sqliteDbPath)) {
    return { error: "db_missing" };
  }
  const feature = String(featureInput || "").trim().toLowerCase();
  const cleanDescription = (value) => {
    if (!value) {
      return "";
    }
    return String(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const truncate = (value, max = 220) => {
    if (!value) {
      return "";
    }
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, max - 1).trim()}...`;
  };
  const splitScope = (value) => {
    const idx = value.lastIndexOf("::");
    if (idx === -1) {
      return { scope: "", name: value };
    }
    return {
      scope: value.slice(0, idx),
      name: value.slice(idx + 2),
    };
  };
  try {
    const sqlite3 = require("better-sqlite3");
    const db = sqlite3(sqliteDbPath, { readonly: true });
    const symbolParts = splitScope(symbolQuery);
    const compound = db
      .prepare(
        "SELECT name, kind, briefdescription, detaileddescription, file_id, line FROM compounddef WHERE name = ?",
      )
      .get(symbolQuery);
    if (compound) {
      const brief = truncate(
        cleanDescription(
          compound.briefdescription || compound.detaileddescription || "",
        ),
      );
      const fileRow = compound.file_id
        ? db
            .prepare("SELECT name FROM path WHERE rowid = ?")
            .get(compound.file_id)
        : null;
      const location = fileRow?.name
        ? `${fileRow.name}${compound.line ? `:${compound.line}` : ""}`
        : "";
      const className = compound.name.split("::").slice(-1)[0];
      if (!feature) {
        const counts = db
          .prepare(
            "SELECT kind, COUNT(*) as count FROM memberdef WHERE scope = ? GROUP BY kind",
          )
          .all(compound.name);
        const countByKind = Object.fromEntries(
          counts.map((row) => [row.kind, row.count]),
        );
        const constructors = db
          .prepare(
            "SELECT COUNT(*) as count FROM memberdef WHERE scope = ? AND kind = 'function' AND name = ?",
          )
          .get(compound.name, className)?.count;
        const methods =
          (countByKind.function || 0) - (constructors || 0);
        const lines = [
          `${compound.kind}: ${compound.name}`,
          brief ? `summary: ${brief}` : "",
          location ? `location: ${location}` : "",
          constructors ? `constructors: ${constructors}` : "constructors: 0",
          `methods: ${methods < 0 ? 0 : methods}`,
        ];
        if (countByKind.variable !== undefined) {
          lines.push(`fields: ${countByKind.variable}`);
        }
        if (countByKind.property !== undefined) {
          lines.push(`properties: ${countByKind.property}`);
        }
        if (countByKind.enum !== undefined) {
          lines.push(`enums: ${countByKind.enum}`);
        }
        if (countByKind.typedef !== undefined) {
          lines.push(`typedefs: ${countByKind.typedef}`);
        }
        db.close();
        return { lines: lines.filter(Boolean) };
      }
      const listLimit = 60;
      if (feature === "constructors") {
        const rows = db
          .prepare(
            "SELECT name, argsstring FROM memberdef WHERE scope = ? AND kind = 'function' AND name = ? ORDER BY name LIMIT ?",
          )
          .all(compound.name, className, listLimit);
        db.close();
        return {
          lines: rows.map(
            (row) => `${row.name}${row.argsstring || ""}`,
          ),
        };
      }
      if (feature === "methods") {
        const rows = db
          .prepare(
            "SELECT name, type, argsstring FROM memberdef WHERE scope = ? AND kind = 'function' AND name != ? ORDER BY name LIMIT ?",
          )
          .all(compound.name, className, listLimit);
        db.close();
        return {
          lines: rows.map((row) => {
            const sig = `${row.name}${row.argsstring || ""}`;
            return row.type ? `${row.type} ${sig}` : sig;
          }),
        };
      }
      if (feature === "fields") {
        const rows = db
          .prepare(
            "SELECT name, type FROM memberdef WHERE scope = ? AND kind = 'variable' ORDER BY name LIMIT ?",
          )
          .all(compound.name, listLimit);
        db.close();
        return {
          lines: rows.map((row) =>
            row.type ? `${row.type} ${row.name}` : row.name,
          ),
        };
      }
      if (feature === "properties") {
        const rows = db
          .prepare(
            "SELECT name, type FROM memberdef WHERE scope = ? AND kind = 'property' ORDER BY name LIMIT ?",
          )
          .all(compound.name, listLimit);
        db.close();
        return {
          lines: rows.map((row) =>
            row.type ? `${row.type} ${row.name}` : row.name,
          ),
        };
      }
      if (feature === "enums") {
        const rows = db
          .prepare(
            "SELECT name FROM memberdef WHERE scope = ? AND kind = 'enum' ORDER BY name LIMIT ?",
          )
          .all(compound.name, listLimit);
        db.close();
        return { lines: rows.map((row) => row.name) };
      }
      if (feature === "typedefs") {
        const rows = db
          .prepare(
            "SELECT name, type FROM memberdef WHERE scope = ? AND kind = 'typedef' ORDER BY name LIMIT ?",
          )
          .all(compound.name, listLimit);
        db.close();
        return {
          lines: rows.map((row) =>
            row.type ? `${row.type} ${row.name}` : row.name,
          ),
        };
      }
      db.close();
      return { error: "unknown_feature" };
    }
    const member = symbolParts.scope
      ? db
          .prepare(
            "SELECT name, scope, kind, type, argsstring, briefdescription, detaileddescription, file_id, line FROM memberdef WHERE scope = ? AND name = ?",
          )
          .get(symbolParts.scope, symbolParts.name)
      : db
          .prepare(
            "SELECT name, scope, kind, type, argsstring, briefdescription, detaileddescription, file_id, line FROM memberdef WHERE name = ?",
          )
          .get(symbolParts.name);
    if (!member) {
      db.close();
      return { lines: ["No results found."] };
    }
    const brief = truncate(
      cleanDescription(
        member.briefdescription || member.detaileddescription || "",
      ),
    );
    const fileRow = member.file_id
      ? db
          .prepare("SELECT name FROM path WHERE rowid = ?")
          .get(member.file_id)
      : null;
    const location = fileRow?.name
      ? `${fileRow.name}${member.line ? `:${member.line}` : ""}`
      : "";
    const signature = member.argsstring
      ? `${member.name}${member.argsstring}`
      : member.name;
    db.close();
    const lines = [
      `${member.kind}: ${member.scope ? `${member.scope}::` : ""}${member.name}`,
      member.type ? `type: ${member.type}` : "",
      member.argsstring ? `signature: ${signature}` : "",
      brief ? `summary: ${brief}` : "",
      location ? `location: ${location}` : "",
    ];
    return { lines: lines.filter(Boolean) };
  } catch (error) {
    return { error: "lookup_failed", details: error?.message || "" };
  }
};

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

const getSessionsDir = (projectPath) => path.join(projectPath, "sessions");

const getSessionPath = (projectPath) =>
  path.join(getSessionsDir(projectPath), "default.json");

const loadSession = (projectPath) => {
  const sessionPath = getSessionPath(projectPath);
  if (!fs.existsSync(sessionPath)) {
    return {
      id: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  }
  try {
    const raw = fs.readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      id: parsed?.id || "default",
      createdAt: parsed?.createdAt || new Date().toISOString(),
      updatedAt: parsed?.updatedAt || new Date().toISOString(),
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
    };
  } catch (error) {
    return {
      id: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  }
};

const saveSession = (projectPath, session) => {
  const dir = getSessionsDir(projectPath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    id: session.id || "default",
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: session.updatedAt || new Date().toISOString(),
    messages: Array.isArray(session.messages) ? session.messages : [],
  };
  fs.writeFileSync(
    getSessionPath(projectPath),
    JSON.stringify(payload, null, 2),
  );
  return payload;
};

const buildChatPrompt = (messages) => {
  const systemLines = Array.isArray(prompts?.codex?.system)
    ? prompts.codex.system
    : [];
  const system = systemLines.map((line) => `System: ${line}`).join("\n");
  const transcript = messages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${message.content || ""}`.trim();
    })
    .join("\n\n");
  const assistantPrefix = prompts?.codex?.assistant_prefix || "Assistant:";
  return `${system}\n\n${transcript}\n\n${assistantPrefix}`;
};

const listProjectItems = (projectPath) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  if (!fs.existsSync(projectPath)) {
    return { error: "path_not_found" };
  }

  const skipNames = new Set(["iPlug2", "node_modules", ".git"]);
  const shouldSkip = (name) => {
    if (!name) {
      return true;
    }
    if (name.startsWith(".")) {
      return true;
    }
    if (skipNames.has(name)) {
      return true;
    }
    if (name === "build" || name.startsWith("build-")) {
      return true;
    }
    return false;
  };

  const hasFileRecursive = (root, matcher, maxDepth = 4) => {
    const stack = [{ dir: root, depth: 0 }];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || current.depth > maxDepth) {
        continue;
      }
      let entries = [];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch (error) {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && matcher(entry.name)) {
          return true;
        }
        if (entry.isDirectory() && !shouldSkip(entry.name)) {
          stack.push({
            dir: path.join(current.dir, entry.name),
            depth: current.depth + 1,
          });
        }
      }
    }
    return false;
  };

  const hasConfigAtRoot = (root) => {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      return entries.some(
        (entry) => entry.isFile() && entry.name.toLowerCase() === "config.h",
      );
    } catch (error) {
      return false;
    }
  };

  const entries = fs.readdirSync(projectPath, { withFileTypes: true });
  const items = entries
    .filter((entry) => entry.isDirectory() && !shouldSkip(entry.name))
    .map((entry) => {
      const folderPath = path.join(projectPath, entry.name);
      const hasSolution = hasFileRecursive(
        folderPath,
        (name) => name.toLowerCase().endsWith(".sln"),
        5,
      );
      if (!hasSolution) {
        return null;
      }
      const hasConfig = hasConfigAtRoot(folderPath);
      return {
        name: entry.name,
        type: hasConfig ? "plugin" : "tool",
      };
    })
    .filter(Boolean);

  return { items };
};

const isCmdScript = (value) => {
  const lower = value.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
};

const isPsScript = (value) => value.toLowerCase().endsWith(".ps1");

const getExtendedPath = () => {
  const home = process.env.USERPROFILE || "";
  const appdata = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const pnpmHome = process.env.PNPM_HOME || "";
  const yarnHome = process.env.YARN_HOME || "";
  const bunInstall = process.env.BUN_INSTALL || "";
  const currentPath = process.env.PATH || "";
  const extraPaths = [
    home ? path.join(home, ".codex", "bin") : "",
    home ? path.join(home, ".claude", "bin") : "",
    home ? path.join(home, ".cargo", "bin") : "",
    home ? path.join(home, "AppData", "Roaming", "npm") : "",
    home ? path.join(home, "AppData", "Local", "npm") : "",
    home ? path.join(home, "AppData", "Roaming", "pnpm") : "",
    home ? path.join(home, "AppData", "Local", "Yarn", "bin") : "",
    home
      ? path.join(
          home,
          "AppData",
          "Local",
          "Programs",
          "Microsoft VS Code",
          "bin",
        )
      : "",
    home
      ? path.join(home, "AppData", "Local", "Programs", "VSCodium", "bin")
      : "",
    home
      ? path.join(
          home,
          "AppData",
          "Local",
          "Programs",
          "Cursor",
          "resources",
          "app",
          "bin",
        )
      : "",
    home ? path.join(home, "AppData", "Local", "Microsoft", "WindowsApps") : "",
    "C:\\Program Files\\nodejs",
    "C:\\Program Files\\Git\\bin",
    "C:\\Program Files\\Microsoft VS Code\\bin",
    "C:\\Program Files (x86)\\Microsoft VS Code\\bin",
  ];
  if (appdata) {
    extraPaths.push(path.join(appdata, "npm"));
    extraPaths.push(path.join(appdata, "pnpm"));
  }
  if (localAppData) {
    extraPaths.push(path.join(localAppData, "npm"));
    extraPaths.push(path.join(localAppData, "Yarn", "bin"));
  }
  if (pnpmHome) {
    extraPaths.push(pnpmHome);
  }
  if (yarnHome) {
    extraPaths.push(yarnHome);
  }
  if (bunInstall) {
    extraPaths.push(path.join(bunInstall, "bin"));
  }
  const filtered = extraPaths.filter((entry) => entry);
  return `${filtered.join(";")};${currentPath}`;
};

const findCodexInPath = (name) => {
  const result = spawnSync("cmd", ["/c", "where", name], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  const line = String(result.stdout || "")
    .split(/\r?\n/)[0]
    .trim();
  return line || "";
};

const resolveCodexCommand = () => {
  const envPath = process.env.CODEX_CLI_PATH || "";
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const candidates = ["codex.cmd", "codex.ps1", "codex.exe", "codex"];
  for (const candidate of candidates) {
    const found = findCodexInPath(candidate);
    if (found) {
      return found;
    }
  }
  const home = process.env.USERPROFILE || "";
  if (home) {
    const localCandidates = [
      path.join(home, "AppData", "Roaming", "npm", "codex.cmd"),
      path.join(home, "AppData", "Local", "npm", "codex.cmd"),
      path.join(home, "AppData", "Roaming", "npm", "codex.exe"),
      path.join(home, "AppData", "Local", "npm", "codex.exe"),
      path.join(home, "AppData", "Roaming", "npm", "codex.ps1"),
      path.join(home, "AppData", "Local", "npm", "codex.ps1"),
    ];
    for (const candidate of localCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return "";
};

const spawnCodex = (codexPath, args, options) => {
  if (isCmdScript(codexPath)) {
    return spawn("cmd", ["/C", codexPath, ...args], options);
  }
  if (isPsScript(codexPath)) {
    return spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", codexPath, ...args],
      options,
    );
  }
  return spawn(codexPath, args, options);
};

const runCodexChat = ({ projectPath, prompt }) =>
  new Promise((resolve, reject) => {
    const codexPath = resolveCodexCommand();
    if (!codexPath) {
      return reject(new Error("Codex CLI not found"));
    }
    const tempPath = path.join(
      os.tmpdir(),
      `ifactory-codex-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    const args = [
      "exec",
      "--cd",
      projectPath,
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--output-last-message",
      tempPath,
      "-",
    ];
    const env = {
      ...process.env,
      PATH: getExtendedPath(),
    };
    const child = spawnCodex(codexPath, args, {
      cwd: projectPath,
      windowsHide: true,
      env,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      let output = "";
      try {
        output = fs.readFileSync(tempPath, "utf8").trim();
      } catch (error) {
        output = "";
      }
      fs.rmSync(tempPath, { force: true });
      if (code !== 0 || !output) {
        return reject(
          new Error(
            stderr ||
              "Codex did not return a response. Ensure you are logged in.",
          ),
        );
      }
      resolve(output);
    });
    try {
      child.stdin.write(prompt || "");
      child.stdin.end();
    } catch (error) {
      reject(error);
    }
  });

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
  ipcMain.handle("agent:ping", () => {
    playAgentPingSound();
    return { ok: true };
  });
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
  ipcMain.handle("codex:check", () => {
    const result = checkCodexInstalled();
    settings.dependencies.codex = {
      ...settings.dependencies.codex,
      installed: result.installed,
      version: result.version || "",
      checkedAt: new Date().toISOString(),
    };
    saveSettings();
    return settings.dependencies.codex;
  });
  ipcMain.handle("codex:chat", async (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      const message = payload?.message || "";
      const history = Array.isArray(payload?.history) ? payload.history : [];
      if (!projectPath) {
        return { error: "missing_path" };
      }
      if (!message.trim()) {
        return { error: "missing_message" };
      }
      const codexState = checkCodexInstalled();
      if (!codexState.installed) {
        return { error: "codex_missing" };
      }
      const maxHistory = history.slice(-20);
      const session = loadSession(projectPath);
      const promptMessages = maxHistory.length ? maxHistory : session.messages;
      const prompt = buildChatPrompt(promptMessages);
      const reply = await runCodexChat({ projectPath, prompt });
      return { reply };
    } catch (error) {
      return { error: "codex_failed", details: error?.message || "" };
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
    const result = checkDoxygenInstalled();
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
  ipcMain.handle("session:load", (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      if (!projectPath) {
        return { error: "missing_path" };
      }
      if (!fs.existsSync(projectPath)) {
        return { error: "path_not_found" };
      }
      const session = loadSession(projectPath);
      return { session };
    } catch (error) {
      return { error: "session_load_failed" };
    }
  });
  ipcMain.handle("session:append", (event, payload) => {
    try {
      const projectPath = payload?.path?.trim();
      if (!projectPath) {
        return { error: "missing_path" };
      }
      const message = payload?.message;
      if (!message || !message.content) {
        return { error: "missing_message" };
      }
      const role = message.role === "assistant" ? "assistant" : "user";
      const session = loadSession(projectPath);
      const next = {
        role,
        content: String(message.content),
        createdAt: new Date().toISOString(),
      };
      if (message.error) {
        next.error = true;
      }
      session.messages = Array.isArray(session.messages)
        ? session.messages.concat(next)
        : [next];
      session.updatedAt = new Date().toISOString();
      const saved = saveSession(projectPath, session);
      return { session: saved };
    } catch (error) {
      return { error: "session_append_failed" };
    }
  });
  ipcMain.handle("prompts:topics", () => {
    const topics = prompts?.codex?.info || prompts?.codex?.modes || {};
    return { topics: Object.keys(topics) };
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
      const privateRepo = payload?.privateRepo !== false;

      if (!name || !basePath) {
        return { error: "missing_fields" };
      }

      const projectPath = createFolder ? path.join(basePath, name) : basePath;

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
            "__pycache__",
          ];
          fs.writeFileSync(gitignorePath, gitignoreLines.join(os.EOL));
        }
      }

      let repoUrl = null;
      let repoWarning = "";
      if (createRepo) {
        const token = settings?.integrations?.github?.token;
        if (!token) {
          return { error: "github_not_connected" };
        }
        const gitState = checkGitInstalled();
        if (!gitState.installed) {
          return { error: "git_required" };
        }
        runGit(["init"], projectPath);
        const repo = await requestJson("https://api.github.com/user/repos", {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "iFactory",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            private: privateRepo,
          }),
        }).catch((error) => {
          if (error?.status === 422) {
            const username = settings?.integrations?.github?.username || "";
            if (username) {
              repoUrl = `https://github.com/${username}/${name}`;
            }
            repoWarning = "repo_exists";
          } else {
            repoWarning = "github_failed";
          }
          return null;
        });
        if (repo?.html_url) {
          repoUrl = repo.html_url;
        }
        if (repoUrl) {
          runGit(["remote", "add", "origin", repoUrl], projectPath);
        }
      }

      pushRecentProject({ name, projectPath });
      currentProjectPath = projectPath;

      return {
        path: projectPath,
        repoUrl,
        repoWarning,
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
      scope: scopes,
    });

    return requestJson("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  });

  ipcMain.handle("github:devicePoll", async (event, payload) => {
    if (!payload?.deviceCode) {
      throw new Error("Missing device code");
    }

    const body = new URLSearchParams({
      client_id: "Ov23liXefQviBroFvVlU",
      device_code: payload.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    const data = await requestJson(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
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
        "User-Agent": "iFactory",
      },
    });
    const username = user?.login || "";
    settings.integrations.github = {
      ...settings.integrations.github,
      username,
      token,
      connected: true,
      authMethod: "oauth",
      updatedAt: new Date().toISOString(),
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
      "User-Agent": "iFactory",
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
          { headers },
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
            { headers },
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
                    { headers },
                  );
                } catch (error) {
                  return null;
                }
              }),
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
            userForksMessage: userForksError.message || null,
          },
        };
      }

      return {
        forks: filteredForks,
        userForks,
        connected: Boolean(token),
        username,
      };
    } catch (error) {
      return {
        error: "forks_failed",
        connected: Boolean(token),
        username,
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
    const token = settings?.integrations?.github?.token;
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "iFactory",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

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
    const token = settings?.integrations?.github?.token || "";
    const hasGitFolder = fs.existsSync(path.join(projectPath, ".git"));
    const isRepo = gitState.installed ? isGitRepo(projectPath) : hasGitFolder;
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
          if (tokenValue) {
            runGit(
              ["submodule", "set-url", "iPlug2", sanitizedUrl],
              projectPath,
            );
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
          "User-Agent": "iFactory",
        };
        let zipUrl = `https://github.com/${repoFullName}/archive/refs/heads/${encodeURIComponent(
          branch,
        )}.zip`;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          zipUrl = `https://api.github.com/repos/${repoFullName}/zipball/${encodeURIComponent(
            branch,
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
            shouldAbort: () => activeInstall?.canceled,
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
        token,
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
      const authError =
        !token &&
        /authentication|access denied|repository not found|not found|permission|could not read username/i.test(
          message,
        );
      if (authError) {
        cleanup();
        return { error: "github_required" };
      }
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
        token: settings?.integrations?.github?.token || "",
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

  ipcMain.handle("github:disconnect", () => {
    settings.integrations.github = {
      ...settings.integrations.github,
      username: "",
      token: "",
      connected: false,
      authMethod: "",
      updatedAt: new Date().toISOString(),
    };
    saveSettings();
    return sanitizeSettings(settings);
  });

  ipcMain.handle("settings:update", (event, payload) => {
    if (!payload || payload.scope !== "github") {
      return sanitizeSettings(settings);
    }

    const values =
      payload.values && typeof payload.values === "object"
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

app.whenReady().then(() => {
  settings = loadSettings();
  try {
    prompts = loadPrompts();
  } catch (error) {
    console.error("Failed to load prompts.json", error);
    app.exit(1);
    return;
  }
  startAgentServer();
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
