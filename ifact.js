#!/usr/bin/env node
"use strict";

const net = require("net");

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
  console.log("  create     Create a plugin from a template");
  console.log("  resource   Add a resource to a plugin");
  console.log("  info       Print additional topic notes");
  console.log("");
  console.log("Usage:");
  console.log("  ifact create <template> [name]");
  console.log("  ifact resource add <plugin> <path> <resource name> [-m]");
  console.log(`  ifact info <${topicList}>`);
};

const command = (process.argv[2] || "").toLowerCase();
const args = process.argv.slice(3);
const fetchTopics = () =>
  new Promise((resolve) => {
    const client = net.createConnection(pipeName, () => {
      client.write("topics\n");
    });
    let buffer = "";
    client.setEncoding("utf8");
    client.on("data", (data) => {
      buffer += data.toString();
    });
    client.on("error", () => resolve([]));
    client.on("close", () => {
      const topics = buffer
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith("error:"));
      resolve(topics);
    });
  });

const run = async () => {
  const topicList = await fetchTopics();
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage(topicList);
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
  if (command === "info") {
    const topic = (args[0] || "").toLowerCase();
    if (!topic) {
      usage(topicList);
      process.exit(1);
    }
    socket.write(`info\t${topic}\n`);
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
      } else {
        console.log(message);
      }
    }
  });

  socket.on("error", (error) => {
    console.error("Unable to connect to iFactory agent.");
    console.error(error.message || String(error));
    process.exitCode = 1;
  });

  socket.on("close", () => {
    process.exit(process.exitCode || 0);
  });
};

run();
