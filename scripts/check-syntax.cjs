"use strict";
const { readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const root = resolve(__dirname, "..");
function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) :
      /\.(?:js|cjs|mjs)$/.test(entry.name) ? [path] : [];
  });
}
const files = ["js", "scripts", "tests"].flatMap(dir => collect(join(root, dir)));
if (!files.length) throw new Error("No JavaScript files found");
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("Syntax checked " + files.length + " JavaScript files.");
