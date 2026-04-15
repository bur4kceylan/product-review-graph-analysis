const fs = require("fs/promises");
const path = require("path");

const PROCESSED_DATA_DIR = path.join(process.cwd(), "data", "processed");
const SUMMARY_DATA_DIR = path.join(process.cwd(), "data", "summary");

const POSITIVE_TERMS = [
  { term: "fiyat performans", weight: 3 },
  { term: "cok iyi", weight: 3 },
  { term: "gayet iyi", weight: 2 },
  { term: "cok guzel", weight: 3 },
  { term: "gayet guzel", weight: 2 },
  { term: "mukemmel", weight: 3 },
  { term: "harika", weight: 3 },
  { term: "basarili", weight: 2 },
  { term: "kaliteli", weight: 2 },
  { term: "memnun", weight: 2 },
  { term: "begendim", weight: 2 },
  { term: "begendi", weight: 2 },
  { term: "tavsiye ederim", weight: 3 },
  { term: "tavsiye", weight: 2 },
  { term: "hizli", weight: 1 },
  { term: "sessiz", weight: 2 },
  { term: "sorunsuz", weight: 2 },
  { term: "uygun", weight: 1 },
  { term: "guzel", weight: 1 },
  { term: "iyi", weight: 1 },
];

const NEGATIVE_TERMS = [
  { term: "cok kotu", weight: -4 },
  { term: "berbat", weight: -4 },
  { term: "rezalet", weight: -4 },
  { term: "pisman", weight: -3 },
  { term: "iade", weight: -3 },
  { term: "problem", weight: -2 },
  { term: "sorun", weight: -2 },
  { term: "bozuk", weight: -3 },
  { term: "eksik", weight: -2 },
  { term: "yavas", weight: -2 },
  { term: "donuyor", weight: -3 },
  { term: "kasiyor", weight: -3 },
  { term: "isiniyor", weight: -2 },
  { term: "sikayet", weight: -2 },
  { term: "kotu", weight: -2 },
];

const ASPECT_CONFIG = {
  "fiyat-performans": {
    keywords: ["fiyat performans", "uygun fiyat", "fiyat", "parasina gore"],
    positiveHints: ["uygun", "deger", "basarili", "iyi"],
    negativeHints: ["pahali", "degmez"],
  },
  performans: {
    keywords: ["performans", "hizli", "akici", "is goruyor", "sessiz"],
    positiveHints: ["akici", "sessiz", "yeterli", "iyi", "hizli"],
    negativeHints: ["yavas", "donuyor", "kasiyor", "isiniyor"],
  },
  ekran: {
    keywords: ["ekran", "goruntu", "cozunurluk"],
    positiveHints: ["canli", "guzel", "iyi", "net"],
    negativeHints: ["kotu", "soluk", "karanlik", "yetersiz"],
  },
  batarya: {
    keywords: ["batarya", "sarj", "pil"],
    positiveHints: ["uzun", "yeterli", "iyi"],
    negativeHints: ["cabuk", "hizli bitiyor", "az gidiyor", "yetersiz"],
  },
  kargo: {
    keywords: ["kargo", "teslimat", "paketleme", "paketlenmis", "gonderilmis"],
    positiveHints: ["hizli", "saglam", "ozenli", "iyi"],
    negativeHints: ["gec", "hasarli", "ezik", "kotu"],
  },
  kullanim: {
    keywords: ["gunluk", "ders", "ofis", "film", "internette", "kullanim"],
    positiveHints: ["ideal", "uygun", "yeterli", "rahat"],
    negativeHints: ["zor", "yetersiz", "kotu"],
  },
  "malzeme-kalite": {
    keywords: ["malzeme", "kasa", "plastik", "kalite", "kaliteli"],
    positiveHints: ["sik", "kaliteli", "saglam", "iyi"],
    negativeHints: ["kalitesiz", "dayaniksiz", "zayif", "kotu"],
  },
};

