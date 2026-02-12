/**
 * ═══════════════════════════════════════════════════════════════════
 * İHA KONTROL SİSTEMİ - Klavye Girdisi
 * UAV Flight Controls - Keyboard Input Handler
 * ═══════════════════════════════════════════════════════════════════
 *
 * Kontrol Şeması (Gerçek Uçak Simülasyonu):
 * ──────────────────────────────────────────
 *   W         → Pitch Down  (burun aşağı - stick ileri)
 *   S         → Pitch Up    (burun yukarı - stick geri)
 *   A         → Roll Left   (sol kanat aşağı)
 *   D         → Roll Right  (sağ kanat aşağı)
 *   Q         → Yaw Left    (rudder sol)
 *   E         → Yaw Right   (rudder sağ)
 *   Left Shift→ Throttle Up (motor gücü artır)
 *   Left Ctrl → Throttle Dn (motor gücü azalt)
 *   Space     → Fren Paraşütü (Drag Chute) aç/kapat
 *   X         → İniş Takımı aç/kapat
 *
 * Kamera Kontrolleri:
 * ──────────────────
 *   R / F     → Kamera yukarı / aşağı
 *   T         → Kamera sıfırla
 *   C         → PiP / Tam Ekran geçiş
 *   V         → Kamera modu değiştir (takip / cockpit)
 *   ?         → Yardım paneli
 */
export class DroneControls {
  constructor(physics, detector) {
    this.physics = physics;
    this.detector = detector;
    this.keys = {};
    this.cameraMode = 'follow'; // 'follow' | 'cockpit'
    this.setupListeners();
  }

  setupListeners() {
    // ── Klavye Tuş Basma ──
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Kamera pitch kontrolleri (tek basış)
      if (e.code === 'KeyR') {
        this.physics.cameraPitch = Math.min(-10, this.physics.cameraPitch + 5);
      }
      if (e.code === 'KeyF') {
        this.physics.cameraPitch = Math.max(-85, this.physics.cameraPitch - 5);
      }
      if (e.code === 'KeyT') {
        this.physics.cameraPitch = -45; // Reset
      }

      // Kamera modu değiştir
      if (e.code === 'KeyV') {
        const modes = ['follow', 'cockpit', 'orbit'];
        const idx = modes.indexOf(this.cameraMode);
        this.cameraMode = modes[(idx + 1) % modes.length];
      }

      // Kamera boyut değişikliği
      if (e.code === 'KeyC') {
        this.toggleCameraSize();
      }

      // AI Detection aç/kapat
      if (e.code === 'KeyB') {
        if (this.detector) this.detector.toggle();
      }

      // Confidence threshold azalt
      if (e.code === 'KeyN') {
        if (this.detector) {
          this.detector.setConfidence(this.detector.confThreshold - 0.05);
        }
      }

      // Confidence threshold artır
      if (e.code === 'KeyM') {
        if (this.detector) {
          this.detector.setConfidence(this.detector.confThreshold + 0.05);
        }
      }

      // Zoom In (+/= tuşu)
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        if (this.detector) this.detector.zoomIn();
        e.preventDefault();
      }

