/**
 * ═══════════════════════════════════════════════════════════════════
 * ISTANBUL DRONE SIMULATOR - Ana Giriş Noktası
 * CesiumJS + Yüksek Sadakatli İHA Uçuş Simülasyonu
 * ═══════════════════════════════════════════════════════════════════
 *
 * Mimari:
 * - Tek Cesium Viewer (performans için)
 * - Canvas-tabanlı drone FPV kamerası (PiP)
 * - requestAnimationFrame + deltaTime render döngüsü
 * - Gerçekçi aerodinamik fizik motoru
 */
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { DronePhysics } from './dronePhysics.js';
import { DroneControls } from './droneControls.js';
import { DroneCamera } from './droneCamera.js';
import { HUD } from './hud.js';
import { DroneModel } from './droneModel.js';
import { ObjectDetector } from './objectDetection.js';
import { WeatherSystem } from './weather.js';

// ── Cesium Ion Token ──
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxYWZiNDJkNy0yZWEwLTQ5OWQtYjk0MS0xOThlMTIxMDg1YTgiLCJpZCI6MzMyOTY1LCJpYXQiOjE3NTU1MTcyNzR9.raBDIk08ACyJ5JbAiqca_PFRHh1MyGLi3Bqfej5sL9Q';

// ── İstanbul Başlangıç Noktası (Galata Kulesi civarı) ──
const ISTANBUL = {
  longitude: 28.9744,
  latitude: 41.0256,
  height: 500,
};

class DroneSimulator {
  constructor() {
    this.clock = { lastTime: performance.now(), deltaTime: 0 };
    this.flightStartTime = null;
    this.isFlying = false;
    this.isTeleporting = false; // Teleport glitch engelleyici bayrak
    this.turboMode = false; // Easter egg: turbo modu
    this.qualityMode = 'performance'; // 'performance' veya 'quality'
    this.setupConsoleCommands();
    this.init();
  }

  setupConsoleCommands() {
    // Easter egg: window.drone.turbo() ile turbo modu aç/kapat
    window.drone = {
      turbo: () => {
        if (this.physics) {
          this.physics.turboMode = !this.physics.turboMode;
          console.log(`🚀 TURBO MODE ${this.physics.turboMode ? 'AÇILDI! 10000km/h sınırlamaz!' : 'KAPATıLDI!'}`);
        }
      },
      quality: (mode = 'performance') => {
        if (mode === 'performance' || mode === 'quality') {
          this.qualityMode = mode;
          console.log(`📊 Kalite modu: ${mode} olarak ayarlandı`);
        } else {
          console.log('❌ Geçerli modlar: "performance" veya "quality"');
        }
      }
    };
    // Ayrıca window objesine de erişimi sağla
    window.drone.isActive = () => console.log('✈️ Drone simulator aktif. Turbo için: window.drone.turbo()');
  }