async function resolveDefaultInputFile() {
  const files = await fs.readdir(PROCESSED_DATA_DIR);
  const processedFiles = files.filter((file) => file.endsWith(".processed.json")).sort();

  if (processedFiles.length === 0) {
    throw new Error(
      "No processed review file found. Run the clean step first or pass a file path.",
    );
  }

  return path.join(PROCESSED_DATA_DIR, processedFiles[processedFiles.length - 1]);
}

async function getInputFile() {
  return process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : resolveDefaultInputFile();
}

async function loadJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function foldText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWeightedMatches(text, entries) {
  return entries.reduce((score, entry) => {
    if (text.includes(entry.term)) {
      return score + entry.weight;
    }

    return score;
  }, 0);
}

function scoreSentiment(review) {
  const text = review.searchableComment;
  let score = 0;

  score += countWeightedMatches(text, POSITIVE_TERMS);
  score += countWeightedMatches(text, NEGATIVE_TERMS);

  if (typeof review.rate === "number") {
    if (review.rate === 5) {
      score += 3;
    } else if (review.rate === 4) {
      score += 2;
    } else if (review.rate === 2) {
      score -= 2;
    } else if (review.rate === 1) {
      score -= 3;
    }
  }

  if (score >= 2) {
    return { sentiment: "positive", score };
  }

  if (score <= -2) {
    return { sentiment: "negative", score };
  }

  return { sentiment: "neutral", score };
}

