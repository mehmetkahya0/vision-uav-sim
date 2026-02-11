# 🚁 Istanbul Drone Simulator

CesiumJS tabanlı, İstanbul üzerinde gerçek dünya verileriyle gelişmiş 3D drone simülasyon platformu. Gerçekçi fizik motoru, dinamik hava durumu sistemi ve AI destekli nesne algılama özellikleriyle profesyonel bir UAV simülasyonu deneyimi sunar.

![Istanbul Drone Simulator](https://img.shields.io/badge/Status-Active-success)
![CesiumJS](https://img.shields.io/badge/CesiumJS-1.138.0-blue)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.10.0-orange)
![License](https://img.shields.io/badge/License-MIT-green)

## 📋 İçindekiler

- [Özellikler](#-özellikler)
- [Teknolojiler](#-teknolojiler)
- [Kurulum](#-kurulum)
- [Kullanım](#-kullanım)
- [Kontroller](#-kontroller)
- [Hava Durumu Sistemi](#️-hava-durumu-sistemi)
- [AI Nesne Algılama](#-ai-nesne-algılama)
- [Performans Optimizasyonu](#-performans-optimizasyonu)
- [GitHub Pages Deployment](#-github-pages-deployment)
- [Geliştirme](#-geliştirme)

## ✨ Özellikler

### 🌍 Gerçek Dünya Simülasyonu
- **Cesium Ion entegrasyonu**: Gerçek arazi verileri, yüksek çözünürlüklü uydu görüntüleri
- **OSM 3D Binalar**: OpenStreetMap tabanlı İstanbul binalar (O tuşu ile aç/kapa)
- **Dinamik arazi**: Gerçek zamanlı yükseklik verisi ve yer şekilleri
- **MQ-1 Predator UAV modeli**: Gerçekçi 3D drone modeli

### ⚙️ Gelişmiş Fizik Motoru
- **Aerodinamik simülasyon**: Sürtünme, ivme, hava direnci
- **Rüzgar etkisi**: Dinamik rüzgar vektörleri (0-50 m/s)
- **Gerçekçi hareket**: Yumulaşma, pitch/roll/yaw dinamikleri
- **Hız sınırları**: Maksimum 50 m/s hız limiti

### 🎥 Kamera Sistemleri
- **7 farklı kamera modu**:
  1. Takip kamerası (1)
  2. Orbit kamerası (2)
  3. Kuşbakışı kamerası (3)
  4. FPV (First Person View)
  5. İniş görünümü
  6. Yanal görünüm
  7. Arkadan görünüm
- **Drone kamerası (PiP)**: Picture-in-Picture mod, tam ekrana genişletilebilir (C tuşu)
- **Akıcı geçişler**: Kamera geçişlerinde yumuşak animasyonlar
- **1 frame render interval**: Ultra düşük gecikme (optimized)

### 🌦️ Dinamik Hava Durumu
- **24 saat zaman döngüsü**: Gerçek zamanlı gün/gece geçişi
- **Atmosferik efektler**: Gün doğumu, gün batımı, gece gökyüzü
- **Rüzgar simülasyonu**: Hız ve yön kontrolü
- **Görüş mesafesi**: Sislilik ve hava koşulları
- **Sıcaklık sistemi**: Yüksekliğe göre sıcaklık değişimi
- **Dinamik aydınlatma**: Güneş pozisyonuna göre otomatik ışık ayarı

### 🤖 AI Nesne Algılama
- **TensorFlow.js + COCO-SSD**: Gerçek zamanlı nesne tanıma
- **Drone kamerasından algılama**: Uçarken nesne tespit
- **80+ nesne kategorisi**: İnsan, araç, hayvan, eşya vb.
- **Sınırlayıcı kutular**: Tespit edilen nesneler üzerinde görsel işaretleme
- **Güven skoru**: Her tespit için doğruluk yüzdesi

### 📊 Gelişmiş HUD (Heads-Up Display)
- **Uçuş telemetrisi**: Yükseklik, hız, ivme
- **Navigasyon**: GPS koordinatları, pusula, heading
- **Durum bilgisi**: Batarya, uçuş süresi, mod
- **Hava durumu paneli**: Saat, rüzgar, görüş, sıcaklık
- **2D Minimap**: Gerçek zamanlı konum takibi

### 🎮 Kullanıcı Arayüzü
- **Yardım paneli (?)**: Tüm kontroller ve kısayollar
- **Hava durumu paneli (H)**: Hava parametreleri kontrolü
- **Responsive tasarım**: Her ekran boyutuna uyumlu
- **Modern UI**: Glassmorphism efektli, şık arayüz

## 🛠️ Teknolojiler

### Ana Framework ve Kütüphaneler
```json
{
  "cesium": "^1.138.0",           // 3D Globe ve coğrafi görselleştirme
  "@tensorflow/tfjs": "^4.10.0",  // Machine Learning runtime
  "@tensorflow-models/coco-ssd": "^2.2.3", // Nesne algılama modeli
  "vite": "^6.4.0",                // Build tool ve dev server
  "vite-plugin-cesium": "^1.2.23" // Cesium entegrasyonu
}
```

### Mimari
- **ES Modules**: Modern JavaScript modül sistemi
- **Custom Physics Engine**: Özel aerodinamik fizik motoru
- **Component-based**: Modüler kod yapısı
- **Event-driven**: Olay tabanlı kontrol sistemi

## 📦 Kurulum

### Gereksinimler
- Node.js 18.x veya üzeri
- npm 9.x veya üzeri
- Modern web tarayıcı (Chrome, Firefox, Edge)
- Cesium Ion hesabı ve API token

### Adım 1: Projeyi İndirme
```bash
git clone https://github.com/kullaniciadi/drone-sim.git
cd drone-sim
```

### Adım 2: Bağımlılıkları Yükleme
```bash
npm install
```

### Adım 3: Cesium Ion Token
1. [Cesium Ion](https://ion.cesium.com/) sitesine üye olun (ücretsiz)
2. Access Token oluşturun
3. Token'ı **src/main.js** dosyasına yapıştırın:

```javascript
Cesium.Ion.defaultAccessToken = 'BURAYA_TOKEN_YAPIŞTIRIN';
```

### Adım 4: Uygulamayı Başlatma
```bash
npm run dev
```

Tarayıcınızda otomatik olarak `http://localhost:3000` açılacaktır.

## 🎮 Kullanım

### İlk Başlatma
1. Uygulama açıldığında drone İstanbul - Maslak bölgesinde başlar
2. `?` tuşuna basarak yardım panelini açabilirsiniz
3. `W/A/S/D` tuşları ile uçuş yapabilirsiniz
4. `Space/Shift` tuşları ile yükseklik kontrolü yapabilirsiniz

### Kamera Modları
- **1**: Takip kamerası - Drone'u takip eder
- **2**: Orbit kamerası - Drone etrafında döner
- **3**: Kuşbakışı - Üstten görünüm
- **C**: Drone kamerası PiP / Tam Ekran

### Hava Durumu Kontrolü
1. `H` tuşuna basarak hava panelini açın
2. `Y/U` ile rüzgar hızını ayarlayın
3. Zaman otomatik ilerler (24 saat döngüsü)

## ⌨️ Kontroller

### Uçuş Kontrolleri
| Tuş | İşlev | Açıklama |
|-----|-------|----------|
| **W** / ↑ | İleri | Drone'u ileri hareket ettirir |
| **S** / ↓ | Geri | Drone'u geri hareket ettirir |
| **A** / ← | Sol | Sola kayma hareketi |
| **D** / → | Sağ | Sağa kayma hareketi |
| **Space** | Yüksel | Dikey yukarı hareket |
| **Shift** | Alçal | Dikey aşağı hareket |
| **Q** | Sola Dön | Yaw ekseni sola (CCW) |
| **E** | Sağa Dön | Yaw ekseni sağa (CW) |

### Kamera Kontrolleri
| Tuş | İşlev | Açıklama |
|-----|-------|----------|
| **1** | Takip Kamerası | Drone'u arkadan takip eder |
| **2** | Orbit Kamerası | Drone etrafında döner |
| **3** | Kuşbakışı | Yukarıdan bakış |
| **R** | Kamera Yukarı | Pitch açısını artır |
| **F** | Kamera Aşağı | Pitch açısını azalt |
| **T** | Kamera Sıfırla | Pitch/Roll sıfırla |
| **C** | Drone Kamerası | PiP ↔ Tam Ekran |

### Hava Durumu ve Ortam
| Tuş | İşlev | Açıklama |
|-----|-------|----------|
| **H** | Hava Paneli | Hava durumu panelini aç/kapa |
| **Y** | Rüzgar Azalt | Rüzgar hızını 5 m/s azalt |
| **U** | Rüzgar Artır | Rüzgar hızını 5 m/s artır |
| **O** | OSM Binalar | 3D binaları aç/kapa |

### Sistem Kontrolleri
| Tuş | İşlev | Açıklama |
|-----|-------|----------|
| **P** | Performans Modu | Performance ↔ Quality |
| **?** | Yardım | Yardım panelini aç/kapa |
| **Esc** | Kapat | Açık panelleri kapat |

## ☁️ Hava Durumu Sistemi

### Zaman Döngüsü
- **24 saatlik simülasyon**: Gerçek zamanlı gün/gece döngüsü
- **Zaman hızı**: 1 dakika = 1 simülasyon saati
- **JulianDate tabanlı**: Cesium'un zaman yönetim sistemi

### Güneş ve Aydınlatma
```javascript
// Güneş konumu otomatik güncellenir
sunrise: 06:00 → maxIntensity: 12:00 → sunset: 18:00
```
- **Gün doğumu**: Kademeli ışık artışı
- **Öğle**: Maksimum güneş ışığı
- **Gün batımı**: Yumuşak ışık azalması
- **Gece**: Ay ışığı ve yıldızlar

### Rüzgar Simülasyonu
- **Hız aralığı**: 0-50 m/s
- **Yön**: Rastgele (simülasyon başında)
- **Drone etkisi**: Rüzgar vektörü ile hava hızı hesaplaması
- **Fiziksel etkileşim**: Gerçekçi sapma ve etki

### Atmosferik Efektler
- **Görüş mesafesi**: 20-50 km arası
- **Atmosfer rengi**: Gün batımında sarı/turuncu tonlar
- **Hue/Saturation**: Dinamik renk ayarları
- **Sis efekti**: Düşük görüş koşulları

## 🤖 AI Nesne Algılama

### COCO-SSD Modeli
- **80 nesne kategorisi**: person, car, bicycle, dog, cat vb.
- **Real-time detection**: 30 FPS (performans moduna göre)
- **Minimum güven**: %50 threshold

### Algılanabilen Nesneler
```
İnsanlar ve Hayvanlar:
person, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe

Araçlar:
car, motorcycle, airplane, bus, train, truck, boat, bicycle

Günlük Eşyalar:
chair, couch, bed, dining table, laptop, cell phone, book, clock

+ 60 kategori daha...
```

### Kullanım
1. Drone kamerasını açın (C tuşu)
2. Model otomatik yüklenir
3. Algılanan nesneler kırmızı kutu ile işaretlenir
4. Etiket ve güven skoru gösterilir

### Performans
- **Loading time**: ~2-3 saniye (ilk yükleme)
- **Inference**: ~50-100ms per frame
- **GPU acceleration**: WebGL backend (otomatik)

## ⚡ Performans Optimizasyonu

### İki Mod
1. **Performance Mode** (Varsayılan)
   - Terrain sampling: 16 frame
   - Camera render: 1 frame
   - OSM Buildings: Enabled
   - Target: 60 FPS

2. **Quality Mode**
   - Terrain sampling: 12 frame
   - Camera render: 1 frame
   - OSM Buildings: Enabled
   - Target: 30-60 FPS

### Optimizasyon Teknikleri
- **DeltaTime clamping**: Smart averaging (0.033s threshold)
- **Render interval**: Frame-based, non-blocking
- **Terrain sampling**: Adaptive frequency
- **Memory management**: Efficient resource handling

### FPS İyileştirmeleri
```javascript
// Önceki sorunlar ve çözümler:
❌ Camera glitch: 2-3 frame interval → ✅ 1 frame interval
❌ DeltaTime jump: 100ms→16ms → ✅ Smart averaging
❌ Terrain lag: Every frame → ✅ 16 frame interval
```

### Performans İpuçları
- OSM binalarını kapatın (O tuşu) - %20-30 FPS artışı
- Performance moduna geçin (P tuşu)
- AI algılamayı kapatın - %10-15 FPS artışı
- Düşük yükseklikte uçun - Daha az render yükü

## 🚀 GitHub Pages Deployment

### Otomatik Deployment (GitHub Actions)

1. **Repository'ye deploy.yml ekleyin**:
```bash
mkdir -p .github/workflows
```

Dosya: `.github/workflows/deploy.yml`
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

2. **GitHub Settings**:
   - Repository → Settings → Pages
   - Source: "GitHub Actions" seçin
   - Save

3. **Push ve Deploy**:
```bash
git add .
git commit -m "Add GitHub Pages deployment"
git push origin main
```

### Manuel Deployment

```bash
# Build
npm run build

# GitHub Pages branch'ine deploy
npm install -g gh-pages
gh-pages -d dist
```

### Deployment Sonrası
- URL: `https://kullaniciadi.github.io/drone-sim/`
- Build süresi: ~2-3 dakika
- Otomatik güncelleme: Her push'da

## 👨‍💻 Geliştirme

### Proje Yapısı
```
drone-sim/
├── src/
│   ├── main.js              # Ana giriş noktası, render loop
│   ├── dronePhysics.js      # Fizik motoru, aerodinamik
│   ├── droneControls.js     # Klavye kontrolleri
│   ├── droneCamera.js       # Kamera sistemleri
│   ├── droneModel.js        # 3D model yönetimi
│   ├── weather.js           # Hava durumu sistemi
│   ├── hud.js               # HUD ve telemetri
│   ├── objectDetection.js   # AI nesne algılama
│   └── styles.css           # Global stiller
├── public/
│   └── models/
│       └── mq_1_predator_uav.glb  # Drone 3D modeli
├── index.html               # Ana HTML
├── vite.config.js           # Vite yapılandırma
└── package.json             # Bağımlılıklar

```

### Development Server
```bash
npm run dev      # http://localhost:3000
npm run build    # dist/ klasörüne build
npm run preview  # Build önizleme
```

### Kod Standardı
- **ES6+**: Modern JavaScript
- **Modüler**: Her özellik ayrı dosya
- **Yorumlar**: Türkçe ve İngilizce
- **Naming**: camelCase (JS), kebab-case (CSS)

### Yeni Özellik Ekleme
1. Özelliği ayrı dosyada geliştirin
2. `main.js`'de import edin
3. Render loop'a entegre edin
4. Kontrolleri `droneControls.js`'e ekleyin
5. HUD'a bilgi göstergeleri ekleyin

### Debug
```javascript
// Console logları
console.log('[DRONE]', drone.position);
console.log('[WEATHER]', weatherSystem.getWindSpeed());

// Performance monitoring
console.time('renderFrame');
// ... kod ...
console.timeEnd('renderFrame');
```

## 📚 Kaynaklar

- [CesiumJS Documentation](https://cesium.com/docs/)
- [TensorFlow.js Guide](https://www.tensorflow.org/js)
- [COCO-SSD Model](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
- [Vite Documentation](https://vitejs.dev/)

## 🐛 Bilinen Sorunlar ve Çözümler

### Cesium Token Hatası
**Sorun**: "Cesium ion access token required"
**Çözüm**: `src/main.js` dosyasında token'ınızı ekleyin

### Model Yüklenmiyor
**Sorun**: "Failed to load model"
**Çözüm**: `public/models/mq_1_predator_uav.glb` dosyasının olduğundan emin olun

### Düşük FPS
**Sorun**: 30 FPS altı performans
**Çözüm**: 
- OSM binalarını kapatın (O tuşu)
- Performance moduna geçin (P tuşu)
- Tarayıcı donanım ivmesini aktifleştirin

### Build Hatası
**Sorun**: "Cannot find module 'cesium'"
**Çözüm**: 
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📄 Lisans

MIT License - Detaylar için [LICENSE](LICENSE) dosyasına bakınız.

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Branch'i push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📧 İletişim

Proje sahibi: [@kullaniciadi](https://github.com/kullaniciadi)

## ⭐ Teşekkürler

Bu projeyi beğendiyseniz yıldız vermeyi unutmayın! ⭐

---

**Not**: Bu proje eğitim ve simülasyon amaçlıdır. Gerçek drone operasyonlarında profesyonel yazılım kullanılmalıdır.
- [ ] Waypoint sistemi (otonom uçuş)
- [ ] Çoklu drone desteği
- [ ] Hava durumu simülasyonu
- [ ] Gamepad desteği
