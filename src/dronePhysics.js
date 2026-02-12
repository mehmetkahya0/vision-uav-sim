/**
 * ═══════════════════════════════════════════════════════════════════
 * YÜKSEK SADAKATLİ SABİT KANATLI İHA UÇUŞ DİNAMİĞİ MOTORU
 * High-Fidelity Fixed-Wing UAV Flight Dynamics Engine
 * ═══════════════════════════════════════════════════════════════════
 *
 * Gerçek havacılık mekaniklerini simüle eder:
 * - Taşıma Kuvveti (Lift):  L = ½ρv²SC_L
 * - Sürüklenme (Drag):      D = ½ρv²SC_D
 * - İtki (Thrust):          Motor/pervane modeli
 * - Stall Mekaniği:         Kritik AoA üzerinde lift kaybı
 * - Koordineli Dönüş:       Banking → yatay lift bileşeni
 * - Atalet (Inertia):       Açısal hız sönümlemesi
 * - G-Kuvveti:              Sert manevralarda hız kaybı
 *
 * Referans platform: MQ-1 Predator benzeri İHA
 */
import * as Cesium from 'cesium';

export class DronePhysics {
  constructor({ startLongitude, startLatitude, startHeight }) {
    // ═════════════════════════════════════════
    // POZİSYON (Coğrafi koordinatlar)
    // ═════════════════════════════════════════
    this.longitude = startLongitude;
    this.latitude = startLatitude;
    this.height = startHeight;

    // ═════════════════════════════════════════
    // ORYANTASYON (Euler Açıları - derece)
    // ═════════════════════════════════════════
    this.heading = 0;   // Yaw:   0°=Kuzey, 90°=Doğu, 180°=Güney, 270°=Batı
    this.pitch = 3;     // Pitch: + burun yukarı, - burun aşağı
    this.roll = 0;      // Roll:  + sağ kanat aşağı, - sol kanat aşağı

    // ═════════════════════════════════════════
    // AÇISAL HIZLAR (Body-frame, derece/saniye)
    // Bu değerler ATALETİ sağlar - tuş bırakıldığında
    // anında sıfırlanmaz, sönümlenerek azalır
    // ═════════════════════════════════════════
    this.p = 0;   // Roll  açısal hızı (deg/s)
    this.q = 0;   // Pitch açısal hızı (deg/s)
    this.r = 0;   // Yaw   açısal hızı (deg/s)

    // ═════════════════════════════════════════
    // HAVAHIZI VE UÇUŞ YOLU
    // ═════════════════════════════════════════
    this.airspeed = 35;           // m/s (True Airspeed - başlangıçta cruise)
    this.flightPathAngle = 0;     // derece (gamma - uçuş yolu açısı)
    this.climbRate = 0;           // m/s (dikey hız)
    this.groundSpeed = 35;        // m/s (yer hızı)

    // ═════════════════════════════════════════
    // GAZ KONTROL (Throttle)
    // ═════════════════════════════════════════
    this.throttle = 65;           // % (0-100, başlangıçta cruise)

    // ═════════════════════════════════════════
    // KAMERA (FPV bakış açısı)
    // ═════════════════════════════════════════
    this.cameraPitch = -45;

    // ═════════════════════════════════════════
    // EASTER EGG: TURBO MODU
    // ═════════════════════════════════════════
    this.turboMode = false;  // Turbo aktifken 10000km/h'e kadar hız var

    // ═════════════════════════════════════════
    // AERODİNAMİK & FİZİK SABİTLERİ
    // MQ-1 Predator referanslı parametreler
    // ═════════════════════════════════════════
    this.config = {
      // ── Kütle ve Yapı ──
      mass: 1020,            // kg (maks kalkış ağırlığı)
      wingArea: 11.45,       // m² (kanat alanı S)
      wingspan: 14.8,        // m  (kanat açıklığı b)
      // Aspect Ratio: AR = b²/S = 14.8²/11.45 ≈ 19.1

      // ── Atmosfer Modeli ──
      rho0: 1.225,           // kg/m³ (deniz seviyesi standart hava yoğunluğu)
      scaleHeight: 8500,     // m (barometrik ölçek yüksekliği)
      gravity: 9.81,         // m/s² (yerçekimi ivmesi)

      // ── Lift (Taşıma Kuvveti) Katsayıları ──
      //    C_L = C_L0 + C_Lα · α
      //    L = ½ρv²SC_L
      CL0: 0.28,             // Sıfır AoA'da lift katsayısı
      CLalpha: 5.5,          // Lift eğimi (per radian) - dC_L/dα
      CLmax: 1.4,            // Maksimum lift katsayısı
      stallAoA: 16,          // Kritik hücum açısı (derece) - stall başlangıcı
      stallSharpness: 6,     // Stall geçiş keskinliği (exponent)
      deepStallRecoveryRate: 0.3, // Derin stall'dan kurtulma hızı

      // ── Drag (Sürüklenme) Katsayıları ──
      //    C_D = C_D0 + K · C_L²
      //    D = ½ρv²SC_D
      CD0: 0.028,            // Parasit sürüklenme (zero-lift drag)
      K: 0.020,              // İndüklenmiş sürüklenme faktörü
      // K = 1/(π · AR · e) = 1/(π · 19.1 · 0.83) ≈ 0.020

      // ── Thrust (İtki) Modeli ──
      maxThrust: 1100,       // N (motor + pervane maksimum itki)
      idleThrust: 30,        // N (rölanti itkisi)
      thrustLag: 2.5,        // Motor tepki gecikmesi (1/s)

      // ── Trim (Denge) Açısı ──
      trimAoA: 3,            // derece (dengeli düz uçuş AoA'sı)

      // ═══ KONTROL YÜZEYLERİ ═══
      // Açısal ivme üretim kapasitesi (deg/s² per unit input)
      // Bu değerler kontrol yüzeylerinin ne kadar moment
      // (tork) üretebildiğini belirler
      elevatorAuthority: 50,   // Elevator (pitch) etkinliği
      aileronAuthority: 90,    // Aileron (roll) etkinliği
      rudderAuthority: 30,     // Rudder (yaw) etkinliği

      // ═══ AERODİNAMİK SÖNÜMLEME (DAMPING) ═══
      // Açısal hızlara karşı direnci belirler
      // Yüksek = hızlı sönümleme, tuş bırakınca çabuk durur
      // Düşük  = uzun süre dönmeye devam eder (daha fazla atalet)
      // ARTIRILDI: Titreme önleme için daha agresif sönümleme
      pitchDamping: 4.8,       // 1/s (3.2'den artırıldı)
      rollDamping: 5.5,        // 1/s (3.8'den artırıldı)
      yawDamping: 4.2,         // 1/s (2.8'den artırıldı)

      // ═══ STABİLİTE (OTOMATİK DENGELEME) ═══
      // Girdi yokken ufka/trim açısına dönme eğilimi
      // ARTIRILDI: Daha smooth, daha stabil hareket
      rollStability: 1.4,      // Roll → 0° eğilimi (1/s) (0.6'dan artırıldı)
      pitchStability: 0.9,     // Pitch → trim eğilimi (1/s) (0.4'ten artırıldı)

      // ═══ LİMİTLER ═══
      maxPitch: 60,            // derece (yapısal limit)
      maxRoll: 80,             // derece (yapısal limit)
      minAirspeed: 22,         // m/s (stall hızı, Vs)
      maxAirspeed: 65,         // m/s (VNE - Never Exceed)
      minHeight: 2,            // m (minimum yer yüksekliği)
      maxHeight: 7600,         // m (servis tavanı)
      maxAngularRate: 120,     // deg/s (max açısal hız)

      // ═══ GAZ DEĞİŞİM HIZI ═══
      throttleRate: 28,        // %/s (gaz pedalı hassasiyeti)

      // ═══ YAKIT / BATARYA ═══
      throttleDrain: 0.05,     // %/s (100% gazda tüketim)

      // ═══ G-KUVVETİ ETKİSİ ═══
      gForceSpeedPenalty: 0.015, // G başına hız kaybı oranı (>1.5G)
      structuralGLimit: 4.5,     // Yapısal G limiti

      // ═══ YER FİZİĞİ (GROUND PHYSICS) ═══
      wheelHeight: 1.5,          // m (tekerlek yüksekliği - yer temas mesafesi)
      rollingResistance: 0.08,   // Yuvarlanma sürtünme katsayısı (μ_r)
      groundFriction: 0.4,       // Zemin sürtünme katsayısı (fren/kayma)
      taxiYawRate: 25,           // deg/s (yerdeyken maksimum dönüş hızı)
      brakeEfficiency: 0.7,      // Fren etkinliği (0-1)

      // ═══ KALKIŞ DİNAMİĞİ (TAKE-OFF) ═══
      vRotation: 15,             // m/s (kritik kalkış hızı - burun kaldıramaz altında)
      takeoffPitchRate: 8,       // deg/s (kalkışta maksimum burun kaldırma hızı)
      maxTakeoffAoA: 12,         // derece (kalkışta maksimum AoA - aşarsa sürat düşer)

      // ═══ İNİŞ VE ÇARPIŞMA (LANDING & CRASH) ═══
      maxLandingVerticalSpeed: -3, // m/s (güvenli iniş dikey hız limiti)
      maxLandingRoll: 5,         // derece (iniş anında maksimum kanat açısı)
      hardLandingThreshold: -5,  // m/s (sert iniş eşiği - hasar alır)
      touchdownDamping: 0.85,    // Yere temas anında dikey hız sönümleme

      // ═══ YER ETKİSİ (GROUND EFFECT) ═══
      groundEffectHeight: 14.8,  // m (kanat açıklığı - yer etkisi mesafesi)
      groundEffectMultiplier: 1.1, // Yer etkisinde lift artışı (%10)

      // ═══ FREN PARAŞÜTÜ (DRAG CHUTE) ═══
      dragChuteMultiplier: 3.0,    // Paraşüt açıkken CD %300 artış
      dragChuteDeploySpeed: 0.8,   // Paraşüt açılma hızı (0-1 arası, 1/s)
      dragChuteMinSpeed: 2.0,      // Paraşüt bu hızın altında otomatik kapanır (m/s)
      dragChuteMaxAltitude: 15,    // Paraşüt açılabilecek max AGL (m)
      dragChuteArea: 8.0,          // m² (paraşüt sürükleme alanı)

      // ═══ İNİŞ TAKIMLARI (LANDING GEAR) ═══
      gearDeployTime: 2.0,         // İniş takımı açılma süresi (saniye)
      noseGearMaxPitch: -8,        // Burun takımı kırılma pitch eşiği (derece)
    };

    // ═════════════════════════════════════════
    // KONTROL GİRDİLERİ (-1 → +1)
    // ═════════════════════════════════════════
    this.input = {
      pitch: 0,       // Elevator: + = burun yukarı
      roll: 0,        // Aileron:  + = sağa yatış
      yaw: 0,         // Rudder:   + = sağa sapma
      throttle: 0,    // Gaz değişim yönü
    };

    // ═════════════════════════════════════════
    // DURUM DEĞİŞKENLERİ
    // ═════════════════════════════════════════
    this.battery = 100;
    this.isOn = true;
    this.isStalling = false;
    this.stallIntensity = 0;      // 0-1 arası stall şiddeti
    this.gForce = 1.0;
    this.loadFactor = 1.0;
    this.angleOfAttack = 0;       // derece (AoA)
    this.currentThrust = 0;       // N (anlık itki)
    this.currentLift = 0;         // N (anlık taşıma)
    this.currentDrag = 0;         // N (anlık sürüklenme)

    // ═════════════════════════════════════════
    // RÜZGAR SİSTEMİ (WIND)
    // ═════════════════════════════════════════
    this.windVector = { x: 0, y: 0, speed: 0 }; // Rüzgar (body frame)
    this.trueAirspeed = 35;                     // TAS (airspeed + rüzgar etkisi) — FIX: 0 değil cruise hızı

    // ═════════════════════════════════════════
    // ÇARPIŞMA & KAZA SİSTEMİ (COLLISION)
    // ═════════════════════════════════════════
    this.isCrashed = false;
    this.crashTime = 0;           // Kaza zamanı
    this.terrainHeight = 0;       // Metin yüksekliği (metre)
    this.collisionMargin = 20;    // Minimum güvenli yükseklik (metre, zemin üstü)
    this.isCollisionWarning = false;

    // ═════════════════════════════════════════
    // YER TEMAS SİSTEMİ (GROUND CONTACT)
    // ═════════════════════════════════════════
    this.isGrounded = false;           // Yerde mi?
    this.heightAboveTerrain = startHeight; // Zemin üstü yükseklik (AGL)
    this.verticalSpeed = 0;            // Dikey hız (m/s) - iniş için
    this.groundContactTime = 0;        // Yer teması süresi
    this.isTaxiing = false;            // Yerde hareket halinde mi?
    this.landingGear = true;           // İniş takımları açık mı?
    this.gearDeployProgress = 1.0;     // 0=kapalı, 1=tam açık
    this.crashReason = '';             // Kaza nedeni

    // ═════════════════════════════════════════
    // FREN PARAŞÜTÜ (DRAG CHUTE)
    // ═════════════════════════════════════════
    this.dragChuteDeployed = false;    // Paraşüt açık mı?
    this.dragChuteProgress = 0;        // Açılma ilerlemesi (0-1)
    this.dragChuteRequested = false;   // Kullanıcı açmak istiyor mu?

    // ═════════════════════════════════════════
    // İSTATİSTİKLER
    // ═════════════════════════════════════════
    this.totalDistance = 0;
    this.maxAltitudeReached = startHeight;
    this.maxGReached = 1.0;
    this.maxSpeedReached = this.airspeed;
  }