function buildFrequencyMap(items, limit = 20) {
  const map = new Map();

  items.forEach((item) => {
    map.set(item, (map.get(item) ?? 0) + 1);
  });

  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildPhraseFrequency(reviews, limit = 12) {
  const phrases = [];

  reviews.forEach((review) => {
    for (let index = 0; index < review.tokens.length - 1; index += 1) {
      const left = foldText(review.tokens[index]);
      const right = foldText(review.tokens[index + 1]);

      if (left.length < 2 || right.length < 2) {
        continue;
      }

      phrases.push(`${left} ${right}`);
    }
  });

  return buildFrequencyMap(phrases, limit);
}

function detectReviewAspects(review) {
  const detected = [];

  Object.entries(ASPECT_CONFIG).forEach(([aspect, config]) => {
    const matched = config.keywords.some((keyword) =>
      review.searchableComment.includes(keyword),
    );

    if (!matched) {
      return;
    }

    let aspectSentiment = review.sentiment;

    const positiveHintMatched = config.positiveHints.some((hint) =>
      review.searchableComment.includes(hint),
    );
    const negativeHintMatched = config.negativeHints.some((hint) =>
      review.searchableComment.includes(hint),
    );

    if (positiveHintMatched && !negativeHintMatched) {
      aspectSentiment = "positive";
    } else if (!positiveHintMatched && negativeHintMatched) {
      aspectSentiment = "negative";
    }

    detected.push({
      aspect,
      sentiment: aspectSentiment,
    });
  });

  return detected;
}

function collectAspectStats(reviews) {
  const aspectStats = {};

  Object.keys(ASPECT_CONFIG).forEach((aspect) => {
    aspectStats[aspect] = {
      mentions: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      bestPositiveComment: null,
      strongestNegativeComment: null,
    };
  });

  reviews.forEach((review) => {
    review.aspects.forEach(({ aspect, sentiment }) => {
      const stats = aspectStats[aspect];

      stats.mentions += 1;
      stats[sentiment] += 1;

      if (
        sentiment === "positive" &&
        (!stats.bestPositiveComment ||
          review.sentimentScore > stats.bestPositiveComment.sentimentScore)
      ) {
        stats.bestPositiveComment = {
          comment: review.comment,
          rate: review.rate,
          sentimentScore: review.sentimentScore,
        };
      }

      if (
        sentiment === "negative" &&
        (!stats.strongestNegativeComment ||
          review.sentimentScore < stats.strongestNegativeComment.sentimentScore)
      ) {
        stats.strongestNegativeComment = {
          comment: review.comment,
          rate: review.rate,
          sentimentScore: review.sentimentScore,
        };
      }
    });
  });

  return Object.entries(aspectStats)
    .filter(([, stats]) => stats.mentions > 0)
    .sort((left, right) => right[1].mentions - left[1].mentions)
    .map(([aspect, stats]) => ({
      aspect,
      mentions: stats.mentions,
      positive: stats.positive,
      neutral: stats.neutral,
      negative: stats.negative,
      positiveRatio:
        stats.mentions > 0 ? Number((stats.positive / stats.mentions).toFixed(3)) : 0,
      negativeRatio:
        stats.mentions > 0 ? Number((stats.negative / stats.mentions).toFixed(3)) : 0,
      bestPositiveComment: stats.bestPositiveComment,
      strongestNegativeComment: stats.strongestNegativeComment,
    }));
}

function pickTopExamples(reviews, sentiment, limit = 3) {
  return reviews
    .filter((review) => review.sentiment === sentiment)
    .sort((left, right) => {
      if (sentiment === "negative") {
        return left.sentimentScore - right.sentimentScore;
      }

      return right.sentimentScore - left.sentimentScore;
    })
    .slice(0, limit)
    .map((review) => ({
      comment: review.comment,
      rate: review.rate,
      sentimentScore: review.sentimentScore,
    }));
}

function formatAspectLabel(aspect) {
  const labels = {
    "fiyat-performans": "fiyat/performans",
    performans: "performans",
    ekran: "ekran",
    batarya: "batarya",
    kargo: "kargo",
    kullanim: "kullanim",
    "malzeme-kalite": "malzeme/kalite",
  };

  return labels[aspect] ?? aspect.replace("-", "/");
}

function buildSentimentPercentages(sentimentCounts, totalReviews) {
  return {
    positive:
      totalReviews > 0
        ? Number(((sentimentCounts.positive / totalReviews) * 100).toFixed(2))
        : 0,
    neutral:
      totalReviews > 0
        ? Number(((sentimentCounts.neutral / totalReviews) * 100).toFixed(2))
        : 0,
    negative:
      totalReviews > 0
        ? Number(((sentimentCounts.negative / totalReviews) * 100).toFixed(2))
        : 0,
  };
}

function buildNarrativeTone(sentimentPercentages) {
  if (sentimentPercentages.positive >= 70) {
    return "cok olumlu";
  }

  if (sentimentPercentages.positive >= 55) {
    return "olumlu";
  }

  if (sentimentPercentages.negative >= 35) {
    return "karisik";
  }

  return "dengeli";
}

function buildConfidenceScore(totalReviews, sentimentPercentages) {
  const volumeScore = Math.min(totalReviews / 250, 1) * 60;
  const consistencyScore =
    (Math.max(sentimentPercentages.positive, sentimentPercentages.negative) / 100) *
    40;

  return Math.round(volumeScore + consistencyScore);
}

function buildRatingBreakdown(sourceSummary) {
  const ratingCounts = Array.isArray(sourceSummary?.ratingCounts)
    ? sourceSummary.ratingCounts
    : [];

  if (ratingCounts.length === 0) {
    return null;
  }

  const map = new Map(
    ratingCounts.map((item) => [Number(item.rate), Number(item.count) || 0]),
  );
  const totalRatings =
    Number(sourceSummary?.totalRatingCount) ||
    [...map.values()].reduce((sum, count) => sum + count, 0);

  if (!totalRatings) {
    return null;
  }

  const positiveCount = (map.get(5) ?? 0) + (map.get(4) ?? 0);
  const neutralCount = map.get(3) ?? 0;
  const negativeCount = (map.get(2) ?? 0) + (map.get(1) ?? 0);

  return {
    totalRatings,
    positiveCount,
    neutralCount,
    negativeCount,
    positivePercent: Number(((positiveCount / totalRatings) * 100).toFixed(2)),
    neutralPercent: Number(((neutralCount / totalRatings) * 100).toFixed(2)),
    negativePercent: Number(((negativeCount / totalRatings) * 100).toFixed(2)),
    fiveStarPercent: Number((((map.get(5) ?? 0) / totalRatings) * 100).toFixed(2)),
    oneStarPercent: Number((((map.get(1) ?? 0) / totalRatings) * 100).toFixed(2)),
  };
}

function pickTopSourceTags(sourceSummary, limit = 4) {
  const tags = Array.isArray(sourceSummary?.tags) ? sourceSummary.tags : [];

  return tags
    .filter((tag) => Number(tag?.count) > 0)
    .filter((tag) => {
      const name = String(tag.name ?? "").toLocaleLowerCase("tr-TR");
      return !["tümü", "fotograflı", "fotoğraflı"].includes(name);
    })
    .sort((left, right) => Number(right.count) - Number(left.count))
    .slice(0, limit)
    .map((tag) => ({
      name: String(tag.name),
      count: Number(tag.count) || 0,
      positive: Number(tag?.sentiment?.positive) || 0,
      negative: Number(tag?.sentiment?.negative) || 0,
      ratio: Number(tag?.sentiment?.ratio) || null,
    }));
}

function buildRatingSignalLabel(ratingBreakdown) {
  if (!ratingBreakdown) {
    return null;
  }

  if (ratingBreakdown.positivePercent >= 75 && ratingBreakdown.negativePercent <= 18) {
    return "guclu pozitif";
  }

  if (ratingBreakdown.positivePercent >= 65 && ratingBreakdown.negativePercent <= 25) {
    return "olumlu";
  }

  if (ratingBreakdown.negativePercent >= 30) {
    return "riskli";
  }

  return "karisik";
}

function buildCommentCoverage(summary) {
  const totalRatingCount = Number(summary?.totalRatingCount);
  const totalCommentCount = Number(summary?.totalCommentCount);

  if (!totalRatingCount || !totalCommentCount) {
    return null;
  }

  return {
    totalRatingCount,
    totalCommentCount,
    ratingsWithoutComment: Math.max(totalRatingCount - totalCommentCount, 0),
    commentCoveragePercent: Number(((totalCommentCount / totalRatingCount) * 100).toFixed(2)),
  };
}

function buildTagSummarySentence(sourceTags) {
  if (!Array.isArray(sourceTags) || sourceTags.length === 0) {
    return null;
  }

  const descriptiveTags = sourceTags.map((item) => {
    if (item.ratio !== null) {
      return `${item.name} (${item.count}, %+${item.ratio})`.replace("%+", "%");
    }

    return `${item.name} (${item.count})`;
  });

  return `Platform etiketlerinde en sik one cikan basliklar ${descriptiveTags.join(", ")} oldu.`;
}

function buildHeadline(sentimentPercentages, averageRating, ratingBreakdown) {
  if (ratingBreakdown && ratingBreakdown.positivePercent >= 75 && averageRating >= 4) {
    return "Toplam puanlama tarafi guclu; yazili yorumlar da genel memnuniyeti destekliyor.";
  }

  if (sentimentPercentages.positive >= 75 && averageRating >= 4) {
    return "Kullanicilarin buyuk kismi urunden memnun gorunuyor.";
  }

  if (sentimentPercentages.positive >= 65 && averageRating >= 4) {
    return "Genel memnuniyet guclu, ancak bazi basliklarda cekinceler dikkat cekiyor.";
  }

  if (sentimentPercentages.negative >= 30) {
    return "Yorumlarda urunle ilgili belirgin cekinceler bulunuyor.";
  }

  return "Genel algi olumlu olsa da urunle ilgili karisik sinyaller de var.";
}

function joinNatural(items) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} ve ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

