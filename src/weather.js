/**
 * ═══════════════════════════════════════════════════════════════════
 * HAVA DURUMU SİSTEMİ
 * Rüzgar, Bulutlar, Atmosfer, Gün/Gece Döngüsü
 * ═══════════════════════════════════════════════════════════════════
 */

import * as Cesium from 'cesium';

export class WeatherSystem {
  constructor(viewer, physics) {
    this.viewer = viewer;
    this.physics = physics;

    // ── Zaman Sistemi ──
    this.gameTime = {
      hour: 7,        // 0-23
      minute: 0,      // 0-59
      second: 0,      // 0-59
      dayOfYear: 40,  // 1-365 (10 Şubat)
    };

    this.timeScale = 1;  // 1 = gerçek zaman, 60 = 60x hızlı

    // ── Hava Durumu ──
    this.weather = {
      // Rüzgar
      windSpeed: 5,        // m/s (5=hafif hava, 10=orta hava, 20=şiddetli)
      windHeading: 180,    // derece (0=Kuzeyden)
      windTurbulence: 0.5, // 0-1 (türbülans seviyesi)
      windGustsEnabled: true,
      
      // Görünürlük
      visibility: 10000,   // metre (10km = iyi hava, 1km = sisli)
      
      // Yağış
      precipitation: 'none', // 'none', 'light_rain', 'heavy_rain', 'snow'
      cloudCover: 0.3,     // 0-1 (0=açık, 1=tamamen bulutlu)
      
      // Sıcaklık
      temperature: 12,     // Celsius
      humidity: 60,        // % (yüzde)
      
      // Hava basıncı
      seaLevelPressure: 1013, // hPa (101.3 kPa = standart)
    };

    // ── İstatistikler ──
    this.stats = {
      windGusts: [],
      weatherChanges: 0,
    };

    // ── Sabit Profiller ──
    this.weatherPresets = {
      'clear': {
        windSpeed: 3, windHeading: 270, visibility: 15000,
        precipitation: 'none', cloudCover: 0.1, temperature: 18,
      },
      'light_wind': {
        windSpeed: 8, windHeading: 180, visibility: 12000,
        precipitation: 'none', cloudCover: 0.2, temperature: 15,
      },
      'stormy': {
        windSpeed: 20, windHeading: 45, visibility: 5000,
        precipitation: 'heavy_rain', cloudCover: 0.9, temperature: 10,
      },
      'foggy': {
        windSpeed: 2, windHeading: 0, visibility: 1500,
        precipitation: 'none', cloudCover: 0.95, temperature: 8,
      },
      'snow': {
        windSpeed: 12, windHeading: 315, visibility: 3000,
        precipitation: 'snow', cloudCover: 0.85, temperature: -2,
      }
    };

    this.setupCesiumLighting();
  }

  setupCesiumLighting() {
    // Cesium'un lighting sistemini kur
    const scene = this.viewer.scene;
    
    // Güneş ışığı
    scene.light = new Cesium.SunLight();
    scene.lightSource = scene.light;
    
    // Gölgeler etkinleştir (zaten aktif, kontrol için)
    scene.shadows = true;
  }

  /**
   * Ana hava durumu güncelleme
   * Her frame'de çağrılır
   */
  update(deltaTime) {
    // ── Zamanı güncelle ──
    this.updateTime(deltaTime);

    // ── Gün/Gece Lighting ──
    this.updateLighting();

    // ── Rüzgar Efektleri ──
    this.updateWind();

    // ── Atmosfer ──
    this.updateAtmosphere();

    // ── Yağış Efektleri (Visual nur - fizyoloji henüz yok) ──
    this.updateVisualEffects();
  }

  /**
   * Zamanı güncelle
   */
  updateTime(deltaTime) {
    // Game time'ı hızlandır
    const realSecondsPerGameSecond = 1 / this.timeScale;
    const gameSecondsToAdd = deltaTime / realSecondsPerGameSecond;

    this.gameTime.second += gameSecondsToAdd;

    if (this.gameTime.second >= 60) {
      this.gameTime.minute += Math.floor(this.gameTime.second / 60);
      this.gameTime.second %= 60;
    }

    if (this.gameTime.minute >= 60) {
      this.gameTime.hour += Math.floor(this.gameTime.minute / 60);
      this.gameTime.minute %= 60;
    }

    if (this.gameTime.hour >= 24) {
      this.gameTime.hour = 0;
      this.gameTime.dayOfYear = (this.gameTime.dayOfYear % 365) + 1;
    }
  }

  /**
   * Gün/Gece lighting ayarla
   * Güneş konumunu hesapla ve lighting'i güncelle
   */
  updateLighting() {
    const viewer = this.viewer;
    const hour = this.gameTime.hour;
    const dayOfYear = this.gameTime.dayOfYear;
    
    // Gün döngüsü: 6am-6pm = gündüz, 6pm-6am = gece
    const sunIntensity = this.calculateSunIntensity(hour);
    
    // Cesium'un ambient light
    const ambientBrightness = 0.2 + (sunIntensity * 0.8);
    viewer.scene.light.intensity = sunIntensity;
    
    // Sky atmosfer rengi
    if (hour >= 6 && hour < 18) {
      // Gündüz: mavi gökyüzü - parlak saatlerde daha doygun, sabah/akşamda daha açık
      const dayProgress = (hour - 6) / 12;
      const colorShift = Math.abs(Math.sin(dayProgress * Math.PI));
      viewer.scene.skyAtmosphere.hueShift = 0;
      viewer.scene.skyAtmosphere.saturationShift = 0.5 + (colorShift * 0.5); // 0.5 - 1.0 arasında
    } else {
      // Gece: lacivert/siyah
      viewer.scene.skyAtmosphere.hueShift = -0.3;
      viewer.scene.skyAtmosphere.saturationShift = -0.5;
    }

    // Fog yoğunluğu: Gece daha sisli
    const fogAmount = this.weather.visibility < 5000 ? 0.0005 : 0.0002;
    viewer.scene.fog.density = fogAmount * (1 - sunIntensity * 0.5);

    // Globe aydınlanması
    viewer.scene.globe.enableLighting = sunIntensity > 0.1;
  }

