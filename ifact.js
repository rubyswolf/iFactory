#!/usr/bin/env node
"use strict";

const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const pipeName = "\\\\.\\pipe\\ifactory-agent";

const usage = (topics = []) => {
  const topicList = Array.isArray(topics) && topics.length
    ? topics.join("|")
    : "<topic>";
  console.log("ifact <command>");
  console.log("");
  console.log("Commands:");
  console.log("  ping       Play attention sound in iFactory");
  console.log("  templates  List iPlug2 templates for the current project");
  console.log("  list       List plugins and tools in the current project");
  console.log("  create     Create a plugin from a template");
  console.log("  resource   Add a resource to a plugin");
  console.log("  info       Print additional topic notes");
  console.log("  doxy       Generate Doxygen XML for the current project");
  console.log("");
  console.log("Usage:");
  console.log("  ifact create <template> [name]");
  console.log("  ifact resource add <plugin> <path> <resource name> [-m]");
  console.log("  ifact doxy generate iPlug2");
  console.log(
    "  ifact doxy find <target> <query> [--limit N] [--type kind] [--no-desc] [--name-only]",
  );
  console.log("  ifact doxy lookup <target> <symbol> [feature]");
  console.log(`  ifact info <${topicList}>`);
};

const command = (process.argv[2] || "").toLowerCase();
const args = process.argv.slice(3);
const printSystemPrompt = () => {
  const agentsPath = path.resolve(__dirname, "AGENTS.md");
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
  const infoPath = path.resolve(__dirname, "info.json");
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

const playLocalPingSound = () => {
  const windir = process.env.WINDIR || "C:\\Windows";
  const soundPath = path.join(windir, "Media", "Windows Hardware Fail.wav");
  const command = `(New-Object Media.SoundPlayer '${soundPath.replace(/'/g, "''")}').PlaySync()`;
  try {
    spawn("powershell", ["-NoProfile", "-Command", command], {
      windowsHide: true,
      stdio: "ignore"
    });
  } catch (error) {
    // ignore failures
  }
};

const run = async () => {
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

  const socket = net.createConnection(pipeName, () => {
    if (command === "create") {
      const template = args[0];
      const name = args[1];
      if (!template) {
        usage(topicList);
        process.exit(1);
      }
      if (name && /\s/.test(name)) {
        console.error("Name must not include spaces.");
        process.exit(1);
      }
      socket.write(
        name ? `${command} ${template} ${name}\n` : `${command} ${template}\n`,
      );
      return;
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
        console.error("Name may only include letters, numbers, spaces, or underscores.");
        process.exit(1);
      }
      socket.write(
        `resource\tadd\t${plugin}\t${filePath}\t${name}\t${move ? "move" : "copy"}\n`,
      );
      return;
    }
    if (command === "list") {
      socket.write("list\n");
      return;
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
        socket.write(
          `doxy\tfind\t${target}\t${query}\t${limit}\t${type}\t${noDesc ? "1" : "0"}\t${nameOnly ? "1" : "0"}\n`,
        );
        return;
      }
      if (action === "lookup") {
        const symbol = args[2] || "";
        const feature = args[3] || "";
        if (!symbol) {
          usage(topicList);
          process.exit(1);
        }
        socket.write(`doxy\tlookup\t${target}\t${symbol}\t${feature}\n`);
        return;
      }
      socket.write(`doxy ${action} ${target}\n`);
      return;
    }
    socket.write(`${command}\n`);
  });

  socket.setEncoding("utf8");

  socket.on("data", (data) => {
    const message = data.toString().trim();
    if (message && message !== "ok") {
      if (message.startsWith("error:")) {
        console.error(message);
        process.exitCode = 1;
      } else if (message.startsWith("ok:")) {
        console.log(message.slice(3));
      } else {
        console.log(message);
      }
    }
  });

  socket.on("error", (error) => {
    console.error(
      "Unable to connect to iFactory, please ask the user to start iFactory and open the project.",
    );
    process.exitCode = 1;
  });

  socket.on("close", () => {
    process.exit(process.exitCode || 0);
  });
};

run();
