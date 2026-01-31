const path = require("path");
const { spawnSync } = require("child_process");

module.exports = async () => {
  const scriptPath = path.join(__dirname, "build-cli.js");
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("CLI build failed.");
  }
};
