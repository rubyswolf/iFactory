const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const cliOutDir = path.join(rootDir, "build", "cli");
fs.mkdirSync(cliOutDir, { recursive: true });

const pkgBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "pkg.cmd" : "pkg",
);
const outputPath = path.join(cliOutDir, process.platform === "win32" ? "ifact.exe" : "ifact");
const entryPath = path.join(rootDir, "ifact.js");

const result = spawnSync(
  pkgBin,
  ["-t", "node20-win-x64", "-o", outputPath, entryPath],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const copyFile = (name, sourceOverride) => {
  const source = sourceOverride || path.join(rootDir, name);
  if (!fs.existsSync(source)) {
    return;
  }
  fs.copyFileSync(source, path.join(cliOutDir, name));
};

copyFile("AGENTS.md");
copyFile("info.json");
copyFile("sql-wasm.wasm", path.join(rootDir, "node_modules", "sql.js", "dist", "sql-wasm.wasm"));
