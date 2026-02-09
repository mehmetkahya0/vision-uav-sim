/**
 * ═══════════════════════════════════════════════════════════════════
 * DRONE KAMERA SİSTEMİ
 * Takip Kamerası + Cockpit Kamerası
 * ═══════════════════════════════════════════════════════════════════
 *
 * İki kamera modu:
 * 1. Follow (Takip): İHA'nın arkasından ve yukarısından izler
 *    - Roll ile hafif eğilme efekti
 *    - Yumuşak geçişler (lerp)
 * 2. Cockpit: İHA'nın içinden bakar
 *    - Tam heading/pitch/roll izleme
 */
import * as Cesium from 'cesium';

export class DroneCamera {
  constructor(mainViewer, physics) {
    this.mainViewer = mainViewer;
    this.physics = physics;

    // ── Takip Kamerası Ayarları ──
    this.followDistance = 45;      // metre arkada
    this.followHeight = 18;        // metre yukarıda
    this.followSmoothing = 2.8;    // Yumuşatma faktörü (düşük = daha yavaş)
    this.rollInfluence = 0.15;     // Kameranın roll'dan etkilenme oranı

    // Mevcut kamera pozisyonu (yumuşatılmış)
    this.currentCamPosition = null;
    this.currentCamHeading = 0;
    this.currentCamRoll = 0;

    // Kamera modu: 'follow' veya 'cockpit'
    this.mode = 'follow';
  }

  setMode(mode) {
    this.mode = mode;
    this.currentCamPosition = null; // Pozisyonu sıfırla
  }

  update(dt) {
    const pos = this.physics.getPosition();
    const droneCartesian = Cesium.Cartesian3.fromDegrees(
      pos.longitude,
      pos.latitude,
      pos.height
    );

    if (this.mode === 'cockpit') {
      this.updateCockpitCamera(dt, pos, droneCartesian);
    } else {
      this.updateFollowCamera(dt, pos, droneCartesian);
    }
  }

  /**
   * Takip Kamerası
   * İHA'nın arkasından ve yukarısından izler.
   * Heading'e göre kamera pozisyonunu hesaplar.
   * Roll açısından hafif etkilenir (sinematik efekt).
   */
  updateFollowCamera(dt, pos, droneCartesian) {
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const rollRad = Cesium.Math.toRadians(this.physics.roll);

    // ── Kameranın olması gereken pozisyon ──
    // İHA'nın heading'inin tam tersi yönünde, arkada ve yukarıda
    const offsetX = -Math.sin(headingRad) * this.followDistance;
    const offsetY = -Math.cos(headingRad) * this.followDistance;

    // Roll'un lateral etkisi (kamera hafifçe kayar)
    const lateralOffset = Math.sin(rollRad) * this.followDistance * 0.15;
    const lateralX = Math.cos(headingRad) * lateralOffset;
    const lateralY = -Math.sin(headingRad) * lateralOffset;

    const metersPerDegreeLon = 111320 * Math.cos(Cesium.Math.toRadians(pos.latitude));
    const metersPerDegreeLat = 111320;

    const targetLon = pos.longitude + (offsetX + lateralX) / metersPerDegreeLon;
    const targetLat = pos.latitude + (offsetY + lateralY) / metersPerDegreeLat;

    // Pitch'e göre yükseklik ayarı (dalış yapınca kamera daha yukarıda kalır)
    const pitchHeightBonus = Math.max(0, -this.physics.pitch * 0.3);
    const targetHeight = pos.height + this.followHeight + pitchHeightBonus;

    const targetCartesian = Cesium.Cartesian3.fromDegrees(
      targetLon,
      targetLat,
      targetHeight
    );

    // ── Yumuşak Geçiş (Lerp) ──
    if (!this.currentCamPosition) {
      this.currentCamPosition = targetCartesian.clone();
      this.currentCamHeading = this.physics.heading;
    } else {
      const lerpFactor = Math.min(1, this.followSmoothing * dt);
      Cesium.Cartesian3.lerp(
        this.currentCamPosition,
        targetCartesian,
        lerpFactor,
        this.currentCamPosition
      );

      // Heading yumuşatma
      let headingDiff = this.physics.heading - this.currentCamHeading;
      if (headingDiff > 180) headingDiff -= 360;
      if (headingDiff < -180) headingDiff += 360;
      this.currentCamHeading += headingDiff * lerpFactor;
      this.currentCamHeading = ((this.currentCamHeading % 360) + 360) % 360;

      // Roll yumuşatma (kameranın hafif eğilmesi)
      this.currentCamRoll += (this.physics.roll * this.rollInfluence - this.currentCamRoll) * lerpFactor;
    }

    // Kamerayı İHA'nın heading yönüne, hafif aşağıya bakacak şekilde ayarla
    const lookDownAngle = -18 + Math.min(0, this.physics.pitch * 0.2);

    this.mainViewer.camera.setView({
      destination: this.currentCamPosition,
      orientation: {
        heading: Cesium.Math.toRadians(this.currentCamHeading),
        pitch: Cesium.Math.toRadians(lookDownAngle),
        roll: Cesium.Math.toRadians(this.currentCamRoll),
      },
    });
  }

  /**
   * Cockpit Kamerası
   * İHA'nın gövdesinden ileri doğru bakar.
   * Heading, Pitch, Roll ile birlikte döner.
   */
  updateCockpitCamera(dt, pos, droneCartesian) {
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const pitchRad = Cesium.Math.toRadians(this.physics.pitch - 5); // Hafif aşağı bak
    const rollRad = Cesium.Math.toRadians(this.physics.roll);

    this.mainViewer.camera.setView({
      destination: droneCartesian,
      orientation: {
        heading: headingRad,
        pitch: pitchRad,
        roll: rollRad,
      },
    });
  }
}
