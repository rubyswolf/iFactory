
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const getDefaultUserDataPath = () => {
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, "iFactory");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "iFactory",
    );
  }
  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Roaming", "iFactory");
  }
  return path.join(os.homedir(), ".config", "iFactory");
};

const getDefaultDoxygenInstallDir = () =>
  path.join(getDefaultUserDataPath(), "tools", "doxygen");

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

const applyDoxyTemplateReplacements = (content, replacements = {}) => {
  if (!content) {
    return "";
  }
  let next = String(content);
  Object.entries(replacements).forEach(([key, value]) => {
    next = replaceAll(next, key, String(value));
  });
  return next;
};

const createPatchedDoxyfileFromContent = (rawContent, outputDir) => {
  const normalizedOutput = outputDir.replace(/\\/g, "/");
  let next = rawContent;
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

const checkDoxygenInstalled = (installDir = getDefaultDoxygenInstallDir()) => {
  const exePath = findDoxygenExecutable(installDir);
  return {
    installed: Boolean(exePath),
    path: exePath || "",
    version: "",
  };
};

const openSqliteDatabase = async (dbPath, { allowWrite = false, useRegex = false } = {}) => {
  const makeRegexFn = () => (pattern, value) => {
    if (value === null || value === undefined) {
      return 0;
    }
    try {
      const regex = new RegExp(pattern, "i");
      return regex.test(String(value)) ? 1 : 0;
    } catch (error) {
      return 0;
    }
  };

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: !allowWrite });
    if (useRegex) {
      db.function("REGEXP", { deterministic: true }, makeRegexFn());
    }
    return {
      type: "better",
      all: (sql, params = []) => db.prepare(sql).all(...params),
      get: (sql, params = []) => db.prepare(sql).get(...params),
      exec: (sql) => db.exec(sql),
      close: () => db.close(),
      persist: () => {}
    };
  } catch (error) {
    // fall back to sql.js
  }

  const initSqlJs = require("sql.js");
  const wasmPath = process.pkg
    ? path.join(path.dirname(process.execPath), "sql-wasm.wasm")
    : path.join(path.dirname(require.resolve("sql.js")), "sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });
  const data = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(data));
  if (useRegex && typeof db.create_function === "function") {
    db.create_function("REGEXP", makeRegexFn());
  }
  return {
    type: "sqljs",
    all: (sql, params = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    },
    get: (sql, params = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const row = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return row;
    },
    exec: (sql) => {
      db.run(sql);
    },
    close: () => db.close(),
    persist: () => {
      if (!allowWrite) {
        return;
      }
      const exported = db.export();
      fs.writeFileSync(dbPath, Buffer.from(exported));
    }
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
  const patched = lines.map((line) => {
    let updated = line.replace(/""(%[A-Z0-9_]+%[^"]*)""/g, '"$1"');
    updated = updated.replace(
      /^(\s*set\s+)([A-Z0-9_]+)(\s*=\s*)%(\d+)\s*$/i,
      (match, prefix, name, equals, index) => {
        if (!pathVars.has(name.toUpperCase())) {
          return match;
        }
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
      updated = normalized;
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

const parseVcxprojPathsFromSln = (slnContent) => {
  const matches = [];
  const regex =
    /Project\("\{[^}]+\}"\)\s*=\s*"[^"]+"\s*,\s*"([^"]+\.vcxproj)"/gi;
  let match = regex.exec(slnContent);
  while (match) {
    const rel = String(match[1] || "").trim();
    if (rel) {
      matches.push(rel);
    }
    match = regex.exec(slnContent);
  }
  return matches;
};

const getIncludeItemTagForPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const headerExts = new Set([".h", ".hh", ".hpp", ".hxx", ".inl", ".ipp"]);
  const sourceExts = new Set([".c", ".cc", ".cpp", ".cxx", ".m", ".mm"]);
  const resourceExts = new Set([".rc"]);
  if (headerExts.has(ext)) {
    return "ClInclude";
  }
  if (sourceExts.has(ext)) {
    return "ClCompile";
  }
  if (resourceExts.has(ext)) {
    return "ResourceCompile";
  }
  return "None";
};

const addIncludeEntryToVcxproj = (vcxprojPath, absFilePath, tagName) => {
  const projectDir = path.dirname(vcxprojPath);
  let relative = path.relative(projectDir, absFilePath);
  if (!relative) {
    relative = path.basename(absFilePath);
  }
  const includePath = relative.split(path.sep).join("\\");
  let xml = fs.readFileSync(vcxprojPath, "utf8");

  const escaped = includePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const duplicateRegex = new RegExp(
    `<${tagName}\\s+Include="${escaped}"\\s*/>`,
    "i",
  );
  if (duplicateRegex.test(xml)) {
    return { updated: false, includePath };
  }

  const entry = `    <${tagName} Include="${includePath}" />`;
  const itemGroup = `  <ItemGroup>\n${entry}\n  </ItemGroup>\n`;
  if (xml.includes('<Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />')) {
    xml = xml.replace(
      '<Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />',
      `${itemGroup}  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />`,
    );
  } else {
    xml = `${xml.replace(/\s*$/, "")}\n${itemGroup}`;
  }
  fs.writeFileSync(vcxprojPath, xml);
  return { updated: true, includePath };
};

const includeFileInItem = ({ projectPath, itemName, filePath }) => {
  if (!projectPath || !itemName || !filePath) {
    return { error: "missing_fields" };
  }
  if (!fs.existsSync(projectPath)) {
    return { error: "path_not_found" };
  }
  const targetName = String(itemName || "").trim();
  if (!targetName || targetName !== path.basename(targetName)) {
    return { error: "invalid_item" };
  }
  const resolvedFilePath = path.resolve(filePath);
  if (!fs.existsSync(resolvedFilePath)) {
    return { error: "file_not_found" };
  }
  const stat = fs.statSync(resolvedFilePath);
  if (!stat.isFile()) {
    return { error: "not_a_file" };
  }
  const itemPath = path.join(projectPath, targetName);
  if (!fs.existsSync(itemPath)) {
    return { error: "item_not_found" };
  }

  const slnCandidates = fs
    .readdirSync(itemPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sln"))
    .map((entry) => path.join(itemPath, entry.name));
  if (!slnCandidates.length) {
    return { error: "solution_missing" };
  }
  const slnPath = slnCandidates[0];
  const slnContent = fs.readFileSync(slnPath, "utf8");
  const vcxprojRelPaths = parseVcxprojPathsFromSln(slnContent);
  if (!vcxprojRelPaths.length) {
    return { error: "projects_missing" };
  }

  const tagName = getIncludeItemTagForPath(resolvedFilePath);
  const updatedProjects = [];
  const skippedProjects = [];
  vcxprojRelPaths.forEach((relPath) => {
    const normalizedRel = relPath.replace(/[\\/]/g, path.sep);
    const vcxprojPath = path.resolve(path.dirname(slnPath), normalizedRel);
    if (!fs.existsSync(vcxprojPath)) {
      return;
    }
    const change = addIncludeEntryToVcxproj(vcxprojPath, resolvedFilePath, tagName);
    if (change.updated) {
      updatedProjects.push(path.basename(vcxprojPath));
    } else {
      skippedProjects.push(path.basename(vcxprojPath));
    }
  });

  return {
    item: targetName,
    tag: tagName,
    includedPath: resolvedFilePath,
    updatedProjects,
    skippedProjects,
  };
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

const detectGraphicsBackend = (projectPath, pluginName) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  if (!fs.existsSync(projectPath)) {
    return { error: "path_not_found" };
  }
  const isValidName = (value) =>
    value && value === path.basename(value) && !value.includes("..");
  let targetPlugin = pluginName;
  if (!targetPlugin) {
    return { error: "missing_plugin" };
  }
  if (targetPlugin && !isValidName(targetPlugin)) {
    return { error: "invalid_plugin" };
  }
  const pluginPath = path.join(projectPath, targetPlugin);
  if (!fs.existsSync(pluginPath)) {
    return { error: "plugin_not_found" };
  }
  const configDir = path.join(pluginPath, "config");
  if (!fs.existsSync(configDir)) {
    return { error: "config_missing" };
  }
  const entries = fs.readdirSync(configDir, { withFileTypes: true });
  let hasSkia = false;
  let hasNano = false;
  entries.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }
    const filePath = path.join(configDir, entry.name);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      if (/\bIGRAPHICS_SKIA\b/.test(content)) {
        hasSkia = true;
      }
      if (/\bIGRAPHICS_NANOVG\b/.test(content)) {
        hasNano = true;
      }
    } catch (error) {
      // ignore config read errors
    }
  });
  if (hasSkia) {
    return { backend: "SKIA", plugin: targetPlugin };
  }
  if (hasNano) {
    return { backend: "NANOVG", plugin: targetPlugin };
  }
  return { error: "graphics_unknown" };
};

const setGraphicsBackend = (projectPath, pluginName, backend) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  if (!fs.existsSync(projectPath)) {
    return { error: "path_not_found" };
  }
  if (!pluginName) {
    return { error: "missing_plugin" };
  }
  const normalizedBackend = String(backend || "")
    .trim()
    .toUpperCase();
  if (normalizedBackend !== "SKIA" && normalizedBackend !== "NANOVG") {
    return { error: "invalid_backend" };
  }
  const targetPlugin = pluginName;
  if (targetPlugin !== path.basename(targetPlugin) || targetPlugin.includes("..")) {
    return { error: "invalid_plugin" };
  }
  const pluginPath = path.join(projectPath, targetPlugin);
  if (!fs.existsSync(pluginPath)) {
    return { error: "plugin_not_found" };
  }
  const configDir = path.join(pluginPath, "config");
  if (!fs.existsSync(configDir)) {
    return { error: "config_missing" };
  }
  const entries = fs.readdirSync(configDir, { withFileTypes: true });
  const targetToken =
    normalizedBackend === "SKIA" ? "IGRAPHICS_SKIA" : "IGRAPHICS_NANOVG";
  let updatedFiles = 0;
  entries.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }
    const filePath = path.join(configDir, entry.name);
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      return;
    }
    if (!/\bIGRAPHICS_(NANOVG|SKIA)\b/.test(content)) {
      return;
    }
    let updated = content.replace(/\bIGRAPHICS_(NANOVG|SKIA)\b/g, targetToken);
    const duplicatePattern = new RegExp(
      `\\b${targetToken}\\b(\\s*[; ,]\\s*)\\b${targetToken}\\b`,
      "g",
    );
    while (duplicatePattern.test(updated)) {
      updated = updated.replace(duplicatePattern, `${targetToken}$1`);
    }
    if (updated !== content) {
      fs.writeFileSync(filePath, updated);
      updatedFiles += 1;
    }
  });
  if (!updatedFiles) {
    return { error: "graphics_not_found" };
  }
  return { backend: normalizedBackend };
};

