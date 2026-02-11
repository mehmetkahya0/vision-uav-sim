/**
 * ═══════════════════════════════════════════════════════════════════
 * DRONE KAMERA SİSTEMİ
 * Takip + Cockpit + 360° Orbit Kamerası
 * ═══════════════════════════════════════════════════════════════════
 *
 * Üç kamera modu:
 * 1. Follow (Takip):  İHA'nın arkasından ve yukarısından izler
 * 2. Cockpit:         İHA'nın içinden bakar (FPV)
 * 3. Orbit (360°):    Mouse ile drone etrafında serbest dönüş
 *    - Sol tuş sürükle: Yörünge döndürme
 *    - Scroll:          Zoom (yakın/uzak)
 */
import * as Cesium from 'cesium';

export class DroneCamera {
  constructor(mainViewer, physics) {
    this.mainViewer = mainViewer;
    this.physics = physics;

    // ── Takip Kamerası Ayarları ──
    this.followDistance = 45;
    this.followHeight = 18;
    this.followSmoothing = 1.2;  // Düşürüldü: titreme önleme
    this.rollInfluence = 0.06;    // Düşürüldü: roll titremesini azalt

    // Mevcut kamera pozisyonu (yumuşatılmış)
    this.currentCamPosition = null;
    this.currentCamHeading = 0;
    this.currentCamRoll = 0;

    // ── Orbit (360°) Kamerası Ayarları ──
    this.orbitYaw = 0;            // Yatay açı (derece, 0=arka)
    this.orbitPitch = -20;        // Dikey açı (derece, - = aşağıdan)
    this.orbitDistance = 60;      // Drone'a uzaklık (metre)
    this.orbitMinDist = 15;       // Minimum zoom
    this.orbitMaxDist = 300;      // Maksimum zoom
    this.orbitSmoothing = 5.0;    // Yumuşatma
    this.orbitSensitivity = 0.3;  // Mouse hassasiyeti

    // Orbit smoothing düşürüldü: daha yumuşak kamera
    this.orbitSmoothing = 2.5;    // 5.0'dan düşürüldü
    
    // Orbit state
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.currentOrbitPosition = null;

    // Kamera modu
    this.mode = 'follow'; // 'follow' | 'cockpit' | 'orbit'

    // Mouse dinleyicilerini kur
    this._setupMouseListeners();
  }