  // ═══════════════════════════════════════════
  // KONTROL GİRDİSİNİ AYARLA
  // ═══════════════════════════════════════════
  setInput(pitchInput, rollInput, yawInput, throttleChange) {
    /**
     * Exponential Input Curve:
     * Merkeze yakın hassas kontrol, uçlara doğru agresif tepki.
     * Deadzone küçük girdilerdeki titreşimi filtreler.
     *
     * Eğri: f(x) = sign(x) · (0.3·|x| + 0.7·|x|³)
     */
    const inputCurve = (x) => {
      const deadzone = 0.04;
      if (Math.abs(x) < deadzone) return 0;
      const sign = x > 0 ? 1 : -1;
      const normalized = (Math.abs(x) - deadzone) / (1 - deadzone);
      return sign * (0.3 * normalized + 0.7 * normalized * normalized * normalized);
    };

    this.input.pitch = inputCurve(Cesium.Math.clamp(pitchInput, -1, 1));
    this.input.roll = inputCurve(Cesium.Math.clamp(rollInput, -1, 1));
    this.input.yaw = inputCurve(Cesium.Math.clamp(yawInput, -1, 1));
    this.input.throttle = Cesium.Math.clamp(throttleChange, -1, 1);
  }

  // ═══════════════════════════════════════════
  // RÜZGAR VEKTÖRÜNÜ AYARLA
  // ═══════════════════════════════════════════
  setWind(windVector) {
    /**
     * BUG-06 FIX: Rüzgar vektörünü ayarla
     * windVector = { x, y, speed }
     * x = world-frame East, y = world-frame North (weather.js'den)
     * 
     * Drone heading'e göre body-frame'e dönüştür:
     * forward = x·sin(heading) + y·cos(heading)
     * right   = x·cos(heading) - y·sin(heading)
     */
    if (windVector) {
      this.windVector = { ...windVector };
      // World-frame → Body-frame dönüşümü
      const headingRad = Cesium.Math.toRadians(this.heading);
      const windForward = windVector.x * Math.sin(headingRad) + windVector.y * Math.cos(headingRad);
      // True airspeed = ground speed - headwind component
      this.trueAirspeed = Math.max(0.1, this.airspeed - windForward);
    }
  }
  update(dt) {
    if (dt <= 0 || !this.isOn) return;
    dt = Math.min(dt, 0.05); // Maksimum 50ms adım (min 20 FPS)

    const cfg = this.config;
    const mass = cfg.mass;
    const g = cfg.gravity;

    // ────────────────────────────────────────────
    // ADIM 0: YER TEMAS TESPİTİ (GROUND CONTACT)
    // ────────────────────────────────────────────
    this.heightAboveTerrain = this.height - this.terrainHeight;
    const previousGrounded = this.isGrounded;
    this.isGrounded = this.heightAboveTerrain <= cfg.wheelHeight;
    
    // Dikey hız hesapla (iniş tespiti için)
    this.verticalSpeed = this.climbRate;
    
    // Yerde hareket (taxiing) tespiti
    this.isTaxiing = this.isGrounded && this.airspeed > 0.5;

    // ══════════════════════════════════════════
    // FREN PARAŞÜTÜ GÜNCELLEMESİ
    // ══════════════════════════════════════════
    if (this.dragChuteRequested && !this.dragChuteDeployed) {
      // Paraşüt açılma koşulları: yerde veya alçak irtifada
      if (this.isGrounded || this.heightAboveTerrain < cfg.dragChuteMaxAltitude) {
        this.dragChuteDeployed = true;
        console.log('🪂 Fren paraşütü AÇILDI!');
      }
    }
    // Paraşüt açılma/kapanma animasyonu
    if (this.dragChuteDeployed) {
      this.dragChuteProgress = Math.min(1, this.dragChuteProgress + cfg.dragChuteDeploySpeed * dt);
      // Hız çok düştüyse paraşütü otomatik kapat
      if (this.airspeed < cfg.dragChuteMinSpeed) {
        this.dragChuteDeployed = false;
        this.dragChuteRequested = false;
        this.dragChuteProgress = 0;
        console.log('🪂 Fren paraşütü KAPANDI (hız düştü)');
      }
    } else {
      this.dragChuteProgress = Math.max(0, this.dragChuteProgress - cfg.dragChuteDeploySpeed * 2 * dt);
    }

    // İniş takımı açılma/kapanma animasyonu
    if (this.landingGear) {
      this.gearDeployProgress = Math.min(1, this.gearDeployProgress + dt / cfg.gearDeployTime);
    } else {
      this.gearDeployProgress = Math.max(0, this.gearDeployProgress - dt / cfg.gearDeployTime);
    }

    // ══════════════════════════════════════════
    // İNİŞ ANI TESPİTİ VE CRASH KONTROLÜ
    // Havadan yere geçiş anında kontroller
    // ══════════════════════════════════════════
    if (this.isGrounded && !previousGrounded) {
      // Az önce yere temas ettik - iniş anı!
      this.groundContactTime = 0;

      // ── İniş Takımı Kontrolü ──
      // İniş takımları kapalıysa veya tam açılmamışsa = CRASH
      if (!this.landingGear || this.gearDeployProgress < 0.9) {
        this.crash(`İniş takımları ${!this.landingGear ? 'KAPALI' : 'tam açılmamış'}! Gövde üzerine iniş!`);
        return;
      }
      
      // ── Dikey Hız Kontrolü ──
      // Çok hızlı iniş = CRASH
      if (this.verticalSpeed < cfg.maxLandingVerticalSpeed) {
        const reason = this.verticalSpeed < cfg.hardLandingThreshold 
          ? `Sert çarpma! Dikey hız: ${this.verticalSpeed.toFixed(1)} m/s`
          : `Aşırı dikey hız: ${this.verticalSpeed.toFixed(1)} m/s (limit: ${cfg.maxLandingVerticalSpeed} m/s)`;
        this.crash(reason);
        return;
      }
      
      // ── Kanat Açısı (Roll) Kontrolü ──
      // Kanat ucu yere çarpması
      if (Math.abs(this.roll) > cfg.maxLandingRoll) {
        this.crash(`Kanat ucu yere çarptı! Roll açısı: ${this.roll.toFixed(1)}° (limit: ±${cfg.maxLandingRoll}°)`);
        return;
      }
      
      // ── Pitch Kontrolü (Burun/Kuyruk Çarpması) ──
      if (this.pitch < cfg.noseGearMaxPitch) {
        this.crash(`Burun üzerine sert çakıldı! Pitch: ${this.pitch.toFixed(1)}° (limit: ${cfg.noseGearMaxPitch}°)`);
        return;
      }
      if (this.pitch > 20 && this.airspeed < cfg.vRotation) {
        this.crash(`Kuyruk yere çarptı! Pitch: ${this.pitch.toFixed(1)}°`);
        return;
      }
      
      // Güvenli iniş - dikey hızı sönümle
      this.climbRate *= cfg.touchdownDamping;
      this.flightPathAngle *= 0.5;
      console.log(`✈️ Başarılı iniş! Dikey hız: ${this.verticalSpeed.toFixed(1)} m/s`);
    }

    // Yerdeyken süre sayacı
    if (this.isGrounded) {
      this.groundContactTime += dt;
    }

    // ────────────────────────────────────────────
    // ADIM 1: GAZ (THROTTLE) KONTROLÜ
    // ────────────────────────────────────────────
    if (this.turboMode) {
      // Turbo modunda throttle otomatik %100
      this.throttle = 100;
    } else {
      this.throttle += this.input.throttle * cfg.throttleRate * dt;
      this.throttle = Cesium.Math.clamp(this.throttle, 0, 100);
    }
    const throttleRatio = this.throttle / 100;

    // ────────────────────────────────────────────
    // ADIM 2: ATMOSFER MODELİ
    // Barometrik formül: ρ(h) = ρ₀ · e^(-h/H)
    // Yükseklik arttıkça hava seyrelir → lift azalır
    // ────────────────────────────────────────────
    const rho = cfg.rho0 * Math.exp(-this.height / cfg.scaleHeight);

    // ────────────────────────────────────────────
    // ADIM 3: AERODİNAMİK KUVVETLER
    // ────────────────────────────────────────────
    // ── FIX-K1: Rüzgar Etkisi → True Airspeed (TAS) ──
    // Aerodinamik kuvvetler hava kütlesine göreceli hıza (TAS) bağlıdır.
    // Karşı rüzgar → TAS artar → daha fazla lift/drag; kuyruk rüzgarı → TAS düşer
    if (this.windVector && this.windVector.speed > 0) {
      const headingRadWind = Cesium.Math.toRadians(this.heading);
      const windFwd = this.windVector.x * Math.sin(headingRadWind)
                    + this.windVector.y * Math.cos(headingRadWind);
      this.trueAirspeed = Math.max(0.5, this.airspeed - windFwd);
    } else {
      this.trueAirspeed = Math.max(0.5, this.airspeed);
    }
    const V = this.trueAirspeed; // Tüm aero hesaplar TAS kullanır

    // ── Dinamik Basınç (q) ──
    // q = ½ρV²  (Pascal)
    const q_dyn = 0.5 * rho * V * V;

    // ── Hücum Açısı (Angle of Attack / AoA) ──
    // α = θ - γ (pitch açısı - uçuş yolu açısı)
    const gammaRad = Cesium.Math.toRadians(this.flightPathAngle);
    const pitchRad = Cesium.Math.toRadians(this.pitch);
    const aoaRad = pitchRad - gammaRad;
    this.angleOfAttack = Cesium.Math.toDegrees(aoaRad);

    // ══════════════════════════════════════════
    // TAŞIMA KUVVETİ (LIFT)
    // L = ½ρv²SC_L
    //
    // C_L doğrusal bölgede: C_L = C_L0 + C_Lα · α
    // Stall'da: C_L üstel olarak düşer
    // ══════════════════════════════════════════
    let CL = cfg.CL0 + cfg.CLalpha * aoaRad;

    // ── STALL MODELİ ──
    // Kritik AoA'yı aştığında akış ayrılması başlar
    // Lift katsayısı üstel olarak düşer
    const stallAoARad = Cesium.Math.toRadians(cfg.stallAoA);
    let stallFactor = 1.0;

    if (Math.abs(aoaRad) > stallAoARad) {
      // Post-stall rejimi
      const excessAoA = Math.abs(aoaRad) - stallAoARad;
      stallFactor = Math.exp(-cfg.stallSharpness * excessAoA);
      CL *= stallFactor;
      this.isStalling = true;
      this.stallIntensity = Math.min(1, excessAoA / Cesium.Math.toRadians(10));
    } else if (V < cfg.minAirspeed * 1.15) {
      // Hız bazlı stall yaklaşımı
      const speedRatio = V / (cfg.minAirspeed * 1.15);
      if (speedRatio < 1) {
        stallFactor = speedRatio * speedRatio;
        CL *= stallFactor;
        this.isStalling = true;
        this.stallIntensity = 1 - speedRatio;
      } else {
        this.isStalling = false;
        this.stallIntensity = 0;
      }
    } else {
      this.isStalling = false;
      this.stallIntensity = 0;
    }

    CL = Cesium.Math.clamp(CL, -cfg.CLmax, cfg.CLmax);
    let lift = q_dyn * cfg.wingArea * CL;

    // ══════════════════════════════════════════
    // YER ETKİSİ (GROUND EFFECT)
    // Kanat açıklığı mesafesinde yere yakınken
    // lift kuvveti %10 artar (indüklenmiş drag azalır)
    // L_ge = L × (1 + k × (b/h)²) yaklaşımı
    // ══════════════════════════════════════════
    if (this.heightAboveTerrain < cfg.groundEffectHeight && this.heightAboveTerrain > 0) {
      const groundEffectRatio = 1 - (this.heightAboveTerrain / cfg.groundEffectHeight);
      const groundEffectBonus = 1 + (cfg.groundEffectMultiplier - 1) * groundEffectRatio;
      lift *= groundEffectBonus;
    }

    this.currentLift = lift;

    // ══════════════════════════════════════════
    // SÜRÜKLENME KUVVETİ (DRAG)
    // D = ½ρv²S · (C_D0 + K·C_L²)
    //
    // C_D0: parasit sürüklenme (gövde, kanat profili)
    // K·C_L²: indüklenmiş sürüklenme (kanat ucu vorteksleri)
    // ══════════════════════════════════════════
    let CD = cfg.CD0 + cfg.K * CL * CL;

    // ══ FREN PARAŞÜTÜ SÜRÜKLEME KUVVETİ ══
    // Paraşüt açıkken toplam CD'yi %300 artır
    // F_drag = ½ ρ v² A C_d
    let dragChuteForce = 0;
    if (this.dragChuteDeployed && this.dragChuteProgress > 0) {
      // Paraşütün kendi sürükleme alanı ve katsayısı
      const chuteCD = cfg.CD0 * cfg.dragChuteMultiplier * this.dragChuteProgress;
      CD += chuteCD;
      // Ek olarak paraşüt alanından gelen kuvvet
      dragChuteForce = q_dyn * cfg.dragChuteArea * 1.2 * this.dragChuteProgress;
    }

    let dragForce = q_dyn * cfg.wingArea * CD + dragChuteForce;
    
    // Turbo modunda drag'\u0131 neredeyse tamamen yok et
    if (this.turboMode) {
      dragForce *= 0.001; // Drag'\u0131 %99.9 azalt (1/1000)
    }
    
    const drag = dragForce;
    this.currentDrag = drag;

    // ══════════════════════════════════════════
    // İTKİ KUVVETİ (THRUST)
    // Pervane verimi yüksek hızlarda azalır
    // T = T_max · δ_t · η_prop
    // ══════════════════════════════════════════
    let propEfficiency = Math.max(0.15, 1.0 - V * V / (120 * 120));
    let maxThrustMultiplier = 1;
    
    // Turbo modunda:
    // - Pervane verimliliğini bypass et (full power)
    // - Motor gücünü 200x arttır (ultra boost)
    if (this.turboMode) {
      propEfficiency = 1.0;
      maxThrustMultiplier = 200; // Çok yüksek thrust
    }
    
    const targetThrust = (cfg.idleThrust + (cfg.maxThrust - cfg.idleThrust) * throttleRatio * maxThrustMultiplier) * propEfficiency;

    // Motor tepki gecikmesi (spool-up/spool-down)
    if (this.turboMode) {
      // Turbo: Doğrudan maksimum thrust set et (motor limitatörü bypass)
      this.currentThrust = 1000000; // 1 milyon Newton
    } else {
      this.currentThrust += (targetThrust - this.currentThrust) * cfg.thrustLag * dt;
    }

    // ────────────────────────────────────────────
    // ADIM 4: AÇISAL DİNAMİKLER
    // Kontrol yüzeylerinden moment → açısal ivme → açısal hız
    //
    // τ = I · α̇  (moment = atalet momenti × açısal ivme)
    //
    // Sönümleme: Hava direnci açısal harekete karşı koyar
    // Bu ATALETİ sağlar - tuş bırakıldığında İHA anında
    // durmaz, momentum korunarak yavaşça sönümlenir
    // ────────────────────────────────────────────

    // Kontrol yüzeylerinin etkinliği dinamik basınca bağlıdır
    // Düşük hızda kontrol yüzeyleri daha az etkili
    // Yüksek hızda daha etkili (ama aşırı da değil)
    const cruiseDynPressure = 0.5 * cfg.rho0 * 35 * 35;
    const controlEffectiveness = Cesium.Math.clamp(
      q_dyn / cruiseDynPressure,
      0.1, 1.8
    );

    // ══════════════════════════════════════════
    // YER KONTROL SİSTEMİ (GROUND CONTROLS)
    // Yerdeyken farklı kontrol mantığı uygula
    // ══════════════════════════════════════════
    let pDot, qDot, rDot;
    
    if (this.isGrounded) {
      // ── YERDE KONTROL ──
      
      // Pitch kontrolü: V_rotation altında burun kaldıramaz!
      // Kalkış hızına (V_rotation) ulaşmadan elevator etkisiz
      let pitchAuthority = 0;
      if (V >= cfg.vRotation) {
        // Kalkış hızına ulaştı - pitch kontrolü aktif
        // Hız arttıkça pitch kontrolü güçlenir
        const rotationFactor = Math.min(1, (V - cfg.vRotation) / (cfg.vRotation * 0.5));
        pitchAuthority = cfg.elevatorAuthority * rotationFactor * cfg.takeoffPitchRate / cfg.elevatorAuthority;
        
        // Kalkışta çok dik AoA = hız kaybı riski
        if (this.angleOfAttack > cfg.maxTakeoffAoA && this.input.pitch > 0) {
          // AoA çok yüksek - pitch artışını engelle ve hız düşür
          pitchAuthority *= 0.3;
          this.airspeed -= cfg.gForceSpeedPenalty * 5 * dt;
        }
      }
      
      // Roll: Yerdeyken aileronlar YAW kontrolü için kullanılır (tekerlek yönlendirme)
      // Roll açısı minimum tutulur (kanat ucu çarpmasını önle)
      const taxiYawFromRoll = this.input.roll * cfg.taxiYawRate;
      
      // Yaw: Normal rudder + tekerlek yönlendirmesi (roll input)
      const combinedYawInput = this.input.yaw + this.input.roll * 0.7;
      
      // Açısal ivmeler (yerde)
      pDot = -cfg.rollDamping * 3 * this.p; // Roll hızla sönümle (kanat düz kalsın)
      qDot = pitchAuthority * this.input.pitch * controlEffectiveness - cfg.pitchDamping * this.q;
      rDot = cfg.taxiYawRate * combinedYawInput - cfg.yawDamping * this.r;
      
      // Yerde roll açısını sıfıra zorla
      this.p -= this.roll * 2.0 * dt;
      
    } else {
      // ── HAVADA KONTROL (normal) ──
      pDot = cfg.aileronAuthority * this.input.roll * controlEffectiveness
                   - cfg.rollDamping * this.p;

      qDot = cfg.elevatorAuthority * this.input.pitch * controlEffectiveness
                   - cfg.pitchDamping * this.q;

      rDot = cfg.rudderAuthority * this.input.yaw * controlEffectiveness
                   - cfg.yawDamping * this.r;
    }

    // ── Açısal Hızları Güncelle ──
    // Bu adım ATALETİ oluşturur:
    // Tuş basılıyken açısal hız birikir,
    // bırakıldığında sönümleme ile yavaşça azalır
    this.p += pDot * dt;
    this.q += qDot * dt;
    this.r += rDot * dt;

    // ── Açısal Hız Limitleri ──
    const maxRate = cfg.maxAngularRate;
    this.p = Cesium.Math.clamp(this.p, -maxRate, maxRate);
    this.q = Cesium.Math.clamp(this.q, -maxRate, maxRate);
    this.r = Cesium.Math.clamp(this.r, -maxRate, maxRate);

    // ── Stall'da rastgele sallanma (buffeting) ──
    if (this.isStalling && this.stallIntensity > 0.2) {
      const buffetAmplitude = this.stallIntensity * 15;
      this.p += (Math.random() - 0.5) * buffetAmplitude * dt;
      this.q += (Math.random() - 0.5) * buffetAmplitude * dt;
    }

    // ── Otomatik Dengeleme (Stability Augmentation) ──
    // Girdi olmadığında İHA doğal olarak dengeye dönmeye çalışır

    // Roll: Ufka dönme eğilimi (dihedral etkisi)
    if (Math.abs(this.input.roll) < 0.05) {
      this.p -= this.roll * cfg.rollStability * dt;
    }

    // Pitch: Trim AoA'ya dönme eğilimi (boylamsal stabilite)
    if (Math.abs(this.input.pitch) < 0.05) {
      const trimPitch = this.flightPathAngle + cfg.trimAoA;
      this.q -= (this.pitch - trimPitch) * cfg.pitchStability * dt;
    }

    // ── FIX-K3: Oryantasyonu Güncelle (Body-rate → Euler Kinematics) ──
    // Doğru dönüşüm: φ̇ = p + (q·sinφ + r·cosφ)·tanθ
    //                 θ̇ = q·cosφ - r·sinφ
    // |θ| > 50° → gimbal lock koruması: basit integrasyona geri dön
    const absPitchDeg = Math.abs(this.pitch);
    if (absPitchDeg < 50) {
      const _phiRad = Cesium.Math.toRadians(this.roll);
      const _thetaRad = Cesium.Math.toRadians(this.pitch);
      const _sinPhi = Math.sin(_phiRad);
      const _cosPhi = Math.cos(_phiRad);
      const _tanTheta = Math.tan(_thetaRad);
      this.roll  += (this.p + (this.q * _sinPhi + this.r * _cosPhi) * _tanTheta) * dt;
      this.pitch += (this.q * _cosPhi - this.r * _sinPhi) * dt;
    } else {
      // Gimbal-lock güvenli bölge — basit Euler
      this.roll  += this.p * dt;
      this.pitch += this.q * dt;
    }

    // ══════════════════════════════════════════
    // KOORDİNELİ DÖNÜŞ (COORDINATED TURN)
    //
    // İHA yattığında (bank), lift vektörünün yatay
    // bileşeni merkezcil kuvvet oluşturur → doğal kavis dönüşü
    //
    // Dönüş hızı: ω = g·tan(φ) / V
    // φ = bank açısı (roll)
    //
    // Bu sayede İHA sadece yaw ile değil,
    // roll + lift ile gerçekçi bir şekilde döner
    // ══════════════════════════════════════════
    const rollRad = Cesium.Math.toRadians(this.roll);
    const bankTurnRate = (g * Math.tan(rollRad)) / Math.max(V, cfg.minAirspeed);
    const bankTurnRateDeg = Cesium.Math.toDegrees(bankTurnRate);

    // Heading = koordineli dönüş + rudder girdisi
    this.heading += (bankTurnRateDeg + this.r) * dt;
    this.heading = ((this.heading % 360) + 360) % 360;

    // ── Oryantasyon Limitleri ──
    this.pitch = Cesium.Math.clamp(this.pitch, -cfg.maxPitch, cfg.maxPitch);
    this.roll = Cesium.Math.clamp(this.roll, -cfg.maxRoll, cfg.maxRoll);

    // ────────────────────────────────────────────
    // ADIM 5: DOĞRUSAL DİNAMİKLER
    // ────────────────────────────────────────────

    // ══════════════════════════════════════════
    // YERDE: SÜRTÜNME VE YUVARLANMA HESABI
    // Yerdeyken farklı fizik kuralları uygula
    // ══════════════════════════════════════════
    let aLongitudinal;
    let aNormal;
    
    if (this.isGrounded) {
      // ── YER FİZİĞİ ──
      
      // Yer tepki kuvveti (Normal Force)
      // N = m·g - L (lift yer tepkisini azaltır)
      const normalForce = Math.max(0, mass * g - lift);
      
      // Yuvarlanma sürtünmesi (tekerlek direnci)
      // F_r = μ_r · N
      const rollingResistanceForce = cfg.rollingResistance * normalForce;
      
      // Zemin sürtünmesi (kayma/fren)
      // Hız azaldıkça sürtünme artar (yapış-kayış modeli)
      let frictionForce = 0;
      if (this.throttle < 20 && V > 0.5) {
        // Düşük gaz = fren etkisi
        const brakingForce = cfg.groundFriction * normalForce * cfg.brakeEfficiency;
        frictionForce = brakingForce * (1 - this.throttle / 20);
      }
      
      // Toplam yavaşlatma kuvveti
      const totalGroundResistance = rollingResistanceForce + frictionForce + drag;
      
      // Boylamsal ivme (yerde)
      // a = (T - D - F_r - F_f) / m
      aLongitudinal = (this.currentThrust - totalGroundResistance) / mass;
      
      // Dikey ivme = 0 (yerde)
      aNormal = 0;
      
      // Yerde pitch'i sıfıra doğru çek (park pozisyonu)
      if (V < cfg.vRotation) {
        this.pitch = this.pitch * (1 - 2 * dt); // Yumuşak geçiş
        this.flightPathAngle = 0;
      }
      
      // Yere yapış (bounce önleme)
      if (this.height < this.terrainHeight + cfg.wheelHeight) {
        this.height = this.terrainHeight + cfg.wheelHeight;
        this.climbRate = 0;
      }
      
    } else {
      // ── HAVA FİZİĞİ (normal) ──
      
      // Uçuş Yolu Boyunca İvme (Longitudinal)
      // a_x = (T - D) / m - g·sin(γ)
      aLongitudinal = (this.currentThrust - drag) / mass - g * Math.sin(gammaRad);

      // Uçuş Yoluna Dik İvme (Normal)
      // Banking'de lift'in dikey bileşeni azalır → irtifa kaybı
      // L_vert = L·cos(φ)
      const liftVertical = lift * Math.cos(rollRad);
      aNormal = liftVertical / mass - g * Math.cos(gammaRad);
    }

    // ══════════════════════════════════════════
    // G-KUVVETİ HESABI
    //
    // Load Factor: n = L / W
    // Düz uçuşta n = 1 (1G)
    // Koordineli dönüşte n = 1/cos(φ)
    // n > 1.5 olduğunda enerji kaybı başlar
    //
    // SERT MANEVRALARDA HIZ KAYBI YAŞANIR
    // ══════════════════════════════════════════
    this.loadFactor = lift / (mass * g);

    // Toplam G-kuvveti (vektörel)
    const gLong = aLongitudinal / g;
    this.gForce = Math.sqrt(gLong * gLong + this.loadFactor * this.loadFactor);
    this.gForce = Math.max(0.01, this.gForce);
    this.maxGReached = Math.max(this.maxGReached, this.gForce);

    // ── G-Kuvveti Hız Cezası ──
    // 1.5G üzerindeki her G için hız kaybı
    // (turbo modunda devre dışı bırak)
    if (!this.turboMode && this.gForce > 1.5) {
      const excessG = this.gForce - 1.5;
      const speedPenalty = excessG * cfg.gForceSpeedPenalty;
      this.airspeed *= (1 - speedPenalty * dt);
    }

    // ── Havahızı Güncellemesi ──
    this.airspeed += aLongitudinal * dt;
    
    // Turbo modunda hız sınırı olmaz; normal modda 65 m/s limit (234 km/h)
    const speedLimit = this.turboMode ? 2778 : cfg.maxAirspeed; // 2778 m/s = 10000 km/h
    this.airspeed = Cesium.Math.clamp(this.airspeed, 0, speedLimit);

    // Stall'da minimum hızın altına düşebilir (yerçekimi kazandırır)
    if (this.airspeed < cfg.minAirspeed && this.pitch > -10 && !this.turboMode) {
      this.isStalling = true;
      this.stallIntensity = Math.max(this.stallIntensity,
        (cfg.minAirspeed - this.airspeed) / cfg.minAirspeed
      );
    }

    // ── Uçuş Yolu Açısı Güncellemesi ──
    const gammaDot = aNormal / Math.max(V, 5);
    this.flightPathAngle += Cesium.Math.toDegrees(gammaDot * dt);
    this.flightPathAngle = Cesium.Math.clamp(this.flightPathAngle, -50, 50);

    this.maxSpeedReached = Math.max(this.maxSpeedReached, this.airspeed);

    // ────────────────────────────────────────────
    // ADIM 6: POZİSYON GÜNCELLEMESİ (Coğrafi)
    // ────────────────────────────────────────────
    const headingRad = Cesium.Math.toRadians(this.heading);
    this.groundSpeed = V * Math.cos(gammaRad);

    // Kuzey ve Doğu hız bileşenleri
    const northVel = Math.cos(headingRad) * this.groundSpeed;
    const eastVel = Math.sin(headingRad) * this.groundSpeed;

    // Coğrafi koordinat güncellemesi
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos(Cesium.Math.toRadians(this.latitude));

    this.latitude += (northVel * dt) / metersPerDegreeLat;
    this.longitude += (eastVel * dt) / metersPerDegreeLon;

    // Tırmanma hızı ve yükseklik
    if (!this.isGrounded) {
      this.climbRate = V * Math.sin(gammaRad);
      this.height += this.climbRate * dt;
    } else {
      // Yerde - yükseklik sabit
      this.climbRate = 0;
      this.height = this.terrainHeight + cfg.wheelHeight;
      this.flightPathAngle = 0;
      
      // Yerde tamamen durduğunda
      if (this.airspeed < 0.5) {
        this.airspeed = 0;
        this.groundSpeed = 0;
      }
    }

    // Yükseklik limitleri (havadayken)
    if (!this.isGrounded && this.height <= this.terrainHeight + cfg.wheelHeight) {
      // Yere yaklaşıyor - iniş temasına geç
      this.height = this.terrainHeight + cfg.wheelHeight;
    }
    this.height = Cesium.Math.clamp(this.height, cfg.minHeight, cfg.maxHeight);

    // ────────────────────────────────────────────
    // ADIM 7: BATARYA / YAKIT
    // ────────────────────────────────────────────
    this.battery -= throttleRatio * cfg.throttleDrain * dt;
    this.battery = Math.max(0, this.battery);
    if (this.battery <= 0) {
      this.throttle = 0;
      // Motor durur ama süzülme (glide) devam eder
    }

    // ────────────────────────────────────────────
    // ADIM 8: İSTATİSTİKLER
    // ────────────────────────────────────────────
    this.totalDistance += Math.max(0, this.groundSpeed) * dt;
    this.maxAltitudeReached = Math.max(this.maxAltitudeReached, this.height);
  }

