# 🚀 Drone Simulator - Performans Iyileştirmesi Rehberi

## Yapılan Optimizasyonlar

### 1. **OSM Binaları Devre Dışı Bırakıldı** ✅
- Varsayılan olarak açık (yapı detayları için)
- O tuşu ile açıp kapatılabilir
- Performans boost için kapatınız

### 2. **Adaptif Drone Kamera Capture Sistemi** ✅
- **Performance Mode (Varsayılan):**
  - AI Detection kapalıyken: Her **3 frame'de** render (~20 FPS)
  - AI Detection açıkken: Her **2 frame'de** render (~30 FPS)
  
- **Quality Mode:**
  - AI Detection kapalıyken: Her **2 frame'de** render (~30 FPS)
  - AI Detection açıkken: Her **1 frame'de** render (~60 FPS)

### 3. **AI Detection Optimizasyonu** ✅
- **Performance Mode:** Her 6 frame'de tespit (~10 FPS tespit)
- **Quality Mode:** Her 4 frame'de tespit (~15 FPS tespit)

### 4. **Minimap Render Optimizasyonu** ✅
- **Küçük modda (Performance):** Her 6 frame'de
- **Küçük modda (Quality):** Her 4 frame'de
- **Expanded modda (Performance):** Her 3 frame'de
- **Expanded modda (Quality):** Her 2 frame'de

### 5. **Terrain Sampling Optimizasyonu** ✅
- **Performance Mode:** Her 12 frame'de
- **Quality Mode:** Her 8 frame'de

### 6. **Kalite Seçeneği** ✅
Dinamik mod seçimi:
```javascript
// Performance moduna geç (varsayılan)
window.drone.quality('performance')

// Quality moduna geç (daha güzel ama yavaş)
window.drone.quality('quality')
```

---

## 📊 Beklenen İyileştirmeler

| Metrik | Performance Mode | Quality Mode | Notlar |
|--------|------------------|--------------|--------|
| Main Viewer FPS | ~50-60 fps | ~30-45 fps | Tespit kapalı |
| Drone Camera FPS | 20-30 fps | 30-60 fps | Tespit kapalı |
| Drone Camera w/AI | 30 fps | 60 fps | Tespit açık |
| Terrain Sampling | Her 12 frame | Her 8 frame | Daha sık = daha hassas |
| Minimap CPU | Düşük | Orta | Expanded modda artar |
| OSM Binaları | Kapalı | Açık | Toggle öncesi kontrol et |

---

## 🎛️ Manuel Ayarlamalar

### OSM Binaları (isteğe bağlı)
**Dosya:** `src/main.js` (satır ~105)
```javascript
const enableOSMBuildings = false; // true ile aç
```

### GPU Bayakları (Vite Config)
**Dosya:** `vite.config.js`
```javascript
export default {
  plugins: [
    cesium({
      WebGL: {
        preserveDrawingBuffer: false // Memory tasarrufu
      }
    })
  ]
}
```

### Cesium Globe Kalitesi
**Dosya:** `src/main.js` (Cesium Viewer kurulumu)
```javascript
this.viewer = new Cesium.Viewer('cesiumContainer', {
  // ... diğer ayarlar
  msaaSamples: 1,      // Anti-aliasing (1 = off, 4 = high quality)
  shadows: false,      // Gölgeler (yavaş)
  fog: {
    enabled: true,
    density: 0.0002    // Daha düşük = daha net, daha yüksek = daha hızlı
  }
});
```

---

## 🔍 Test Etme

### Console Commands (F12)
```javascript
// Performans modu
window.drone.quality('performance')

// Kalite modu
window.drone.quality('quality')

// Turbo mode (easter egg)
window.drone.turbo()

// Simulator aktif mi?
window.drone.isActive()
```

### Performans Monitoring
Chrome DevTools > Performance tab:
1. Kayıt başlat (Ctrl + Shift + E)
2. Drone uçur (15-30 saniye)
3. Kayıt durdur
4. FPS chart'ı kontrol et (yeşil = iyi, kırmızı = sorun)

---

## 🎯 Gelecek Iyileştirmeler

- [ ] Model LOD (Level of Detail) sistemi
- [ ] Imagery Provider caching
- [ ] Web Workers for terrain sampling
- [ ] Drone model compression (gzip)
- [ ] Lazy loading for AI models
- [ ] GPU texture compression

---

## 📈 Tanı İçin Yararlı Komutlar

```javascript
// Cesium performans bilgileri
console.log(window.sim.viewer.scene.stats)

// FPS göster
setInterval(() => {
  const stats = window.sim.viewer.scene.stats;
  console.log(`FPS: ${(1/stats._lastFrameTime).toFixed(1)}`);
}, 1000)
```

---

## 💡 İpuçları

1. **Harita çerçeve hızını yaşlı cihazlarda azalt:** Cesium Viewer'da `targetFrameRate` ayarını düşür
2. **Minimap genişletmeyken:** Küçük modda kal, çünkü render sıklığı otomatik azalıyor
3. **AI Detection kapalıyken:** Drone kamera 2x daha az render ediliyor
4. **OSM Binaları:** Yapı detayları gerekmediyse kapalı tut (hızlı uydu görüntüsü yeterli)

---

**Sorun yaşıyorsanız:** Console'da `window.drone.quality('performance')` yazın ve temiz bir test yapın.
