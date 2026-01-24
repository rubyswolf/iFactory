#!/usr/bin/env node
"use strict";

const net = require("net");

const pipeName = "\\\\.\\pipe\\ifactory-agent";

const usage = () => {
  console.log("ifact <command>");
  console.log("");
  console.log("Commands:");
  console.log("  ping   Play attention sound in iFactory");
};

const command = (process.argv[2] || "").toLowerCase();
if (!command || command === "help" || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

const socket = net.createConnection(pipeName, () => {
  socket.write(`${command}\n`);
});

socket.setEncoding("utf8");

socket.on("data", (data) => {
  const message = data.toString().trim();
  if (message && message !== "ok") {
    console.error(message);
    process.exitCode = 1;
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
