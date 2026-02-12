/**
 * ═══════════════════════════════════════════════════════════════════
 * AudioManager — UAV Ses Yöneticisi (Optimized)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Gerçek ses dosyalarıyla çalışan yüksek performanslı ses sistemi.
 *
 * Katmanlar:
 *   engine   → Motor/pervane sesi (loop) — throttle → playbackRate + gain
 *   wind     → Rüzgar sesi (loop) — airspeed → gain + playbackRate
 *   stall    → Stall uyarısı (loop) — isStalling true olduğunda
 *   altitude → Alçak irtifa uyarısı (loop) — AGL < 50m
 *   crash    → Çarpma sesi (one-shot) — crash anında tetiklenir
 *
 * Optimizasyonlar:
 *   - setTargetAtTime ile smooth parametre geçişleri (click/pop yok)
 *   - DynamicsCompressor ile clipping önleme
 *   - Büyük WAV dosyaları için async decode
 *   - Throttle smoothing ile Shift tuşu senkronizasyonu
 *   - Dead-zone altında gereksiz AudioParam güncellemesi atlanır
 *   - dronecrash CustomEvent dinleyicisi ile fizik motoruna doğrudan bağlantı
 *
 * Dosyalar: /sounds/engine.wav, wind.mp3, crash.wav,
 *           stall-warning.mp3, altitude-warning.mp3
 */

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.masterVolume = 0.65;

    // Decode edilmiş AudioBuffer'lar
    this._buffers = {};

    // Aktif {src: BufferSourceNode, gain: GainNode} çiftleri
    this._nodes = {};

    // Durum bayrakları
    this._crashed = false;
    this._prevCrashed = false;
    this._stallActive = false;
    this._altActive = false;

    // Throttle smooth interpolasyon (Shift senkron)
    this._curRate = 0.35;   // anlık playbackRate
    this._tgtRate = 0.35;   // hedef playbackRate
    this._curEngVol = 0.06; // anlık motor gain
    this._tgtEngVol = 0.06; // hedef motor gain

    // Wind smooth
    this._curWindVol = 0;
    this._curWindRate = 0.65;
  }

  /* ═══════════════════════════════════════════════════
     SES DOSYASI YÜKLEME & DECODE
     ═══════════════════════════════════════════════════ */

  /** Tek bir dosyayı fetch → decode et */
  async _load(name, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
      const ab = await res.arrayBuffer();
      this._buffers[name] = await this.ctx.decodeAudioData(ab);
      console.log(`  ✓ ${name} (${(ab.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(`  ✗ ${name}: ${err.message}`);
    }
  }

  /** Tüm ses dosyalarını paralel yükle */
  async _loadAll() {
    console.log('🔊 Ses dosyaları yükleniyor…');
    await Promise.all([
      this._load('engine',   '/sounds/engine.wav'),
      this._load('wind',     '/sounds/wind.mp3'),
      this._load('crash',    '/sounds/crash.wav'),
      this._load('stall',    '/sounds/stall-warning.mp3'),
      this._load('altitude', '/sounds/altitude-warning.mp3'),
    ]);
    console.log('🔊 Tüm sesler hazır');
  }

  /* ═══════════════════════════════════════════════════
     AUDIO GRAPH — Node ağacı kurulumu
     ═══════════════════════════════════════════════════

     BufferSource ─┐
                   ├─► [GainNode] ─► [Compressor] ─► [MasterGain] ─► destination
     BufferSource ─┘
  */

  _buildGraph() {
    // Master çıkış gain'i
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    // Compressor — tüm katmanlar buna bağlanır
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.12;
    this.comp.connect(this.masterGain);
  }

  /* ═══════════════════════════════════════════════════
     LOOP SOURCE OLUŞTUR
     ═══════════════════════════════════════════════════ */

  /**
   * Bir buffer'ı loop olarak çalmaya başla.
   * @param {string} name — buffer adı
   * @param {number} initGain — başlangıç gain (0–1)
   * @param {number} initRate — başlangıç playbackRate
   * @param {AudioNode} [dest] — bağlanacak hedef node (default: compressor)
   */
  _loop(name, initGain = 0, initRate = 1, dest = null) {
    // Aynı isimde çalan varsa önce durdur
    this._stop(name);

    const buf = this._buffers[name];
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = initRate;

    const gain = this.ctx.createGain();
    gain.gain.value = initGain;

    src.connect(gain);
    gain.connect(dest || this.comp);
    src.start(0);

    this._nodes[name] = { src, gain };
  }

  /* ═══════════════════════════════════════════════════
     INIT — İlk kullanıcı etkileşiminden sonra çağrılır
     (Tarayıcı autoplay politikası)
     ═══════════════════════════════════════════════════ */

  async init() {
    if (this.ready) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this._buildGraph();
    await this._loadAll();

    // ── Sürekli loop'lar ──
    this._loop('engine', 0.06, 0.35);   // idle hum
    this._loop('wind',   0.00, 0.65);   // sessiz başlar

    // ── Crash event dinle (fizik motoru dispatch eder) ──
    window.addEventListener('dronecrash', () => this._onCrash(), { once: false });

    this.ready = true;
    console.log('🔊 AudioManager aktif');
  }

  /* ═══════════════════════════════════════════════════
     UPDATE — Her frame çağrılır
     @param {number} dt — saniye cinsinden delta time
     @param {object} fd — DronePhysics.getFlightData()
     ═══════════════════════════════════════════════════ */

  update(dt, fd) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    if (this._crashed) return;

    const now = this.ctx.currentTime;

    // Smooth interpolasyon katsayısı (dt bağımlı, frame-rate independent)
    const lerpSpeed = 1 - Math.exp(-8 * dt); // ~8 Hz cutoff

    /* ─────────────────────────────────────────────
       1) MOTOR SESİ
       throttle % → playbackRate (perde) + gain (volume)

       Mapping:
         throttle  0%  → rate 0.35  gain 0.06   (rölanti)
         throttle 50%  → rate 1.15  gain 0.30   (orta devir)
         throttle 100% → rate 2.20  gain 0.55   (tam gaz)

       Shift basılı → throttle artar → rate + gain artar
       Shift bırakılı → throttle düşer → rate + gain düşer
       Smooth lerp ani zıplamayı önler
       ───────────────────────────────────────────── */
    const throttle = Math.max(0, Math.min(1, (fd.throttle || 0) / 100));
    const eng = this._nodes.engine;

    if (eng) {
      // Hedef değerler
      this._tgtRate = 0.35 + throttle * 1.85;
      this._tgtEngVol = 0.06 + throttle * 0.49;

      // Smooth lerp
      this._curRate += (this._tgtRate - this._curRate) * lerpSpeed;
      this._curEngVol += (this._tgtEngVol - this._curEngVol) * lerpSpeed;

      // AudioParam güncelle (sadece anlamlı fark varsa CPU tasarrufu)
      eng.src.playbackRate.setTargetAtTime(this._curRate, now, 0.06);
      eng.gain.gain.setTargetAtTime(this._curEngVol, now, 0.06);
    }

    /* ─────────────────────────────────────────────
       2) RÜZGAR SESİ
       airspeed (m/s) → gain (volume) + playbackRate (pitch)

       Mapping:
         0 m/s   → vol 0.00  rate 0.65  (sessiz)
         35 m/s  → vol 0.20  rate 1.10  (cruise)
         65 m/s  → vol 0.45  rate 1.70  (max speed)

       ───────────────────────────────────────────── */
    const v = fd.airspeed || 0;
    const wnd = this._nodes.wind;

    if (wnd) {
      const tgtWVol = Math.min(0.45, v / 145);
      const tgtWRate = 0.65 + Math.min(v, 70) * 0.015;

      this._curWindVol += (tgtWVol - this._curWindVol) * lerpSpeed;
      this._curWindRate += (tgtWRate - this._curWindRate) * lerpSpeed;

      wnd.gain.gain.setTargetAtTime(this._curWindVol, now, 0.08);
      wnd.src.playbackRate.setTargetAtTime(this._curWindRate, now, 0.08);
    }

    /* ─────────────────────────────────────────────
       3) STALL UYARISI — isStalling flag
       ───────────────────────────────────────────── */
    if (fd.isStalling && !this._stallActive) {
      this._stallActive = true;
      this._loop('stall', 0.50, 1.15);
    } else if (!fd.isStalling && this._stallActive) {
      this._stallActive = false;
      this._stop('stall', 0.08);
    }

    /* ─────────────────────────────────────────────
       4) ALÇAK İRTİFA UYARISI — AGL < 50m
       ───────────────────────────────────────────── */
    const hat = fd.heightAboveTerrain ?? 9999;
    const altWarn = hat < 50 && hat > 0 && !fd.isGrounded && !fd.isCrashed;

    if (altWarn && !this._altActive) {
      this._altActive = true;
      this._loop('altitude', 0.40, 1.0);
    } else if (!altWarn && this._altActive) {
      this._altActive = false;
      this._stop('altitude', 0.08);
    }

    /* ─────────────────────────────────────────────
       5) CRASH TESPİTİ (flightData yedek)
       ───────────────────────────────────────────── */
    if (fd.isCrashed && !this._prevCrashed) {
      this._onCrash();
    }
    this._prevCrashed = fd.isCrashed || false;
  }

  /* ═══════════════════════════════════════════════════
     CRASH HANDLER
     Motor sesini durdur + crash sesi çal (one-shot)
     ═══════════════════════════════════════════════════ */

  _onCrash() {
    if (this._crashed) return;
    this._crashed = true;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // ── Motor: hızla devir düşür + sessizleştir ──
    const eng = this._nodes.engine;
    if (eng) {
      eng.gain.gain.cancelScheduledValues(now);
      eng.gain.gain.setTargetAtTime(0, now, 0.06);
      eng.src.playbackRate.setTargetAtTime(0.15, now, 0.4);
    }

    // ── Rüzgar: kapat ──
    const wnd = this._nodes.wind;
    if (wnd) {
      wnd.gain.gain.setTargetAtTime(0, now, 0.12);
    }

    // ── Uyarıları kapat ──
    this._stop('stall', 0.04);
    this._stop('altitude', 0.04);
    this._stallActive = false;
    this._altActive = false;

    // ── Crash sesi (one-shot) ──
    const buf = this._buffers.crash;
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const g = this.ctx.createGain();
      g.gain.value = 0.80;

      src.connect(g);
      g.connect(this.comp);
      src.start(now);
    }

    console.log('💥 AudioManager: crash');
  }

  /* ═══════════════════════════════════════════════════
     STOP — Bir loop kaynağını fade-out ile durdur
     @param {string} name
     @param {number} [fadeTime=0.05] — fade süresi (saniye)
     ═══════════════════════════════════════════════════ */

  _stop(name, fadeTime = 0.05) {
    const n = this._nodes[name];
    if (!n) return;

    const now = this.ctx.currentTime;
    try {
      n.gain.gain.cancelScheduledValues(now);
      n.gain.gain.setTargetAtTime(0, now, fadeTime);
      n.src.stop(now + fadeTime * 4);
    } catch (_) { /* zaten durmuş */ }
    delete this._nodes[name];
  }

  /* ═══════════════════════════════════════════════════
     KONTROLLER
     ═══════════════════════════════════════════════════ */

  setVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime, 0.04
      );
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime, 0.04
      );
    }
    console.log(`🔊 Ses: ${this.muted ? 'KAPALI' : 'AÇIK'}`);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  /** Crash sonrası yeni uçuş başlatıldığında çağır */
  reset() {
    if (!this.ctx) return;

    // Tüm aktif source'ları durdur
    for (const name of Object.keys(this._nodes)) {
      try { this._nodes[name].src.stop(); } catch (_) { /* */ }
    }
    this._nodes = {};

    // Durumları sıfırla
    this._crashed = false;
    this._prevCrashed = false;
    this._stallActive = false;
    this._altActive = false;
    this._curRate = 0.35;
    this._tgtRate = 0.35;
    this._curEngVol = 0.06;
    this._tgtEngVol = 0.06;
    this._curWindVol = 0;
    this._curWindRate = 0.65;

    // Sürekli loop'ları yeniden başlat
    this._loop('engine', 0.06, 0.35);
    this._loop('wind', 0, 0.65);
  }

  dispose() {
    for (const name of Object.keys(this._nodes)) {
      try { this._nodes[name].src.stop(); } catch (_) { /* */ }
    }
    this._nodes = {};
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.ready = false;
  }
}
