/**
 * ═══════════════════════════════════════════════════════════════════
 * HUD (Head-Up Display) SİSTEMİ
 * Uçuş Bilgi Göstergesi
 * ═══════════════════════════════════════════════════════════════════
 *
 * Gösterim panelleri:
 * - Birincil: Yükseklik, Hız, Yön, Pitch/Roll
 * - İkincil:  Throttle, Tırmanma Hızı, G-Kuvveti, AoA
 * - Durum:    Batarya, Uçuş Süresi, Koordinatlar
 * - Uyarılar: Stall, Overspeed, Yapısal G limiti
 */
export class HUD {
  constructor() {
    // ── Birincil Göstergeler ──
    this.elements = {
      altitude: document.getElementById('hudAltitude'),
      speed: document.getElementById('hudSpeed'),
      heading: document.getElementById('hudHeading'),
      pitchRoll: document.getElementById('hudPitch'),
      // ── İkincil Göstergeler ──
      throttle: document.getElementById('hudThrottle'),
      climbRate: document.getElementById('hudClimbRate'),
      gForce: document.getElementById('hudGForce'),
      aoa: document.getElementById('hudAoA'),
      // ── Durum Göstergeleri ──
      lat: document.getElementById('hudLat'),
      lon: document.getElementById('hudLon'),
      battery: document.getElementById('hudBattery'),
      flightTime: document.getElementById('hudFlightTime'),
    };

    // ── Uyarı Elemanları ──
    this.stallWarning = document.getElementById('stallWarning');
    this.overspeedWarning = document.getElementById('overspeedWarning');
    this.crashWarning = document.getElementById('crashWarning');
    this.collisionWarning = document.getElementById('collisionWarning');

    // Throttle bar
    this.throttleBar = document.getElementById('throttleBarFill');
  }

