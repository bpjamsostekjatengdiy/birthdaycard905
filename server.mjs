import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const root = process.cwd();
const port = Number(process.env.PORT || 8088);
const types = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/proxy-image") {
    proxyImage(url, response);
    return;
  }

  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, requestedPath === "/" ? "index.html" : requestedPath);

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  response.writeHead(200, { "content-type": types[extname(filePath).toLowerCase()] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Birthday Card running at http://localhost:${port}`);
});

async function proxyImage(url, response) {
  const target = url.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing image URL");
    return;
  }

  try {
    const upstream = await fetch(target);
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
      "content-type": contentType,
    });
    response.end(buffer);
  } catch (error) {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Could not load image: ${error.message}`);
  }
}
