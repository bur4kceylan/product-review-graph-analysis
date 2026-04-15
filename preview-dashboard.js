const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 4173;
const ROOT_DIR = process.cwd();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function resolveFilePath(urlPath) {
  const cleanPath = urlPath === "/" ? "/dashboard.html" : urlPath;
  const safePath = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(ROOT_DIR, safePath);
}

async function serveFile(filePath, response) {
  const content = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
  });
  response.end(content);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => resolve(raw));
    request.on("error", reject);
  });
}

function repairText(value) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  if (/[ÃƒÃ…Ã„]/.test(value)) {
    try {
      return Buffer.from(value, "latin1").toString("utf8");
    } catch {
      return value;
    }
  }

  return value;
}

function extractContentId(productUrl) {
  const match = productUrl.match(/-p-(\d+)/i);

  if (!match) {
    throw new Error(
      "Trendyol linki içinde '-p-941342405' benzeri bir ürün kimliği bulunamadı.",
    );
  }

  return match[1];
}

function runPipeline(productUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["run-pipeline.js", productUrl], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `Pipeline failed: ${code}`));
    });
  });
}

async function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function resolveLatestSummaryFile() {
  const summaryDir = path.join(ROOT_DIR, "data", "summary");
  const files = (await fs.readdir(summaryDir))
    .filter((file) => file.endsWith(".summary.json"))
    .sort()
    .reverse();

  let fallbackFile = null;

  for (const file of files) {
    const filePath = path.join(summaryDir, file);
    const summary = JSON.parse(await fs.readFile(filePath, "utf8"));

    fallbackFile ??= filePath;

    const totalReviews = Number(summary?.totalReviews || 0);
    const totalRatings = Number(summary?.ratingBreakdown?.totalRatings || 0);
    const totalCommentCount = Number(summary?.sourceSummary?.totalCommentCount || 0);

    if (totalReviews > 0 || totalRatings > 0 || totalCommentCount > 0) {
      return filePath;
    }
  }

  if (!fallbackFile) {
    throw new Error("Hiç özet dosyası bulunamadı.");
  }

  return fallbackFile;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && requestUrl.pathname === "/api/analyze") {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body || "{}");
      const productUrl = String(payload.productUrl || "").trim();

      if (!productUrl) {
        await sendJson(response, 400, {
          error: "Ürün linki boş bırakılamaz.",
        });
        return;
      }

      const contentId = extractContentId(productUrl);
      await runPipeline(productUrl);

      const summaryPath = path.join(
        ROOT_DIR,
        "data",
        "summary",
        `reviews-${contentId}.summary.json`,
      );
      const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));

      await sendJson(response, 200, {
        ok: true,
        summary,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/summary") {
      const file = requestUrl.searchParams.get("file");
      const filePath = file ? resolveFilePath(file) : await resolveLatestSummaryFile();
      const summary = JSON.parse(await fs.readFile(filePath, "utf8"));

      await sendJson(response, 200, {
        ok: true,
        summary,
      });
      return;
    }

    const filePath = resolveFilePath(requestUrl.pathname);
    await serveFile(filePath, response);
  } catch (error) {
    if (request.url?.startsWith("/api/")) {
      await sendJson(response, 500, {
        error: repairText(error.message) || "Beklenmeyen bir hata oluştu.",
      });
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard preview: http://localhost:${PORT}`);
});
