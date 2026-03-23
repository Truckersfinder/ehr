import path from "path";
import fs from "fs";

/**
 * Single resolved uploads directory for multer + express.static.
 * Uses the main script path when possible so files are found even if `process.cwd()` differs
 * (e.g. launching `node dist/index.cjs` from another directory).
 */
export function resolveUploadsDir(): string {
  const main = process.argv[1];
  if (main) {
    const abs = path.resolve(main);
    const normalized = abs.replace(/\\/g, "/");
    if (normalized.endsWith("/dist/index.cjs")) {
      return path.resolve(path.dirname(abs), "..", "uploads");
    }
    if (normalized.endsWith("/server/index.ts") || normalized.includes("/server/index.ts")) {
      return path.resolve(path.dirname(abs), "..", "uploads");
    }
  }
  return path.resolve(process.cwd(), "uploads");
}

export function ensureUploadsDir(): string {
  const dir = resolveUploadsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
