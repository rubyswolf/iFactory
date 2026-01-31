const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const cliOutDir = path.join(rootDir, "build", "cli");
fs.mkdirSync(cliOutDir, { recursive: true });

const pkgLocal = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "pkg.cmd" : "pkg",
);
const pkgBin = fs.existsSync(pkgLocal)
  ? pkgLocal
  : (process.platform === "win32" ? "npx.cmd" : "npx");
const outputPath = path.join(cliOutDir, process.platform === "win32" ? "ifact.exe" : "ifact");
const entryPath = path.join(rootDir, "ifact.js");

const pkgArgs =
  pkgBin.toLowerCase().includes("npx")
    ? ["pkg", "-t", process.env.IFACT_PKG_TARGET || "node18-win-x64", "-o", outputPath, entryPath]
    : ["-t", process.env.IFACT_PKG_TARGET || "node18-win-x64", "-o", outputPath, entryPath];
const result = spawnSync(pkgBin, pkgArgs, { stdio: "inherit" });
if (result.error) {
  console.error(result.error);
}
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
