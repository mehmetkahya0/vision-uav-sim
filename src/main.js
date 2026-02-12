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
import { AIVisionManager } from './aiVisionManager.js';
import { AudioManager } from './soundEngine.js';

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
    this.nightVisionEnabled = false; // Gece görüş modu
    
    // ═══ PERFORMANS İZLEME ═══
    this.performanceStats = {
      frameCount: 0,
      fps: 0,
      avgFPS: 0,
      avgFrameTime: 0,
      uptime: 0,
      lastFPSUpdate: performance.now(),
    };
    this.frameTimes = [];
    
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
      },
      stats: () => {
        if (!this.performanceStats) {
          console.log('⏳ İstatistikler henüz hazır değil...');
          return;
        }
        console.log('═══════════════════════════════════════');
        console.log('📊 DRONE SIMULATOR PERFORMANS İSTATİSTİKLERİ');
        console.log('═══════════════════════════════════════');
        console.log(`🎯 Avg FPS: ${this.performanceStats.avgFPS.toFixed(1)}`);
        console.log(`⚡ Avg Frame Time: ${this.performanceStats.avgFrameTime.toFixed(2)}ms`);
        console.log(`🎬 Total Frames: ${this.frameCount}`);
        console.log(`⏱️  Uptime: ${(this.performanceStats.uptime / 1000).toFixed(1)}s`);
        console.log(`🏞️  Globe Tiles Loaded: ${this.viewer.scene.globe._surface._tilesToRenderByTextureCount || 'N/A'}`);
        console.log(`🏗️  OSM Buildings: ${this.osmBuildingsEnabled ? 'AÇIK' : 'KAPALI'}`);
        console.log('═══════════════════════════════════════');
      }
    };
    // Ayrıca window objesine de erişimi sağla
    window.drone.isActive = () => console.log('✈️ Drone simulator aktif. Komutlar: .turbo(), .quality(), .stats()');
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
      shadows: false,             // Gölgeler KAPALI (büyük performans kazancı)
      shouldAnimate: true,
      msaaSamples: 1,             // MSAA kapalı (GPU yükünü azalt)
      orderIndependentTranslucency: false,  // Şeffaflık sıralama kapalı
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,
          antialias: false,       // WebGL AA kapalı (GPU tasarrufu)
          powerPreference: 'high-performance',  // GPU'yu zorunlu kullan
          failIfMajorPerformanceCaveat: false,
        },
      },
    });

    // Render döngüsünü biz yöneteceğiz
    this.viewer.useDefaultRenderLoop = false;

    // ════════════════════════════════════════
    // GLOBE TILE LOADING OPTİMİZASYONU (KRITIK)
    // Harita yüklenirken glitch'in ana sebebi:
    // Cesium çok fazla tile yüklemeye çalışıyor
    // ════════════════════════════════════════
    const globe = this.viewer.scene.globe;

    // maximumScreenSpaceError: Tile detay seviyesi (yüksek = daha az tile yükler)
    // Varsayılan 2, biz 4-6 yaparak tile sayısını dramatik azaltıyoruz
    globe.maximumScreenSpaceError = 6;

    // tileCacheSize: Bellekte tutulacak tile sayısı (yüksek = daha az reload)
    // Varsayılan 100, biz 500 yaparak bir kez yüklenen tile'ı tekrar yüklemiyoruz
    globe.tileCacheSize = 500;

    // preloadAncestors: Üst seviye tile'ları önceden yükle
    // Bu, zoom yaparken "delik" görünmesini engeller
    globe.preloadAncestors = true;

    // preloadSiblings: Komşu tile'ları önceden yükle
    // Kamera dönerken yeni tile beklemesini azaltır
    globe.preloadSiblings = true;

    // loadingDescendantLimit: Aynı anda yüklenebilecek alt tile sayısı
    // Düşük değer = daha az concurrent request = daha az jank
    globe.loadingDescendantLimit = 4;

    // baseColor: Tile yüklenmeden önce görünen renk
    // Koyu renk yaparak "beyaz flash" glitch'ini engelle
    globe.baseColor = Cesium.Color.fromCssColorString('#0a1628');

    // showGroundAtmosphere: Yer atmosfer efekti açık (gökyüzü görünümü için)
    globe.showGroundAtmosphere = true;

    // backFaceCulling: Arka yüzleri render etme (varsayılan zaten true)
    globe.backFaceCulling = true;

    // ── Imagery (Uydu Görüntüsü) ──
    try {
      this.viewer.imageryLayers.removeAll();
      const imagery = await Cesium.IonImageryProvider.fromAssetId(2);
      const imageryLayer = this.viewer.imageryLayers.addImageryProvider(imagery);
      
      // ═══ IMAGERY TILE LOADING OPTIMIZATION ═══
      // maximumAnisotropy: Texture filtering (düşük = daha az GPU yükü)
      imageryLayer.maximumAnisotropy = 1;
      // alpha: Transparency (blend işlemi yapmaz)
      imageryLayer.alpha = 1.0;
      // brightness/contrast: Post-processing kapalı
      imageryLayer.brightness = 1.0;
      imageryLayer.contrast = 1.0;
      imageryLayer.hue = 0.0;
      imageryLayer.saturation = 1.0;
      imageryLayer.gamma = 1.0;
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
        
        // ═══ OSM Buildings TILE OPTİMİZASYONU ═══
        // maximumScreenSpaceError: Bina detay seviyesi (yüksek = daha az bina tile)
        this.osmBuildings.maximumScreenSpaceError = 24;  // Varsayılan 16
        // maximumMemoryUsage: Bellekte tutulacak bina verisi (MB)
        this.osmBuildings.maximumMemoryUsage = 256;      // Varsayılan 512 → düşür
        // preloadFlightDestinations: Uçuş sırasında preload engelle
        this.osmBuildings.preloadFlightDestinations = false;
        // preferLeaves: Yaprak tile'ları tercih et (daha az intermediate tile)
        this.osmBuildings.preferLeaves = true;
        // skipLevelOfDetail: LOD atla → daha hızlı yükleme
        this.osmBuildings.skipLevelOfDetail = true;
        this.osmBuildings.skipScreenSpaceErrorFactor = 16;
        this.osmBuildings.skipLevels = 1;
        this.osmBuildings.loadSiblings = false;
        this.osmBuildings.immediatelyLoadDesiredLevelOfDetail = false;
        
        // Outline'ları kapat (imagery draping uyarısını engelle)
        this.osmBuildings.showOutline = false;
        
        this.viewer.scene.primitives.add(this.osmBuildings);
        console.log('✅ OSM binaları YÜKLENDİ (optimize edilmiş tile loading)');
      } catch (e) {
        console.warn('OSM binaları yüklenemedi:', e);
      }
    }

    // ── Sahne Ayarları (AGRESIF PERFORMANS) ──
    const scene = this.viewer.scene;
    scene.globe.enableLighting = true;     // Aydınlatma AÇIK (skyAtmosphere için gerekli!)
    
    // FOG: Daha yoğun sis = uzak tile'lar gizlenir = daha az yükleme
    scene.fog.enabled = true;
    scene.fog.density = 0.0003;            // Orta kalınlıkta sis
    scene.fog.minimumBrightness = 0.03;    // Minimum parlaklık
    
    // ═══ GÖKYÜZÜ SİSTEMİ ═══
    // Atmosfer efektleri AÇIK (gökyüzü için gerekli)
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.brightnessShift = 0.3;   // Daha parlak atmosfer
    scene.skyAtmosphere.saturationShift = 0.1;   // Biraz daha doygun renkler
    
    // SkyBox (yıldızlı gökyüzü arka planı) - Gece için
    scene.skyBox = new Cesium.SkyBox({
      sources: {
        positiveX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_px.jpg'),
        negativeX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mx.jpg'),
        positiveY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_py.jpg'),
        negativeY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_my.jpg'),
        positiveZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_pz.jpg'),
        negativeZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mz.jpg'),
      }
    });
    scene.skyBox.show = false;  // Başlangıçta gizle (gündüz atmosfer görünsün)
    
    // Güneş görünümü - AÇIK
    scene.sun.show = true;
    
    // Ay görünümü - AÇIK  
    scene.moon.show = true;
    
    // Arka plan rengi (skyBox yüklenemezse görünür)
    scene.backgroundColor = Cesium.Color.fromCssColorString('#87CEEB');  // Açık mavi
    
    // Depth test - terrain clipping için gerekli
    scene.globe.depthTestAgainstTerrain = true;
    
    // FXAA post-processing KAPALI (GPU yükü azalt)
    scene.postProcessStages.fxaa.enabled = false;
    
    // Sun/Moon glow efektleri KAPALI
    scene.sun.glowFactor = 0;
    
    // Scene optimizasyonları
    scene.highDynamicRange = false;        // HDR kapalı
    scene.logarithmicDepthBuffer = true;   // Z-fighting engelle (glitch azalt)

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

    // AI Vision Manager (Çoklu AI modelleri yönetimi)
    this.aiVision = new AIVisionManager(this.detector);

    // Klavye Kontrolleri
    this.controls = new DroneControls(this.physics, this.detector);

    // Kamera Sistemi
    this.droneCamera = new DroneCamera(this.viewer, this.physics);

    // HUD (Gösterge Paneli)
    this.hud = new HUD();

    // Hava Durumu Sistemi
    this.weather = new WeatherSystem(this.viewer, this.physics);

    // Ses Yöneticisi (Gerçek ses dosyaları + Web Audio API)
    this.audioManager = new AudioManager();
    // Tarayıcı autoplay politikası: ilk tuşa basınca ses başlat
    window.addEventListener('keydown', () => this.audioManager.init(), { once: true });

    // Zaman Kontrol Paneli
    this.setupTimeControlPanel();

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
   * Her FPV capture'da 2 render yapılır:
   * 1. FPV kamera ile render → FPV canvas'a copy
   * 2. Ana kamera restore → ana render loop'ta render
   */
  captureDroneCam(cesiumTime) {
    if (!this.physics || !this.droneCamCtx) return;

    const scene = this.viewer.scene;
    const camera = scene.camera;

    // ═══ KAMERA STATE KAYDET (restore için) ═══
    const savedPosition = camera.position.clone();
    const savedDirection = camera.direction.clone();
    const savedUp = camera.up.clone();
    const savedRight = camera.right.clone();

    // ═══ YUMUŞATILMIŞ POZİSYON KULLAN (titreme önleme) ═══
    // DroneModel'in smooth pozisyonunu kullan, yoksa physics'den al
    const pos = this.physics.getPosition();
    let baseLon = pos.longitude;
    let baseLat = pos.latitude;
    let baseHeight = pos.height;
    
    if (this.droneModel && this.droneModel.currentPosition) {
      const carto = Cesium.Cartographic.fromCartesian(this.droneModel.currentPosition);
      baseLon = Cesium.Math.toDegrees(carto.longitude);
      baseLat = Cesium.Math.toDegrees(carto.latitude);
      baseHeight = carto.height;
    }
    
    // ═══ GIMBAL KAMERA OFSETİ ═══
    // Kamera drone'un altında ve biraz önünde (gimbal pozisyonu)
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const pitchRad = Cesium.Math.toRadians(this.physics.pitch);
    
    // Ofset değerleri (metre)
    const gimbalDown = 3.0;     // Drone altında 3m
    const gimbalForward = 2.0;  // Drone önünde 2m
    
    // Heading'e göre öne offseti hesapla
    const metersPerDegreeLon = 111320 * Math.cos(Cesium.Math.toRadians(baseLat));
    const metersPerDegreeLat = 111320;
    
    const forwardOffsetX = Math.sin(headingRad) * gimbalForward;
    const forwardOffsetY = Math.cos(headingRad) * gimbalForward;
    
    const camLon = baseLon + forwardOffsetX / metersPerDegreeLon;
    const camLat = baseLat + forwardOffsetY / metersPerDegreeLat;
    const camHeight = baseHeight - gimbalDown;
    
    const droneCartesian = Cesium.Cartesian3.fromDegrees(camLon, camLat, camHeight);
    
    const cameraPitchRad = Cesium.Math.toRadians(this.physics.cameraPitch);

    // FPV kamerasını ayarla
    camera.setView({
      destination: droneCartesian,
      orientation: {
        heading: headingRad,
        pitch: cameraPitchRad,
        roll: 0,
      },
      duration: 0,
      easingFunction: undefined,
      endTransform: Cesium.Matrix4.IDENTITY,
    });

    // FPV kamera ile render (sadece ilk 10 frame skip)
    if (this.frameCount > 10) {
      scene.initializeFrame();
      scene.render(cesiumTime);
      
      // Canvas'a kopyala (FPV kamera görüntüsü)
      const cesiumCanvas = scene.canvas;
      const w = this.droneCamCanvas.width;
      const h = this.droneCamCanvas.height;
      if (w > 0 && h > 0) {
        this.droneCamCtx.drawImage(cesiumCanvas, 0, 0, w, h);
        
        // ═══ GECE GÖRÜŞ MODU ═══
        if (this.nightVisionEnabled) {
          this.applyNightVisionFilter(w, h);
        }
      }
    }

    // ═══ KAMERA STATE GERİ YÜKLE ═══
    // Ana kamera pozisyonunu geri koy - ana loop'ta render edilecek
    camera.position = savedPosition;
    camera.direction = savedDirection;
    camera.up = savedUp;
    camera.right = savedRight;
  }

  /**
   * Gece Görüş Filtresi Uygula
   * Yeşil tonlu, kontrast artırılmış görüntü
   */
  applyNightVisionFilter(w, h) {
    const ctx = this.droneCamCtx;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // RGB değerlerini al
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Luminance hesapla (parlaklık)
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      // Kontrastı artır ve parlaklığı yükselt
      let boosted = luminance * 2.5 + 30;
      boosted = Math.min(255, Math.max(0, boosted));

      // Yeşil tonlu gece görüş efekti
      data[i] = boosted * 0.1;       // R - çok az
      data[i + 1] = boosted;          // G - tam yeşil
      data[i + 2] = boosted * 0.15;   // B - çok az
    }

    ctx.putImageData(imageData, 0, 0);

    // Scanline efekti (CRT tarzı çizgiler)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }

    // Vignette efekti (köşeler karanlık)
    const gradient = ctx.createRadialGradient(w/2, h/2, h * 0.3, w/2, h/2, h * 0.8);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * Gece Görüş Modunu Aç/Kapat
   */
  toggleNightVision() {
    this.nightVisionEnabled = !this.nightVisionEnabled;
    
    // UI güncelle
    const container = document.getElementById('droneCameraContainer');
    if (container) {
      container.classList.toggle('night-vision-active', this.nightVisionEnabled);
    }

    // NV Badge güncelle
    const nvBadge = document.getElementById('nvStatusBadge');
    if (nvBadge) {
      if (this.nightVisionEnabled) {
        nvBadge.textContent = 'NV ON';
        nvBadge.className = 'nv-badge nv-on';
      } else {
        nvBadge.textContent = 'NV OFF';
        nvBadge.className = 'nv-badge nv-off';
      }
    }

    // Floating badge göster
    this.showNightVisionBadge();
    
    console.log(`🌙 Gece Görüş: ${this.nightVisionEnabled ? 'AÇIK' : 'KAPALI'}`);
  }

  /**
   * Gece Görüş Badge göster
   */
  showNightVisionBadge() {
    // Mevcut badge'i kaldır
    const existing = document.querySelector('.night-vision-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = 'night-vision-badge';
    badge.innerHTML = this.nightVisionEnabled 
      ? '🌙 GECE GÖRÜŞ: AÇIK' 
      : '☀️ GECE GÖRÜŞ: KAPALI';
    badge.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${this.nightVisionEnabled ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 0, 0, 0.7)'};
      border: 2px solid ${this.nightVisionEnabled ? '#00ff00' : '#666'};
      color: ${this.nightVisionEnabled ? '#00ff00' : '#fff'};
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'Consolas', monospace;
      font-size: 16px;
      font-weight: bold;
      z-index: 9999;
      text-shadow: 0 0 10px ${this.nightVisionEnabled ? '#00ff00' : '#000'};
      animation: fadeOut 1.5s forwards;
    `;
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 1500);
  }

  /**
   * Zaman Kontrol Paneli Ayarla
   */
  setupTimeControlPanel() {
    const panel = document.getElementById('timeControlPanel');
    if (!panel) return;

    // Saat göstergesi
    this.timeDisplayClock = document.getElementById('timeDisplayClock');

    // Kontrol butonları
    const backwardBtn = document.getElementById('timeBackward');
    const pauseBtn = document.getElementById('timePause');
    const forwardBtn = document.getElementById('timeForward');

    if (backwardBtn) {
      backwardBtn.addEventListener('click', () => {
        if (this.weather) this.weather.adjustHour(-1);
        this.updateTimeDisplay();
      });
    }

    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        if (this.weather) this.weather.adjustHour(1);
        this.updateTimeDisplay();
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        if (this.weather) {
          const isPaused = this.weather.togglePause();
          pauseBtn.textContent = isPaused ? '▶' : '⏸';
          pauseBtn.classList.toggle('paused', isPaused);
        }
      });
    }

    // Hız butonları
    const speedBtns = panel.querySelectorAll('.speed-btn');
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed);
        if (this.weather) {
          // Pause durumunu kaldır
          if (this.weather.isPaused()) {
            this.weather.togglePause();
            if (pauseBtn) {
              pauseBtn.textContent = '⏸';
              pauseBtn.classList.remove('paused');
            }
          }
          this.weather.setTimeScale(speed);
        }
        // Aktif butonu güncelle
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Preset butonları
    const presetBtns = panel.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseInt(btn.dataset.hour);
        if (this.weather) {
          this.weather.jumpToTime(hour, 0);
          this.updateTimeDisplay();
        }
      });
    });
  }

  /**
   * Zaman göstergesini güncelle
   */
  updateTimeDisplay() {
    if (this.timeDisplayClock && this.weather) {
      this.timeDisplayClock.textContent = this.weather.getTimeString();
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

      // Yükseklik seçiciyi göster
      const altitudeSelector = document.getElementById('altitudeSelector');
      if (altitudeSelector) {
        altitudeSelector.classList.remove('hidden');
      }

      // Sonuç tıklama event'leri
      searchResults.querySelectorAll('.search-result-item').forEach((item, idx) => {
        item.addEventListener('click', () => {
          const result = results[idx];
          // Seçilen yüksekliği al
          const altitudeSelect = document.getElementById('altitudeSelect');
          const selectedAltitude = altitudeSelect ? parseFloat(altitudeSelect.value) : 500;
          this.teleportDrone(parseFloat(result.lat), parseFloat(result.lon), result.display_name, selectedAltitude);
        });
      });

    } catch (error) {
      console.error('Geocoding hatası:', error);
      searchStatus.className = 'search-status error';
      searchStatus.textContent = 'Hata: ' + error.message;
    }
  }

  teleportDrone(latitude, longitude, locationName, altitude = 500) {
    const searchStatus = document.getElementById('searchStatus');
    
    // Teleport bayrağı (trail update'i engellemek için)
    this.isTeleporting = true;
    
    // Drone pozisyonunu değiştir
    this.physics.latitude = latitude;
    this.physics.longitude = longitude;
    this.physics.height = altitude; // Seçilen yüksekliği kullan
    this.physics.heading = 0; // Heading sıfırla
    this.physics.pitch = 3;
    this.physics.roll = 0;
    
    // Hız ve tırmanma değerlerini sıfırla
    this.physics.airspeed = 0;
    this.physics.throttle = 0;
    this.physics.climbRate = 0;

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
    searchStatus.textContent = `✓ ${locationName.split(',')[0]} konumuna (${altitude}m yükseklikte) ışınlandı!`;

    // Sonuçları gizle
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.classList.add('hidden');

    // Yükseklik seçiciyi gizle
    const altitudeSelector = document.getElementById('altitudeSelector');
    if (altitudeSelector) altitudeSelector.classList.add('hidden');

    // 2 saniye sonra mesajı gizle
    setTimeout(() => {
      searchStatus.classList.add('hidden');
    }, 2000);

    console.log(`📍 Drone teleported to: ${locationName} (${latitude}, ${longitude}) at ${altitude}m altitude`);
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
    // ═══ KRİTİK: requestAnimationFrame her koşulda çağrılmalı ═══
    // Render loop ölürse tüm uygulama donar!
    requestAnimationFrame(() => this.animate());
    
    const now = performance.now();
    this.clock.deltaTime = (now - this.clock.lastTime) / 1000;
    this.clock.lastTime = now;

    // ═══ PERFORMANS İZLEME ═══
    this.frameTimes.push(this.clock.deltaTime * 1000);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    
    if (now - this.performanceStats.lastFPSUpdate > 1000) {
      this.performanceStats.avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.performanceStats.avgFPS = 1000 / this.performanceStats.avgFrameTime;
      this.performanceStats.uptime = now - (this.flightStartTime || now);
      this.performanceStats.lastFPSUpdate = now;
    }

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

    // ── Ses Yöneticisi Güncelle ──
    if (this.audioManager) {
      this.audioManager.update(this.clock.deltaTime, this.physics.getFlightData());
    }

    // ── Hava Durumu Güncelle (her 10 frame ~167ms) ──
    // Rüzgar/sıcaklık değişimi yavaş, sık update gereksiz
    if (this.frameCount % 10 === 0) {
      this.weather.update(this.clock.deltaTime * 10);
    }

    // ── Çarpışma Kontrolü & Terrain Height Query ──
    this.updateTerrainHeight();
    this.physics.checkCollisionAndCrash();

    // ── Drone Modeli Güncelle (her frame - titreme önleme) ──
    this.droneModel.update(this.physics, this.clock.deltaTime);

    // ── HUD Güncelle (her 3 frame) ──
    const flightTime = this.isFlying
      ? (now - this.flightStartTime) / 1000
      : 0;
    if (this.frameCount % 3 === 0) {
      this.hud.update(this.physics, flightTime);
    }

    // ── Hava Durumu HUD'a (her 30 frame ~500ms) ──
    if (this.frameCount % 30 === 0) {
      this.hud.updateWeather(this.weather);
    }

    // ── Minimap Güncelle (her 4 frame) ──
    if (this.frameCount % 4 === 0) {
      this.updateMinimap();
    }

    // ── Hava Durumu Paneli Güncelle (her 60 frame ~1s) ──
    if (this.frameCount % 60 === 0) {
      this.updateWeatherPanel();
      this.updateTimeDisplay();
    }

    // ── Cesium Clock Tick ──
    const cesiumTime = this.viewer.clock.tick();

    // ── RENDER PASS 1: Drone FPV Kamerası (THROTTLED) ──
    this.frameCount++;

    // ═══ FPV KAMERA RENDER SIKLIĞI ═══
    // scene.render() ÇOK AĞIR bir işlem!
    // FPV cam'i her 3 frame'de render et = %66 GPU tasarrufu
    // Kullanıcı farkı hissetmez (20fps drone cam yeterli)
    const fpvCaptureInterval = 3;

    // Freeze aktifse frozen frame çiz, canlı render atla
    if (this.detector.isFrozen) {
      this.detector.drawFrozenFrame(
        this.droneCamCtx,
        this.droneCamCanvas.width,
        this.droneCamCanvas.height
      );
      this._drawZoomIndicator();
    } else if (this.frameCount % fpvCaptureInterval === 0) {
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
      // Her 15 frame'de AI tespit çalıştır (~4 FPS tespit = yeterli)
      const detectionInterval = 15;
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

      // AI Vision Manager: Çoklu AI modelleri güncelle ve render et
      // try/catch ile sarmalı - hata olursa render loop ölmesin
      try {
        if (this.aiVision && this.aiVision.isAnyModelActive()) {
          const detections = this.detector.detections;
          this.aiVision.update(this.droneCamCanvas, this.droneCamCtx, detections);
          this.aiVision.render(this.droneCamCtx, this.droneCamCanvas.width, this.droneCamCanvas.height);
          this._drawAIActiveBadges();
        }
      } catch (aiErr) {
        console.warn('AI Vision hata:', aiErr);
      }

      // Zoom göstergesini çiz
      this._drawZoomIndicator();
    }

    // ── RENDER PASS 2: Ana Takip Kamerası ──
    // Only update camera if not in drone cam freeze mode
    if (!this.detector.isFrozen) {
      this.droneCamera.update(this.clock.deltaTime);
    }
    
    // ═══ ANA KAMERA RENDER (HER FRAME!) ═══
    // FPV capture frame'lerinde kamera restore edilmiş olacak
    // Normal frame'lerde zaten ana kamera ayarlı
    // Her frame ana takip kamerasını render et
    this.viewer.scene.initializeFrame();
    this.viewer.scene.render(cesiumTime);
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

  /**
   * Aktif AI modellerinin badge'lerini drone cam üzerine çiz
   */
  _drawAIActiveBadges() {
    if (!this.aiVision) return;
    
    const activeModels = this.aiVision.getActiveModels();
    if (activeModels.length === 0) return;

    const ctx = this.droneCamCtx;
    const badges = [];
    
    // Model ID'den kısa isim ve renge çevir
    const modelInfo = {
      objectTracking: { name: 'TRACK', color: '#ff6b6b' },
      depthEstimation: { name: 'DEPTH', color: '#4ecdc4' },
      segmentation: { name: 'SEG', color: '#a855f7' },
      poseEstimation: { name: 'POSE', color: '#f59e0b' },
      opticalFlow: { name: 'FLOW', color: '#06b6d4' }
    };
    
    activeModels.forEach(modelId => {
      if (modelInfo[modelId]) {
        badges.push(modelInfo[modelId]);
      }
    });
    
    // Badge'leri çiz (sağ üst, zoom badge'in altında)
    let yOffset = 38; // Zoom badge'in altı
    const startX = this.droneCamCanvas.width - 70;
    
    badges.forEach((badge, i) => {
      const x = startX;
      const y = yOffset + (i * 22);
      
      // Arka plan
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(x, y, 60, 18);
      
      // Border
      ctx.strokeStyle = badge.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, 60, 18);
      
      // Text
      ctx.fillStyle = badge.color;
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.fillText(badge.name, x + 8, y + 13);
      
      // Aktif göstergesi (yanıp sönen nokta)
      const pulse = Math.sin(performance.now() / 200) * 0.3 + 0.7;
      ctx.beginPath();
      ctx.arc(x + 52, y + 9, 4, 0, Math.PI * 2);
      ctx.fillStyle = badge.color;
      ctx.globalAlpha = pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
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
    // Hesaplama cache'le - trigonometri pahalı
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const lineLen = this.minimapExpanded ? 0.01 : 0.003;
    const sinHeading = Math.sin(headingRad);
    const cosHeading = Math.cos(headingRad);
    const endLon = pos.longitude + sinHeading * lineLen;
    const endLat = pos.latitude + cosHeading * lineLen;
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

    // Render iste (minimap - çok seyrek update)
    // Expanded: her 16 frame (~267ms @ 60fps)
    // Small: her 30 frame (~500ms @ 60fps)
    // Minimap sabit harita - sık render gereksiz
    const minimapSmallInterval = 30;
    const minimapExpandedInterval = 16;
    
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
   * (Terrain height estimation - optimized, non-blocking)
   */
  updateTerrainHeight() {
    const pos = this.physics.getPosition();
    
    // Terrain height sampling: render pipeline'ı bloke etmemek için
    // Her 120 frame (~2000ms @ 60fps) - çok seyrek ve non-blocking
    const terrainSamplingInterval = 120;
    if (this.frameCount % terrainSamplingInterval === 0) {
      const terrainProvider = this.viewer.scene.globe.terrainProvider;
      const cartographicArray = [
        Cesium.Cartographic.fromDegrees(pos.longitude, pos.latitude)
      ];

      // Deferred execution: requestIdleCallback ile idle thread'te çalıştır
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          Cesium.sampleTerrainMostDetailed(terrainProvider, cartographicArray)
            .then((samples) => {
              if (samples && samples.length > 0) {
                this.physics.setTerrainHeight(samples[0].height);
              }
            })
            .catch(() => {
              this.physics.setTerrainHeight(0);
            });
        });
      } else {
        // Fallback: setTimeout(0) ile deferred execution
        setTimeout(() => {
          Cesium.sampleTerrainMostDetailed(terrainProvider, cartographicArray)
            .then((samples) => {
              if (samples && samples.length > 0) {
                this.physics.setTerrainHeight(samples[0].height);
              }
            })
            .catch(() => {
              this.physics.setTerrainHeight(0);
            });
        }, 0);
      }
    }
  }
}

// ── Başlat ──
window.addEventListener('DOMContentLoaded', () => {
  window.sim = new DroneSimulator();
});
