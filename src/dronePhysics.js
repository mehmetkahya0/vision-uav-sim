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
      pitchDamping: 3.2,       // 1/s
      rollDamping: 3.8,        // 1/s
      yawDamping: 2.8,         // 1/s

      // ═══ STABİLİTE (OTOMATİK DENGELEME) ═══
      // Girdi yokken ufka/trim açısına dönme eğilimi
      rollStability: 0.6,      // Roll → 0° eğilimi (1/s)
      pitchStability: 0.4,     // Pitch → trim eğilimi (1/s)

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
  // ANA FİZİK GÜNCELLEME DÖNGÜSÜ
  // Her frame'de çağrılır (requestAnimationFrame)
  // ═══════════════════════════════════════════
  update(dt) {
    if (dt <= 0 || !this.isOn) return;
    dt = Math.min(dt, 0.05); // Maksimum 50ms adım (min 20 FPS)

    const cfg = this.config;
    const mass = cfg.mass;
    const g = cfg.gravity;

    // ────────────────────────────────────────────
    // ADIM 1: GAZ (THROTTLE) KONTROLÜ
    // ────────────────────────────────────────────
    this.throttle += this.input.throttle * cfg.throttleRate * dt;
    this.throttle = Cesium.Math.clamp(this.throttle, 0, 100);
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
    const V = Math.max(this.airspeed, 0.5); // Sıfıra bölmeyi önle

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
    const lift = q_dyn * cfg.wingArea * CL;
    this.currentLift = lift;

    // ══════════════════════════════════════════
    // SÜRÜKLENME KUVVETİ (DRAG)
    // D = ½ρv²S · (C_D0 + K·C_L²)
    //
    // C_D0: parasit sürüklenme (gövde, kanat profili)
    // K·C_L²: indüklenmiş sürüklenme (kanat ucu vorteksleri)
    // ══════════════════════════════════════════
    const CD = cfg.CD0 + cfg.K * CL * CL;
    const drag = q_dyn * cfg.wingArea * CD;
    this.currentDrag = drag;

    // ══════════════════════════════════════════
    // İTKİ KUVVETİ (THRUST)
    // Pervane verimi yüksek hızlarda azalır
    // T = T_max · δ_t · η_prop
    // ══════════════════════════════════════════
    const propEfficiency = Math.max(0.15, 1.0 - V * V / (120 * 120));
    const targetThrust = (cfg.idleThrust + (cfg.maxThrust - cfg.idleThrust) * throttleRatio) * propEfficiency;

    // Motor tepki gecikmesi (spool-up/spool-down)
    this.currentThrust += (targetThrust - this.currentThrust) * cfg.thrustLag * dt;

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

    // ── Açısal İvmeler (deg/s²) ──
    // Kontrol girdisi + aerodinamik sönümleme
    const pDot = cfg.aileronAuthority * this.input.roll * controlEffectiveness
                 - cfg.rollDamping * this.p;

    const qDot = cfg.elevatorAuthority * this.input.pitch * controlEffectiveness
                 - cfg.pitchDamping * this.q;

    const rDot = cfg.rudderAuthority * this.input.yaw * controlEffectiveness
                 - cfg.yawDamping * this.r;

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

    // ── Oryantasyonu Güncelle (Euler Integration) ──
    this.roll += this.p * dt;
    this.pitch += this.q * dt;

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

    // ── Uçuş Yolu Boyunca İvme (Longitudinal) ──
    // a_x = (T - D) / m - g·sin(γ)
    const aLongitudinal = (this.currentThrust - drag) / mass - g * Math.sin(gammaRad);

    // ── Uçuş Yoluna Dik İvme (Normal) ──
    // Banking'de lift'in dikey bileşeni azalır → irtifa kaybı
    // L_vert = L·cos(φ)
    const liftVertical = lift * Math.cos(rollRad);
    const aNormal = liftVertical / mass - g * Math.cos(gammaRad);

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
    if (this.gForce > 1.5) {
      const excessG = this.gForce - 1.5;
      const speedPenalty = excessG * cfg.gForceSpeedPenalty;
      this.airspeed *= (1 - speedPenalty * dt);
    }

    // ── Havahızı Güncellemesi ──
    this.airspeed += aLongitudinal * dt;
    this.airspeed = Cesium.Math.clamp(this.airspeed, 0, cfg.maxAirspeed);

    // Stall'da minimum hızın altına düşebilir (yerçekimi kazandırır)
    if (this.airspeed < cfg.minAirspeed && this.pitch > -10) {
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
    this.climbRate = V * Math.sin(gammaRad);
    this.height += this.climbRate * dt;

    // Yükseklik limitleri
    if (this.height <= cfg.minHeight) {
      this.height = cfg.minHeight;
      this.climbRate = Math.max(0, this.climbRate);
      this.flightPathAngle = Math.max(0, this.flightPathAngle);
      // Yere çok sert çarpınca
      if (this.airspeed < 5) {
        this.airspeed = 0;
        this.isOn = false;
      }
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
    };
  }
}