function buildStrengthPhrase(aspect) {
  const phrases = {
    "fiyat-performans": "fiyat/performans dengesi",
    performans: "gunluk kullanim performansi",
    ekran: "ekran deneyimi",
    batarya: "batarya yeterliligi",
    kargo: "hizli teslimat ve paketleme",
    kullanim: "gunluk kullanim kolayligi",
    "malzeme-kalite": "tasarim ve malzeme hissi",
  };

  return phrases[aspect] ?? formatAspectLabel(aspect);
}

function buildConcernPhrase(aspect) {
  const phrases = {
    "fiyat-performans": "fiyat dengesine dair beklentiler",
    performans: "uzun sureli performans",
    ekran: "ekran kalitesi",
    batarya: "sarj suresi",
    kargo: "teslimat sureci",
    kullanim: "bazi kullanim senaryolarindaki yeterlilik",
    "malzeme-kalite": "malzeme kalitesi",
  };

  return phrases[aspect] ?? formatAspectLabel(aspect);
}

function buildSuitableUseCases(topPositiveAspects) {
  const mapped = new Set();

  topPositiveAspects.forEach((item) => {
    if (item.aspect === "kullanim") {
      mapped.add("gunluk kullanim");
    }
    if (item.aspect === "performans") {
      mapped.add("ofis ve temel isler");
    }
    if (item.aspect === "fiyat-performans") {
      mapped.add("fiyat/performans odakli alisveris");
    }
  });

  return [...mapped].slice(0, 3);
}

