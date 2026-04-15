# Product Review Graph Analysis 📊🕸️

Bu proje, Trendyol ürün sayfalarındaki yorumları otomatik olarak çeken, temizleyen ve NLP tabanlı duygu/özellik analizi yaparak bu yorumlardan kelime ağları (word graphs) çıkaran Node.js tabanlı bir veri hattıdır.

Sonuçlar yerleşik modern bir masaüstü (dashboard) arayüzünde analiz edilir ve sunulur.

## 🚀 Özellikler

- **Gelişmiş Web Kazıma (Playwright):** İlgili ürün linkinden hedef yorumlar otomatik, sessiz ve insan davranışını taklit edecek şekilde çekilir.
- **Temizleme ve Sayısallaştırma:** Yorumlar harflerine ayrılır, stopwords (bağlaçlar) atılır ve analiz edilmeye hazır hale gelir.
- **NLP ve Bağlam Analizi (Aspect-Based Sentiment):**
  - **Fiyat/Performans, Performans, Ekran, Batarya, Malzeme** gibi başlıklar yakalanır ve puanlanır.
  - Ortalama yıldız değerlendirmesi, yorum tutarlılığı ve dağılımı ölçülür.
- **Kelime Ağı (Word Graph):** Sıklıkla birlikte geçen kelimelerin (co-occurrence) arasındaki bağlar analiz edilerek bir ağ grafiği oluşturulur.
- **Dinamik Dashboard:** Çıkarılan tüm analiz (olumlu/olumsuz dağılımları, kanıt yorumlar, kelime grafiği vb.) yerleşik SVG ve HTML/CSS yetenekleriyle ekranda görselleştirilir.

## 🛠️ Kurulum

Bilgisayarınızda [Node.js](https://nodejs.org) yüklü olması gerekmektedir. Projeyi sisteminize indirdikten sonra:

```bash
# Proje dizinine gidin
cd product-review-graph-analysis

# Bağımlılıkları yükleyin (Playwright vb. paketler)
npm install
```

## 💻 Kullanım

Projeyi tek bir ürün özelinde tam zamanlı ayağa kaldırma:

1. **Uçtan Uca Pipiline:** Ürün linkini argüman vererek veri hattını çalıştırın.
   ```bash
   node run-pipeline.js "https://www.trendyol.com/...-p-ID/yorumlar"
   ```
   *Not: Bu işlem veriyi `data/raw` klasörüne çeker ardından temizler ve `data/summary` içine `.summary.json` formatında yazar.*
   
2. **Dashboard Önizlemesi:** Çıkan özet veriyi güzel bir arayüzde görmek için:
   ```bash
   npm run dashboard
   ```
   Komutu çalıştırdıktan sonra `http://localhost:4173` bağlantısından analizleri filtreleyip interaktif grafiği görüntüleyebilirsiniz.

## 🗂️ Temel Yapı

- `fetch-trendyol-reviews.js`: Playwright botu ile veri kazıma senaryosu.
- `clean-reviews.js`: Kirli harfleri, gereksiz Türkçe bağlaçları temizleme ve tokenleştirme senaryosu.
- `analyze-reviews.js`: Ağırlıklı puanlama ve kelime grafiği, ikili eşleşmelerin çıkarılması senaryosu.
- `run-pipeline.js`: Bu üç botun sırasıyla senkronize çalışmasını yönetir.
- `dashboard.html / .css / .js`: İstemci üzerinde bağımsız çalışan ve veri görselleştiren arayüz.

## 💡 Katkı
Burak Ceylan / Veri analiz & Kelime Tespiti. PR ve Issuelara açıktır.