  /**
   * Mouse Dinleyicileri (Orbit kamera için)
   * Cesium'un ScreenSpaceEventHandler'ını kullanır.
   * DOM eventleri Cesium tarafından yutulduğu için
   * Cesium'un kendi olay sistemi zorunludur.
   */
  _setupMouseListeners() {
    const canvas = this.mainViewer.canvas;
    const handler = new Cesium.ScreenSpaceEventHandler(canvas);

    // Sol tuş basılı → sürükleme başla
    handler.setInputAction((click) => {
      if (this.mode !== 'orbit') return;
      this.isDragging = true;
      this.lastMouseX = click.position.x;
      this.lastMouseY = click.position.y;
      canvas.style.cursor = 'grabbing';
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    // Mouse hareket → orbit döndürme
    handler.setInputAction((movement) => {
      if (!this.isDragging || this.mode !== 'orbit') return;

      const dx = movement.endPosition.x - this.lastMouseX;
      const dy = movement.endPosition.y - this.lastMouseY;
      this.lastMouseX = movement.endPosition.x;
      this.lastMouseY = movement.endPosition.y;

      // Yaw (yatay dönüş) ve Pitch (dikey dönüş)
      // Faster rotation for better responsiveness
      this.orbitYaw += dx * (this.orbitSensitivity * 1.2);
      this.orbitPitch -= dy * (this.orbitSensitivity * 1.2);

      // Pitch sınırlama (-80° ile +60° arası)
      this.orbitPitch = Cesium.Math.clamp(this.orbitPitch, -80, 60);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Tuş bırakıldı → sürükleme bitir
    handler.setInputAction(() => {
      this.isDragging = false;
      if (this.mode === 'orbit') {
        canvas.style.cursor = 'grab';
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Mouse tekerleği → zoom (yakınlaş/uzaklaş)
    handler.setInputAction((delta) => {
      if (this.mode !== 'orbit') return;
      const zoomSpeed = this.orbitDistance * 0.08;
      // delta > 0 → uzaklaş, delta < 0 → yakınlaş
      this.orbitDistance += delta > 0 ? zoomSpeed : -zoomSpeed;
      this.orbitDistance = Cesium.Math.clamp(
        this.orbitDistance,
        this.orbitMinDist,
        this.orbitMaxDist
      );
    }, Cesium.ScreenSpaceEventType.WHEEL);

    // Saklayalım (cleanup için)
    this._handler = handler;
  }

  setMode(mode) {
    this.mode = mode;
    this.currentCamPosition = null;
    this.currentOrbitPosition = null;

    const canvas = this.mainViewer.canvas;

    if (mode === 'orbit') {
      // Orbit moduna geçerken mevcut bakışı başlangıç açısı yap
      this.orbitYaw = 180; // Arkasından başla
      this.orbitPitch = -20;
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
      this.isDragging = false;
    }
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
    } else if (this.mode === 'orbit') {
      this.updateOrbitCamera(dt, pos, droneCartesian);
    } else {
      this.updateFollowCamera(dt, pos, droneCartesian);
    }
  }

  /**
   * Takip Kamerası
   */
  updateFollowCamera(dt, pos, droneCartesian) {
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const rollRad = Cesium.Math.toRadians(this.physics.roll);

    const offsetX = -Math.sin(headingRad) * this.followDistance;
    const offsetY = -Math.cos(headingRad) * this.followDistance;

    const lateralOffset = Math.sin(rollRad) * this.followDistance * 0.15;
    const lateralX = Math.cos(headingRad) * lateralOffset;
    const lateralY = -Math.sin(headingRad) * lateralOffset;

    const metersPerDegreeLon = 111320 * Math.cos(Cesium.Math.toRadians(pos.latitude));
    const metersPerDegreeLat = 111320;

    const targetLon = pos.longitude + (offsetX + lateralX) / metersPerDegreeLon;
    const targetLat = pos.latitude + (offsetY + lateralY) / metersPerDegreeLat;

    const pitchHeightBonus = Math.max(0, -this.physics.pitch * 0.3);
    const targetHeight = pos.height + this.followHeight + pitchHeightBonus;

    const targetCartesian = Cesium.Cartesian3.fromDegrees(
      targetLon,
      targetLat,
      targetHeight
    );

    if (!this.currentCamPosition) {
      this.currentCamPosition = targetCartesian.clone();
      this.currentCamHeading = this.physics.heading;
    } else {
      // Düşük lerp faktör: titreme önleme, smooth kamera hareketi
      const lerpFactor = Math.min(1, this.followSmoothing * dt);
      Cesium.Cartesian3.lerp(
        this.currentCamPosition,
        targetCartesian,
        lerpFactor,
        this.currentCamPosition
      );

      let headingDiff = this.physics.heading - this.currentCamHeading;
      if (headingDiff > 180) headingDiff -= 360;
      if (headingDiff < -180) headingDiff += 360;
      this.currentCamHeading += headingDiff * lerpFactor;
      this.currentCamHeading = ((this.currentCamHeading % 360) + 360) % 360;

      this.currentCamRoll += (this.physics.roll * this.rollInfluence - this.currentCamRoll) * lerpFactor;
    }

    const lookDownAngle = -18 + Math.min(0, this.physics.pitch * 0.2);

    this.mainViewer.camera.setView({
      destination: this.currentCamPosition,
      orientation: {
        heading: Cesium.Math.toRadians(this.currentCamHeading),
        pitch: Cesium.Math.toRadians(lookDownAngle),
        roll: Cesium.Math.toRadians(this.currentCamRoll),
      },
      duration: 0,
      easingFunction: undefined,
    });
  }

  /**
   * Cockpit Kamerası
   */
  updateCockpitCamera(dt, pos, droneCartesian) {
    const headingRad = Cesium.Math.toRadians(this.physics.heading);
    const pitchRad = Cesium.Math.toRadians(this.physics.pitch - 5);
    const rollRad = Cesium.Math.toRadians(this.physics.roll);

    this.mainViewer.camera.setView({
      destination: droneCartesian,
      orientation: {
        heading: headingRad,
        pitch: pitchRad,
        roll: rollRad,
      },
      duration: 0,
      easingFunction: undefined,
    });
  }

  /**
   * 360° Orbit Kamerası
   * Mouse ile drone etrafında serbest dönüş.
   *
   * Kamera, drone'un konumunu merkez alır ve
   * küresel koordinatlarda (yaw, pitch, distance) hareket eder.
   * Drone heading'ine göre ofsetlenir → İHA dönünce kamera da
   * bakış açısını korur.
   */
  updateOrbitCamera(dt, pos, droneCartesian) {
    // Orbit açıları (drone heading'ine göre ofsetli)
    const totalYaw = this.physics.heading + this.orbitYaw;
    const yawRad = Cesium.Math.toRadians(totalYaw);
    const pitchRad = Cesium.Math.toRadians(this.orbitPitch);

    // Küresel koordinattan kartezyen ofset hesapla
    const cosPitch = Math.cos(pitchRad);
    const offsetX = this.orbitDistance * cosPitch * Math.sin(yawRad);
    const offsetY = this.orbitDistance * cosPitch * Math.cos(yawRad);
    const offsetZ = this.orbitDistance * Math.sin(-pitchRad);

    const metersPerDegreeLon = 111320 * Math.cos(Cesium.Math.toRadians(pos.latitude));
    const metersPerDegreeLat = 111320;

    const camLon = pos.longitude + offsetX / metersPerDegreeLon;
    const camLat = pos.latitude + offsetY / metersPerDegreeLat;
    const camHeight = Math.max(5, pos.height + offsetZ);

    const targetCartesian = Cesium.Cartesian3.fromDegrees(camLon, camLat, camHeight);

    // Yumuşak geçiş: titreme önleme
    if (!this.currentOrbitPosition) {
      this.currentOrbitPosition = targetCartesian.clone();
    } else {
      const lerpFactor = Math.min(1, this.orbitSmoothing * dt);
      Cesium.Cartesian3.lerp(
        this.currentOrbitPosition,
        targetCartesian,
        lerpFactor,
        this.currentOrbitPosition
      );
    }

    // Kamerayı drone'a bakacak yönde ayarla
    // ENU (East-North-Up) frame'inde bakış vektörü hesapla
    const camToTarget = new Cesium.Cartesian3();
    Cesium.Cartesian3.subtract(droneCartesian, this.currentOrbitPosition, camToTarget);

    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(this.currentOrbitPosition);
    const inverseTransform = Cesium.Matrix4.inverse(transform, new Cesium.Matrix4());
    const localDir = Cesium.Matrix4.multiplyByPointAsVector(
      inverseTransform, camToTarget, new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(localDir, localDir);

    const lookHeading = Math.atan2(localDir.x, localDir.y);
    const lookPitch = Math.asin(
      Cesium.Math.clamp(localDir.z / Cesium.Cartesian3.magnitude(localDir), -1, 1)
    );

    this.mainViewer.camera.setView({
      destination: this.currentOrbitPosition,
      orientation: {
        heading: lookHeading,
        pitch: lookPitch,
        roll: 0,
      },
      duration: 0,
      easingFunction: undefined,
    });
  }
}
