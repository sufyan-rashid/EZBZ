// Vercel silently drops any directory literally named "node_modules" during
// deploy, even when it's just a static asset folder (which is what Metro's
// web export uses for @expo/vector-icons fonts and expo-router's nav icons).
// This renames it to "_vendor" and rewrites every reference in the exported
// output so those assets actually get uploaded and served.
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");
const OLD_SEGMENT = "assets/node_modules";
const NEW_SEGMENT = "assets/_vendor";

const oldDir = path.join(DIST, "assets", "node_modules");
const newDir = path.join(DIST, "assets", "_vendor");

if (!fs.existsSync(oldDir)) {
  console.log("[fix-vercel-assets] no assets/node_modules folder found, nothing to do");
  process.exit(0);
}

// A plain renameSync on a directory literally named "node_modules" reliably
// hits EPERM on Windows (antivirus/indexer tools watch that name specifically
// and hold a transient lock on it) — copy-then-remove sidesteps that.
fs.cpSync(oldDir, newDir, { recursive: true });
fs.rmSync(oldDir, { recursive: true, force: true });
console.log(`[fix-vercel-assets] renamed ${oldDir} -> ${newDir}`);

const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".map"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

let changedCount = 0;
for (const file of walk(DIST)) {
  if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(OLD_SEGMENT)) continue;
  fs.writeFileSync(file, content.split(OLD_SEGMENT).join(NEW_SEGMENT));
  changedCount++;
}

console.log(`[fix-vercel-assets] updated references in ${changedCount} file(s)`);