const ensureIPlug2Installed = (projectPath) => {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return { error: "missing_path" };
  }
  const iplugPath = path.join(projectPath, "iPlug2");
  if (!fs.existsSync(iplugPath)) {
    return {
      error: "iplug_missing",
      message:
        "iPlug2 is not installed in this folder, please create a project with iFactory and use its folder as the working directory",
    };
  }
  return { ok: true };
};

const runDoxygenGenerate = async (projectPath, target, options = {}) => {
  if (!projectPath) {
    return { error: "missing_path" };
  }
  const normalizedTarget = String(target || "").toLowerCase();
  if (!normalizedTarget) {
    return { error: "missing_target" };
  }
  const targetConfigs = {
    iplug2: {
      doxyfilePath: path.join(
        projectPath,
        "iPlug2",
        "Documentation",
        "Doxyfile",
      ),
      cwd: path.join(projectPath, "iPlug2", "Documentation"),
      outputFolder: "iPlug2",
      transformContent: null,
    },
    edsp: {
      doxyfilePath: path.join(projectPath, "eDSP", "doxygen", "Doxyfile.in"),
      cwd: path.join(projectPath, "eDSP"),
      outputFolder: "eDSP",
      transformContent: (raw) => {
        const sourceRoot = path.join(projectPath, "eDSP").replace(/\\/g, "/");
        const binaryRoot = path
          .join(projectPath, "eDSP", "build", "doxygen")
          .replace(/\\/g, "/");
        const replacements = {
          "@CMAKE_PROJECT_NAME@": "eDSP",
          "@VERSION_MAJOR@": "0",
          "@VERSION_MINOR@": "0",
          "@VERSION_PATCH@": "0",
          "@PROJECT_SOURCE_DIR@": sourceRoot,
          "@PROJECT_BINARY_DIR@": binaryRoot,
        };
        return applyDoxyTemplateReplacements(raw, replacements);
      },
    },
  };
  const config = targetConfigs[normalizedTarget];
  if (!config) {
    return { error: "unknown_target" };
  }
  const installDir = options.installDir || getDefaultDoxygenInstallDir();
  const installState = checkDoxygenInstalled(installDir);
  if (!installState.installed || !installState.path) {
    return { error: "doxygen_missing" };
  }
  const { doxyfilePath } = config;
  if (!fs.existsSync(doxyfilePath)) {
    return { error: "doxyfile_missing" };
  }
  const outputDir = path.join(projectPath, "doxygen", config.outputFolder);
  fs.mkdirSync(outputDir, { recursive: true });
  const rawDoxyfile = fs.readFileSync(doxyfilePath, "utf8");
  const patchedSource = config.transformContent
    ? config.transformContent(rawDoxyfile)
    : rawDoxyfile;
  const { tempPath, tempDir } = createPatchedDoxyfileFromContent(
    patchedSource,
    outputDir,
  );
  try {
    const result = spawnSync(installState.path, [tempPath], {
      cwd: config.cwd || path.dirname(doxyfilePath),
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
        const db = await openSqliteDatabase(sqliteDbPath, { allowWrite: true });
        db.exec(
          [
            "CREATE INDEX IF NOT EXISTS idx_compounddef_name_kind ON compounddef(name, kind);",
            "CREATE INDEX IF NOT EXISTS idx_memberdef_name_kind_scope ON memberdef(name, kind, scope);",
            "CREATE INDEX IF NOT EXISTS idx_memberdef_scope ON memberdef(scope);",
          ].join("\n"),
        );
        db.persist();
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
    const db = await openSqliteDatabase(sqliteDbPath, { useRegex: isRegex });
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
    const rows = db.all(
      sql,
      [
        ...compoundWhere.params,
        ...compoundKind.params,
        ...memberWhere.params,
        ...memberKind.params,
        cappedLimit,
      ],
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
  const truncate = (value) => value || "";
  const cleanDescriptionMultiline = (value) => {
    if (!value) {
      return "";
    }
    const raw = String(value)
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|para)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    const normalized = raw.replace(/\r\n/g, "\n");
    const lines = normalized
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return lines.join("\n");
  };
  const buildSummary = (briefText, detailedText) => {
    const cleanedBrief = cleanDescriptionMultiline(briefText || "");
    const cleanedDetail = cleanDescriptionMultiline(detailedText || "");
    if (!cleanedBrief && !cleanedDetail) {
      return "";
    }
    if (!cleanedBrief) {
      return truncate(cleanedDetail);
    }
    if (!cleanedDetail) {
      return truncate(cleanedBrief);
    }
    const lowerBrief = cleanedBrief.toLowerCase();
    const lowerDetail = cleanedDetail.toLowerCase();
    if (lowerDetail.startsWith(lowerBrief)) {
      return truncate(cleanedDetail);
    }
    return truncate(`${cleanedBrief} ${cleanedDetail}`);
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
    const db = await openSqliteDatabase(sqliteDbPath);
    const symbolParts = splitScope(symbolQuery);
    const compound = db.get(
      "SELECT name, kind, briefdescription, detaileddescription, file_id, line FROM compounddef WHERE name = ?",
      [symbolQuery],
    );
    if (compound) {
      const brief = buildSummary(
        compound.briefdescription,
        compound.detaileddescription,
      );
      const fileRow = compound.file_id
        ? db.get("SELECT name FROM path WHERE rowid = ?", [compound.file_id])
        : null;
      const location = fileRow?.name
        ? `${fileRow.name}${compound.line ? `:${compound.line}` : ""}`
        : "";
      const className = compound.name.split("::").slice(-1)[0];
      if (!feature) {
        const counts = db.all(
          "SELECT kind, COUNT(*) as count FROM memberdef WHERE scope = ? GROUP BY kind",
          [compound.name],
        );
        const countByKind = Object.fromEntries(
          counts.map((row) => [row.kind, row.count]),
        );
        const constructors = db.get(
          "SELECT COUNT(*) as count FROM memberdef WHERE scope = ? AND kind = 'function' AND name = ?",
          [compound.name, className],
        )?.count;
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
        const rows = db.all(
          "SELECT name, argsstring FROM memberdef WHERE scope = ? AND kind = 'function' AND name = ? ORDER BY name LIMIT ?",
          [compound.name, className, listLimit],
        );
        db.close();
        return {
          lines: rows.map(
            (row) => `${row.name}${row.argsstring || ""}`,
          ),
        };
      }
      if (feature === "methods") {
        const rows = db.all(
          "SELECT name, type, argsstring FROM memberdef WHERE scope = ? AND kind = 'function' AND name != ? ORDER BY name LIMIT ?",
          [compound.name, className, listLimit],
        );
        db.close();
        return {
          lines: rows.map((row) => {
            const sig = `${row.name}${row.argsstring || ""}`;
            return row.type ? `${row.type} ${sig}` : sig;
          }),
        };
      }
      if (feature === "fields") {
        const rows = db.all(
          "SELECT name, type FROM memberdef WHERE scope = ? AND kind = 'variable' ORDER BY name LIMIT ?",
          [compound.name, listLimit],
        );
        db.close();
        return {
          lines: rows.map((row) =>
            row.type ? `${row.type} ${row.name}` : row.name,
          ),
        };
      }
      if (feature === "properties") {
        const rows = db.all(
          "SELECT name, type FROM memberdef WHERE scope = ? AND kind = 'property' ORDER BY name LIMIT ?",
          [compound.name, listLimit],
        );
        db.close();
        return {
          lines: rows.map((row) =>
            row.type ? `${row.type} ${row.name}` : row.name,
          ),
        };
      }
      if (feature === "enums") {
        const rows = db.all(
          "SELECT name FROM memberdef WHERE scope = ? AND kind = 'enum' ORDER BY name LIMIT ?",
          [compound.name, listLimit],
        );
        db.close();
        return { lines: rows.map((row) => row.name) };
      }
      if (feature === "typedefs") {
        const rows = db.all(
          "SELECT name, type FROM memberdef WHERE scope = ? AND kind = 'typedef' ORDER BY name LIMIT ?",
          [compound.name, listLimit],
        );
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
    const member = db.get(
      "SELECT name, kind, scope, type, argsstring, briefdescription, detaileddescription, file_id, line FROM memberdef WHERE name = ?",
      [symbolParts.name],
    );
    if (member) {
      const fullName = member.scope
        ? `${member.scope}::${member.name}`
        : member.name;
      const brief = buildSummary(
        member.briefdescription,
        member.detaileddescription,
      );
      const fileRow = member.file_id
        ? db.get("SELECT name FROM path WHERE rowid = ?", [member.file_id])
        : null;
      const location = fileRow?.name
        ? `${fileRow.name}${member.line ? `:${member.line}` : ""}`
        : "";
      const signature = member.argsstring
        ? `${member.name}${member.argsstring}`
        : member.name;
      const line = member.type ? `${member.type} ${signature}` : signature;
      db.close();
      return {
        lines: [
          `${member.kind}: ${fullName}`,
          brief ? `summary: ${brief}` : "",
          location ? `location: ${location}` : "",
          line,
        ].filter(Boolean),
      };
    }
    db.close();
    return { error: "not_found" };
  } catch (error) {
    return { error: "lookup_failed", details: error?.message || "" };
  }
};

const createPluginFromTemplate = ({
  projectPath,
  templateFolder,
  name,
  manufacturer = "AcmeInc",
  onProgress,
  isCanceled,
}) => {
  if (!projectPath || !templateFolder || !name) {
    return { error: "missing_fields" };
  }
  if (/[^a-zA-Z0-9]/.test(name)) {
    return { error: "invalid_name" };
  }
  const sourcePath = path.join(projectPath, "iPlug2", "Examples", templateFolder);
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

  const cleanupTarget = () => {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  };

  try {
    onProgress?.(0.05, "Copying template...");
    copyDirectory(
      sourcePath,
      targetPath,
      (progress) => onProgress?.(0.05 + progress * 0.6, "Copying template..."),
      isCanceled,
    );
    if (isCanceled?.()) {
      cleanupTarget();
      return { error: "cancelled" };
    }
    const needsRename = templateFolder !== name;
    const needsRootUpdate = Boolean(oldRoot && newRoot && oldRoot !== newRoot);
    if (needsRename || needsRootUpdate) {
      onProgress?.(
        0.7,
        needsRename ? "Renaming project..." : "Updating project references...",
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
    onProgress?.(0.9, "Updating build scripts...");
    patchPostbuildScript(targetPath);
    patchCreateBundleScript(projectPath);
    onProgress?.(1, "Finished");
    return { path: targetPath };
  } catch (error) {
    cleanupTarget();
    if (error?.message === "cancelled") {
      return { error: "cancelled" };
    }
    return { error: "copy_failed" };
  }
};

module.exports = {
  getDefaultUserDataPath,
  getDefaultDoxygenInstallDir,
  getDepsConfig,
  getDepsBuildPath,
  copyDirectory,
  updateDoxySetting,
  createPatchedDoxyfile,
  findDoxygenExecutable,
  checkDoxygenInstalled,
  extractIPlugRoot,
  getTemplateIPlugRoot,
  getOutOfSourceRoot,
  patchPostbuildScript,
  patchCreateBundleScript,
  updateFileContents,
  renameTemplateContents,
  formatTemplateName,
  listTemplatesForProject,
  normalizeResourceName,
  addResourceToPlugin,
  includeFileInItem,
  resolveTemplateFolder,
  listProjectItems,
  detectGraphicsBackend,
  setGraphicsBackend,
  ensureIPlug2Installed,
  runDoxygenGenerate,
  runDoxygenFind,
  runDoxygenLookup,
  createPluginFromTemplate,
};
