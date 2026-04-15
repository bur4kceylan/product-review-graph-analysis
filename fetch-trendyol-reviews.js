const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const DEFAULT_PRODUCT_URL =
  "https://www.trendyol.com/lenovo/ideapad-slim-3-intel-celeron-n100-4gb-128gb-intel-uhd-graphics-15-6-fhd-w11-notebook-82xb009gtx-p-941342405/yorumlar";
const RAW_DATA_DIR = path.join(process.cwd(), "data", "raw");
const PAGE_SIZE = 20;
const CHANNEL_ID = 1;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const EXTRA_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const BROWSER_STARTUP_TIMEOUT_MS = 45000;

const REVIEW_API_URL =
  "https://apigw.trendyol.com/discovery-storefront-trproductgw-service/api/review-read/product-reviews/detailed";

function getProductUrl() {
  return process.argv[2] || DEFAULT_PRODUCT_URL;
}

function extractContentId(productUrl) {
  const match = productUrl.match(/-p-(\d+)/i);

  if (!match) {
    throw new Error(
      "Product link must include a Trendyol contentId like '-p-941342405'.",
    );
  }

  return match[1];
}

function buildOutputFile(contentId) {
  return path.join(RAW_DATA_DIR, `reviews-${contentId}.raw.json`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDelayMs() {
  return BASE_DELAY_MS + Math.floor(Math.random() * (EXTRA_DELAY_MS + 1));
}

function normalizeReviews(payload) {
  const candidates = [
    payload?.result?.productReviews?.content,
    payload?.result?.productReviews?.reviews,
    payload?.result?.productReviews,
    payload?.result?.reviews,
    payload?.result?.data,
    payload?.reviews,
    payload?.content,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractReviewMeta(payload) {
  return {
    aiSummary:
      payload?.result?.aiSummary ??
      null,
    summary:
      payload?.result?.summary ??
      null,
  };
}

function repairText(value) {
  if (typeof value !== "string" || value.length === 0) {
    return value ?? "";
  }

  // Trendyol review text can occasionally arrive as UTF-8 bytes interpreted
  // as Latin-1. Re-interpreting the string restores Turkish characters.
  if (/[ÃÅÄ]/.test(value)) {
    return Buffer.from(value, "latin1").toString("utf8");
  }

  return value;
}

function mapReview(review) {
  return {
    comment:
      repairText(
        review?.comment ??
          review?.commentText ??
          review?.text ??
          review?.reviewText ??
          "",
      ),
    rate:
      review?.rate ??
      review?.rating ??
      review?.score ??
      review?.starCount ??
      null,
    createdAt:
      review?.createdAt ??
      review?.creationDate ??
      review?.createdDate ??
      review?.date ??
      null,
  };
}

async function createBrowserSession() {
  const browser = await chromium.launch({
    headless: false,
    timeout: BROWSER_STARTUP_TIMEOUT_MS,
  });

  const context = await browser.newContext({
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 960 },
    extraHTTPHeaders: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://www.trendyol.com/",
      Origin: "https://www.trendyol.com",
    },
  });

  const page = await context.newPage();
  return { browser, context, page };
}

async function warmUpSession(page, productUrl) {
  await page.goto(productUrl, {
    waitUntil: "domcontentloaded",
    timeout: REQUEST_TIMEOUT_MS,
  });

  await page.waitForLoadState("networkidle", {
    timeout: REQUEST_TIMEOUT_MS,
  }).catch(() => undefined);

  await sleep(2500);
}

async function fetchPageInBrowser(page, contentId, pageIndex, attempt = 1) {
  try {
    const result = await page.evaluate(
      async ({ url, contentId, pageNumber, pageSize, channelId }) => {
        const requestUrl = new URL(url);
        requestUrl.searchParams.set("contentId", contentId);
        requestUrl.searchParams.set("page", String(pageNumber));
        requestUrl.searchParams.set("pageSize", String(pageSize));
        requestUrl.searchParams.set("channelId", String(channelId));

        const finalResponse = await fetch(requestUrl.toString(), {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
          },
        });

        const bytes = Array.from(
          new Uint8Array(await finalResponse.arrayBuffer()),
        );

        return {
          ok: finalResponse.ok,
          status: finalResponse.status,
          bytes,
        };
      },
      {
        url: REVIEW_API_URL,
        contentId,
        pageNumber: pageIndex,
        pageSize: PAGE_SIZE,
        channelId: CHANNEL_ID,
      },
    );

    if (!result.ok) {
      throw new Error(`HTTP ${result.status}`);
    }

    const payload = JSON.parse(Buffer.from(result.bytes).toString("utf8"));
    return {
      reviews: normalizeReviews(payload),
      meta: extractReviewMeta(payload),
    };
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(
        `Page ${pageIndex} could not be fetched after ${MAX_RETRIES} attempts: ${error.message}`,
      );
    }

    const retryDelayMs = getDelayMs();
    console.warn(
      `Request failed for page ${pageIndex} (attempt ${attempt}/${MAX_RETRIES}): ${error.message}. Retrying in ${retryDelayMs} ms...`,
    );
    await sleep(retryDelayMs);

    return fetchPageInBrowser(page, contentId, pageIndex, attempt + 1);
  }
}

async function fetchAllReviews(page, contentId) {
  const allReviews = [];
  let pageIndex = 0;
  let meta = {
    aiSummary: null,
    summary: null,
  };

  while (true) {
    console.log(`Fetching page ${pageIndex}...`);
    const result = await fetchPageInBrowser(page, contentId, pageIndex);
    const reviews = result.reviews;

    if (pageIndex === 0) {
      meta = result.meta;
    }

    if (reviews.length === 0) {
      console.log(`No reviews returned on page ${pageIndex}. Pagination finished.`);
      break;
    }

    allReviews.push(...reviews.map(mapReview));
    console.log(
      `Page ${pageIndex} fetched successfully. ${reviews.length} review(s) collected.`,
    );

    pageIndex += 1;
    await sleep(getDelayMs());
  }

  return {
    reviews: allReviews,
    meta,
  };
}

async function saveReviews(outputFile, payload) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(payload, null, 2), "utf8");
}

async function clearSession(context) {
  try {
    await context.clearCookies();
  } catch (error) {
    console.warn(`Cookie cleanup warning: ${error.message}`);
  }
}

async function main() {
  let browser;
  let context;
  let page;
  const productUrl = getProductUrl();
  const contentId = extractContentId(productUrl);
  const outputFile = buildOutputFile(contentId);

  try {
    ({ browser, context, page } = await createBrowserSession());
    await warmUpSession(page, productUrl);
    const { reviews, meta } = await fetchAllReviews(page, contentId);
    await saveReviews(outputFile, {
      productUrl,
      contentId,
      totalReviews: reviews.length,
      fetchedAt: new Date().toISOString(),
      sourceSummary: meta.summary,
      sourceAiSummary: meta.aiSummary,
      reviews,
    });
    console.log(
      `Done. ${reviews.length} total review(s) saved to ${outputFile}.`,
    );
  } catch (error) {
    console.error("Script failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (context) {
      await clearSession(context);
    }

    if (browser) {
      await browser.close();
    }
  }
}

main();
