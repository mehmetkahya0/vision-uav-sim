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
  constructor(physics) {
    this.physics = physics;
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

      // Yardım paneli
      if (e.code === 'Slash' && e.shiftKey) {
        this.toggleHelp();
      }

      // Tarayıcı varsayılanlarını engelle (kaydırma, zoom vs.)
      if ([
        'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'ControlLeft', 'ShiftLeft', 'ShiftRight'
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

    // Sürekli girdi döngüsünü başlat
    this._inputLoop();
  }

  /**
   * Her frame'de çağrılır.
   * Basılı tuşları okuyarak fizik motoruna kontrol girdisi uygular.
   */
  _inputLoop() {
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

    requestAnimationFrame(() => this._inputLoop());
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
}
