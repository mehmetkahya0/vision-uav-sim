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

    // ═══ FREN PARAŞÜTÜ GÖRSELİ (DRAG CHUTE) ═══
    // Canvas ile çizilmiş paraşüt billboard + halat çizgileri
    this._chuteCanvasImage = this._createChuteCanvasImage();

    // Ana kubbe (billboard - her açıdan görünür)
    this.dragChuteEntity = this.mainViewer.entities.add({
      name: 'Drag Chute Canopy',
      position: startPos,
      show: false,
      billboard: {
        image: this._chuteCanvasImage,
        width: 22,
        height: 16,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(50, 1.6, 3000, 0.3),
      },
    });

    // Halat çizgileri (4 adet - kuyruktan kubbeye)
    this.dragChuteRopes = [];
    for (let i = 0; i < 4; i++) {
      const rope = this.mainViewer.entities.add({
        name: `Chute Rope ${i}`,
        show: false,
        polyline: {
          positions: [startPos, startPos],
          width: 1.5,
          material: new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString('#aa7744').withAlpha(0.85)
          ),
        },
      });
      this.dragChuteRopes.push(rope);
    }

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

    // ═══ FREN PARAŞÜTÜ GÖRSELİ GÜNCELLEMESİ ═══
    const fd = physics.getFlightData();
    if (fd.dragChuteDeployed && fd.dragChuteProgress > 0) {
      this.dragChuteEntity.show = true;

      const chuteScale = fd.dragChuteProgress; // 0→1 açılma
      const chuteDistance = 14 + fd.airspeed * 0.35; // 14-35m

      // Kubbe merkezi: kuyruktan geride
      const chuteOffsetE = -chuteDistance * Math.sin(headingRad);
      const chuteOffsetN = -chuteDistance * Math.cos(headingRad);
      const chutePos = Cesium.Cartesian3.fromDegrees(
        smoothLon + chuteOffsetE / metersPerDegreeLon,
        smoothLat + chuteOffsetN / 111320,
        smoothHeight + 1.5
      );
      this.dragChuteEntity.position = chutePos;

      // Billboard boyut animasyonu
      const bw = 22 * chuteScale;
      const bh = 16 * chuteScale;
      this.dragChuteEntity.billboard.width = bw;
      this.dragChuteEntity.billboard.height = bh;

      // 4 halat: kuyruktan kubbenin kenarlarına
      const ropeAngleOffsets = [-0.35, -0.12, 0.12, 0.35]; // radyan sapma
      const ropeSpread = 4.0 * chuteScale; // halat yayılma
      for (let i = 0; i < 4; i++) {
        this.dragChuteRopes[i].show = true;
        const angOff = ropeAngleOffsets[i];
        const rOffE = -chuteDistance * 0.92 * Math.sin(headingRad + angOff);
        const rOffN = -chuteDistance * 0.92 * Math.cos(headingRad + angOff);
        const ropeEnd = Cesium.Cartesian3.fromDegrees(
          smoothLon + rOffE / metersPerDegreeLon,
          smoothLat + rOffN / 111320,
          smoothHeight + 0.2
        );
        this.dragChuteRopes[i].polyline.positions = [tailPos, ropeEnd];
      }
    } else {
      this.dragChuteEntity.show = false;
      for (let i = 0; i < 4; i++) {
        this.dragChuteRopes[i].show = false;
      }
    }
  }

  /**
   * Canvas ile paraşüt görseli oluştur (billboard image)
   * Yarı-kubbe + şerit deseni
   */
  _createChuteCanvasImage() {
    const w = 128, h = 96;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Arka plan şeffaf
    ctx.clearRect(0, 0, w, h);

    // Kubbe (yarı-elips)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.7, w * 0.46, h * 0.62, 0, Math.PI, 0);
    ctx.closePath();
    ctx.clip();

    // Şerit deseni (turuncu-beyaz)
    const stripes = 8;
    const stripeW = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ff5500' : '#ffffff';
      ctx.fillRect(i * stripeW, 0, stripeW, h);
    }
    ctx.restore();

    // Kubbe kenar çizgisi
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.7, w * 0.46, h * 0.62, 0, Math.PI, 0);
    ctx.strokeStyle = '#cc3300';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Alt kenar (kubbe ağzı)
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.7);
    ctx.lineTo(w * 0.96, h * 0.7);
    ctx.strokeStyle = '#993300';
    ctx.lineWidth = 2;
    ctx.stroke();

    // İpler (kubbe altından orta-aşağıya)
    ctx.strokeStyle = '#aa7744';
    ctx.lineWidth = 1;
    const ropesN = 5;
    for (let i = 0; i < ropesN; i++) {
      const rx = w * 0.12 + (w * 0.76) * (i / (ropesN - 1));
      ctx.beginPath();
      ctx.moveTo(rx, h * 0.7);
      ctx.lineTo(w / 2, h * 0.95);
      ctx.stroke();
    }

    return canvas;
  }
}
