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
        silhouetteColor: Cesium.Color.fromCssColorString('#00d4ff'),
        silhouetteSize: 2.0,
        colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
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

  update(physics) {
    if (!this.entity) return;

    const pos = physics.getPosition();
    const cartesian = Cesium.Cartesian3.fromDegrees(
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

    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      cartesian,
      finalHPR
    );

    // Ana model pozisyon/yön güncelle
    this.entity.position = cartesian;
    this.entity.orientation = orientation;

    // ── Navigasyon Işıkları ──
    const headingRad = Cesium.Math.toRadians(physics.heading);
    const wingSpan = 6.0;

    const metersPerDegreeLon = 111320 * Math.cos(Cesium.Math.toRadians(pos.latitude));
    const leftWingOffsetE = -wingSpan * Math.cos(headingRad);
    const leftWingOffsetN = wingSpan * Math.sin(headingRad);

    const leftPos = Cesium.Cartesian3.fromDegrees(
      pos.longitude + leftWingOffsetE / metersPerDegreeLon,
      pos.latitude + leftWingOffsetN / 111320,
      pos.height + 0.1
    );

    const rightPos = Cesium.Cartesian3.fromDegrees(
      pos.longitude - leftWingOffsetE / metersPerDegreeLon,
      pos.latitude - leftWingOffsetN / 111320,
      pos.height + 0.1
    );

    this.navLightLeft.position = leftPos;
    this.navLightRight.position = rightPos;

    // Strobe (kuyrukta, yanıp söner)
    const strobeOn = Math.floor(performance.now() / 500) % 3 === 0;
    const tailOffsetE = -3.5 * Math.sin(headingRad);
    const tailOffsetN = -3.5 * Math.cos(headingRad);
    const tailPos = Cesium.Cartesian3.fromDegrees(
      pos.longitude + tailOffsetE / metersPerDegreeLon,
      pos.latitude + tailOffsetN / 111320,
      pos.height + 0.9
    );
    this.strobLight.position = tailPos;
    this.strobLight.point.color = strobeOn
      ? Cesium.Color.WHITE.withAlpha(0.95)
      : Cesium.Color.WHITE.withAlpha(0.1);
  }
}