function buildNegativeDetailList(topNegativeAspects, sourceTags) {
  const items = [];

  topNegativeAspects.forEach((item) => {
    const phrase = buildConcernPhrase(item.aspect);
    if (!items.includes(phrase)) {
      items.push(phrase);
    }
  });

  sourceTags.forEach((tag) => {
    if ((tag.ratio ?? 100) > 60 || !tag.negative) {
      return;
    }

    const label = String(tag.name).toLocaleLowerCase("tr-TR");
    if (!items.includes(label)) {
      items.push(label);
    }
  });

  return items.slice(0, 4);
}

function buildGeneralEvaluation(summary, topPositiveAspects, topNegativeAspects) {
  const ratingBreakdown = summary.ratingBreakdown;
  const commentCoverage = summary.commentCoverage;
  const sourceTags = Array.isArray(summary.sourceTags) ? summary.sourceTags : [];
  const suitableUseCases = buildSuitableUseCases(topPositiveAspects);
  const positivePhrases = topPositiveAspects
    .slice(0, 4)
    .map((item) => buildStrengthPhrase(item.aspect));
  const negativePhrases = buildNegativeDetailList(topNegativeAspects, sourceTags);

  const opening =
    positivePhrases.length > 0
      ? `Urun, ${joinNatural(positivePhrases)} ile kullanicilar tarafindan genel olarak olumlu degerlendirilmistir.`
      : "Urun, kullanicilar tarafindan genel olarak olumlu degerlendirilmistir.";

  const useCaseSentence =
    suitableUseCases.length > 0
      ? `Ozellikle ${joinNatural(suitableUseCases)} icin yeterli ve tercih edilebilir bir secenek oldugu belirtilmistir.`
      : null;

  const ratingSentence =
    ratingBreakdown
      ? `Toplam puanlamalarda da bu tablo desteklenmektedir; 4-5 yildiz orani %${ratingBreakdown.positivePercent}, 1-2 yildiz orani ise %${ratingBreakdown.negativePercent} seviyesindedir.`
      : null;

  const criticismSentence =
    negativePhrases.length > 0
      ? `Bununla birlikte bazi kullanicilar ${joinNatural(negativePhrases)} konusunda elestirilerde bulunmustur.`
      : null;

  const coverageSentence =
    commentCoverage
      ? `${commentCoverage.ratingsWithoutComment} kullanicinin sadece puan verip yorum birakmamasi, genel memnuniyetin yorum yazan kullanicilarla sinirli olmadigini da gostermektedir.`
      : null;

  const closing =
    topNegativeAspects.length > 0
      ? "Genel olarak urunun fiyat ve performans dengesi tatmin edici bulunsa da, bazi teknik ve donanimsal detaylarda iyilestirme beklentisi oldugu gorulmektedir."
      : "Genel olarak urunun fiyat ve performans dengesi kullanicilarin buyuk bolumu tarafindan tatmin edici bulunmaktadir.";

  return [opening, useCaseSentence, ratingSentence, criticismSentence, coverageSentence, closing]
    .filter(Boolean)
    .join(" ");
}

