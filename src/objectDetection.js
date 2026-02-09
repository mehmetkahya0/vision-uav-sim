/**
 * ═══════════════════════════════════════════════════════════════════
 * AI OBJECT DETECTION SİSTEMİ
 * TensorFlow.js + COCO-SSD (CDN)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Drone FPV kamerasından gerçek zamanlı nesne tespiti.
 * TensorFlow.js + COCO-SSD ile tarayıcıda çalışır (WebGL backend).
 * Model otomatik olarak CDN'den yüklenir - dosya indirmeye gerek yok.
 *
 * Kısayol: B tuşu ile aç/kapat
 */

// ── Türkçe Sınıf İsimleri (COCO-SSD çıktısı → Türkçe) ──
const CLASS_NAME_TR = {
  'person': 'İnsan',
  'bicycle': 'Bisiklet',
  'car': 'Araba',
  'motorcycle': 'Motosiklet',
  'airplane': 'Uçak',
  'bus': 'Otobüs',
  'train': 'Tren',
  'truck': 'Kamyon',
  'boat': 'Tekne',
  'traffic light': 'Trafik Lamba',
  'fire hydrant': 'Yangın Musluğu',
  'stop sign': 'Dur Tabelası',
  'parking meter': 'Parkmetre',
  'bench': 'Bank',
  'bird': 'Kuş',
  'cat': 'Kedi',
  'dog': 'Köpek',
  'horse': 'At',
  'sheep': 'Koyun',
  'cow': 'İnek',
  'elephant': 'Fil',
  'bear': 'Ayı',
  'zebra': 'Zebra',
  'giraffe': 'Zürafa',
  'backpack': 'Sırt Çantası',
  'umbrella': 'Şemsiye',
  'handbag': 'El Çantası',
  'tie': 'Kravat',
  'suitcase': 'Valiz',
  'frisbee': 'Frizbi',
  'skis': 'Kayak',
  'snowboard': 'Snowboard',
  'sports ball': 'Top',
  'kite': 'Uçurtma',
  'baseball bat': 'Beyzbol Sopası',
  'baseball glove': 'Beyzbol Eldiveni',
  'skateboard': 'Kaykay',
  'surfboard': 'Sörf Tahtası',
  'tennis racket': 'Tenis Raketi',
  'bottle': 'Şişe',
  'wine glass': 'Kadeh',
  'cup': 'Bardak',
  'fork': 'Çatal',
  'knife': 'Bıçak',
  'spoon': 'Kaşık',
  'bowl': 'Kase',
  'banana': 'Muz',
  'apple': 'Elma',
  'sandwich': 'Sandviç',
  'orange': 'Portakal',
  'broccoli': 'Brokoli',
  'carrot': 'Havuç',
  'hot dog': 'Sosisli',
  'pizza': 'Pizza',
  'donut': 'Donut',
  'cake': 'Pasta',
  'chair': 'Sandalye',
  'couch': 'Kanepe',
  'potted plant': 'Saksı Bitkisi',
  'bed': 'Yatak',
  'dining table': 'Masa',
  'toilet': 'Tuvalet',
  'tv': 'TV',
  'laptop': 'Laptop',
  'mouse': 'Mouse',
  'remote': 'Kumanda',
  'keyboard': 'Klavye',
  'cell phone': 'Telefon',
  'microwave': 'Mikrodalga',
  'oven': 'Fırın',
  'toaster': 'Tost Makine',
  'sink': 'Lavabo',
  'refrigerator': 'Buzdolabı',
  'book': 'Kitap',
  'clock': 'Saat',
  'vase': 'Vazo',
  'scissors': 'Makas',
  'teddy bear': 'Oyuncak Ayı',
  'hair drier': 'Saç Kurutucu',
  'toothbrush': 'Diş Fırçası',
};

/**
 * Sınıf adından benzersiz renk üret
 */
