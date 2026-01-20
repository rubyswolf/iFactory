const { contextBridge } = require("electron");
const pkg = require("./package.json");

contextBridge.exposeInMainWorld("ifactory", {
  name: pkg.productName || pkg.name,
  version: pkg.version,
  description: pkg.description
});
