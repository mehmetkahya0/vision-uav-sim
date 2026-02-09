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

    // Klavye Kontrolleri
    this.controls = new DroneControls(this.physics);

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
    const minimapCanvas = document.getElementById('minimapCanvas');
    if (!minimapCanvas) return;

    this.minimapCtx = minimapCanvas.getContext('2d');
    this.minimapCanvas = minimapCanvas;

    minimapCanvas.width = 180;
    minimapCanvas.height = 140;
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
    if (this.frameCount % 3 === 0) {
      this.captureDroneCam(cesiumTime);
    }

    // ── RENDER PASS 2: Ana Takip Kamerası ──
    this.droneCamera.update(this.clock.deltaTime);
    this.viewer.scene.initializeFrame();
    this.viewer.scene.render(cesiumTime);

    requestAnimationFrame(() => this.animate());
  }

  updateMinimap() {
    if (!this.minimapCtx) return;

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const pos = this.physics.getPosition();
    const fd = this.physics.getFlightData();

    // Arka plan
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, w, h);

    // Izgara
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let i = 0; i < h; i += 20) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }

    const cx = w / 2;
    const cy = h / 2;

    // ── Bank açısı göstergesi (ufuk çizgisi) ──
    const rollRad = (this.physics.roll * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rollRad);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(40, 0);
    ctx.stroke();
    ctx.restore();

    // ── Yön göstergesi (üçgen) ──
    const headingRad = (this.physics.heading * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(headingRad);

    // Yön çizgisi
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -22);
    ctx.stroke();

    // Drone ikonu (üçgen)
    ctx.fillStyle = fd.isStalling ? '#ff3344' : '#00d4ff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Dış halka
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();

    // Koordinat ve durum
    ctx.fillStyle = 'rgba(0, 212, 255, 0.6)';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${pos.latitude.toFixed(4)}°N`, 4, 12);
    ctx.fillText(`${pos.longitude.toFixed(4)}°E`, 4, 24);
    ctx.fillText(`${pos.height.toFixed(0)}m`, 4, 36);

    // G-Force göstergesi
    ctx.fillStyle = fd.gForce > 2.0 ? '#ffaa00' : 'rgba(0, 255, 136, 0.5)';
    ctx.fillText(`${fd.gForce.toFixed(1)}G`, 4, h - 8);

    // Pusula
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px Consolas';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 12);
    ctx.fillText('S', cx, h - 4);
    ctx.textAlign = 'left';
    ctx.fillText('W', 4, h / 2 + 4);
    ctx.textAlign = 'right';
    ctx.fillText('E', w - 4, h / 2 + 4);
  }
}

// ── Başlat ──
window.addEventListener('DOMContentLoaded', () => {
  window.sim = new DroneSimulator();
});