function buildDisplaySummary(summary, topPositiveAspects, topNegativeAspects) {
  const strengthPhrases = topPositiveAspects
    .slice(0, 3)
    .map((item) => buildStrengthPhrase(item.aspect));
  const concernPhrases = topNegativeAspects
    .slice(0, 2)
    .map((item) => buildConcernPhrase(item.aspect));
  const ratingBreakdown = summary.ratingBreakdown;
  const commentCoverage = summary.commentCoverage;
  const sourceTags = Array.isArray(summary.sourceTags) ? summary.sourceTags : [];
  const dominantPositiveAspect = topPositiveAspects[0]?.aspect
    ? buildStrengthPhrase(topPositiveAspects[0].aspect)
    : null;
  const dominantNegativeAspect = topNegativeAspects[0]?.aspect
    ? buildConcernPhrase(topNegativeAspects[0].aspect)
    : null;

  const opening =
    ratingBreakdown && ratingBreakdown.positivePercent >= 70
      ? `Urunun genel resmi olumlu: toplam degerlendirmelerin %${ratingBreakdown.positivePercent} kadari 4-5 yildiz, yalnizca %${ratingBreakdown.negativePercent} kadari 1-2 yildiz seviyesinde.`
      : "Urun, kullanici yorumlarinda genel olarak olumlu bir tablo ortaya koymaktadir.";

  const strengthsSentence =
    strengthPhrases.length > 0
      ? `Yazili yorumlarda en guclu taraf olarak ${joinNatural(strengthPhrases)} one cikmaktadir.`
      : "Yorumlarda urunun gunluk kullanim ihtiyaclarini karsilamasi olumlu bir nokta olarak one cikmaktadir.";

  const concernsSentence =
    concernPhrases.length > 0
      ? `Zayif tarafta ise kullanicilar en cok ${joinNatural(concernPhrases)} konusunda elestiri getirmektedir.`
      : "Olumsuz yorumlar sinirli olsa da bazi kullanicilar belirli kullanim senaryolarinda gelistirme beklentisi dile getirmektedir.";

  const evidenceSentence =
    commentCoverage && sourceTags.length > 0
      ? `Ayrica ${commentCoverage.ratingsWithoutComment} kullanicinin sadece puan verip yorum birakmamasi, toplam memnuniyetin yorum yazan kitleyle sinirli olmadigini da gosteriyor; Trendyol etiketlerinde ${sourceTags.map((item) => item.name).join(", ")} basliklari one cikiyor.`
      : commentCoverage
        ? `Bu ozet, ${commentCoverage.totalRatingCount} toplam puanlama icindeki yorumlu bolum dikkate alinarak hazirlanmistir.`
        : null;

  const closing =
    summary.averageRating >= 4
      ? dominantPositiveAspect && dominantNegativeAspect
        ? `Kisacasi urun, ${dominantPositiveAspect} arayan kullanicilar icin mantikli bir tercih; ancak satin almadan once ${dominantNegativeAspect} tarafindaki beklentiyi dogru ayarlamak gerekiyor.`
        : "Genel olarak urun, beklentiyi buyuk olcude karsilayan ve gunluk kullanim icin tercih edilebilecek bir secenek olarak degerlendirilmektedir."
      : "Genel olarak urun, guclu yonleri one ciksa da satin alma kararinda beklentilerin dikkatle degerlendirilmesini gerektiren bir secenek olarak gorunmektedir.";

  return [opening, strengthsSentence, concernsSentence, evidenceSentence, closing]
    .filter(Boolean)
    .join(" ");
}