function getClassColor(className) {
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 85%, 55%)`;
}

// ═══════════════════════════════════════════════════════════════════
// ANA SINIF
// ═══════════════════════════════════════════════════════════════════

export class ObjectDetector {
  constructor() {
    this.model = null;
    this.isLoading = false;
    this.isReady = false;
    this.isEnabled = false;
    this.isRunning = false;

    // ── Model Ayarları ──
    this.confThreshold = 0.25;
    this.maxDetections = 50;

    // ── Tespit Sonuçları (frame'ler arası korunur) ──
    this.detections = [];
    this.lastInferenceTime = 0;
    this.inferenceMs = 0;
    this.detFps = 0;
    this.detFrameCount = 0;
    this.fpsTimer = performance.now();
    this.totalDetections = 0;

    // ── UI Elemanları ──
    this.statusEl = document.getElementById('detectionStatus');
    this.detCountEl = document.getElementById('detectionCount');
    this.detPanelEl = document.getElementById('detectionPanel');
    this.aiBadgeEl = document.getElementById('aiStatusBadge');
    this.detConfEl = document.getElementById('detConfidence');

    // Animasyon durumu
    this._scanLineOffset = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // MODEL YÜKLEME
  // ═══════════════════════════════════════════════════════════════

  async loadModel() {
    if (this.isLoading || this.isReady) return;

    this.isLoading = true;
    this._updateStatus('MODEL YÜKLENİYOR...', '#ffaa00');
    this._showPanel(true);

    try {
      const cocoSsd = window.cocoSsd;
      if (!cocoSsd) {
        throw new Error('COCO-SSD kütüphanesi yüklenmedi');
      }

      console.log('🤖 COCO-SSD modeli yükleniyor (CDN)...');
      const startLoad = performance.now();

      // COCO-SSD modeli CDN'den otomatik yüklenir
      // 'lite_mobilenet_v2' → hızlı ve hafif (tarayıcı dostu)
      this.model = await cocoSsd.load({
        base: 'lite_mobilenet_v2',
      });

      const loadTime = ((performance.now() - startLoad) / 1000).toFixed(1);

      this.isReady = true;
      this.isLoading = false;
      this._updateStatus('AI AKTİF', '#00ff88');
      this._updateBadge(true);
      console.log(`✅ COCO-SSD modeli yüklendi! (${loadTime}s)`);
      console.log('📊 Backend:', tf.getBackend());
    } catch (error) {
      this.isLoading = false;
      console.error('❌ Model yüklenemedi:', error);
      this._updateStatus('HATA', '#ff3344');
      this._updateBadge(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // AÇ / KAPAT
  // ═══════════════════════════════════════════════════════════════

  toggle() {
    if (!this.isReady && !this.isLoading) {
      // İlk açılışta modeli yükle
      this.isEnabled = true;
      this._showPanel(true);
      this.loadModel();
      return;
    }

    this.isEnabled = !this.isEnabled;

    if (this.isEnabled) {
      this._updateStatus('AI AKTİF', '#00ff88');
      this._updateBadge(true);
      this._showPanel(true);
    } else {
      this.detections = [];
      this._updateStatus('AI KAPALI', '#666');
      this._updateBadge(false);
      this._showPanel(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TESPIT ÇALIŞTIR
  // ═══════════════════════════════════════════════════════════════

  async detect(sourceCanvas) {
    if (!this.isReady || !this.isEnabled || this.isRunning) return;
    if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0)
      return;

    this.isRunning = true;
    const t0 = performance.now();

    try {
      // COCO-SSD doğrudan canvas / image / video kabul eder
      const predictions = await this.model.detect(
        sourceCanvas,
        this.maxDetections,
        this.confThreshold
      );

      // Sonuçları iç formata dönüştür
      this.detections = predictions.map((pred) => {
        const [x, y, w, h] = pred.bbox;
        const color = getClassColor(pred.class);
        return {
          x1: x,
          y1: y,
          x2: x + w,
          y2: y + h,
          score: pred.score,
          className: pred.class,
          classNameTr: CLASS_NAME_TR[pred.class] || pred.class,
          color: color,
        };
      });

      // İstatistik
      this.inferenceMs = performance.now() - t0;
      this.detFrameCount++;
      this.totalDetections += this.detections.length;

      const now = performance.now();
      if (now - this.fpsTimer >= 1000) {
        this.detFps = this.detFrameCount;
        this.detFrameCount = 0;
        this.fpsTimer = now;
      }
    } catch (err) {
      console.error('Detection hatası:', err);
    }

    this.isRunning = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // ÇİZİM - BOUNDING BOX OVERLAY
  // Taktik görünümlü askeri HUD stili
  // ═══════════════════════════════════════════════════════════════

  drawDetections(ctx, canvasWidth, canvasHeight) {
    if (!this.isEnabled) return;

    ctx.save();

    // Tarama çizgisi animasyonu
    this._scanLineOffset = (this._scanLineOffset + 1.5) % canvasHeight;

    // Scan line (askeri radar efekti)
    const gradient = ctx.createLinearGradient(
      0, this._scanLineOffset - 40,
      0, this._scanLineOffset + 2
    );
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0)');
    gradient.addColorStop(0.7, 'rgba(0, 255, 136, 0.04)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, Math.max(0, this._scanLineOffset - 40), canvasWidth, 42);

    // Her tespit için bounding box çiz
    for (const det of this.detections) {
      this._drawSingleDetection(ctx, det);
    }

    // İstatistik paneli (canvas üzerinde)
    this._drawStatsOverlay(ctx, canvasWidth, canvasHeight);

    ctx.restore();
  }

  /**
   * Tek bir tespit kutusu çiz (taktik stil)
   */
  _drawSingleDetection(ctx, det) {
    const { x1, y1, x2, y2, score, classNameTr, color } = det;
    const w = x2 - x1;
    const h = y2 - y1;
    const cornerLen = Math.min(w, h) * 0.25;

    // ── Ana kutu (ince çizgi) ──
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(x1, y1, w, h);

    // ── Köşe vurguları (kalın, taktik) ──
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = color;

    // Sol üst
    ctx.beginPath();
    ctx.moveTo(x1, y1 + cornerLen);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + cornerLen, y1);
    ctx.stroke();

    // Sağ üst
    ctx.beginPath();
    ctx.moveTo(x2 - cornerLen, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo(x2, y1 + cornerLen);
    ctx.stroke();

    // Sol alt
    ctx.beginPath();
    ctx.moveTo(x1, y2 - cornerLen);
    ctx.lineTo(x1, y2);
    ctx.lineTo(x1 + cornerLen, y2);
    ctx.stroke();

    // Sağ alt
    ctx.beginPath();
    ctx.moveTo(x2 - cornerLen, y2);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 - cornerLen);
    ctx.stroke();

    // ── Label (sınıf + skor) ──
    const label = `${classNameTr} ${(score * 100).toFixed(0)}%`;
    ctx.font = 'bold 11px Consolas, monospace';
    const metrics = ctx.measureText(label);
    const labelW = metrics.width + 12;
    const labelH = 18;
    const labelX = x1;
    const labelY = y1 - labelH > 2 ? y1 - labelH : y1;

    // Label arka planı
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(labelX, labelY, labelW, labelH);

    // Label yazısı
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000';
    ctx.fillText(label, labelX + 6, labelY + 13);

    // ── Hedef merkez noktası (crosshair) ──
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    // Küçük artı işareti
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    // Mesafe çemberi
    const radius = Math.min(w, h) * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
  }

  /**
   * Canvas üzerinde istatistik göster
   */
  _drawStatsOverlay(ctx, canvasWidth, canvasHeight) {
    const padding = 8;
    const boxW = 165;
    const boxH = 78;
    const x = canvasWidth - boxW - padding;
    const y = 32;

    // Arka plan
    ctx.fillStyle = 'rgba(0, 5, 15, 0.75)';
    ctx.fillRect(x, y, boxW, boxH);

    // Kenarlık
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, boxW, boxH);

    // Başlık
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('◉ AI DETECTION', x + 8, y + 15);

    // İstatistikler
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(`OBJECTS : ${this.detections.length}`, x + 8, y + 32);
    ctx.fillText(`LATENCY : ${this.inferenceMs.toFixed(0)} ms`, x + 8, y + 47);
    ctx.fillText(`DET FPS : ${this.detFps}`, x + 8, y + 62);

    // Confidence bar (en yüksek skor)
    if (this.detections.length > 0) {
      const topScore = this.detections[0].score;
      const barW = 60;
      const barH = 4;
      const barX = x + boxW - barW - 8;
      const barY = y + boxH - 12;

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(barX, barY, barW * topScore, barH);
    }

    // Tespit sayısı güncelle (DOM)
    if (this.detCountEl) {
      this.detCountEl.textContent = this.detections.length;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UI YARDIMCILARI
  // ═══════════════════════════════════════════════════════════════

  _updateStatus(text, color) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.style.color = color || '#00d4ff';
    }
  }

  /**
   * Drone cam üzerindeki AI badge güncelle
   */
  _updateBadge(active) {
    if (this.aiBadgeEl) {
      if (active) {
        this.aiBadgeEl.textContent = 'AI ON';
        this.aiBadgeEl.classList.remove('ai-off');
        this.aiBadgeEl.classList.add('ai-on');
      } else {
        this.aiBadgeEl.textContent = 'AI OFF';
        this.aiBadgeEl.classList.remove('ai-on');
        this.aiBadgeEl.classList.add('ai-off');
      }
    }
  }

  _showPanel(show) {
    if (this.detPanelEl) {
      if (show) {
        this.detPanelEl.classList.remove('hidden');
      } else {
        this.detPanelEl.classList.add('hidden');
      }
    }
  }

  /**
   * Confidence threshold ayarla
   */
  setConfidence(value) {
    this.confThreshold = Math.max(0.05, Math.min(0.95, value));
    console.log(`🎯 Confidence threshold: ${(this.confThreshold * 100).toFixed(0)}%`);
    if (this.detConfEl) {
      this.detConfEl.textContent = `CONF: ${(this.confThreshold * 100).toFixed(0)}%`;
    }
  }

  /**
   * Kaynakları temizle
   */
  dispose() {
    if (this.model) {
      this.model = null;
    }
    this.isReady = false;
    this.isEnabled = false;
    this.detections = [];
  }
}
