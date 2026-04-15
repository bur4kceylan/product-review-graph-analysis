const fs = require("fs/promises");
const path = require("path");

const RAW_DATA_DIR = path.join(process.cwd(), "data", "raw");
const PROCESSED_DATA_DIR = path.join(process.cwd(), "data", "processed");
const MIN_COMMENT_LENGTH = 8;
const TURKISH_STOPWORDS = new Set([
  "acaba",
  "ama",
  "aslinda",
  "az",
  "bazı",
  "belki",
  "ben",
  "bence",
  "beni",
  "benim",
  "bir",
  "biri",
  "birkaç",
  "birsey",
  "biz",
  "bize",
  "bu",
  "çok",
  "cok",
  "çünkü",
  "da",
  "daha",
  "de",
  "defa",
  "değil",
  "diye",
  "eğer",
  "en",
  "gibi",
  "hem",
  "hep",
  "hepsi",
  "her",
  "hiç",
  "icin",
  "için",
  "ile",
  "ise",
  "iyi",
  "kez",
  "ki",
  "kim",
  "mı",
  "mi",
  "mu",
  "mü",
  "nasıl",
  "ne",
  "neden",
  "nerde",
  "olarak",
  "olan",
  "oldu",
  "olduğu",
  "oldukça",
  "oluyor",
  "onu",
  "sanki",
  "şey",
  "siz",
  "şu",
  "tam",
  "ve",
  "veya",
  "ya",
  "yani",
]);

async function resolveDefaultInputFile() {
  try {
    const files = await fs.readdir(RAW_DATA_DIR);
    const rawFiles = files.filter((file) => file.endsWith(".raw.json")).sort();

    if (rawFiles.length > 0) {
      return path.join(RAW_DATA_DIR, rawFiles[rawFiles.length - 1]);
    }
  } catch {
    // Fall back to the legacy root-level file.
  }

  return path.join(process.cwd(), "reviews.json");
}

async function getInputFile() {
  return process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : resolveDefaultInputFile();
}

function repairText(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  if (/[ÃÅÄ]/.test(value)) {
    try {
      return Buffer.from(value, "latin1").toString("utf8");
    } catch {
      return value;
    }
  }

  return value;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanComment(value) {
  const repaired = repairText(value);
  const normalized = normalizeWhitespace(repaired)
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, " ")
    .replace(/[^\p{L}\p{N}\s.,!?-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function buildNormalizedComment(value) {
  return cleanComment(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 1 &&
        !TURKISH_STOPWORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}

function getCommentSignature(normalizedComment) {
  return normalizedComment.replace(/\s+/g, " ").trim();
}

async function loadJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function normalizeRawPayload(payload, inputFile) {
  if (Array.isArray(payload)) {
    return {
      productUrl: null,
      contentId:
        payload[0]?.contentId ??
        payload[0]?.productId ??
        path.basename(inputFile, path.extname(inputFile)),
      totalReviews: payload.length,
      fetchedAt: null,
      reviews: payload,
    };
  }

  return {
    productUrl: payload.productUrl ?? null,
    contentId: payload.contentId ?? path.basename(inputFile, path.extname(inputFile)),
    totalReviews: payload.totalReviews ?? payload.reviews?.length ?? 0,
    fetchedAt: payload.fetchedAt ?? null,
    sourceSummary:
      payload.sourceSummary && typeof payload.sourceSummary === "object"
        ? payload.sourceSummary
        : null,
    sourceAiSummary:
      typeof payload.sourceAiSummary === "string" ? payload.sourceAiSummary : null,
    reviews: Array.isArray(payload.reviews) ? payload.reviews : [],
  };
}

function processReviews(rawPayload) {
  const seen = new Set();
  const processedReviews = [];
  let duplicateCount = 0;
  let droppedShortCount = 0;
  let droppedEmptyCount = 0;

  rawPayload.reviews.forEach((review, index) => {
    const originalComment = typeof review?.comment === "string" ? review.comment : "";
    const cleanText = cleanComment(originalComment);
    const normalizedComment = buildNormalizedComment(originalComment);

    if (!normalizedComment) {
      droppedEmptyCount += 1;
      return;
    }

    if (normalizedComment.length < MIN_COMMENT_LENGTH) {
      droppedShortCount += 1;
      return;
    }

    const signature = getCommentSignature(normalizedComment);
    if (seen.has(signature)) {
      duplicateCount += 1;
      return;
    }

    seen.add(signature);

    processedReviews.push({
      reviewId: `${rawPayload.contentId}-${index + 1}`,
      comment: cleanText,
      normalizedComment,
      rate:
        typeof review?.rate === "number"
          ? review.rate
          : Number.isFinite(Number(review?.rate))
            ? Number(review.rate)
            : null,
      createdAt: review?.createdAt ?? null,
      tokens: tokenize(normalizedComment),
      tokenCount: tokenize(normalizedComment).length,
    });
  });

  return {
    processedReviews,
    duplicateCount,
    droppedShortCount,
    droppedEmptyCount,
  };
}

function buildOutputFile(contentId) {
  return path.join(PROCESSED_DATA_DIR, `reviews-${contentId}.processed.json`);
}

async function main() {
  const inputFile = await getInputFile();
  const rawPayload = normalizeRawPayload(await loadJson(inputFile), inputFile);
  const {
    processedReviews,
    duplicateCount,
    droppedShortCount,
    droppedEmptyCount,
  } = processReviews(rawPayload);
  const outputFile = buildOutputFile(rawPayload.contentId);

  const payload = {
    productUrl: rawPayload.productUrl,
    contentId: rawPayload.contentId,
    fetchedAt: rawPayload.fetchedAt,
    sourceSummary: rawPayload.sourceSummary,
    sourceAiSummary: rawPayload.sourceAiSummary,
    sourceFile: inputFile,
    stats: {
      rawReviewCount: rawPayload.reviews.length,
      processedReviewCount: processedReviews.length,
      duplicateCount,
      droppedShortCount,
      droppedEmptyCount,
    },
    reviews: processedReviews,
  };

  await fs.mkdir(PROCESSED_DATA_DIR, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(
    `Processed ${processedReviews.length} review(s). Output saved to ${outputFile}.`,
  );
}

main().catch((error) => {
  console.error("Cleaning failed:", error.message);
  process.exitCode = 1;
});