  update(physics, flightTimeSeconds) {
    const pos = physics.getPosition();
    const orientation = physics.getOrientation();
    const fd = physics.getFlightData();

    // ════════════════════════════════════════
    // BİRİNCİL GÖSTERGELER
    // ════════════════════════════════════════

    // YÜKSEKLİK (Altimeter)
    if (this.elements.altitude) {
      this.elements.altitude.textContent = `ALT: ${pos.height.toFixed(0)} m`;
    }

    // HAVAHIZI (Airspeed Indicator)
    if (this.elements.speed) {
      const kmh = physics.getAirspeedKmh();
      this.elements.speed.textContent = `TAS: ${kmh.toFixed(0)} km/h`;

      // Renk kodu: stall sarı → normal yeşil → overspeed kırmızı
      if (fd.isStalling) {
        this.elements.speed.style.color = '#ff3344';
      } else if (fd.airspeed > physics.config.maxAirspeed * 0.9) {
        this.elements.speed.style.color = '#ffaa00';
      } else {
        this.elements.speed.style.color = '#00ff88';
      }
    }

    // YÖN (Heading / Compass)
    if (this.elements.heading) {
      const compassDir = this.getCompassDirection(orientation.heading);
      this.elements.heading.textContent = `HDG: ${orientation.heading.toFixed(0)}° ${compassDir}`;
    }

    // PITCH & ROLL
    if (this.elements.pitchRoll) {
      const pitchStr = orientation.pitch >= 0 ? `+${orientation.pitch.toFixed(1)}` : orientation.pitch.toFixed(1);
      const rollStr = orientation.roll >= 0 ? `+${orientation.roll.toFixed(1)}` : orientation.roll.toFixed(1);
      this.elements.pitchRoll.textContent = `P:${pitchStr}° R:${rollStr}°`;
    }

    // ════════════════════════════════════════
    // İKİNCİL GÖSTERGELER
    // ════════════════════════════════════════

    // GAZ (Throttle)
    if (this.elements.throttle) {
      this.elements.throttle.textContent = `THR: ${fd.throttle.toFixed(0)}%`;
    }

    // Throttle Bar (görsel çubuk)
    if (this.throttleBar) {
      this.throttleBar.style.height = `${fd.throttle}%`;
      // Renk: düşük=yeşil, orta=sarı, yüksek=turuncu, max=kırmızı
      if (fd.throttle > 90) {
        this.throttleBar.style.background = 'linear-gradient(to top, #ff3344, #ff6644)';
      } else if (fd.throttle > 70) {
        this.throttleBar.style.background = 'linear-gradient(to top, #ffaa00, #ff8800)';
      } else {
        this.throttleBar.style.background = 'linear-gradient(to top, #00ff88, #00ccff)';
      }
    }

    // TIRMANMA HIZI (Vertical Speed Indicator)
    if (this.elements.climbRate) {
      const vs = fd.climbRate;
      const vsStr = vs >= 0 ? `+${vs.toFixed(1)}` : vs.toFixed(1);
      this.elements.climbRate.textContent = `VS: ${vsStr} m/s`;
      this.elements.climbRate.style.color = vs >= 0 ? '#00ff88' : '#ff8844';
    }

    // G-KUVVETİ
    if (this.elements.gForce) {
      this.elements.gForce.textContent = `G: ${fd.gForce.toFixed(1)}`;
      // Renk: normal=yeşil, yüksek=sarı, tehlikeli=kırmızı
      if (fd.gForce > 3.5) {
        this.elements.gForce.style.color = '#ff3344';
      } else if (fd.gForce > 2.0) {
        this.elements.gForce.style.color = '#ffaa00';
      } else {
        this.elements.gForce.style.color = '#00ff88';
      }
    }

    // HÜCUM AÇISI (Angle of Attack)
    if (this.elements.aoa) {
      this.elements.aoa.textContent = `AoA: ${fd.aoa.toFixed(1)}°`;
      // Stall AoA'ya yaklaşınca sarı → kırmızı
      if (Math.abs(fd.aoa) > physics.config.stallAoA * 0.8) {
        this.elements.aoa.style.color = '#ff3344';
      } else if (Math.abs(fd.aoa) > physics.config.stallAoA * 0.6) {
        this.elements.aoa.style.color = '#ffaa00';
      } else {
        this.elements.aoa.style.color = '#00ccff';
      }
    }

    // ════════════════════════════════════════
    // DURUM GÖSTERGELERİ
    // ════════════════════════════════════════

    // KOORDİNATLAR
    if (this.elements.lat) {
      this.elements.lat.textContent = `LAT: ${pos.latitude.toFixed(5)}`;
    }
    if (this.elements.lon) {
      this.elements.lon.textContent = `LON: ${pos.longitude.toFixed(5)}`;
    }

    // BATARYA / YAKIT
    if (this.elements.battery) {
      const batteryColor =
        fd.battery > 50  ? '#00ff88' :
        fd.battery > 20  ? '#ffaa00' :
                           '#ff3344';
      this.elements.battery.textContent = `FUEL: ${fd.battery.toFixed(0)}%`;
      this.elements.battery.style.color = batteryColor;
    }

    // UÇUŞ SÜRESİ
    if (this.elements.flightTime) {
      const mins = Math.floor(flightTimeSeconds / 60);
      const secs = Math.floor(flightTimeSeconds % 60);
      this.elements.flightTime.textContent = `TIME: ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ════════════════════════════════════════
    // UYARILAR
    // ════════════════════════════════════════

    // STALL UYARISI
    if (this.stallWarning) {
      if (fd.isStalling && fd.stallIntensity > 0.1) {
        this.stallWarning.classList.remove('hidden');
        // Ciddi stall'da daha hızlı yanıp söner
        this.stallWarning.style.animationDuration = fd.stallIntensity > 0.5 ? '0.3s' : '0.7s';
      } else {
        this.stallWarning.classList.add('hidden');
      }
    }

    // OVERSPEED UYARISI
    if (this.overspeedWarning) {
      if (fd.airspeed > physics.config.maxAirspeed * 0.92) {
        this.overspeedWarning.classList.remove('hidden');
      } else {
        this.overspeedWarning.classList.add('hidden');
      }
    }

    // CRASH UYARISI
    if (this.crashWarning) {
      if (physics.isCrashed) {
        this.crashWarning.classList.remove('hidden');
        this.crashWarning.style.animationDuration = '0.2s'; // Hızlı yanıp söner
      } else {
        this.crashWarning.classList.add('hidden');
      }
    }

    // ZEMİN YAKLAŞMA UYARISI
    if (this.collisionWarning) {
      if (physics.isCollisionWarning && !physics.isCrashed) {
        this.collisionWarning.classList.remove('hidden');
      } else {
        this.collisionWarning.classList.add('hidden');
      }
    }
  }

  /**
   * Pusula yönünü döndürür
   */
  getCompassDirection(heading) {
    const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    const index = Math.round(heading / 45) % 8;
    return dirs[index];
  }
}
