#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const core = require("./lib/ifact-core");

const usage = (topics = []) => {
  const topicList =
    Array.isArray(topics) && topics.length ? topics.join("|") : "<topic>";
  console.log("ifact <command>");
  console.log("");
  console.log("Commands:");
  console.log("  ping       Play attention sound in iFactory");
  console.log("  templates  List iPlug2 templates for the current project");
  console.log("  list       List plugins and tools in the current project");
  console.log("  create     Create a plugin from a template");
  console.log("  resource   Add a resource to a plugin");
  console.log("  include    Add a file to all projects in a plugin/tool solution");
  console.log("  graphics   Detect the graphics backend for the project");
  console.log("  info       Print additional topic notes");
  console.log("  doxy       Generate Doxygen XML for the current project");
  console.log("");
  console.log("Usage:");
  console.log("  ifact create <template> [name]");
  console.log("  ifact resource add <plugin> <path> <resource name> [-m]");
  console.log("  ifact include <plugin/tool name> <path to file>");
  console.log("  ifact graphics get <plugin>");
  console.log("  ifact graphics set <plugin> <SKIA|NANOVG>");
  console.log("  ifact doxy generate <iPlug2|eDSP>");
  console.log(
    "  ifact doxy find <target> <query> [--limit N] [--type kind] [--no-desc] [--name-only]",
  );
  console.log("  ifact doxy lookup <target> <symbol> [feature]");
  console.log(`  ifact info <${topicList}>`);
};

const getCliDir = () => {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  return __dirname;
};

