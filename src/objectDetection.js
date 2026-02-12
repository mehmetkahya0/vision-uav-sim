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

// ── Tam Liste: Türkçe Sınıf İsimleri (COCO-SSD 80 Sınıf Tam Kapasite) ──
const CLASS_NAME_TR = {
  // Araçlar ve Ulaşım
  'person': 'İnsan',
  'bicycle': 'Bisiklet',
  'car': 'Araba',
  'motorcycle': 'Motosiklet',
  'airplane': 'Uçak',
  'bus': 'Otobüs',
  'train': 'Tren',
  'truck': 'Kamyon',
  'boat': 'Tekne',
  
  // Sokak ve Dış Mekan
  'traffic light': 'Trafik Lambası',
  'fire hydrant': 'Yangın Musluğu',
  'stop sign': 'Dur Tabelası',
  'parking meter': 'Parkmetre',
  'bench': 'Bank',
  
  // Hayvanlar
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
  
  // Kişisel Eşyalar
  'backpack': 'Sırt Çantası',
  'umbrella': 'Şemsiye',
  'handbag': 'El Çantası',
  'tie': 'Kravat',
  'suitcase': 'Valiz',
  
  // Spor ve Hobi
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
  
  // Mutfak ve Ev Gereçleri
  'bottle': 'Şişe',
  'wine glass': 'Kadeh',
  'cup': 'Bardak',
  'fork': 'Çatal',
  'knife': 'Bıçak',
  'spoon': 'Kaşık',
  'bowl': 'Kase',
  
  // Yiyecekler
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
  
  // Mobilya ve İç Mekan
  'chair': 'Sandalye',
  'couch': 'Kanepe',
  'potted plant': 'Saksı Bitkisi',
  'bed': 'Yatak',
  'dining table': 'Masa',
  'toilet': 'Tuvalet',
  
  // Elektronik
  'tv': 'Televizyon',
  'laptop': 'Dizüstü Bilgisayar',
  'mouse': 'Fare',
  'remote': 'Kumanda',
  'keyboard': 'Klavye',
  'cell phone': 'Telefon',
  
  // Beyaz Eşya
  'microwave': 'Mikrodalga',
  'oven': 'Fırın',
  'toaster': 'Tost Makinesi',
  'sink': 'Lavabo',
  'refrigerator': 'Buzdolabı',
  
  // Diğer Objeler
  'book': 'Kitap',
  'clock': 'Saat',
  'vase': 'Vazo',
  'scissors': 'Makas',
  'teddy bear': 'Oyuncak Ayı',
  'hair drier': 'Saç Kurutucu',
  'toothbrush': 'Diş Fırçası'
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
    this._smoothedDetections = []; // Smooth interpolation
    this.lastInferenceTime = 0;
    this.inferenceMs = 0;
    this.detFps = 0;
    this.detFrameCount = 0;
    this.fpsTimer = performance.now();
    this.totalDetections = 0;
    this._trackingId = 0;

    // ── Zoom Sistemi ──
    this.zoomLevel = 1.0;
    this.minZoom = 1.0;
    this.maxZoom = 8.0;
    this.zoomStep = 0.5;
    this._targetZoom = 1.0;
    this._currentZoom = 1.0; // Smooth zoom

    // ── Freeze (Görüntü Dondurma) Sistemi ──
    this.isFrozen = false;
    this.freezeStartTime = 0;
    this.freezeDuration = 5000; // 5 saniye
    this.frozenCanvas = null;
    this.frozenDetections = [];

    // ── Distance Estimation (Mesafe Tahmini) ──
    this.cameraFOV = 75; // Drone kamera FOV (derece)
    this.enableDistance = true;
    this.closestDetection = null; // En yakın nesne
    this.avgDistance = 0;

    // ── UI Elemanları ──
    this.statusEl = document.getElementById('detectionStatus');
    this.detCountEl = document.getElementById('detectionCount');
    this.detPanelEl = document.getElementById('detectionPanel');
    this.aiBadgeEl = document.getElementById('aiStatusBadge');
    this.detConfEl = document.getElementById('detConfidence');
    this.detClosestDistEl = document.getElementById('detClosestDistance');

    // Animasyon durumu
    this._scanLineOffset = 0;
    this._lastScanTime = performance.now(); // BUG-13 FIX: delta-time tabanlı animasyon

    // BUG-08 FIX: Zoom için yeniden kullanılabilir canvas (GC baskısını önle)
    this._zoomCanvas = document.createElement('canvas');
    this._zoomCtx = this._zoomCanvas.getContext('2d');
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
      this._smoothedDetections = [];
      this._updateStatus('AI KAPALI', '#666');
      this._updateBadge(false);
      this._showPanel(false);
      // Freeze varsa iptal et
      if (this.isFrozen) this._unfreeze();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ZOOM SİSTEMİ
  // ═══════════════════════════════════════════════════════════════

  zoomIn() {
    this._targetZoom = Math.min(this.maxZoom, this._targetZoom + this.zoomStep);
    this.zoomLevel = this._targetZoom;
    console.log(`🔍 Zoom: ${this.zoomLevel.toFixed(1)}x`);
  }

  zoomOut() {
    this._targetZoom = Math.max(this.minZoom, this._targetZoom - this.zoomStep);
    this.zoomLevel = this._targetZoom;
    console.log(`🔍 Zoom: ${this.zoomLevel.toFixed(1)}x`);
  }

  resetZoom() {
    this._targetZoom = 1.0;
    this.zoomLevel = 1.0;
    this._currentZoom = 1.0;
    console.log('🔍 Zoom sıfırlandı');
  }

  /**
   * Zoom uygulanmış canvas çizimi.
   * sourceCanvas'tan ortalanmış crop alır ve hedef canvas'a çizer.
   */
  applyZoom(sourceCanvas, ctx, canvasWidth, canvasHeight) {
    // Smooth zoom interpolation
    this._currentZoom += (this._targetZoom - this._currentZoom) * 0.15;
    if (Math.abs(this._currentZoom - this._targetZoom) < 0.01) {
      this._currentZoom = this._targetZoom;
    }

    const zoom = this._currentZoom;
    if (zoom <= 1.01) return false; // No zoom applied

    const sw = sourceCanvas.width / zoom;
    const sh = sourceCanvas.height / zoom;
    const sx = (sourceCanvas.width - sw) / 2;
    const sy = (sourceCanvas.height - sh) / 2;

    // BUG-08 FIX: Önceden oluşturulmuş canvas'ı yeniden kullan
    if (this._zoomCanvas.width !== canvasWidth || this._zoomCanvas.height !== canvasHeight) {
      this._zoomCanvas.width = canvasWidth;
      this._zoomCanvas.height = canvasHeight;
    }
    this._zoomCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    this._zoomCtx.drawImage(sourceCanvas, 0, 0);

    // Temizle ve zoom uygulanmış halini çiz
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this._zoomCanvas, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);

    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // FREEZE (GÖRÜNTÜ DONDURMA) SİSTEMİ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Mevcut drone kamera frame'ini 5 saniye dondur.
   * Detection sonuçları da korunur.
   */
  toggleFreeze(sourceCanvas) {
    if (this.isFrozen) {
      this._unfreeze();
      return;
    }
    if (!sourceCanvas || sourceCanvas.width === 0) return;

    this.isFrozen = true;
    this.freezeStartTime = performance.now();

    // Canvas'ı kopyala
    this.frozenCanvas = document.createElement('canvas');
    this.frozenCanvas.width = sourceCanvas.width;
    this.frozenCanvas.height = sourceCanvas.height;
    const fCtx = this.frozenCanvas.getContext('2d');
    fCtx.drawImage(sourceCanvas, 0, 0);

    // Mevcut tespitleri sakla
    this.frozenDetections = [...this.detections];

    this._updateStatus('FROZEN ⏸', '#ff9900');
    this._updateBadge(true, true); // frozen mode
    console.log('❄️ Görüntü donduruldu (5s)');
  }

  _unfreeze() {
    this.isFrozen = false;
    this.frozenCanvas = null;
    this.frozenDetections = [];
    if (this.isEnabled) {
      this._updateStatus('AI AKTİF', '#00ff88');
      this._updateBadge(true, false);
    }
    console.log('▶️ Görüntü devam ediyor');
  }

  /**
   * Frozen frame'i canvas'a çiz. Süre biterse otomatik unfreeze.
   * @returns {boolean} true = hâlâ frozen
   */
  drawFrozenFrame(ctx, canvasWidth, canvasHeight) {
    if (!this.isFrozen || !this.frozenCanvas) return false;

    const elapsed = performance.now() - this.freezeStartTime;
    if (elapsed >= this.freezeDuration) {
      this._unfreeze();
      return false;
    }

    // Frozen frame'i çiz
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(this.frozenCanvas, 0, 0, canvasWidth, canvasHeight);

    // Detections'ı frozen frame üzerinde çiz
    const origDetections = this.detections;
    this.detections = this.frozenDetections;
    this.drawDetections(ctx, canvasWidth, canvasHeight);
    this.detections = origDetections;

    // ── Freeze Overlay UI ──
    const remaining = Math.ceil((this.freezeDuration - elapsed) / 1000);
    const progress = elapsed / this.freezeDuration;

    // Üst bar - FROZEN yazısı
    ctx.fillStyle = 'rgba(255, 153, 0, 0.15)';
    ctx.fillRect(0, 0, canvasWidth, 36);

    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillStyle = '#ff9900';
    ctx.textAlign = 'center';
    ctx.fillText(`❄ FROZEN — ${remaining}s`, canvasWidth / 2, 23);
    ctx.textAlign = 'left';

    // Progress bar (alt)
    const barH = 4;
    const barY = canvasHeight - barH;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, barY, canvasWidth, barH);
    ctx.fillStyle = '#ff9900';
    ctx.fillRect(0, barY, canvasWidth * (1 - progress), barH);

    // Kenarlık parlaması
    ctx.strokeStyle = 'rgba(255, 153, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);

    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // TESPIT ÇALIŞTIR
  // ═══════════════════════════════════════════════════════════════

  async detect(sourceCanvas, physics = null) {
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

      // Sonuçları iç formata dönüştür + tracking
      const newDetections = predictions.map((pred) => {
        const [x, y, w, h] = pred.bbox;
        const color = getClassColor(pred.class);
        // Basit tracking: önceki frame'de aynı sınıfta en yakın kutuyu bul
        const trackId = this._matchTrack(x, y, x + w, y + h, pred.class);
        
        // Mesafe hesapla (physics datası varsa)
        let distance = null;
        if (physics && this.enableDistance) {
          distance = this._calculateDistance(
            x + w / 2,
            y + h / 2,
            h,
            sourceCanvas.width,
            sourceCanvas.height,
            physics
          );
        }

        return {
          x1: x,
          y1: y,
          x2: x + w,
          y2: y + h,
          score: pred.score,
          className: pred.class,
          classNameTr: CLASS_NAME_TR[pred.class] || pred.class,
          color: color,
          trackId: trackId,
          distance: distance,
        };
      });

      // Smooth interpolation (bounding box titreşimi azaltma)
      this.detections = this._interpolateDetections(newDetections);

      // En yakın nesneyi bul
      this._findClosestDetection();

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

  /**
   * Basit IoU tabanlı tracking: önceki frame'deki en yakın kutuyu eşleştir
   */
  _matchTrack(x1, y1, x2, y2, className) {
    let bestId = ++this._trackingId;
    // BUG-07 FIX: Track ID taşmasını önle
    if (this._trackingId > 100000) this._trackingId = 0;
    let bestIoU = 0.3; // min IoU eşiği

    for (const prev of this._smoothedDetections) {
      if (prev.className !== className) continue;
      const iou = this._calcIoU(x1, y1, x2, y2, prev.x1, prev.y1, prev.x2, prev.y2);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestId = prev.trackId;
      }
    }
    return bestId;
  }

  _calcIoU(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const ix1 = Math.max(ax1, bx1);
    const iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2);
    const iy2 = Math.min(ay2, by2);
    if (ix2 <= ix1 || iy2 <= iy1) return 0;
    const inter = (ix2 - ix1) * (iy2 - iy1);
    const areaA = (ax2 - ax1) * (ay2 - ay1);
    const areaB = (bx2 - bx1) * (by2 - by1);
    return inter / (areaA + areaB - inter);
  }

  /**
   * Bounding box smooth interpolation — titreşimi azaltır
   */
  _interpolateDetections(newDets) {
    const alpha = 0.4; // 0=tamamen eski, 1=tamamen yeni
    return newDets.map((nd) => {
      const prev = this._smoothedDetections.find(
        (sd) => sd.trackId === nd.trackId
      );
      if (prev) {
        return {
          ...nd,
          x1: prev.x1 + (nd.x1 - prev.x1) * alpha,
          y1: prev.y1 + (nd.y1 - prev.y1) * alpha,
          x2: prev.x2 + (nd.x2 - prev.x2) * alpha,
          y2: prev.y2 + (nd.y2 - prev.y2) * alpha,
        };
      }
      return nd;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // MESAFE TAHMİNİ (DISTANCE ESTIMATION)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Nesneye yaklaşık mesafe hesapla.
   * Yöntem: Drone altitude + camera pitch + FOV + bounding box pozisyonu
   * 
   * @param {number} cx - Bounding box merkez X (pixel)
   * @param {number} cy - Bounding box merkez Y (pixel)
   * @param {number} boxHeight - Bounding box yüksekliği (pixel)
   * @param {number} canvasWidth - Canvas genişliği
   * @param {number} canvasHeight - Canvas yüksekliği
   * @param {object} physics - { height: altitude(m), pitch: pitch(deg), cameraPitch: cameraPitch(deg) }
   * @returns {number} Mesafe (metre)
   */
  _calculateDistance(cx, cy, boxHeight, canvasWidth, canvasHeight, physics) {
    const altitude = physics.height; // Drone yüksekliği (metre)
    const cameraPitchDeg = physics.cameraPitch; // Kamera pitch açısı (derece, genelde -45)
    const dronePitchDeg = physics.pitch || 0; // Drone pitch (derece)

    // Total pitch = drone pitch + camera pitch
    const totalPitchDeg = dronePitchDeg + cameraPitchDeg;
    const totalPitchRad = (totalPitchDeg * Math.PI) / 180;

    // FIX-O4: Zoom aktifken efektif FOV daralır → mesafe doğruluğu artar
    const effectiveFOV = this.cameraFOV / (this._currentZoom || 1.0);
    const verticalFOVRad = (effectiveFOV * Math.PI) / 180;

    // Bounding box merkezinin canvas içindeki normalize Y pozisyonu
    // 0 = en üst, 1 = en alt
    const normalizedY = cy / canvasHeight;

    // Canvas'ın ortasından olan ofset açısı
    // normalizedY=0.5 → ofset=0 (merkez)
    // normalizedY=1.0 → ofset=verticalFOV/2 (alt)
    // normalizedY=0.0 → ofset=-verticalFOV/2 (üst)
    const yOffsetRad = (normalizedY - 0.5) * verticalFOVRad;

    // Ray açısı (horizon'dan aşağı doğru pozitif)
    const rayAngleRad = totalPitchRad + yOffsetRad;

    // Zemine olan mesafe hesapla
    // distance = altitude / tan(|rayAngle|)
    // Eğer ray horizon'un üstündeyse (pozitif pitch), mesafe çok büyük
    const tanAngle = Math.tan(Math.abs(rayAngleRad));
    if (tanAngle < 0.01) {
      // Neredeyse yatay, çok uzak
      return 9999;
    }

    const groundDistance = altitude / tanAngle;

    // Zoom faktörünü hesaba kat (zoom yaparken mesafe değişmez)
    const zoom = this._currentZoom || 1.0;

    // Basitleştirilmiş slant range (direkt mesafe)
    // slantRange = sqrt(groundDistance^2 + altitude^2)
    const slantRange = Math.sqrt(
      groundDistance * groundDistance + altitude * altitude
    );

    return Math.round(slantRange);
  }

  /**
   * En yakın nesneyi bul ve işaretle
   */
  _findClosestDetection() {
    this.closestDetection = null;
    let minDist = Infinity;
    let totalDist = 0;
    let count = 0;

    for (const det of this.detections) {
      if (det.distance && det.distance < 9999) {
        totalDist += det.distance;
        count++;
        if (det.distance < minDist) {
          minDist = det.distance;
          this.closestDetection = det;
        }
      }
    }

    this.avgDistance = count > 0 ? Math.round(totalDist / count) : 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // ÇİZİM - BOUNDING BOX OVERLAY
  // Taktik görünümlü askeri HUD stili
  // ═══════════════════════════════════════════════════════════════

  drawDetections(ctx, canvasWidth, canvasHeight) {
    if (!this.isEnabled) return;

    ctx.save();

    // BUG-13 FIX: Delta-time tabanlı tarama çizgisi animasyonu
    const nowScan = performance.now();
    const dtScan = (nowScan - this._lastScanTime) / 1000;
    this._lastScanTime = nowScan;
    this._scanLineOffset = (this._scanLineOffset + 90 * dtScan) % canvasHeight;

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

    // Smooth detections güncelle (sonraki frame interpolation için)
    this._smoothedDetections = [...this.detections];

    // İstatistik paneli (canvas üzerinde)
    this._drawStatsOverlay(ctx, canvasWidth, canvasHeight);

    ctx.restore();
  }

  /**
   * Tek bir tespit kutusu çiz (taktik stil)
   */
  _drawSingleDetection(ctx, det) {
    const { x1, y1, x2, y2, score, classNameTr, color, distance } = det;
    const w = x2 - x1;
    const h = y2 - y1;
    const cornerLen = Math.min(w, h) * 0.25;

    // En yakın nesne mi?
    const isClosest = this.closestDetection && det.trackId === this.closestDetection.trackId;

    // Mesafe bazlı renk modifikasyonu (yakın = daha kırmızımsı)
    let drawColor = color;
    if (distance && distance < 9999) {
      if (distance < 50) {
        drawColor = '#ff3344'; // Çok yakın - kırmızı
      } else if (distance < 150) {
        drawColor = '#ff9900'; // Yakın - turuncu
      } else if (distance < 300) {
        drawColor = '#ffdd00'; // Orta - sarı
      } else {
        drawColor = color; // Uzak - orijinal renk
      }
    }

    // ── Ana kutu (ince çizgi) ──
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = isClosest ? 2 : 1;
    ctx.globalAlpha = isClosest ? 0.8 : 0.5;
    ctx.strokeRect(x1, y1, w, h);

    // ── Köşe vurguları (kalın, taktik) ──
    ctx.lineWidth = isClosest ? 3.5 : 2.5;
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = drawColor;

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

    // ── Label (sınıf + skor + tracking ID + distance) ──
    let label = `${classNameTr} %${(score * 100).toFixed(0)} #${det.trackId || 0}`;
    if (distance && distance < 9999) {
      label += ` ${distance}m`;
    }
    
    ctx.font = 'bold 11px Consolas, monospace';
    const metrics = ctx.measureText(label);
    const labelW = metrics.width + 12;
    const labelH = 18;
    const labelX = x1;
    const labelY = y1 - labelH > 2 ? y1 - labelH : y1;

    // Label arka planı (en yakın nesne için farklı)
    ctx.globalAlpha = isClosest ? 0.95 : 0.8;
    ctx.fillStyle = isClosest ? '#ff3344' : drawColor;
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

    // En yakın nesne için ek vurgu (pulsing circle)
    if (isClosest) {
      ctx.strokeStyle = '#ff3344';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  /**
   * Canvas üzerinde istatistik göster
   */
  _drawStatsOverlay(ctx, canvasWidth, canvasHeight) {
    const padding = 8;
    const boxW = 165;
    const boxH = this.enableDistance && this.avgDistance > 0 ? 90 : 78;
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

    // Mesafe istatistikleri (yeni satır)
    if (this.enableDistance && this.avgDistance > 0) {
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`AVG DST : ${this.avgDistance}m`, x + 8, y + 77);
    }

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

    // En yakın mesafe güncelle (DOM)
    if (this.detClosestDistEl) {
      if (this.closestDetection && this.closestDetection.distance && this.closestDetection.distance < 9999) {
        this.detClosestDistEl.textContent = `EN YAKIN: ${this.closestDetection.distance}m`;
        this.detClosestDistEl.style.color = '#ff3344';
      } else {
        this.detClosestDistEl.textContent = 'EN YAKIN: --';
        this.detClosestDistEl.style.color = '#666';
      }
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
  _updateBadge(active, frozen = false) {
    if (this.aiBadgeEl) {
      if (frozen) {
        this.aiBadgeEl.textContent = '❄ FROZEN';
        this.aiBadgeEl.classList.remove('ai-off', 'ai-on');
        this.aiBadgeEl.classList.add('ai-frozen');
      } else if (active) {
        this.aiBadgeEl.textContent = 'AI ON';
        this.aiBadgeEl.classList.remove('ai-off', 'ai-frozen');
        this.aiBadgeEl.classList.add('ai-on');
      } else {
        this.aiBadgeEl.textContent = 'AI OFF';
        this.aiBadgeEl.classList.remove('ai-on', 'ai-frozen');
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
    // BUG-05 FIX: TF.js GPU bellek sızıntısını önle
    if (this.model) {
      if (typeof this.model.dispose === 'function') {
        this.model.dispose();
      }
      this.model = null;
    }
    this.isReady = false;
    this.isEnabled = false;
    this.detections = [];
    this._smoothedDetections = [];
  }
}
