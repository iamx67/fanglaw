import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const siteRootDir = fileURLToPath(new URL("./", import.meta.url));
const webExportRootDir = fileURLToPath(new URL("../client/web_export/", import.meta.url));
const port = 4173;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function resolvePath(rootDir, urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const relativePath = normalize(decodeURIComponent(cleanPath)).replace(/^(\.\.[/\\])+/, "");
  return join(rootDir, relativePath);
}

function findExistingFile(urlPath) {
  const candidateRoots = [siteRootDir, webExportRootDir];

  for (const rootDir of candidateRoots) {
    const filePath = resolvePath(rootDir, urlPath);
    if (!filePath.startsWith(rootDir)) {
      continue;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      continue;
    }

    return filePath;
  }

  return null;
}

createServer((req, res) => {
  const filePath = findExistingFile(req.url ?? "/");

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`Site dev server running at http://localhost:${port}`);
});