  async init() {
    // ════════════════════════════════════════
    // CESIUM VIEWER KURULUMU
    // ════════════════════════════════════════
    const performanceQuality = this.qualityMode === 'quality';
    
    this.viewer = new Cesium.Viewer('cesiumContainer', {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: performanceQuality,  // Gölgeler = açılı performans (kapalı varsayılan)
      shouldAnimate: true,
      msaaSamples: performanceQuality ? 4 : 1,  // Anti-aliasing (quality: 4x, performance: off)
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,
          antialias: performanceQuality,
        },
      },
    });

    // Render döngüsünü biz yöneteceğiz
    this.viewer.useDefaultRenderLoop = false;

    // ── Imagery (Uydu Görüntüsü) ──
    try {
      this.viewer.imageryLayers.removeAll();
      const imagery = await Cesium.IonImageryProvider.fromAssetId(2);
      this.viewer.imageryLayers.addImageryProvider(imagery);
    } catch (e) {
      console.warn('Imagery yüklenemedi:', e);
    }

    // ── OSM Binalar (Varsayılan AÇIK - 'O' tuşu ile aç/kapa) ──
    this.osmBuildings = null;
    this.osmBuildingsEnabled = true; // Varsayılan açık
    const enableOSMBuildings = true; // Toggle: 'O' tuşu ile değiştir
    if (enableOSMBuildings) {
      try {
        this.osmBuildings = await Cesium.createOsmBuildingsAsync();
        this.viewer.scene.primitives.add(this.osmBuildings);
        console.log('✅ OSM binaları YÜKLENDİ (O tuşu ile aç/kapa)');
      } catch (e) {
        console.warn('OSM binaları yüklenemedi:', e);
      }
    }

    // ── Sahne Ayarları (kalite modu uyarınca) ──
    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.fog.enabled = true;
    this.viewer.scene.fog.density = performanceQuality ? 0.0003 : 0.0002;  // Quality: daha kalın (hızlı)
    this.viewer.scene.skyAtmosphere.show = performanceQuality;  // Atmosfer efekti
    this.viewer.scene.globe.depthTestAgainstTerrain = true;

    // Varsayılan kamera kontrollerini devre dışı bırak
    const ssc = this.viewer.scene.screenSpaceCameraController;
    ssc.enableRotate = false;
    ssc.enableTranslate = false;
    ssc.enableZoom = false;
    ssc.enableTilt = false;
    ssc.enableLook = false;

    // ════════════════════════════════════════
    // SİMÜLASYON BİLEŞENLERİ
    // ════════════════════════════════════════

    // Drone FPV Kamera Canvas (PiP)
    this.setupDroneCamCanvas();

    // Fizik Motoru
    this.physics = new DronePhysics({
      startLongitude: ISTANBUL.longitude,
      startLatitude: ISTANBUL.latitude,
      startHeight: ISTANBUL.height,
    });

    // 3D Drone Modeli
    this.droneModel = new DroneModel(this.viewer);
    await this.droneModel.init();

    // AI Object Detection (TF.js + COCO-SSD)
    this.detector = new ObjectDetector();

    // Klavye Kontrolleri
    this.controls = new DroneControls(this.physics, this.detector);

    // Kamera Sistemi
    this.droneCamera = new DroneCamera(this.viewer, this.physics);

    // HUD (Gösterge Paneli)
    this.hud = new HUD();

    // Hava Durumu Sistemi
    this.weather = new WeatherSystem(this.viewer, this.physics);

    // Minimap
    this.setupMinimap();

    // Frame sayacı (drone cam optimizasyonu)
    this.frameCount = 0;

    // ════════════════════════════════════════
    // SİMÜLASYONU BAŞLAT
    // ════════════════════════════════════════
    this.isFlying = true;
    this.flightStartTime = performance.now();
    this.animate();

    console.log('✈️ Istanbul Drone Simulator başlatıldı!');
    console.log('📍 Konum: Galata Kulesi civarı, İstanbul');
    console.log('🎮 Kontroller: W/S=Pitch, A/D=Roll, Q/E=Yaw, Shift/Ctrl=Throttle');
    console.log('🤖 AI Detection: B tuşu ile aç/kapat');
  }

  /**
   * Drone FPV kamerası için 2D Canvas oluştur.
   * Ana viewer'dan postRender ile frame yakalayıp bu canvas'a çizeriz.
   */
  setupDroneCamCanvas() {
    const container = document.getElementById('droneCameraView');
    this.droneCamCanvas = document.createElement('canvas');
    this.droneCamCanvas.id = 'droneCamCanvas';
    this.droneCamCanvas.style.width = '100%';
    this.droneCamCanvas.style.height = '100%';
    container.appendChild(this.droneCamCanvas);
    this.droneCamCtx = this.droneCamCanvas.getContext('2d');

    // Boyut takibi
    this._resizeDroneCamCanvas();
    const ro = new ResizeObserver(() => this._resizeDroneCamCanvas());
    ro.observe(container);
  }

  _resizeDroneCamCanvas() {
    const container = document.getElementById('droneCameraView');
    if (!container || !this.droneCamCanvas) return;
    this.droneCamCanvas.width = container.clientWidth;
    this.droneCamCanvas.height = container.clientHeight;
  }

  /**
   * Drone FPV kamerasını render et ve canvas'a yakala.
   */
  captureDroneCam(cesiumTime) {
    if (!this.physics || !this.droneCamCtx) return;

    const scene = this.viewer.scene;
    const camera = scene.camera;

    const pos = this.physics.getPosition();
    const droneCartesian = Cesium.Cartesian3.fromDegrees(
      pos.longitude,
      pos.latitude,
      pos.height
    );
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const cameraPitchRad = Cesium.Math.toRadians(this.physics.cameraPitch);

    // Kamera ayarlarını güncelle (smooth animation olmadan direkt)
    camera.setView({
      destination: droneCartesian,
      orientation: {
        heading: headingRad,
        pitch: cameraPitchRad,
        roll: 0,
      },
      duration: 0,  // Animation yok, direkt geç
      endTransform: Cesium.Matrix4.IDENTITY,
    });

    // Scene'i render et (clock tick'lemeden)
    scene.initializeFrame();
    scene.render(cesiumTime);

    // Canvas'a kopyala
    const cesiumCanvas = scene.canvas;
    const w = this.droneCamCanvas.width;
    const h = this.droneCamCanvas.height;
    if (w > 0 && h > 0) {
      this.droneCamCtx.drawImage(cesiumCanvas, 0, 0, w, h);
    }
  }

  setupMinimap() {
    const container = document.getElementById('minimapContainer');
    if (!container) return;

    this.minimapExpanded = false;

    // ── İkinci Cesium Viewer: 2D Dünya Haritası ──
    this.minimapViewer = new Cesium.Viewer('minimapViewer', {
      sceneMode: Cesium.SceneMode.SCENE2D,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      targetFrameRate: 10,
      msaaSamples: 1,
      contextOptions: {
        webgl: { antialias: false },
      },
    });

    // Minimap kamera kontrollerini kısıtla (küçük modda)
    const msc = this.minimapViewer.scene.screenSpaceCameraController;
    msc.enableRotate = false;
    msc.enableTranslate = false;
    msc.enableZoom = false;
    msc.enableTilt = false;
    msc.enableLook = false;

    // Drone pozisyon marker (kırmızı nokta)
    this.minimapDroneEntity = this.minimapViewer.entities.add({
      name: 'Drone Position',
      position: Cesium.Cartesian3.fromDegrees(
        ISTANBUL.longitude, ISTANBUL.latitude, 0
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#ff3344'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Drone yön çizgisi (heading göstergesi)
    this.minimapHeadingEntity = this.minimapViewer.entities.add({
      name: 'Drone Heading',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          ISTANBUL.longitude, ISTANBUL.latitude,
          ISTANBUL.longitude, ISTANBUL.latitude + 0.002,
        ]),
        width: 2,
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.8)
        ),
        clampToGround: true,
      },
    });

    // Drone iz çizgisi (trail)
    this.minimapTrailPositions = [];
    this.minimapTrailEntity = this.minimapViewer.entities.add({
      name: 'Drone Trail',
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          return this.minimapTrailPositions;
        }, false),
        width: 1.5,
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.4)
        ),
        clampToGround: true,
      },
    });
    this.lastTrailTime = 0;

    // Başlangıç kamera pozisyonu (İstanbul üzeri)
    this.minimapViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        ISTANBUL.longitude, ISTANBUL.latitude, 8000
      ),
    });

    // Koordinat bilgi elemanı
    this.minimapCoordsEl = document.getElementById('minimapCoords');

    // ── Backdrop elemanı (expanded modda arka plan) ──
    this.minimapBackdrop = document.createElement('div');
    this.minimapBackdrop.id = 'minimapBackdrop';
    document.body.appendChild(this.minimapBackdrop);

    // ── Tıklama: Küçük → Büyük ──
    container.addEventListener('click', (e) => {
      // Close butonuna basıldıysa yoksay
      if (e.target.id === 'minimapClose') return;
      if (!this.minimapExpanded) {
        this.expandMinimap();
      }
    });

    // ── Close butonu: Büyük → Küçük ──
    const closeBtn = document.getElementById('minimapClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapseMinimap();
      });
    }

    // ── Backdrop tıklama: Kapat ──
    this.minimapBackdrop.addEventListener('click', () => {
      this.collapseMinimap();
    });

    // ESC tuşu ile kapat
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.minimapExpanded) {
        this.collapseMinimap();
      }
    });

    // ── Location Search Setup ──
    this.setupLocationSearch();
  }

  setupLocationSearch() {
    const searchInput = document.getElementById('locationInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const searchStatus = document.getElementById('searchStatus');

    if (!searchInput || !searchBtn) return;

    // Enter tuşu ile arama
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) this.searchLocation(query);
      }
    });

    // Arama butonu
    searchBtn.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (query) this.searchLocation(query);
    });
  }

  async searchLocation(query) {
    const searchResults = document.getElementById('searchResults');
    const searchStatus = document.getElementById('searchStatus');
    
    if (!searchResults || !searchStatus) return;

    // Yükleniyor göster
    searchStatus.className = 'search-status loading';
    searchStatus.textContent = 'Aranıyor...';
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';

    try {
      // Nominatim API (OpenStreetMap geocoding - ücretsiz)
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DroneSimulator/1.0'
        }
      });

      if (!response.ok) throw new Error('Arama başarısız');

      const results = await response.json();

      if (results.length === 0) {
        searchStatus.className = 'search-status error';
        searchStatus.textContent = 'Sonuç bulunamadı';
        return;
      }

      // Sonuçları göster
      searchStatus.classList.add('hidden');
      searchResults.classList.remove('hidden');
      searchResults.innerHTML = results.map((result, idx) => `
        <div class="search-result-item" data-idx="${idx}">
          <div class="search-result-name">${result.display_name}</div>
          <div class="search-result-coords">${parseFloat(result.lat).toFixed(4)}°N, ${parseFloat(result.lon).toFixed(4)}°E</div>
        </div>
      `).join('');

      // Sonuç tıklama event'leri
      searchResults.querySelectorAll('.search-result-item').forEach((item, idx) => {
        item.addEventListener('click', () => {
          const result = results[idx];
          this.teleportDrone(parseFloat(result.lat), parseFloat(result.lon), result.display_name);
        });
      });

    } catch (error) {
      console.error('Geocoding hatası:', error);
      searchStatus.className = 'search-status error';
      searchStatus.textContent = 'Hata: ' + error.message;
    }
  }

  teleportDrone(latitude, longitude, locationName) {
    const searchStatus = document.getElementById('searchStatus');
    
    // Teleport bayrağı (trail update'i engellemek için)
    this.isTeleporting = true;
    
    // Drone pozisyonunu değiştir
    this.physics.latitude = latitude;
    this.physics.longitude = longitude;
    this.physics.height = 500; // 500m yükseklikte başlat
    this.physics.heading = 0; // Heading sıfırla
    this.physics.pitch = 3;
    this.physics.roll = 0;

    // Trail'i temizle
    this.minimapTrailPositions = [];
    this.lastTrailTime = performance.now();

    // Entity pozisyonlarını hemen güncelle
    const droneCart = Cesium.Cartesian3.fromDegrees(longitude, latitude, 0);
    if (this.minimapDroneEntity) {
      this.minimapDroneEntity.position = droneCart;
    }

    // Heading çizgisini güncelle
    if (this.minimapHeadingEntity) {
      const lineLen = this.minimapExpanded ? 0.01 : 0.003;
      this.minimapHeadingEntity.polyline.positions = Cesium.Cartesian3.fromDegreesArray([
        longitude, latitude,
        longitude, latitude + lineLen,
      ]);
    }

    // Minimap kamera animasyonu
    this.minimapViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, this.minimapExpanded ? 5000000 : 5000),
      duration: 1.5,
      complete: () => {
        // Animasyon tamamlandı, trail update'i tekrar aktif
        this.isTeleporting = false;
        this.minimapViewer.scene.requestRender();
      }
    });

    // Başarı mesajı
    searchStatus.className = 'search-status success';
    searchStatus.textContent = `✓ ${locationName.split(',')[0]} konumuna ışınlandı!`;

    // Sonuçları gizle
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.classList.add('hidden');

    // 2 saniye sonra mesajı gizle
    setTimeout(() => {
      searchStatus.classList.add('hidden');
    }, 2000);

    console.log(`📍 Drone teleported to: ${locationName} (${latitude}, ${longitude})`);
  }

  expandMinimap() {
    const container = document.getElementById('minimapContainer');
    const closeBtn = document.getElementById('minimapClose');
    if (!container) return;

    this.minimapExpanded = true;
    container.classList.remove('minimap-small');
    container.classList.add('minimap-expanded');
    closeBtn?.classList.remove('hidden');
    this.minimapBackdrop?.classList.add('visible');

    // Location search bar'ı göster
    const locationSearch = document.getElementById('locationSearch');
    if (locationSearch) locationSearch.classList.remove('hidden');

    // Expanded modda kamera kontrollerini aç (zoom/pan)
    const msc = this.minimapViewer.scene.screenSpaceCameraController;
    msc.enableTranslate = true;
    msc.enableZoom = true;

    // Daha yüksekten bak (tüm dünya)
    this.minimapViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        this.physics.longitude, this.physics.latitude, 5000000
      ),
      duration: 0.8,
    });

    // Resize tetikle
    setTimeout(() => {
      this.minimapViewer.resize();
      this.minimapViewer.scene.requestRender();
    }, 450);
  }

  collapseMinimap() {
    const container = document.getElementById('minimapContainer');
    const closeBtn = document.getElementById('minimapClose');
    if (!container) return;

    this.minimapExpanded = false;
    container.classList.remove('minimap-expanded');
    container.classList.add('minimap-small');
    closeBtn?.classList.add('hidden');
    this.minimapBackdrop?.classList.remove('visible');

    // Location search bar'ı gizle
    const locationSearch = document.getElementById('locationSearch');
    if (locationSearch) {
      locationSearch.classList.add('hidden');
      // Sonuçları ve status'ı temizle
      const searchResults = document.getElementById('searchResults');
      const searchStatus = document.getElementById('searchStatus');
      if (searchResults) searchResults.classList.add('hidden');
      if (searchStatus) searchStatus.classList.add('hidden');
    }

    // Kamera kontrollerini tekrar kapat
    const msc = this.minimapViewer.scene.screenSpaceCameraController;
    msc.enableTranslate = false;
    msc.enableZoom = false;

    // Resize tetikle
    setTimeout(() => {
      this.minimapViewer.resize();
      this.minimapViewer.scene.requestRender();
    }, 450);
  }

  /**
   * OSM Binalarını aç/kapa yap
   * 'O' tuşu ile toggle edilir
   */
  toggleOSMBuildings() {
    this.osmBuildingsEnabled = !this.osmBuildingsEnabled;

    if (this.osmBuildingsEnabled) {
      // OSM Binalarını aç
      if (!this.osmBuildings) {
        Cesium.createOsmBuildingsAsync()
          .then((osmBuildings) => {
            this.osmBuildings = osmBuildings;
            this.viewer.scene.primitives.add(this.osmBuildings);
            console.log('🏢 OSM Binaları AÇILDI');
          })
          .catch(() => console.warn('OSM binaları yüklenemedi'));
      } else {
        // Varsa sadece göster
        this.osmBuildings.show = true;
        console.log('🏢 OSM Binaları AÇILDI');
      }
    } else {
      // OSM Binalarını kapa (gizle)
      if (this.osmBuildings) {
        this.osmBuildings.show = false;
        console.log('🏢 OSM Binaları KAPANDI');
      }
    }

    // Status mesajı
    const badge = document.createElement('div');
    badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 20, 40, 0.9);
      color: #00ff88;
      padding: 12px 24px;
      border: 1px solid #00d4ff;
      border-radius: 4px;
      font-family: Consolas, monospace;
      font-size: 12px;
      z-index: 1000;
      pointer-events: none;
    `;
    badge.textContent = this.osmBuildingsEnabled ? '🏢 Binalar: AÇIK' : '🏢 Binalar: KAPALI';
    document.body.appendChild(badge);

    setTimeout(() => badge.remove(), 1500);
  }

  /**
   * Hava durumu panelini güncelle
   */
  updateWeatherPanel() {
    if (!this.weather) return;

    const report = this.weather.getWeatherReport();

    // Saat
    const timeEl = document.getElementById('weatherTime');
    if (timeEl) timeEl.textContent = report.time;

    // Sıcaklık
    const tempEl = document.getElementById('weatherTemp');
    if (tempEl) tempEl.textContent = `SICI: ${report.temperature}°C`;

    // Rüzgar
    const windEl = document.getElementById('weatherWind');
    if (windEl) windEl.textContent = `${report.windSpeed} m/s`;

    // Rüzgar Yönü
    const dirEl = document.getElementById('weatherDir');
    if (dirEl) dirEl.textContent = `YÖN: ${report.windHeading}°`;

    // Görünürlük
    const visEl = document.getElementById('weatherVisibility');
    if (visEl) visEl.textContent = `GÖRÜNÜRLÜK: ${report.visibility}km`;

    // Koşul
    const condEl = document.getElementById('weatherCondition');
    if (condEl) {
      let condition = 'Açık';
      if (this.weather.weather.precipitation === 'light_rain') condition = '☔ Hafif Yağmur';
      if (this.weather.weather.precipitation === 'heavy_rain') condition = '⛈️ Şiddetli Yağmur';
      if (this.weather.weather.precipitation === 'snow') condition = '❄️ Kar';
      condEl.textContent = `KOŞULT: ${condition}`;
    }
  }

  /**
   * Ana Render Döngüsü
   * requestAnimationFrame + deltaTime ile akıcı güncelleme
   */
  animate() {
    const now = performance.now();
    this.clock.deltaTime = (now - this.clock.lastTime) / 1000;
    this.clock.lastTime = now;

    // DeltaTime sınırla (tab değiştirme, frame drop vs.)
    // 50ms'den fazla = glitch yapıcı tab geçişi, 0'la
    if (this.clock.deltaTime > 0.05) {
      // Tab geçişi tespit - önceki frame ile ortalama al
      this.clock.deltaTime = Math.min(0.033, this.clock.deltaTime / 2);
    }
    // Minimum 1ms
    if (this.clock.deltaTime < 0.001) this.clock.deltaTime = 0.001;

    // ── Kamera modunu senkronize et ──
    if (this.controls.cameraMode !== this.droneCamera.mode) {
      this.droneCamera.setMode(this.controls.cameraMode);
    }

    // ── Fizik Güncelle ──
    this.physics.update(this.clock.deltaTime);

    // ── Hava Durumu Güncelle ──
    this.weather.update(this.clock.deltaTime);

    // ── Çarpışma Kontrolü & Terrain Height Query ──
    this.updateTerrainHeight();
    this.physics.checkCollisionAndCrash();

    // ── Drone Modeli Güncelle ──
    this.droneModel.update(this.physics);

    // ── HUD Güncelle ──
    const flightTime = this.isFlying
      ? (now - this.flightStartTime) / 1000
      : 0;
    this.hud.update(this.physics, flightTime);
    this.hud.updateWeather(this.weather);

    // ── Minimap Güncelle ──
    this.updateMinimap();

    // ── Hava Durumu Paneli Güncelle ──
    this.updateWeatherPanel();

    // ── Cesium Clock Tick ──
    const cesiumTime = this.viewer.clock.tick();

    // ── RENDER PASS 1: Drone FPV Kamerası (optimized frame rate) ──
    this.frameCount++;

    // Drone cam capture sıklığı: kalite moduna göre dinamik
    // Performance: her 2 frame (işlemci yüksek değilse)
    // Quality: her 1 frame (maksimum smoothness)
    let camCaptureInterval;
    if (this.qualityMode === 'quality') {
      camCaptureInterval = 1;  // Her frame render
    } else {
      camCaptureInterval = 1;  // Her frame render (glitch sorunu çözmek için)
    }

    // Freeze aktifse frozen frame çiz, canlı render atla
    if (this.detector.isFrozen) {
      this.detector.drawFrozenFrame(
        this.droneCamCtx,
        this.droneCamCanvas.width,
        this.droneCamCanvas.height
      );
      // Zoom göstergesini frozen üzerine de çiz
      this._drawZoomIndicator();
    } else if (this.frameCount % camCaptureInterval === 0) {
      this.captureDroneCam(cesiumTime);

      // Zoom uygula (canlı görüntüye)
      if (this.detector.zoomLevel > 1.01) {
        this.detector.applyZoom(
          this.droneCamCanvas,
          this.droneCamCtx,
          this.droneCamCanvas.width,
          this.droneCamCanvas.height
        );
      }

      // AI Detection: FPV frame'den tespit çalıştır (seyrek)
      // Performance: her 8 frame'de, Quality: her 6 frame'de
      const detectionInterval = this.qualityMode === 'quality' ? 6 : 8;
      if (this.detector.isEnabled && this.frameCount % detectionInterval === 0) {
        // Physics bilgilerini detector'a geç (mesafe hesaplama için)
        const physicsData = {
          height: this.physics.height,
          pitch: this.physics.pitch,
          cameraPitch: this.physics.cameraPitch,
        };
        this.detector.detect(this.droneCamCanvas, physicsData);
      }

      // AI Detection: Bounding box + overlay çiz (her drone cam frame'inde)
      if (this.detector.isEnabled) {
        this.detector.drawDetections(
          this.droneCamCtx,
          this.droneCamCanvas.width,
          this.droneCamCanvas.height
        );
      }

      // Zoom göstergesini çiz
      this._drawZoomIndicator();
    }

    // ── RENDER PASS 2: Ana Takip Kamerası ──
    this.droneCamera.update(this.clock.deltaTime);
    this.viewer.scene.initializeFrame();
    this.viewer.scene.render(cesiumTime);

    requestAnimationFrame(() => this.animate());
  }

  /**
   * Zoom göstergesini drone cam üzerine çiz
   */
  _drawZoomIndicator() {
    const zoom = this.detector._currentZoom || 1.0;
    if (zoom <= 1.01) return;

    const ctx = this.droneCamCtx;
    const w = this.droneCamCanvas.width;

    // Zoom badge (sağ üst)
    const text = `🔍 ${zoom.toFixed(1)}x`;
    ctx.font = 'bold 12px Consolas, monospace';
    const tw = ctx.measureText(text).width + 16;
    const tx = w - tw - 10;
    const ty = 8;

    ctx.fillStyle = 'rgba(0, 20, 40, 0.8)';
    ctx.fillRect(tx, ty, tw, 22);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, 22);

    ctx.fillStyle = '#00d4ff';
    ctx.fillText(text, tx + 8, ty + 16);
  }

  updateMinimap() {
    if (!this.minimapViewer) return;

    const pos = this.physics.getPosition();
    const now = performance.now();

    // ── Drone pozisyon marker'ını güncelle ──
    const droneCart = Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, 0);
    if (this.minimapDroneEntity) {
      this.minimapDroneEntity.position = droneCart;
    }

    // ── Heading çizgisini güncelle ──
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const lineLen = this.minimapExpanded ? 0.01 : 0.003;
    const endLon = pos.longitude + Math.sin(headingRad) * lineLen;
    const endLat = pos.latitude + Math.cos(headingRad) * lineLen;
    if (this.minimapHeadingEntity) {
      this.minimapHeadingEntity.polyline.positions = Cesium.Cartesian3.fromDegreesArray([
        pos.longitude, pos.latitude,
        endLon, endLat,
      ]);
    }

    // ── İz çizgisi (trail) - her 500ms bir nokta ekle ──
    // Teleport sırasında trail update'i atla (glitch engelleme)
    if (!this.isTeleporting && now - this.lastTrailTime > 500) {
      this.minimapTrailPositions.push(
        Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, 0)
      );
      // Maksimum 500 nokta tut
      if (this.minimapTrailPositions.length > 500) {
        this.minimapTrailPositions.shift();
      }
      this.lastTrailTime = now;
    }

    // ── Kamerayı drone'a merkezle (küçük modda) ──
    // Teleport sırasında kamera güncellemesi atla (flyTo çakışmasını engelle)
    if (!this.minimapExpanded && !this.isTeleporting) {
      this.minimapViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          pos.longitude, pos.latitude, 5000
        ),
      });
    }

    // ── Koordinat bilgisini güncelle ──
    if (this.minimapCoordsEl) {
      this.minimapCoordsEl.textContent =
        `${pos.latitude.toFixed(4)}°N  ${pos.longitude.toFixed(4)}°E  ${pos.height.toFixed(0)}m`;
    }

    // Render iste (minimap - seyrek update, temel glitch sorunu değil)
    const minimapSmallInterval = this.qualityMode === 'quality' ? 3 : 4;
    const minimapExpandedInterval = this.qualityMode === 'quality' ? 2 : 2;
    
    if (this.minimapExpanded) {
      if (this.frameCount % minimapExpandedInterval === 0) {
        this.minimapViewer.scene.requestRender();
      }
    } else {
      if (this.frameCount % minimapSmallInterval === 0) {
        this.minimapViewer.scene.requestRender();
      }
    }
  }

  /**
   * Drone konumunda arazi yüksekliğini sor ve physics'e geçir
   * (Terrain height estimation - optimized)
   */
  updateTerrainHeight() {
    const pos = this.physics.getPosition();
    
    // Terrain height sampling: seyrek ama glitch sorunu değil
    // Performance: her 16 frame, Quality: her 12 frame
    const terrainSamplingInterval = this.qualityMode === 'quality' ? 12 : 16;
    if (this.frameCount % terrainSamplingInterval === 0) {
      const terrainProvider = this.viewer.scene.globe.terrainProvider;
      const cartographicArray = [
        Cesium.Cartographic.fromDegrees(pos.longitude, pos.latitude)
      ];

      Cesium.sampleTerrainMostDetailed(terrainProvider, cartographicArray)
        .then((samples) => {
          if (samples && samples.length > 0) {
            this.physics.setTerrainHeight(samples[0].height);
          }
        })
        .catch(() => {
          // Fallback: zemin seviyesi 0
          this.physics.setTerrainHeight(0);
        });
    }
  }
}

// ── Başlat ──
window.addEventListener('DOMContentLoaded', () => {
  window.sim = new DroneSimulator();
});
