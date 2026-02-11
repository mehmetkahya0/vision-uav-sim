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
 *
 * OPTIMIZED: DOM updates throttled, cached values to prevent flickering
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
      // ── Hava & Zaman Göstergeleri ──
      gameTime: document.getElementById('hudGameTime'),
      windInfo: document.getElementById('hudWindInfo'),
      visInfo: document.getElementById('hudVisInfo'),
      tempInfo: document.getElementById('hudTempInfo'),
    };

    // ── Uyarı Elemanları ──
    this.stallWarning = document.getElementById('stallWarning');
    this.overspeedWarning = document.getElementById('overspeedWarning');
    this.crashWarning = document.getElementById('crashWarning');
    this.collisionWarning = document.getElementById('collisionWarning');

    // Throttle bar
    this.throttleBar = document.getElementById('throttleBarFill');

    // ── Optimizasyon: Cached values ──
    this.cachedAltitude = null;
    this.cachedSpeed = null;
    this.cachedHeading = null;
    this.cachedThrottle = null;
    this.updateCounter = 0;
    this.weatherUpdateCounter = 0;
  }

  update(physics, flightTimeSeconds) {
    const pos = physics.getPosition();
    const orientation = physics.getOrientation();
    const fd = physics.getFlightData();

    // Throttle DOM updates every 3 frames (called from main already throttled)
    // Main loop zaten her 3 frame'de çağırıyor, burada ekstra kontrol gereksiz
    // this.updateCounter++; // REMOVED - main loop throttles it

    // ════════════════════════════════════════
    // BİRİNCİL GÖSTERGELER
    // ════════════════════════════════════════

    // YÜKSEKLİK (Altimeter) - Only update if changed significantly
    if (this.elements.altitude) {
      const roundedAlt = Math.round(pos.height / 5) * 5; // Round to nearest 5m
      if (this.cachedAltitude !== roundedAlt) {
        this.elements.altitude.textContent = `ALT: ${pos.height.toFixed(0)} m`;
        this.cachedAltitude = roundedAlt;
      }
    }

    // HAVAHIZI (Airspeed Indicator)
    if (this.elements.speed) {
      const kmh = physics.getAirspeedKmh();
      const roundedSpeed = Math.round(kmh / 2) * 2; // Round to nearest 2 km/h
      if (this.cachedSpeed !== roundedSpeed) {
        this.elements.speed.textContent = `TAS: ${kmh.toFixed(0)} km/h`;
        this.cachedSpeed = roundedSpeed;
      }

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
      const roundedHeading = Math.round(orientation.heading / 5) * 5; // Round to nearest 5°
      if (this.cachedHeading !== roundedHeading) {
        const compassDir = this.getCompassDirection(orientation.heading);
        this.elements.heading.textContent = `HDG: ${orientation.heading.toFixed(0)}° ${compassDir}`;
        this.cachedHeading = roundedHeading;
      }
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
      const roundedThrottle = Math.round(fd.throttle / 2) * 2;
      if (this.cachedThrottle !== roundedThrottle) {
        this.elements.throttle.textContent = `THR: ${fd.throttle.toFixed(0)}%`;
        this.cachedThrottle = roundedThrottle;
      }
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

    // OVERSPEED UYARISI (turbo mode'da gösterilmez)
    if (this.overspeedWarning) {
      if (!physics.turboMode && fd.airspeed > physics.config.maxAirspeed * 0.92) {
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
        // Crash nedenini göster
        const reason = physics.getCrashReason ? physics.getCrashReason() : '';
        if (reason && this.crashWarning.textContent.indexOf(reason) === -1) {
          this.crashWarning.innerHTML = `💥 CRASH<br><small>${reason}</small>`;
        }
      } else {
        this.crashWarning.classList.add('hidden');
        this.crashWarning.innerHTML = '💥 CRASH';
      }
    }

    // ZEMİN YAKLAŞMA UYARISI
    if (this.collisionWarning) {
      if (physics.isCollisionWarning && !physics.isCrashed && !physics.isGrounded) {
        this.collisionWarning.classList.remove('hidden');
        // İniş hızı çok yüksekse özel uyarı
        if (fd.verticalSpeed < physics.config.maxLandingVerticalSpeed) {
          this.collisionWarning.innerHTML = '⚠️ PULL UP!<br><small>Dikey hız çok yüksek!</small>';
          this.collisionWarning.style.background = 'rgba(255, 0, 0, 0.8)';
        } else {
          this.collisionWarning.innerHTML = '⚠️ TERRAIN';
          this.collisionWarning.style.background = 'rgba(255, 100, 0, 0.8)';
        }
      } else {
        this.collisionWarning.classList.add('hidden');
      }
    }

    // ════════════════════════════════════════
    // YER DURUMU GÖSTERGESİ
    // ════════════════════════════════════════
    this.updateGroundStatus(physics, fd);
  }

  /**
   * Yer durumu göstergesini güncelle
   */
  updateGroundStatus(physics, fd) {
    // Ground status element'i bul veya oluştur
    let groundStatus = document.getElementById('groundStatus');
    if (!groundStatus) {
      groundStatus = document.createElement('div');
      groundStatus.id = 'groundStatus';
      groundStatus.style.cssText = `
        position: fixed;
        bottom: 120px;
        left: 20px;
        padding: 8px 16px;
        border-radius: 8px;
        font-family: 'Orbitron', monospace;
        font-size: 14px;
        font-weight: bold;
        text-transform: uppercase;
        z-index: 1000;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(groundStatus);
    }

    if (physics.isGrounded) {
      groundStatus.style.display = 'block';
      
      if (fd.airspeed < 0.5) {
        // Durmuş
        groundStatus.textContent = '🛬 PARKED';
        groundStatus.style.background = 'rgba(0, 150, 0, 0.8)';
        groundStatus.style.color = '#fff';
      } else if (fd.airspeed < physics.config.vRotation) {
        // Taxi / hazırlanıyor
        groundStatus.textContent = `🚕 TAXI (V: ${fd.airspeed.toFixed(1)} m/s)`;
        groundStatus.style.background = 'rgba(255, 180, 0, 0.8)';
        groundStatus.style.color = '#000';
      } else {
        // Kalkış hızına ulaştı
        groundStatus.textContent = `✈️ ROTATE! (V: ${fd.airspeed.toFixed(1)} m/s)`;
        groundStatus.style.background = 'rgba(0, 200, 100, 0.9)';
        groundStatus.style.color = '#fff';
        groundStatus.style.animation = 'pulse 0.5s ease-in-out infinite';
      }
    } else if (fd.heightAboveTerrain < 50) {
      // Alçak uçuş / iniş yaklaşması
      groundStatus.style.display = 'block';
      groundStatus.textContent = `🛬 AGL: ${fd.heightAboveTerrain.toFixed(0)}m | VS: ${fd.verticalSpeed.toFixed(1)} m/s`;
      
      // Dikey hız güvenli mi?
      if (fd.verticalSpeed < physics.config.maxLandingVerticalSpeed) {
        groundStatus.style.background = 'rgba(255, 50, 50, 0.9)';
        groundStatus.style.color = '#fff';
      } else if (fd.verticalSpeed < 0) {
        groundStatus.style.background = 'rgba(255, 150, 0, 0.8)';
        groundStatus.style.color = '#000';
      } else {
        groundStatus.style.background = 'rgba(0, 150, 200, 0.8)';
        groundStatus.style.color = '#fff';
      }
    } else {
      groundStatus.style.display = 'none';
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

  /**
   * Hava durumu bilgisini güncelle
   */
  updateWeather(weather) {
    if (!weather) return;

    // Saat
    if (this.elements.gameTime) {
      this.elements.gameTime.textContent = `🕐 ${weather.getTimeString()}`;
    }

    // Rüzgar
    if (this.elements.windInfo) {
      const windStr = `💨 ${weather.weather.windSpeed.toFixed(1)}m/s`;
      this.elements.windInfo.textContent = windStr;
    }

    // Görünürlük
    if (this.elements.visInfo) {
      const visStr = `👁 ${(weather.weather.visibility / 1000).toFixed(1)}km`;
      this.elements.visInfo.textContent = visStr;
    }

    // Sıcaklık
    if (this.elements.tempInfo) {
      const tempStr = `🌡 ${weather.weather.temperature}°C`;
      this.elements.tempInfo.textContent = tempStr;
    }
  }
}
