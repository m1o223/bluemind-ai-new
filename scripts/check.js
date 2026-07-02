import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

walk(root);

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const imageChatPipeline = spawnSync(process.execPath, ["scripts/verify-image-chat-pipeline.js"], {
  stdio: "inherit",
});

if (imageChatPipeline.status !== 0) {
  process.exit(imageChatPipeline.status || 1);
}

console.log(`Checked ${files.length} backend files.`);
