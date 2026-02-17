/**
 * ═══════════════════════════════════════════════════════════════════
 * AudioManager — UAV Ses Yöneticisi (v3 — Loop-Safe)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Sorun: engine.wav gibi uzun kayıtlarda başlangıç "spool-up" sesi var.
 * Loop yeniden başladığında o spool-up tekrar duyuluyor.
 *
 * Çözüm: loopStart / loopEnd ile yalnızca kararlı (steady-state)
 * bölge loop ediliyor, başlangıç introsu atlanıyor.
 *
 * Dosyalar: /sounds/engine.wav, wind.mp3, crash.wav,
 *           stall-warning.mp3, altitude-warning.mp3
 */

// ── Her ses katmanının loop konfigürasyonu ──
// skipIntro : kaydın başındaki intro/spool-up atlanacak saniye
// trimEnd   : kaydın sonundan kesilecek saniye (sessizlik / kapanma)
const LAYER_CONFIG = {
  engine: {
    url: `${import.meta.env.BASE_URL}sounds/engine.wav`,
    skipIntro: 5.0,   // ilk 5 sn startup ses → loop'tan atla
    trimEnd:   3.0,   // son 3 sn shutdown/fade → loop'tan atla
    initGain:  0.06,
    initRate:  0.35,
  },
  wind: {
    url: `${import.meta.env.BASE_URL}sounds/wind.mp3`,
    skipIntro: 1.0,   // ilk 1 sn fade-in → atla
    trimEnd:   1.0,   // son 1 sn fade-out → atla
    initGain:  0.00,
    initRate:  0.65,
  },
  stall: {
    url: `${import.meta.env.BASE_URL}sounds/stall-warning.mp3`,
    skipIntro: 0,
    trimEnd:   0,
    initGain:  0.50,
    initRate:  1.15,
  },
  altitude: {
    url: `${import.meta.env.BASE_URL}sounds/altitude-warning.mp3`,
    skipIntro: 0,
    trimEnd:   0,
    initGain:  0.40,
    initRate:  1.0,
  },
  crash: {
    url: `${import.meta.env.BASE_URL}sounds/crash.wav`,
    skipIntro: 0,
    trimEnd:   0,
    initGain:  0.80,
    initRate:  1.0,
  },
};

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.masterVolume = 0.65;

    /** Decode edilmiş AudioBuffer'lar */
    this._buffers = {};

    /** Aktif {src, gain} çiftleri */
    this._nodes = {};

    // Durum bayrakları
    this._crashed = false;
    this._prevCrashed = false;
    this._stallActive = false;
    this._altActive = false;

    // Throttle smoothing
    this._curRate = 0.35;
    this._tgtRate = 0.35;
    this._curEngVol = 0.06;
    this._tgtEngVol = 0.06;

    // Wind smoothing
    this._curWindVol = 0;
    this._curWindRate = 0.65;
  }

  /* ═══════════════════════════════════════════════════
     SES DOSYASI YÜKLEME
     ═══════════════════════════════════════════════════ */

  async _load(name, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      this._buffers[name] = await this.ctx.decodeAudioData(ab);
      const dur = this._buffers[name].duration.toFixed(1);
      console.log(`  ✓ ${name} (${(ab.byteLength / 1024).toFixed(0)} KB, ${dur}s)`);
    } catch (err) {
      console.warn(`  ✗ ${name}: ${err.message}`);
    }
  }

  async _loadAll() {
    console.log('🔊 Ses dosyaları yükleniyor…');
    const jobs = Object.entries(LAYER_CONFIG).map(([name, cfg]) =>
      this._load(name, cfg.url)
    );
    await Promise.all(jobs);
    console.log('🔊 Tüm sesler hazır');
  }

  /* ═══════════════════════════════════════════════════
     AUDIO GRAPH
     ═══════════════════════════════════════════════════ */

  _buildGraph() {
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.12;
    this.comp.connect(this.masterGain);
  }

  /* ═══════════════════════════════════════════════════
     LOOP SOURCE — loopStart / loopEnd ile intro-safe
     ═══════════════════════════════════════════════════

     engine.wav:  [STARTUP 5s | ====STEADY STATE==== | SHUTDOWN 3s]
                               ↑ loopStart           ↑ loopEnd
     Playback her zaman loopStart'tan başlar.
     Loop geri sardığında da loopStart'a döner.
     Böylece startup sesi ASLA tekrarlanmaz.
  */

  _loop(name) {
    this._stop(name);

    const buf = this._buffers[name];
    const cfg = LAYER_CONFIG[name];
    if (!buf || !cfg) return;

    const duration = buf.duration;
    const loopStart = Math.min(cfg.skipIntro, duration * 0.4);
    const loopEnd = Math.max(loopStart + 0.5, duration - cfg.trimEnd);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = loopStart;
    src.loopEnd = loopEnd;
    src.playbackRate.value = cfg.initRate;

    const gain = this.ctx.createGain();
    gain.gain.value = cfg.initGain;

    src.connect(gain);
    gain.connect(this.comp);

    // loopStart noktasından başlat — startup intro'yu atla
    src.start(0, loopStart);

    this._nodes[name] = { src, gain };

    if (cfg.skipIntro > 0) {
      console.log(`  🔁 ${name}: loop ${loopStart.toFixed(1)}s – ${loopEnd.toFixed(1)}s (toplam ${duration.toFixed(1)}s)`);
    }
  }

  /* ═══════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════ */

  async init() {
    if (this.ready) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this._buildGraph();
    await this._loadAll();

    // Sürekli loop'lar
    this._loop('engine');
    this._loop('wind');

    // Crash event dinle
    window.addEventListener('dronecrash', () => this._onCrash());

    this.ready = true;
    console.log('🔊 AudioManager aktif');
  }

  /* ═══════════════════════════════════════════════════
     UPDATE — Her frame
     ═══════════════════════════════════════════════════ */

  update(dt, fd) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    if (this._crashed) return;

    const now = this.ctx.currentTime;
    const lerp = 1 - Math.exp(-8 * dt);

    /* ── 1) MOTOR SESİ ──
       throttle 0%  → rate 0.35  vol 0.06
       throttle 100% → rate 2.20  vol 0.55  */
    const throttle = Math.max(0, Math.min(1, (fd.throttle || 0) / 100));
    const eng = this._nodes.engine;
    if (eng) {
      // FIX-O3: Logaritmik motor pitch — perceptually linear ses değişimi
      // Düşük devirlerde daha hassas, yüksek devirlerde doygun
      // log₂(1+t): t=0→0, t=0.25→0.32, t=0.5→0.58, t=1→1
      const logThrottle = Math.log2(1 + throttle);
      this._tgtRate = 0.35 + 1.85 * logThrottle;
      this._tgtEngVol = 0.06 + 0.49 * logThrottle;

      this._curRate += (this._tgtRate - this._curRate) * lerp;
      this._curEngVol += (this._tgtEngVol - this._curEngVol) * lerp;

      eng.src.playbackRate.setTargetAtTime(this._curRate, now, 0.06);
      eng.gain.gain.setTargetAtTime(this._curEngVol, now, 0.06);
    }

    /* ── 2) RÜZGAR SESİ ──
       0 m/s → vol 0.00, 65 m/s → vol 0.45  */
    const v = fd.airspeed || 0;
    const wnd = this._nodes.wind;
    if (wnd) {
      const tgtWVol = Math.min(0.45, v / 145);
      const tgtWRate = 0.65 + Math.min(v, 70) * 0.015;

      this._curWindVol += (tgtWVol - this._curWindVol) * lerp;
      this._curWindRate += (tgtWRate - this._curWindRate) * lerp;

      wnd.gain.gain.setTargetAtTime(this._curWindVol, now, 0.08);
      wnd.src.playbackRate.setTargetAtTime(this._curWindRate, now, 0.08);
    }

    /* ── 3) STALL UYARISI ── */
    if (fd.isStalling && !this._stallActive) {
      this._stallActive = true;
      this._loop('stall');
    } else if (!fd.isStalling && this._stallActive) {
      this._stallActive = false;
      this._stop('stall', 0.08);
    }

    /* ── 4) ALÇAK İRTİFA UYARISI ── */
    const hat = fd.heightAboveTerrain ?? 9999;
    const altWarn = hat < 50 && hat > 0 && !fd.isGrounded && !fd.isCrashed;
    if (altWarn && !this._altActive) {
      this._altActive = true;
      this._loop('altitude');
    } else if (!altWarn && this._altActive) {
      this._altActive = false;
      this._stop('altitude', 0.08);
    }

    /* ── 5) CRASH TESPİTİ (yedek) ── */
    if (fd.isCrashed && !this._prevCrashed) this._onCrash();
    this._prevCrashed = fd.isCrashed || false;
  }

  /* ═══════════════════════════════════════════════════
     CRASH — Motor dur + crash sesi çal (one-shot, loop yok)
     ═══════════════════════════════════════════════════ */

  _onCrash() {
    if (this._crashed) return;
    this._crashed = true;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Motor devir düşür + sessizleştir
    const eng = this._nodes.engine;
    if (eng) {
      eng.gain.gain.cancelScheduledValues(now);
      eng.gain.gain.setTargetAtTime(0, now, 0.06);
      eng.src.playbackRate.setTargetAtTime(0.15, now, 0.4);
    }

    // Rüzgar kapat
    const wnd = this._nodes.wind;
    if (wnd) wnd.gain.gain.setTargetAtTime(0, now, 0.12);

    // Uyarıları kapat
    this._stop('stall', 0.04);
    this._stop('altitude', 0.04);
    this._stallActive = false;
    this._altActive = false;

    // Crash sesi — ONE-SHOT (loop = false)
    const buf = this._buffers.crash;
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = false; // TEK SEFER çal!

      const g = this.ctx.createGain();
      g.gain.value = 0.80;

      src.connect(g);
      g.connect(this.comp);
      src.start(now);
    }

    console.log('💥 crash');
  }

  /* ═══════════════════════════════════════════════════
     STOP — Fade-out ile source durdur
     ═══════════════════════════════════════════════════ */

  _stop(name, fadeTime = 0.05) {
    const n = this._nodes[name];
    if (!n) return;
    const now = this.ctx.currentTime;
    try {
      n.gain.gain.cancelScheduledValues(now);
      n.gain.gain.setTargetAtTime(0, now, fadeTime);
      n.src.stop(now + fadeTime * 4);
    } catch (_) { /* */ }
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

  /** Crash sonrası reset */
  reset() {
    if (!this.ctx) return;

    for (const name of Object.keys(this._nodes)) {
      try { this._nodes[name].src.stop(); } catch (_) { /* */ }
    }
    this._nodes = {};

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

    this._loop('engine');
    this._loop('wind');
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
