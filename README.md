# Istanbul Drone Simulator 🚁

CesiumJS tabanlı, İstanbul üzerinde gerçek dünya verileriyle 3D drone simülatörü.

## Özellikler

- **Gerçek dünya verileri**: Cesium ion üzerinden gerçek arazi, uydu görüntüleri ve 3D binalar (OSM Buildings)
- **Fizik motoru**: Gerçekçi drone uçuş dinamikleri (sürtünme, ivme, hız sınırları)
- **Drone kamerası (PiP)**: Ekranın köşesinde drone bakış açısı, tam ekrana büyütülebilir
- **HUD**: Yükseklik, hız, yön, koordinat, batarya ve uçuş süresi bilgileri
- **Minimap**: 2D harita üzerinde anlık konum takibi
- **3 kamera modu**: Takip, Orbit, Kuşbakışı

## Kurulum

```bash
npm install
npm run dev
```

## Cesium Ion Token

Uygulamayı çalıştırmak için [Cesium Ion](https://ion.cesium.com/) üzerinden ücretsiz bir token almanız gerekir.

Token'ınızı `src/main.js` dosyasındaki `Cesium.Ion.defaultAccessToken` satırına yapıştırın.

## Kontroller

| Tuş | İşlev |
|------|--------|
| W / ↑ | İleri |
| S / ↓ | Geri |
| A / ← | Sol |
| D / → | Sağ |
| Space | Yüksel |
| Shift | Alçal |
| Q | Sola Dön (Yaw) |
| E | Sağa Dön (Yaw) |
| R | Kamera Yukarı |
| F | Kamera Aşağı |
| T | Kamera Sıfırla |
| 1 | Takip Kamerası |
| 2 | Orbit Kamerası |
| 3 | Kuşbakışı Kamerası |
| C | Drone Kamerası PiP / Tam Ekran |
| ? | Yardım Paneli |

## İleri Aşamalar

- [ ] Drone kamerası üzerinden görüntü işleme (AI)
- [ ] Waypoint sistemi (otonom uçuş)
- [ ] Çoklu drone desteği
- [ ] Hava durumu simülasyonu
- [ ] Gamepad desteği
