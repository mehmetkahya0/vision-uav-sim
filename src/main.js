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
    this.init();
  }

  async init() {
    // ════════════════════════════════════════
    // CESIUM VIEWER KURULUMU
    // ════════════════════════════════════════
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
      shadows: true,
      shouldAnimate: true,
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,
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

    // ── OSM Binalar ──
    try {
      const osmBuildings = await Cesium.createOsmBuildingsAsync();
      this.viewer.scene.primitives.add(osmBuildings);
    } catch (e) {
      console.warn('OSM binaları yüklenemedi:', e);
    }

    // ── Sahne Ayarları ──
    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.fog.enabled = true;
    this.viewer.scene.fog.density = 0.0002;
    this.viewer.scene.skyAtmosphere.show = true;
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

    camera.setView({
      destination: droneCartesian,
      orientation: {
        heading: headingRad,
        pitch: cameraPitchRad,
        roll: 0,
      },
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
   * Ana Render Döngüsü
   * requestAnimationFrame + deltaTime ile akıcı güncelleme
   */
  animate() {
    const now = performance.now();
    this.clock.deltaTime = (now - this.clock.lastTime) / 1000;
    this.clock.lastTime = now;

    // DeltaTime sınırla (tab değiştirme vs.)
    if (this.clock.deltaTime > 0.1) this.clock.deltaTime = 0.016;

    // ── Kamera modunu senkronize et ──
    if (this.controls.cameraMode !== this.droneCamera.mode) {
      this.droneCamera.setMode(this.controls.cameraMode);
    }

    // ── Fizik Güncelle ──
    this.physics.update(this.clock.deltaTime);

    // ── Drone Modeli Güncelle ──
    this.droneModel.update(this.physics);

    // ── HUD Güncelle ──
    const flightTime = this.isFlying
      ? (now - this.flightStartTime) / 1000
      : 0;
    this.hud.update(this.physics, flightTime);

    // ── Minimap Güncelle ──
    this.updateMinimap();

    // ── Cesium Clock Tick ──
    const cesiumTime = this.viewer.clock.tick();

    // ── RENDER PASS 1: Drone FPV Kamerası (her 3 frame'de) ──
    this.frameCount++;

    // Freeze aktifse frozen frame çiz, canlı render atla
    if (this.detector.isFrozen) {
      this.detector.drawFrozenFrame(
        this.droneCamCtx,
        this.droneCamCanvas.width,
        this.droneCamCanvas.height
      );
      // Zoom göstergesini frozen üzerine de çiz
      this._drawZoomIndicator();
    } else if (this.frameCount % 3 === 0) {
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

      // AI Detection: FPV frame'den tespit çalıştır (her 6 frame'de)
      if (this.detector.isEnabled && this.frameCount % 6 === 0) {
        this.detector.detect(this.droneCamCanvas);
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
    this.minimapDroneEntity.position = droneCart;

    // ── Heading çizgisini güncelle ──
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const lineLen = this.minimapExpanded ? 0.01 : 0.003;
    const endLon = pos.longitude + Math.sin(headingRad) * lineLen;
    const endLat = pos.latitude + Math.cos(headingRad) * lineLen;
    this.minimapHeadingEntity.polyline.positions = Cesium.Cartesian3.fromDegreesArray([
      pos.longitude, pos.latitude,
      endLon, endLat,
    ]);

    // ── İz çizgisi (trail) - her 500ms bir nokta ekle ──
    if (now - this.lastTrailTime > 500) {
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
    if (!this.minimapExpanded) {
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

    // Render iste
    this.minimapViewer.scene.requestRender();
  }
}

// ── Başlat ──
window.addEventListener('DOMContentLoaded', () => {
  window.sim = new DroneSimulator();
});