  /**
   * Güneş yoğunluğu hesapla (saat'e göre)
   */
  calculateSunIntensity(hour) {
    // 6am = 0 (gece), 12pm = 1 (tepe), 6pm = 0 (gece)
    if (hour < 6 || hour >= 18) return 0;
    if (hour >= 12) return Math.cos((hour - 12) * Math.PI / 6);
    return Math.sin((hour - 6) * Math.PI / 12);
  }

  /**
   * Rüzgar sistemi - Physics'e rüzgar etkileri uygula
   */
  updateWind() {
    // Rüzgar hava akışını drift gibi simüle et
    if (!this.physics) return;

    // Rüzgar vektörü (m/s)
    const windHeadingRad = Cesium.Math.toRadians(this.weather.windHeading);
    const baseWindSpeed = this.weather.windSpeed;
    
    // Türbülans ekleme (sinüs dalgalanması)
    const time = performance.now() / 1000;
    const windSpeed = baseWindSpeed + 
      Math.sin(time * 0.3) * this.weather.windTurbulence * 3;

    // Wind vektörü
    this.physics.windVector = {
      x: Math.sin(windHeadingRad) * windSpeed,
      y: Math.cos(windHeadingRad) * windSpeed,
      speed: Math.max(0, windSpeed),
    };

    // Rüzgar hava akışını fizikse geçir
    this.physics.setWind(this.physics.windVector);
  }

  /**
   * Atmosfer parametrelerini güncelle (fog, etc)
   */
  updateAtmosphere() {
    const viewer = this.viewer;
    const visibility = this.weather.visibility;

    // Görünürlüğe göre fog density ayarla
    // visibility = 10000m → density = 0.0001
    // visibility = 1000m → density = 0.001
    const fogDensity = Math.max(0.00001, 0.1 / visibility);
    viewer.scene.fog.density = fogDensity * (0.5 + this.weather.cloudCover);

    // Bulut örtüsüne göre shadow intensity
    const shadowIntensity = 1.0 - (this.weather.cloudCover * 0.3);
    viewer.scene.light.intensity = Math.max(0.2, shadowIntensity);
  }

  /**
   * Visual efektler (yağış animasyonu, vs)
   */
  updateVisualEffects() {
    // Yağış tipiyle ekran efekti
    if (this.weather.precipitation === 'heavy_rain') {
      // Daha koyu, daha az görünürlük
      this.viewer.scene.fog.density *= 1.5;
    } else if (this.weather.precipitation === 'snow') {
      // Kar - biraz daha gökkuşağı efekti
      this.viewer.scene.skyAtmosphere.saturationShift -= 0.1;
    }
  }

  /**
   * Hava durumunu değiştir (rastgele anlarında)
   */
  randomizeWeather() {
    const presets = Object.keys(this.weatherPresets);
    const randomPreset = presets[Math.floor(Math.random() * presets.length)];
    this.setWeatherPreset(randomPreset);
    this.stats.weatherChanges++;
  }

  /**
   * Önceden tanımlanmış hava durumunu ayarla
   */
  setWeatherPreset(presetName) {
    if (this.weatherPresets[presetName]) {
      Object.assign(this.weather, this.weatherPresets[presetName]);
      console.log(`🌥️ Hava durumu: ${presetName}`);
    }
  }

  /**
   * Zamanı ileriye al (saatler cinsinden)
   */
  jumpToTime(hour, minute = 0) {
    this.gameTime.hour = Math.floor(hour) % 24;
    this.gameTime.minute = Math.floor(minute) % 60;
    this.gameTime.second = 0;
  }

  /**
   * Rüzgar hızını ayarla (m/s)
   */
  setWindSpeed(speed) {
    this.weather.windSpeed = Math.max(0, Math.min(50, speed));
  }

  /**
   * Rüzgar yönünü ayarla (derece)
   */
  setWindHeading(heading) {
    this.weather.windHeading = ((heading % 360) + 360) % 360;
  }

  /**
   * Görünürlüğü ayarla (metre)
   */
  setVisibility(meters) {
    this.weather.visibility = Math.max(500, Math.min(20000, meters));
  }

  /**
   * Hava durumu bilgisi döndür
   */
  getWeatherReport() {
    return {
      time: `${String(this.gameTime.hour).padStart(2, '0')}:${String(this.gameTime.minute).padStart(2, '0')}`,
      date: `Gün ${this.gameTime.dayOfYear}`,
      windSpeed: this.weather.windSpeed.toFixed(1),
      windHeading: this.weather.windHeading.toFixed(0),
      visibility: (this.weather.visibility / 1000).toFixed(1),
      temperature: this.weather.temperature,
      precipitation: this.weather.precipitation,
      cloudCover: (this.weather.cloudCover * 100).toFixed(0),
    };
  }

  /**
   * HUD için formatlanmış saat metni
   */
  getTimeString() {
    const h = String(this.gameTime.hour).padStart(2, '0');
    const m = String(this.gameTime.minute).padStart(2, '0');
    const s = String(Math.floor(this.gameTime.second)).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /**
   * HUD için formatlanmış hava durumu metni
   */
  getWeatherString() {
    const w = this.weather.windSpeed.toFixed(1);
    const vis = (this.weather.visibility / 1000).toFixed(1);
    return `WIND: ${w}m/s | VIS: ${vis}km`;
  }
}
