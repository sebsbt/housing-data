import crypto from "crypto";
import fs from "fs";
import path from "path";

export function zctaDiskCacheEnabled() {
  return process.env.DISABLE_ZCTA_DISK_CACHE !== "1";
}

function viewportPath(root, cacheKey) {
  const name = `${crypto.createHash("sha256").update(cacheKey).digest("hex").slice(0, 40)}.json`;
  return path.join(root, "data", "cache", "zcta-viewport", name);
}

function extentPath(root, zip5) {
  return path.join(root, "data", "cache", "zcta-extent", `${zip5}.json`);
}

export function readZctaViewportDisk(root, cacheKey) {
  if (!zctaDiskCacheEnabled()) return null;
  const p = viewportPath(root, cacheKey);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function writeZctaViewportDisk(root, cacheKey, payload) {
  if (!zctaDiskCacheEnabled()) return;
  const p = viewportPath(root, cacheKey);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  void fs.promises.writeFile(p, JSON.stringify(payload), "utf8").catch(() => {});
}

export function readZctaExtentDisk(root, zip5) {
  if (!zctaDiskCacheEnabled()) return null;
  const p = extentPath(root, zip5);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function writeZctaExtentDisk(root, zip5, payload) {
  if (!zctaDiskCacheEnabled()) return;
  const p = extentPath(root, zip5);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  void fs.promises.writeFile(p, JSON.stringify(payload), "utf8").catch(() => {});
}