      // Zoom Out (- tuşu)
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        if (this.detector) this.detector.zoomOut();
        e.preventDefault();
      }

      // Zoom Reset (0 tuşu)
      if (e.code === 'Digit0' || e.code === 'Numpad0') {
        if (this.detector) this.detector.resetZoom();
      }

      // Freeze (G tuşu) - 5 saniyelik görüntü dondurma
      if (e.code === 'KeyG') {
        if (this.detector) {
          const canvas = document.getElementById('droneCamCanvas');
          this.detector.toggleFreeze(canvas);
        }
      }

      // OSM Binaları aç/kapa (O tuşu)
      if (e.code === 'KeyO') {
        if (window.sim && window.sim.toggleOSMBuildings) {
          window.sim.toggleOSMBuildings();
        }
      }

      // Hava Durumu Paneli (H tuşu)
      if (e.code === 'KeyH') {
        const weatherPanel = document.getElementById('weatherPanel');
        if (weatherPanel) {
          weatherPanel.classList.toggle('hidden');
        }
      }

      // Rüzgar Hızını Artır (Y tuşu)
      if (e.code === 'KeyY') {
        if (window.sim && window.sim.weather) {
          const newSpeed = Math.min(window.sim.weather.weather.windSpeed + 2, 50);
          window.sim.weather.setWindSpeed(newSpeed);
          console.log(`💨 Rüzgar: ${newSpeed.toFixed(1)} m/s`);
        }
      }

      // Rüzgar Hızını Azalt (U tuşu)
      if (e.code === 'KeyU') {
        if (window.sim && window.sim.weather) {
          const newSpeed = Math.max(window.sim.weather.weather.windSpeed - 2, 0);
          window.sim.weather.setWindSpeed(newSpeed);
          console.log(`💨 Rüzgar: ${newSpeed.toFixed(1)} m/s`);
        }
      }

      // Zaman Kontrol Paneli (J tuşu)
      if (e.code === 'KeyJ') {
        const timePanel = document.getElementById('timeControlPanel');
        if (timePanel) {
          timePanel.classList.toggle('hidden');
        }
      }

      // Saat Geri (K tuşu) - 1 saat geri
      if (e.code === 'KeyK') {
        if (window.sim && window.sim.weather) {
          window.sim.weather.adjustHour(-1);
        }
      }

      // Saat İleri (L tuşu) - 1 saat ileri
      if (e.code === 'KeyL') {
        if (window.sim && window.sim.weather) {
          window.sim.weather.adjustHour(1);
        }
      }

      // Gece Görüş Modu (Z tuşu) - Infrared/Night Vision
      if (e.code === 'KeyZ') {
        if (window.sim && window.sim.toggleNightVision) {
          window.sim.toggleNightVision();
        }
      }

      // Ses Aç/Kapat (P tuşu)
      if (e.code === 'KeyP') {
        if (window.sim && window.sim.audioManager) {
          const muted = window.sim.audioManager.toggleMute();
          // HUD badge güncelle
          const badge = document.getElementById('soundBadge');
          if (badge) {
            badge.textContent = muted ? '🔇' : '🔊';
            badge.classList.toggle('sound-muted', muted);
          }
        }
      }

      // Fren Paraşütü Aç/Kapat (Space tuşu)
      if (e.code === 'Space') {
        if (this.physics) {
          const result = this.physics.toggleDragChute();
          this._showNotification(result.deployed ? '🪂 PARAŞÜT AÇIK' : '🪂 PARAŞÜT KAPALI', 
            result.deployed ? '#ff6600' : '#00aa44', result.reason);
        }
      }

      // İniş Takımı Aç/Kapat (X tuşu)
      if (e.code === 'KeyX') {
        if (this.physics) {
          const result = this.physics.toggleLandingGear();
          this._showNotification(result.gear ? '✈️ GEAR DOWN' : '✈️ GEAR UP',
            result.gear ? '#00aa44' : '#ffaa00', result.reason);
        }
      }

      // Yardım paneli
      if (e.code === 'Slash' && e.shiftKey) {
        this.toggleHelp();
      }

      // Tarayıcı varsayılanlarını engelle (kaydırma, zoom vs.)
      if ([
        'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'ControlLeft', 'ShiftLeft', 'ShiftRight', 'Equal', 'Minus',
        'NumpadAdd', 'NumpadSubtract'
      ].includes(e.code)) {
        e.preventDefault();
      }
    });

    // ── Klavye Tuş Bırakma ──
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Sayfa odağını kaybettiğinde tüm tuşları sıfırla
    window.addEventListener('blur', () => {
      this.keys = {};
    });

    // Buton dinleyicileri
    const toggleBtn = document.getElementById('toggleCameraSize');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleCameraSize());
    }

    const helpBtn = document.getElementById('toggleHelp');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => this.toggleHelp());
    }

    // Drone kamera üzerinde scroll ile zoom
    const droneCamContainer = document.getElementById('droneCameraContainer');
    if (droneCamContainer) {
      droneCamContainer.addEventListener('wheel', (e) => {
        if (!this.detector) return;
        e.preventDefault();
        if (e.deltaY < 0) {
          this.detector.zoomIn();
        } else {
          this.detector.zoomOut();
        }
      }, { passive: false });
    }

    // BUG-03 FIX: Girdi döngüsü artık ana animate() loop'undan çağrılıyor
    // this._inputLoop(); → kaldırıldı, processInput() dışarıdan çağrılacak
  }

  /**
   * BUG-03 FIX: Her frame'de ana animate() loop'undan çağrılır.
   * Basılı tuşları okuyarak fizik motoruna kontrol girdisi uygular.
   * Artık kendi RAF döngüsü yok — fizikle senkronize çalışır.
   */
  processInput() {
    let pitch = 0;
    let roll = 0;
    let yaw = 0;
    let throttle = 0;

    // ════════════════════════════════════════
    // PITCH (Elevator Kontrolü)
    // W = Burun Aşağı (pitch down) → negatif girdi
    // S = Burun Yukarı (pitch up)  → pozitif girdi
    //
    // Uçak simülasyonu standardı: stick ileri = nose down
    // ════════════════════════════════════════
    if (this.keys['KeyW'] || this.keys['ArrowUp'])   pitch = -1;  // Pitch DOWN
    if (this.keys['KeyS'] || this.keys['ArrowDown']) pitch = 1;   // Pitch UP

    // ════════════════════════════════════════
    // ROLL (Aileron Kontrolü)
    // A = Sol Kanat Aşağı (roll left)  → negatif girdi
    // D = Sağ Kanat Aşağı (roll right) → pozitif girdi
    // ════════════════════════════════════════
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  roll = -1;  // Roll LEFT
    if (this.keys['KeyD'] || this.keys['ArrowRight']) roll = 1;   // Roll RIGHT

    // ════════════════════════════════════════
    // YAW (Rudder / Kuyruk Dümeni)
    // Q = Sola Sapma (yaw left)  → negatif girdi
    // E = Sağa Sapma (yaw right) → pozitif girdi
    // ════════════════════════════════════════
    if (this.keys['KeyQ']) yaw = -1;   // Yaw LEFT
    if (this.keys['KeyE']) yaw = 1;    // Yaw RIGHT

    // ════════════════════════════════════════
    // THROTTLE (Motor Gaz Kontrolü)
    // Left Shift = Gaz Artır → pozitif girdi
    // Left Ctrl  = Gaz Azalt → negatif girdi
    // ════════════════════════════════════════
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) throttle = 1;   // Throttle UP
    if (this.keys['ControlLeft'])                          throttle = -1;  // Throttle DOWN

    // Fizik motoruna girdileri uygula
    // setInput() fonksiyonu deadzone ve exponential curve uygular
    this.physics.setInput(pitch, roll, yaw, throttle);
  }

  /**
   * Drone kamera boyutunu değiştirir (PiP ↔ Tam Ekran)
   */
  toggleCameraSize() {
    const container = document.getElementById('droneCameraContainer');
    if (!container) return;

    if (container.classList.contains('pip')) {
      container.classList.remove('pip');
      container.classList.add('fullscreen');
    } else {
      container.classList.remove('fullscreen');
      container.classList.add('pip');
    }

    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  /**
   * Yardım panelini göster/gizle
   */
  toggleHelp() {
    const panel = document.getElementById('helpPanel');
    if (panel) {
      panel.classList.toggle('hidden');
    }
  }

  /**
   * Kısa bildirim göster (drag chute, gear vb.)
   */
  _showNotification(title, color, detail) {
    // Mevcut bildirimi kaldır
    const existing = document.querySelector('.controls-notification');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = 'controls-notification';
    badge.innerHTML = `<strong>${title}</strong>${detail ? `<br><small>${detail}</small>` : ''}`;
    badge.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 20, 40, 0.92);
      border: 2px solid ${color};
      color: ${color};
      padding: 14px 28px;
      border-radius: 10px;
      font-family: 'Orbitron', 'Consolas', monospace;
      font-size: 16px;
      text-align: center;
      z-index: 9999;
      pointer-events: none;
      text-shadow: 0 0 10px ${color};
      box-shadow: 0 0 20px ${color}44;
      animation: fadeOut 1.8s forwards;
    `;
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 1800);
  }
}
