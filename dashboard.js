function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(2)}%`;
}

function repairText(value) {
  if (typeof value !== "string" || value.length === 0) {
    return value ?? "";
  }

  if (/[ÃƒÃ…Ã„]/.test(value)) {
    try {
      return decodeURIComponent(escape(value));
    } catch {
      return value;
    }
  }

  return value;
}

function formatAspectLabel(aspect) {
  const labels = {
    "fiyat-performans": "Fiyat / Performans",
    performans: "Performans",
    ekran: "Ekran",
    batarya: "Batarya",
    kargo: "Kargo",
    kullanim: "Kullanım",
    "malzeme-kalite": "Malzeme / Kalite",
  };

  return labels[aspect] || aspect;
}

function createAspectCard(item, type) {
  const wrapper = document.createElement("article");
  wrapper.className = "aspect-item";
  const quote = item.example?.comment;

  wrapper.innerHTML = `
    <strong>${formatAspectLabel(item.aspect)}</strong>
    <div class="aspect-metrics">
      <span class="metric-pill">${item.mentions} yorum</span>
      <span class="metric-pill">${
        type === "strength"
          ? `Pozitif oranı ${formatPercent((item.positiveRatio || 0) * 100)}`
          : `Negatif oranı ${formatPercent((item.negativeRatio || 0) * 100)}`
      }</span>
    </div>
    ${
      quote
        ? `<p class="aspect-quote">"${repairText(quote)}"</p>`
        : `<p class="aspect-quote">Bu başlık için yeterli örnek yorum bulunamadı.</p>`
    }
  `;

  return wrapper;
}

function createPhrasePill(item) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = `${repairText(item.value)} • ${item.count}`;
  return pill;
}

function createQuoteCard(item) {
  const article = document.createElement("article");
  article.className = "quote-card";
  article.innerHTML = `
    <p>"${repairText(item.comment)}"</p>
    <footer>Puan: ${item.rate ?? "-"} | Skor: ${item.sentimentScore ?? "-"}</footer>
  `;
  return article;
}

function createEmptyCard(message) {
  const wrapper = document.createElement("article");
  wrapper.className = "aspect-item empty-state";
  wrapper.innerHTML = `<p class="aspect-quote">${message}</p>`;
  return wrapper;
}

function createEmptyQuote(message) {
  const article = document.createElement("article");
  article.className = "quote-card empty-state";
  article.innerHTML = `<p>${message}</p>`;
  return article;
}

function setBar(id, value) {
  const bar = document.getElementById(id);
  if (bar) {
    bar.style.width = `${Math.max(0, Math.min(100, value || 0))}%`;
  }
}

function setLoadingState(isLoading, title, text) {
  const overlay = document.getElementById("loadingOverlay");
  const submitButton = document.getElementById("submitButton");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingText = document.getElementById("loadingText");

  overlay.classList.toggle("hidden", !isLoading);
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Hazırlanıyor..." : "Analizi Başlat";

  if (title) {
    loadingTitle.textContent = title;
  }

  if (text) {
    loadingText.textContent = text;
  }
}

function showResults() {
  document.body.classList.remove("input-mode");
  document.getElementById("inputShell").classList.add("hidden");
  document.getElementById("resultsHero").classList.remove("hidden");
  document.getElementById("resultsGrid").classList.remove("hidden");
}

function showInputMode() {
  document.body.classList.add("input-mode");
  document.getElementById("inputShell").classList.remove("hidden");
  document.getElementById("resultsHero").classList.add("hidden");
  document.getElementById("resultsGrid").classList.add("hidden");
}

function updateHelperText(message) {
  const helper = document.querySelector(".helper-text");
  if (helper) {
    helper.textContent = message;
  }
}

function isMeaningfulSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return false;
  }

  const totalReviews = Number(summary.totalReviews || 0);
  const totalRatings = Number(summary?.ratingBreakdown?.totalRatings || 0);
  const totalCommentCount = Number(summary?.sourceSummary?.totalCommentCount || 0);

  return totalReviews > 0 || totalRatings > 0 || totalCommentCount > 0;
}

function renderSummary(summary) {
  if (!isMeaningfulSummary(summary)) {
    showInputMode();
    updateHelperText(
      "Bu ürün için gösterilecek yorum verisi bulunamadı. Başka bir Trendyol ürün linki deneyebilirsin.",
    );
    return;
  }

  showResults();

  document.getElementById("headline").textContent = repairText(summary.headline);
  document.getElementById("displaySummary").textContent = repairText(summary.displaySummary);
  document.getElementById("generalEvaluation").textContent = repairText(summary.generalEvaluation);
  document.getElementById("confidenceScore").textContent = summary.confidenceScore;
  document.getElementById("averageRating").textContent = summary.averageRating;
  document.getElementById("totalReviews").textContent = summary.totalReviews;
  document.getElementById("contentId").textContent = summary.contentId;

  document.getElementById("positiveValue").textContent = formatPercent(
    summary.sentimentPercentages.positive,
  );
  document.getElementById("neutralValue").textContent = formatPercent(
    summary.sentimentPercentages.neutral,
  );
  document.getElementById("negativeValue").textContent = formatPercent(
    summary.sentimentPercentages.negative,
  );

  setBar("positiveBar", summary.sentimentPercentages.positive);
  setBar("neutralBar", summary.sentimentPercentages.neutral);
  setBar("negativeBar", summary.sentimentPercentages.negative);

  document.getElementById("strengthsList").replaceChildren(
    ...((summary.strengths || []).length > 0
      ? summary.strengths.map((item) => createAspectCard(item, "strength"))
      : [createEmptyCard("Bu özet için yeterli güçlü yön sinyali bulunamadı.")]),
  );

  document.getElementById("weaknessesList").replaceChildren(
    ...((summary.weaknesses || []).length > 0
      ? summary.weaknesses.map((item) => createAspectCard(item, "weakness"))
      : [createEmptyCard("Belirgin bir geliştirme alanı saptanmadı.")]),
  );

  document.getElementById("phraseCloud").replaceChildren(
    ...((summary.topPhrases || []).length > 0
      ? summary.topPhrases.slice(0, 10).map(createPhrasePill)
      : [createEmptyCard("Tekrar eden ifade verisi henüz oluşmadı.")]),
  );

  document.getElementById("positiveQuotes").replaceChildren(
    ...((summary.samplePositiveReviews || []).length > 0
      ? summary.samplePositiveReviews.map(createQuoteCard)
      : [createEmptyQuote("Olumlu örnek yorum bulunamadı.")]),
  );

  document.getElementById("negativeQuotes").replaceChildren(
    ...((summary.sampleNegativeReviews || []).length > 0
      ? summary.sampleNegativeReviews.map(createQuoteCard)
      : [createEmptyQuote("Olumsuz örnek yorum bulunamadı.")]),
  );
}

async function analyzeProduct(productUrl) {
  setLoadingState(
    true,
    "Yorumlar çekiliyor...",
    "Trendyol verileri toplanıyor, yorumlar temizleniyor ve analiz ekranı hazırlanıyor.",
  );

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productUrl }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Analiz sırasında bir hata oluştu.");
  }

  return payload.summary;
}

document.getElementById("analyzeForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const productUrl = document.getElementById("productUrl").value.trim();

  try {
    const summary = await analyzeProduct(productUrl);
    renderSummary(summary);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoadingState(false);
  }
});

async function loadInitialSummary() {
  try {
    const response = await fetch("/api/summary");
    const payload = await response.json();

    if (response.ok && payload.ok && payload.summary) {
      renderSummary(payload.summary);
    }
  } catch {
    showInputMode();
  }
}

showInputMode();
loadInitialSummary();