  // ═══════════════════════════════════════════
  // GETTER METOTLARI
  // ═══════════════════════════════════════════

  getPosition() {
    return {
      longitude: this.longitude,
      latitude: this.latitude,
      height: this.height,
    };
  }

  getOrientation() {
    return {
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
    };
  }

  getAirspeedKmh() {
    return this.airspeed * 3.6;
  }

  getGroundSpeedKmh() {
    return this.groundSpeed * 3.6;
  }

  getCartesian() {
    return Cesium.Cartesian3.fromDegrees(
      this.longitude,
      this.latitude,
      this.height
    );
  }

  getHeadingPitchRoll() {
    return new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(this.heading),
      Cesium.Math.toRadians(this.pitch),
      Cesium.Math.toRadians(this.roll)
    );
  }

  getFlightData() {
    return {
      airspeed: this.airspeed,
      groundSpeed: this.groundSpeed,
      climbRate: this.climbRate,
      altitude: this.height,
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
      throttle: this.throttle,
      gForce: this.gForce,
      loadFactor: this.loadFactor,
      aoa: this.angleOfAttack,
      isStalling: this.isStalling,
      stallIntensity: this.stallIntensity,
      battery: this.battery,
      totalDistance: this.totalDistance,
      flightPathAngle: this.flightPathAngle,
      thrust: this.currentThrust,
      lift: this.currentLift,
      drag: this.currentDrag,
      // Yer Fiziği Verileri
      isGrounded: this.isGrounded,
      heightAboveTerrain: this.heightAboveTerrain,
      verticalSpeed: this.verticalSpeed,
      isTaxiing: this.isTaxiing,
      isCrashed: this.isCrashed,
      crashReason: this.crashReason,
      // Fren Paraşütü Verileri
      dragChuteDeployed: this.dragChuteDeployed,
      dragChuteProgress: this.dragChuteProgress,
      // İniş Takımı Verileri
      landingGear: this.landingGear,
      gearDeployProgress: this.gearDeployProgress,
    };
  }

  // ═══════════════════════════════════════════
  // ÇARPIŞMA KONTROLLERI (COLLISION DETECTION)
  // ═══════════════════════════════════════════

  /**
   * Arazi yüksekliğini güncelle (dış kaynak Cesium'dan)
   * @param {number} height - Metin yüksekliği (metre)
   */
  setTerrainHeight(height) {
    this.terrainHeight = height || 0;
    
    // Çarpışma uyarısı kontrolü
    const altitudeAboveTerrain = this.height - this.terrainHeight;
    this.isCollisionWarning = altitudeAboveTerrain < this.collisionMargin && !this.isCrashed;
  }

  /**
   * Crash durumunu kontrol et. Eğer zemin altında ise crash
   */
  checkCollisionAndCrash() {
    if (this.isCrashed) return;

    const altitudeAboveTerrain = this.height - this.terrainHeight;

    // Zemin altına iniş = CRASH (kontrolsüz çarpma)
    if (altitudeAboveTerrain < 0) {
      this.crash('Zemine kontrolsüz çarpma!');
    }
  }

  /**
   * Crash durumunu tetikle
   * @param {string} reason - Kaza nedeni
   */
  crash(reason = 'Bilinmeyen neden') {
    if (this.isCrashed) return;

    this.isCrashed = true;
    this.crashReason = reason;
    this.crashTime = performance.now();
    this.throttle = 0;           // Motor hemen kes
    this.airspeed = 0;           // Hızı sıfırla
    this.isOn = false;           // Sistemi kapat
    this.climbRate = 0;
    this.groundSpeed = 0;

    console.error(`💥 CRASH! ${reason}`);
    
    // Crash event'ı dispatch et (UI'nın yakalayiçi için)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dronecrash', { 
        detail: { reason, time: this.crashTime } 
      }));
    }
  }

  /**
   * Crash durumunda olup olmadığını kontrol et
   * @returns {boolean}
   */
  hasCrashed() {
    return this.isCrashed;
  }

  /**
   * Crash nedenini döndür
   * @returns {string}
   */
  getCrashReason() {
    return this.crashReason || '';
  }

  /**
   * Yer temas durumunu döndür
   * @returns {boolean}
   */
  isOnGround() {
    return this.isGrounded;
  }

  /**
   * Uçuş verisine yer bilgileri ekle
   */
  getGroundData() {
    return {
      isGrounded: this.isGrounded,
      heightAboveTerrain: this.heightAboveTerrain,
      verticalSpeed: this.verticalSpeed,
      isTaxiing: this.isTaxiing,
      groundContactTime: this.groundContactTime,
      dragChuteDeployed: this.dragChuteDeployed,
      dragChuteProgress: this.dragChuteProgress,
      landingGear: this.landingGear,
      gearDeployProgress: this.gearDeployProgress,
    };
  }

  // ═════════════════════════════════════════
  // FREN PARAŞÜTÜ KONTROLÜ
  // ═════════════════════════════════════════

  /**
   * Fren paraşütünü aç/kapat (toggle)
   * @returns {{ deployed: boolean, reason: string }}
   */
  toggleDragChute() {
    if (this.dragChuteDeployed) {
      // Paraşütü kapat (jettison)
      this.dragChuteDeployed = false;
      this.dragChuteRequested = false;
      this.dragChuteProgress = 0;
      return { deployed: false, reason: 'Paraşüt atıldı (jettison)' };
    }
    // Açma koşullarını kontrol et
    if (!this.isGrounded && this.heightAboveTerrain > this.config.dragChuteMaxAltitude) {
      return { deployed: false, reason: `İrtifa çok yüksek! (AGL: ${this.heightAboveTerrain.toFixed(0)}m, limit: ${this.config.dragChuteMaxAltitude}m)` };
    }
    this.dragChuteRequested = true;
    this.dragChuteDeployed = true;
    console.log('🪂 Fren paraşütü AÇILDI!');
    return { deployed: true, reason: 'Paraşüt açıldı' };
  }

  // ═════════════════════════════════════════
  // İNİŞ TAKIMI KONTROLÜ
  // ═════════════════════════════════════════

  /**
   * İniş takımlarını aç/kapat
   * @returns {{ gear: boolean, reason: string }}
   */
  toggleLandingGear() {
    if (this.isGrounded && this.landingGear) {
      // Yerdeyken takım kapatma izni yok
      return { gear: true, reason: 'Yerdeyken iniş takımı kapatılamaz!' };
    }
    this.landingGear = !this.landingGear;
    console.log(`✈️ İniş takımı: ${this.landingGear ? 'AÇIK' : 'KAPALI'}`);
    return { gear: this.landingGear, reason: this.landingGear ? 'Takım açıldı' : 'Takım kapatıldı' };
  }
}