function analyzeReviews(payload) {
  const reviews = payload.reviews.map((review) => {
    const searchableComment = foldText(review.normalizedComment || review.comment || "");
    const sentimentResult = scoreSentiment({
      ...review,
      searchableComment,
    });

    const enrichedReview = {
      ...review,
      searchableComment,
      sentiment: sentimentResult.sentiment,
      sentimentScore: sentimentResult.score,
    };

    enrichedReview.aspects = detectReviewAspects(enrichedReview);
    return enrichedReview;
  });

  const sentimentCounts = reviews.reduce(
    (accumulator, review) => {
      accumulator[review.sentiment] += 1;
      return accumulator;
    },
    { positive: 0, neutral: 0, negative: 0 },
  );

  const sentimentPercentages = buildSentimentPercentages(
    sentimentCounts,
    reviews.length,
  );

  const ratedReviews = reviews.filter((review) => typeof review.rate === "number");
  const averageRating =
    ratedReviews.length > 0
      ? ratedReviews.reduce((sum, review) => sum + review.rate, 0) / ratedReviews.length
      : 0;

  const keywordFrequency = buildFrequencyMap(
    reviews.flatMap((review) => review.tokens.map((token) => foldText(token))),
    20,
  );
  const phraseFrequency = buildPhraseFrequency(reviews, 12);
  const aspectStats = collectAspectStats(reviews);

  const topPositiveAspects = aspectStats
    .filter((aspect) => aspect.positiveRatio >= 0.55 && aspect.mentions >= 8)
    .slice(0, 4);
  const topNegativeAspects = aspectStats
    .filter((aspect) => aspect.negativeRatio >= 0.18 && aspect.mentions >= 5)
    .slice(0, 4);

  const ratingBreakdown = buildRatingBreakdown(payload.sourceSummary);
  const commentCoverage = buildCommentCoverage(payload.sourceSummary);
  const sourceTags = pickTopSourceTags(payload.sourceSummary, 4);

  const summary = {
    productUrl: payload.productUrl,
    contentId: payload.contentId,
    generatedAt: new Date().toISOString(),
    sourceFile: payload.sourceFile,
    sourceAiSummary: payload.sourceAiSummary ?? null,
    sourceSummary: payload.sourceSummary ?? null,
    totalReviews: reviews.length,
    averageRating: Number(averageRating.toFixed(2)),
    confidenceScore: buildConfidenceScore(reviews.length, sentimentPercentages),
    headline: buildHeadline(sentimentPercentages, averageRating, ratingBreakdown),
    sentiment: sentimentCounts,
    sentimentPercentages,
    sourceTags,
    ratingBreakdown,
    commentCoverage,
    topKeywords: keywordFrequency,
    topPhrases: phraseFrequency,
    aspects: aspectStats,
    strengths: topPositiveAspects.map((aspect) => ({
      aspect: aspect.aspect,
      mentions: aspect.mentions,
      positiveRatio: aspect.positiveRatio,
      example: aspect.bestPositiveComment,
    })),
    weaknesses: topNegativeAspects.map((aspect) => ({
      aspect: aspect.aspect,
      mentions: aspect.mentions,
      negativeRatio: aspect.negativeRatio,
      example: aspect.strongestNegativeComment,
    })),
    samplePositiveReviews: pickTopExamples(reviews, "positive"),
    sampleNegativeReviews: pickTopExamples(reviews, "negative"),
  };

  summary.generalEvaluation = buildGeneralEvaluation(
    summary,
    topPositiveAspects,
    topNegativeAspects,
  );
  summary.displaySummary = buildDisplaySummary(
    summary,
    topPositiveAspects,
    topNegativeAspects,
  );

  return summary;
}

function buildOutputFile(contentId) {
  return path.join(SUMMARY_DATA_DIR, `reviews-${contentId}.summary.json`);
}

async function main() {
  const inputFile = await getInputFile();
  const payload = await loadJson(inputFile);
  const summary = analyzeReviews(payload);
  const outputFile = buildOutputFile(summary.contentId);

  await fs.mkdir(SUMMARY_DATA_DIR, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(summary, null, 2), "utf8");

  console.log(`Summary saved to ${outputFile}.`);
  console.log(summary.headline);
  console.log(summary.generalEvaluation);
  console.log(summary.displaySummary);
}

main().catch((error) => {
  console.error("Analysis failed:", error.message);
  process.exitCode = 1;
});