const printSystemPrompt = () => {
  const agentsPath = path.resolve(getCliDir(), "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    return false;
  }
  try {
    const raw = fs.readFileSync(agentsPath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    if (!lines.length) {
      return false;
    }
    lines.forEach((line) => {
      console.log(String(line));
    });
    return true;
  } catch (error) {
    return false;
  }
};

const loadInfoTopics = () => {
  const infoPath = path.resolve(getCliDir(), "info.json");
  if (!fs.existsSync(infoPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(infoPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    return {};
  }
};

const resolvePowerShell = (windir) => {
  const systemRoot = windir || "C:\\Windows";
  const candidates = [
    path.join(
      systemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    path.join(systemRoot, "System32", "powershell.exe"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "powershell.exe";
};

const runSync = (label, exe, args) => {
  const result = spawnSync(exe, args, {
    windowsHide: true,
    stdio: "ignore",
  });
  if (result.error) {
    return false;
  }
  return result.status === 0;
};

const runStartDetached = (label, windir, exe, args) => {
  const cmd = path.join(windir, "System32", "cmd.exe");
  const startArgs = ["/c", "start", "", "/min", exe, ...args];
  return runSync(label, cmd, startArgs);
};

const playLocalPingSound = () => {
  const windir = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
  const soundPath = path.join(windir, "Media", "Windows Hardware Fail.wav");
  const hasSound = fs.existsSync(soundPath);
  if (hasSound) {
    const powershell = resolvePowerShell(windir);
    const command = `[System.Media.SoundPlayer]::new('${soundPath.replace(/'/g, "''")}').PlaySync()`;
    if (
      runStartDetached("powershell-playsound-detached", windir, powershell, [
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        command,
      ])
    ) {
      return;
    }

    const rundll = path.join(windir, "System32", "rundll32.exe");
    const asyncFlags = "0x00020001";
    const asyncArgs = ["winmm.dll,PlaySound", `${soundPath},${asyncFlags}`];
    if (runSync("rundll32-playsound-async", rundll, asyncArgs)) {
      return;
    }
  }

  const rundll = path.join(windir, "System32", "rundll32.exe");
  runSync("rundll32-messagebeep", rundll, ["user32.dll,MessageBeep", "0x10"]);
};

const requireProjectPath = () => {
  const projectPath = process.cwd();
  const check = core.ensureIPlug2Installed(projectPath);
  if (check?.error) {
    console.error(
      check.message ||
        "iPlug2 is not installed in this folder, please create a project with iFactory and use its folder as the working directory",
    );
    process.exit(1);
  }
  return projectPath;
};

const run = async (argv = process.argv) => {
  const command = (argv[2] || "").toLowerCase();
  const args = argv.slice(3);
  const infoTopics = loadInfoTopics();
  const topicList = Object.keys(infoTopics || {});
  if (!command) {
    const printed = printSystemPrompt();
    if (!printed) {
      usage(topicList);
    }
    process.exit(0);
  }
  if (command === "help" || command === "--help" || command === "-h") {
    usage(topicList);
    process.exit(0);
  }
  if (command === "info") {
    const topic = args.join(" ").trim().toLowerCase();
    if (!topic) {
      usage(topicList);
      process.exit(1);
    }
    const lines = Array.isArray(infoTopics?.[topic]) ? infoTopics[topic] : null;
    if (!lines) {
      console.error("error:unknown_topic");
      process.exit(1);
    }
    lines.forEach((line) => console.log(String(line)));
    process.exit(0);
  }
  if (command === "ping") {
    playLocalPingSound();
    process.exit(0);
  }
  if (command === "templates") {
    const projectPath = requireProjectPath();
    const result = core.listTemplatesForProject(projectPath);
    if (result.error) {
      console.error(`error:${result.error}`);
      process.exit(1);
    }
    const templates = result.templates || [];
    if (!templates.length) {
      console.log("No templates found.");
      process.exit(0);
    }
    const lines = templates.map((template) =>
      template.description
        ? `${template.folder}: ${template.description}`
        : `${template.folder}`,
    );
    console.log(lines.join("\n"));
    process.exit(0);
  }
  if (command === "list") {
    const projectPath = requireProjectPath();
    const listResult = core.listProjectItems(projectPath);
    if (listResult.error) {
      console.error(`error:${listResult.error}`);
      process.exit(1);
    }
    const items = listResult.items || [];
    if (!items.length) {
      console.log("No items found, maybe you should create something.");
      process.exit(0);
    }
    const lines = items.map((item) => {
      const label = item.type === "tool" ? "Tool" : "Plugin";
      return `${label}: ${item.name}`;
    });
    console.log(lines.join("\n"));
    process.exit(0);
  }
  if (command === "create") {
    const templateInput = args[0];
    const name = args[1] || templateInput;
    if (!templateInput) {
      usage(topicList);
      process.exit(1);
    }
    if (name && /\s/.test(name)) {
      console.error("Name must not include spaces.");
      process.exit(1);
    }
    const projectPath = requireProjectPath();
    const resolved = core.resolveTemplateFolder(projectPath, templateInput);
    if (resolved.error) {
      console.error(`error:${resolved.error}`);
      process.exit(1);
    }
    const result = core.createPluginFromTemplate({
      projectPath,
      templateFolder: resolved.folder,
      name,
    });
    if (result.error) {
      console.error(`error:${result.error}`);
      process.exit(1);
    }
    if (result.path) {
      console.log(result.path);
    }
    process.exit(0);
  }
  if (command === "resource") {
    const move = args.includes("-m") || args.includes("--move");
    const filtered = args.filter((arg) => arg !== "-m" && arg !== "--move");
    const action = (filtered[0] || "").toLowerCase();
    if (action !== "add") {
      usage(topicList);
      process.exit(1);
    }
    const plugin = filtered[1];
    const filePath = filtered[2];
    const name = filtered.slice(3).join(" ").trim();
    if (!plugin || !filePath || !name) {
      usage(topicList);
      process.exit(1);
    }
    if (/[^a-zA-Z0-9 _]/.test(name)) {
      console.error(
        "Name may only include letters, numbers, spaces, or underscores.",
      );
      process.exit(1);
    }
    const projectPath = requireProjectPath();
    const result = core.addResourceToPlugin({
      projectPath,
      pluginName: plugin,
      filePath,
      resourceName: name,
      removeOriginal: move,
    });
    if (result.error) {
      console.error(`error:${result.error}`);
      process.exit(1);
    }
    const macro = result.macroName || `${result.resourceName}_FN`;
    console.log(macro);
    process.exit(0);
  }
  if (command === "include") {
    const itemName = (args[0] || "").trim();
    const filePath = args.slice(1).join(" ").trim();
    if (!itemName || !filePath) {
      usage(topicList);
      process.exit(1);
    }
    const projectPath = requireProjectPath();
    const result = core.includeFileInItem({
      projectPath,
      itemName,
      filePath,
    });
    if (result?.error) {
      console.error(`error:${result.error}`);
      process.exit(1);
    }
    const updated = Array.isArray(result.updatedProjects)
      ? result.updatedProjects.length
      : 0;
    const skipped = Array.isArray(result.skippedProjects)
      ? result.skippedProjects.length
      : 0;
    console.log(
      `Included as ${result.tag} in ${updated} project(s)` +
        (skipped ? `, already present in ${skipped}.` : "."),
    );
    process.exit(0);
  }
  if (command === "graphics") {
    const action = (args[0] || "").toLowerCase();
    if (action !== "get" && action !== "set") {
      usage(topicList);
      process.exit(1);
    }
    const plugin = args[1] || "";
    if (!plugin) {
      usage(topicList);
      process.exit(1);
    }
    const projectPath = requireProjectPath();
    if (action === "get") {
      const result = core.detectGraphicsBackend(projectPath, plugin);
      if (result.error) {
        console.error(`error:${result.error}`);
        process.exit(1);
      }
      console.log(result.backend);
      process.exit(0);
    }
    const backend = args[2] || "";
    if (!backend) {
      usage(topicList);
      process.exit(1);
    }
    const result = core.setGraphicsBackend(projectPath, plugin, backend);
    if (result.error) {
      console.error(`error:${result.error}`);
      process.exit(1);
    }
    console.log(result.backend);
    process.exit(0);
  }
  if (command === "doxy") {
    const action = (args[0] || "").toLowerCase();
    const target = args[1] || "";
    if (action !== "generate" && action !== "find" && action !== "lookup") {
      usage(topicList);
      process.exit(1);
    }
    if (!target) {
      usage(topicList);
      process.exit(1);
    }
    const projectPath = requireProjectPath();
    if (action === "generate") {
      if (String(target).toLowerCase() === "skia") {
        console.error(
          "Skia docs are generated via the Skia Docs addon in iFactory. Ask the user to open the Addons view in iFactory and install the Skia Docs addon.",
        );
        process.exit(1);
      }
      const result = await core.runDoxygenGenerate(projectPath, target);
      if (result?.error) {
        if (result.error === "doxygen_missing") {
          console.error(
            "Doxygen is not installed. Ask the user to open the Addons view in iFactory and install the Doxygen addon, then run this command again.",
          );
        } else if (result.error === "edsp_missing") {
          console.error(
            "eDSP is not installed in this project. Ask the user to open the Addons view in iFactory and install the eDSP addon, then run this command again.",
          );
        } else {
          console.error(`error:${result.error}`);
        }
        process.exit(1);
      }
      if (result?.outputDir) {
        console.log(result.outputDir);
      } else {
        console.log("ok");
      }
      process.exit(0);
    }
    if (action === "find") {
      let limit = "";
      let type = "";
      let noDesc = false;
      let nameOnly = false;
      const queryParts = [];
      const rawArgs = args.slice(2);
      for (let i = 0; i < rawArgs.length; i += 1) {
        const value = rawArgs[i];
        if (value === "--limit") {
          limit = rawArgs[i + 1] || "";
          i += 1;
          continue;
        }
        if (value === "--type") {
          type = rawArgs[i + 1] || "";
          i += 1;
          continue;
        }
        if (value === "--no-desc") {
          noDesc = true;
          continue;
        }
        if (value === "--name-only") {
          nameOnly = true;
          continue;
        }
        queryParts.push(value);
      }
      const query = queryParts.join(" ").trim();
      if (!query) {
        usage(topicList);
        process.exit(1);
      }
      const result = await core.runDoxygenFind(
        projectPath,
        target,
        query,
        limit,
        type,
        noDesc ? "1" : "0",
        nameOnly ? "1" : "0",
      );
      if (result?.error) {
        if (result.error === "db_missing") {
          console.error(
            "Doxygen database not found. Run `ifact doxy generate <target>` first; it may take some time.",
          );
        } else if (result.error === "unknown_type") {
          console.error("error:unknown_type");
        } else {
          console.error(`error:${result.error}`);
        }
        process.exit(1);
      }
      const results = result.results || [];
      if (!results.length) {
        console.log("No results found.");
        process.exit(0);
      }
      const lines = results.map((item) =>
        item.description
          ? `${item.kind}: ${item.name} - ${item.description}`
          : `${item.kind}: ${item.name}`,
      );
      console.log(lines.join("\n"));
      process.exit(0);
    }
    if (action === "lookup") {
      const symbol = args[2] || "";
      const feature = args[3] || "";
      if (!symbol) {
        usage(topicList);
        process.exit(1);
      }
      const result = await core.runDoxygenLookup(
        projectPath,
        target,
        symbol,
        feature,
      );
      if (result?.error) {
        if (result.error === "db_missing") {
          console.error(
            "Doxygen database not found. Run `ifact doxy generate <target>` first; it may take some time.",
          );
        } else if (result.error === "unknown_feature") {
          console.error("error:Unknown lookup feature.");
        } else {
          console.error(`error:${result.error}`);
        }
        process.exit(1);
      }
      if (result?.lines?.length) {
        console.log(result.lines.join("\n"));
      }
      process.exit(0);
    }
  }

  usage(topicList);
  process.exit(1);
};

if (require.main === module) {
  run();
}

module.exports = { run };
