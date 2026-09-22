import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const root = process.cwd();
const port = Number(process.env.PORT || 8088);
const templateDir = join(root, "data");
const templateMetaPath = join(templateDir, "template.json");
const templateFilePath = join(templateDir, "template-current");
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

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/proxy-image") {
    proxyImage(url, response);
    return;
  }

  if (url.pathname === "/template-meta") {
    await sendTemplateMeta(response);
    return;
  }

  if (url.pathname === "/saved-template") {
    await sendSavedTemplate(response);
    return;
  }

  if (url.pathname === "/template" && request.method === "POST") {
    await saveTemplate(request, response);
    return;
  }

  if (url.pathname === "/template" && request.method === "DELETE") {
    await deleteTemplate(response);
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
    const upstream = await fetch(target, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36",
      },
    });
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

async function sendTemplateMeta(response) {
  try {
    if (!existsSync(templateMetaPath)) throw new Error("No template");
    const meta = JSON.parse(await readFile(templateMetaPath, "utf8"));
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(meta));
  } catch {
    response.writeHead(404, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false }));
  }
}

async function sendSavedTemplate(response) {
  try {
    if (!existsSync(templateMetaPath) || !existsSync(templateFilePath)) throw new Error("No template");
    const meta = JSON.parse(await readFile(templateMetaPath, "utf8"));
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": meta.type || "image/png",
    });
    createReadStream(templateFilePath).pipe(response);
  } catch {
    response.writeHead(404, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" });
    response.end("No saved template");
  }
}

async function saveTemplate(request, response) {
  try {
    const body = await readRequestBody(request, 16 * 1024 * 1024);
    const payload = JSON.parse(body);
    const match = String(payload.dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
    if (!match) throw new Error("Format template harus PNG/JPG/WebP.");

    mkdirSync(templateDir, { recursive: true });
    const buffer = Buffer.from(match[2], "base64");
    const meta = {
      name: String(payload.name || "template-upload").slice(0, 160),
      type: match[1] === "image/jpg" ? "image/jpeg" : match[1],
      savedAt: new Date().toISOString(),
    };

    await writeFile(templateFilePath, buffer);
    await writeFile(templateMetaPath, JSON.stringify(meta, null, 2));
    response.writeHead(200, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, ...meta }));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, message: error.message }));
  }
}

async function deleteTemplate(response) {
  await Promise.allSettled([rm(templateFilePath, { force: true }), rm(templateMetaPath, { force: true })]);
  response.writeHead(200, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: true }));
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Ukuran template terlalu besar."));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
