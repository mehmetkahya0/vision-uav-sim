/**
 * ═══════════════════════════════════════════════════════════════════
 * İHA (UAV) 3D MODEL SİSTEMİ
 * MQ-1 Predator GLB modeli + Navigasyon Işıkları
 * ═══════════════════════════════════════════════════════════════════
 */
import * as Cesium from 'cesium';

const MODEL_URL = '/models/mq_1_predator_uav.glb';

export class DroneModel {
  constructor(mainViewer) {
    this.mainViewer = mainViewer;
    this.entity = null;
    
    // Smoothing için interpolasyon state
    this.currentPosition = null;
    this.currentOrientation = null;
    this.smoothingFactor = 12; // Titreme önleme için yumuşatma faktörü
  }

  async init() {
    // Başlangıç pozisyonu
    const startPos = Cesium.Cartesian3.fromDegrees(28.9744, 41.0256, 500);
    const startHPR = new Cesium.HeadingPitchRoll(0, 0, 0);
    const startOrientation = Cesium.Transforms.headingPitchRollQuaternion(
      startPos,
      startHPR
    );

    // Ana Entity oluştur
    this.entity = this.mainViewer.entities.add({
      name: 'İHA',
      position: startPos,
      orientation: startOrientation,
      model: {
        uri: MODEL_URL,
        scale: 8.0,
        minimumPixelSize: 0,
        maximumScale: 800,
        color: Cesium.Color.WHITE,
      },
    });

    // Sol kanat navigasyon ışığı (kırmızı)
    this.navLightLeft = this.mainViewer.entities.add({
      name: 'Nav Light Sol',
      position: startPos,
      point: {
        pixelSize: 5,
        color: Cesium.Color.RED.withAlpha(0.9),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Sağ kanat navigasyon ışığı (yeşil)
    this.navLightRight = this.mainViewer.entities.add({
      name: 'Nav Light Sağ',
      position: startPos,
      point: {
        pixelSize: 5,
        color: Cesium.Color.GREEN.withAlpha(0.9),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Kuyruk strobe ışığı (beyaz, yanıp söner)
    this.strobLight = this.mainViewer.entities.add({
      name: 'Strobe',
      position: startPos,
      point: {
        pixelSize: 4,
        color: Cesium.Color.WHITE.withAlpha(0.9),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    console.log('✈️ İHA modeli yüklendi');
  }

  update(physics, dt = 0.016) {
    if (!this.entity) return;

    const pos = physics.getPosition();
    const targetCartesian = Cesium.Cartesian3.fromDegrees(
      pos.longitude,
      pos.latitude,
      pos.height
    );

    // Physics'den yönelim al
    const physicsHPR = physics.getHeadingPitchRoll();

    // Model file oryantasyon offset'i (glTF → Cesium dönüşümü)
    const modelOffset = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(270),  // Heading offset
      Cesium.Math.toRadians(0),    // Pitch offset
      Cesium.Math.toRadians(0)     // Roll offset
    );

    // Combined HPR
    const finalHPR = new Cesium.HeadingPitchRoll(
      physicsHPR.heading + modelOffset.heading,
      physicsHPR.pitch + modelOffset.pitch,
      physicsHPR.roll + modelOffset.roll
    );

    const targetOrientation = Cesium.Transforms.headingPitchRollQuaternion(
      targetCartesian,
      finalHPR
    );

    // ═══ TİTREME ÖNLEME: Pozisyon ve Oryantasyon Yumuşatma ═══
    const lerpFactor = Math.min(1.0, this.smoothingFactor * dt);
    
    // İlk frame veya reset durumu
    if (!this.currentPosition) {
      this.currentPosition = targetCartesian.clone();
      this.currentOrientation = targetOrientation.clone();
    } else {
      // Pozisyon interpolasyonu (LERP)
      Cesium.Cartesian3.lerp(
        this.currentPosition,
        targetCartesian,
        lerpFactor,
        this.currentPosition
      );
      
      // Oryantasyon interpolasyonu (SLERP - küresel interpolasyon)
      Cesium.Quaternion.slerp(
        this.currentOrientation,
        targetOrientation,
        lerpFactor,
        this.currentOrientation
      );
    }

    // Ana model pozisyon/yön güncelle (yumuşatılmış değerlerle)
    this.entity.position = this.currentPosition;
    this.entity.orientation = this.currentOrientation;

    // ── Navigasyon Işıkları (yumuşatılmış pozisyondan) ──
    // Smooth pozisyondan kartografik koordinat al
    const smoothCarto = Cesium.Cartographic.fromCartesian(this.currentPosition);
    const smoothLon = Cesium.Math.toDegrees(smoothCarto.longitude);
    const smoothLat = Cesium.Math.toDegrees(smoothCarto.latitude);
    const smoothHeight = smoothCarto.height;
    
    const headingRad = Cesium.Math.toRadians(physics.heading);
    const wingSpan = 6.0;

    const metersPerDegreeLon = 111320 * Math.cos(smoothCarto.latitude);
    const leftWingOffsetE = -wingSpan * Math.cos(headingRad);
    const leftWingOffsetN = wingSpan * Math.sin(headingRad);

    const leftPos = Cesium.Cartesian3.fromDegrees(
      smoothLon + leftWingOffsetE / metersPerDegreeLon,
      smoothLat + leftWingOffsetN / 111320,
      smoothHeight + 0.1
    );

    const rightPos = Cesium.Cartesian3.fromDegrees(
      smoothLon - leftWingOffsetE / metersPerDegreeLon,
      smoothLat - leftWingOffsetN / 111320,
      smoothHeight + 0.1
    );

    this.navLightLeft.position = leftPos;
    this.navLightRight.position = rightPos;

    // Strobe (kuyrukta, yanıp söner)
    const strobeOn = Math.floor(performance.now() / 500) % 3 === 0;
    const tailOffsetE = -3.5 * Math.sin(headingRad);
    const tailOffsetN = -3.5 * Math.cos(headingRad);
    const tailPos = Cesium.Cartesian3.fromDegrees(
      smoothLon + tailOffsetE / metersPerDegreeLon,
      smoothLat + tailOffsetN / 111320,
      smoothHeight + 0.9
    );
    this.strobLight.position = tailPos;
    this.strobLight.point.color = strobeOn
      ? Cesium.Color.WHITE.withAlpha(0.95)
      : Cesium.Color.WHITE.withAlpha(0.1);
  }
}
