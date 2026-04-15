const path = require("path");
const { spawn } = require("child_process");

const RAW_DATA_DIR = path.join(process.cwd(), "data", "raw");
const PROCESSED_DATA_DIR = path.join(process.cwd(), "data", "processed");
const SUMMARY_DATA_DIR = path.join(process.cwd(), "data", "summary");
const DEFAULT_PRODUCT_URL =
  "https://www.trendyol.com/lenovo/ideapad-slim-3-intel-celeron-n100-4gb-128gb-intel-uhd-graphics-15-6-fhd-w11-notebook-82xb009gtx-p-941342405/yorumlar";

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

function runNodeScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptName, ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptName} exited with code ${code}.`));
    });
  });
}

async function main() {
  const productUrl = getProductUrl();
  const contentId = extractContentId(productUrl);
  const rawFile = path.join(RAW_DATA_DIR, `reviews-${contentId}.raw.json`);
  const processedFile = path.join(
    PROCESSED_DATA_DIR,
    `reviews-${contentId}.processed.json`,
  );
  const summaryFile = path.join(
    SUMMARY_DATA_DIR,
    `reviews-${contentId}.summary.json`,
  );

  console.log(`Running pipeline for contentId ${contentId}...`);

  await runNodeScript("fetch-trendyol-reviews.js", [productUrl]);
  await runNodeScript("clean-reviews.js", [rawFile]);
  await runNodeScript("analyze-reviews.js", [processedFile]);

  console.log("Pipeline completed successfully.");
  console.log(`Raw reviews: ${rawFile}`);
  console.log(`Processed reviews: ${processedFile}`);
  console.log(`Summary: ${summaryFile}`);
}

main().catch((error) => {
  console.error("Pipeline failed:", error.message);
  process.exitCode = 1;
});
