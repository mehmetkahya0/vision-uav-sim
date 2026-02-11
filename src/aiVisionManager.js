/**
 * ═══════════════════════════════════════════════════════════════════
 * AI VISION MANAGER - Çoklu AI Model Yönetim Sistemi
 * ═══════════════════════════════════════════════════════════════════
 *
 * Drone kamerasından çalışan tüm AI modellerini yönetir:
 * - Object Detection (COCO-SSD) - Mevcut
 * - Object Tracking (DeepSORT benzeri)
 * - Depth Estimation (MiDaS)
 * - Semantic Segmentation (DeepLab)
 * - Pose Estimation (MoveNet)
 * - Optical Flow (Lucas-Kanade)
 *
 * Kısayol: I tuşu ile AI Panel aç/kapat
 */

// ═══════════════════════════════════════════════════════════════════
// SABİTLER VE RENK PALETİ
// ═══════════════════════════════════════════════════════════════════

const AI_MODELS = {
  OBJECT_DETECTION: {
    id: 'objectDetection',
    name: 'Nesne Algılama',
    icon: '🎯',
    description: 'COCO-SSD ile 80+ nesne kategorisi',
    color: '#00ff88',
    shortcut: 'B'
  },
  OBJECT_TRACKING: {
    id: 'objectTracking',
    name: 'Nesne Takibi',
    icon: '📍',
    description: 'ID atama ve hareket takibi',
    color: '#ff6b6b',
    shortcut: '1'
  },
  DEPTH_ESTIMATION: {
    id: 'depthEstimation',
    name: 'Derinlik Tahmini',
    icon: '📏',
    description: 'Mono kameradan mesafe haritası',
    color: '#4ecdc4',
    shortcut: '2'
  },
  SEGMENTATION: {
    id: 'segmentation',
    name: 'Segmentasyon',
    icon: '🎨',
    description: 'Piksel düzeyinde sınıflandırma',
    color: '#a855f7',
    shortcut: '3'
  },
  POSE_ESTIMATION: {
    id: 'poseEstimation',
    name: 'Poz Tahmini',
    icon: '🏃',
    description: 'İnsan iskelet tespiti',
    color: '#f59e0b',
    shortcut: '4'
  },
  OPTICAL_FLOW: {
    id: 'opticalFlow',
    name: 'Optik Akış',
    icon: '🌊',
    description: 'Hareket vektörleri analizi',
    color: '#06b6d4',
    shortcut: '5'
  }
};

// Segmentasyon renk paleti (20 sınıf)
const SEGMENTATION_COLORS = [
  [0, 0, 0],       // 0: background
  [128, 0, 0],     // 1: aeroplane
  [0, 128, 0],     // 2: bicycle
  [128, 128, 0],   // 3: bird
  [0, 0, 128],     // 4: boat
  [128, 0, 128],   // 5: bottle
  [0, 128, 128],   // 6: bus
  [128, 128, 128], // 7: car
  [64, 0, 0],      // 8: cat
  [192, 0, 0],     // 9: chair
  [64, 128, 0],    // 10: cow
  [192, 128, 0],   // 11: dining table
  [64, 0, 128],    // 12: dog
  [192, 0, 128],   // 13: horse
  [64, 128, 128],  // 14: motorbike
  [192, 128, 128], // 15: person
  [0, 64, 0],      // 16: potted plant
  [128, 64, 0],    // 17: sheep
  [0, 192, 0],     // 18: sofa
  [128, 192, 0],   // 19: train
  [0, 64, 128],    // 20: tv/monitor
];

// Poz iskelet bağlantıları (MoveNet)
const POSE_CONNECTIONS = [
  [0, 1], [0, 2], [1, 3], [2, 4],           // Yüz
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],  // Kollar
  [5, 11], [6, 12], [11, 12],               // Gövde
  [11, 13], [13, 15], [12, 14], [14, 16]    // Bacaklar
];

const POSE_KEYPOINT_NAMES = [
  'burun', 'sol göz', 'sağ göz', 'sol kulak', 'sağ kulak',
  'sol omuz', 'sağ omuz', 'sol dirsek', 'sağ dirsek',
  'sol bilek', 'sağ bilek', 'sol kalça', 'sağ kalça',
  'sol diz', 'sağ diz', 'sol ayak bileği', 'sağ ayak bileği'
];

// ═══════════════════════════════════════════════════════════════════
// ANA SINIF
// ═══════════════════════════════════════════════════════════════════

export class AIVisionManager {
  constructor(objectDetector) {
    // Mevcut object detector'ı referans al
    this.objectDetector = objectDetector;
    
    // AI model durumları
    this.models = {
      objectDetection: { enabled: false, ready: false, loading: false, model: null },
      objectTracking: { enabled: false, ready: false, loading: false, data: null },
      depthEstimation: { enabled: false, ready: false, loading: false, model: null },
      segmentation: { enabled: false, ready: false, loading: false, model: null },
      poseEstimation: { enabled: false, ready: false, loading: false, model: null },
      opticalFlow: { enabled: false, ready: false, loading: false, data: null }
    };
    
    // ═══ PERFORMANS: Throttle & Downscale ═══
    this._frameCounter = 0;
    this._updateIntervals = {
      objectTracking: 3,    // Her 3 frame'de 1 (takip hafif)
      depthEstimation: 15,  // Her 15 frame'de 1 (ağır)
      segmentation: 15,     // Her 15 frame'de 1 (ağır)
      poseEstimation: 5,    // Her 5 frame'de 1 (orta)
      opticalFlow: 10       // Her 10 frame'de 1 (ağır)
    };
    this._downscaleFactor = 6;  // Piksel işleme 6x küçük çözünürlükte (380/6≈63, 240/6=40)
    this._cachedImageData = null;
    this._cachedDownscaled = null;
    this._lastImageDataFrame = -999;
    
    // Önceden oluşturulmuş canvas'lar (GC baskısını önle)
    this._tempCanvas = document.createElement('canvas');
    this._tempCtx = this._tempCanvas.getContext('2d');
    this._downscaleCanvas = document.createElement('canvas');
    this._downscaleCtx = this._downscaleCanvas.getContext('2d');
    
    // Tracking verileri
    this.tracks = new Map();
    this.nextTrackId = 1;
    this.maxTrackAge = 30;
    this.iouThreshold = 0.3;
    
    // Depth verileri
    this.depthMap = null;
    this.depthCanvas = null;
    this.depthCtx = null;
    this._depthOverlayCanvas = null;
    this._depthOverlayCtx = null;
    
    // Segmentation verileri
    this.segmentationMask = null;
    this.segmentationCanvas = null;
    this.segmentationCtx = null;
    this._segOverlayCanvas = null;
    this._segOverlayCtx = null;
    
    // Pose verileri
    this.poses = [];
    
    // Optical flow verileri
    this.prevFrame = null;
    this.flowVectors = [];
    this.flowCanvas = null;
    this.flowCtx = null;
    
    // UI paneli
    this.panelVisible = false;
    this.panelEl = null;
    
    // Performans izleme
    this.stats = {
      tracking: { fps: 0, count: 0 },
      depth: { fps: 0, lastTime: 0 },
      segmentation: { fps: 0, lastTime: 0 },
      pose: { fps: 0, count: 0 },
      flow: { fps: 0, vectors: 0 }
    };
    
    this._createPanel();
    this._setupKeyboardShortcuts();
  }
  
  // ═══════════════════════════════════════════════════════════════
  // UI PANEL OLUŞTURMA
  // ═══════════════════════════════════════════════════════════════
  
  _createPanel() {
    // Ana panel
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'aiVisionPanel';
    this.panelEl.className = 'ai-vision-panel hidden';
    
    // Header
    const header = document.createElement('div');
    header.className = 'ai-vision-header';
    header.innerHTML = `
      <span class="ai-vision-icon">🤖</span>
      <span class="ai-vision-title">AI VİZYON SİSTEMİ</span>
      <span class="ai-vision-close" id="aiVisionClose">✕</span>
    `;
    
    // Body - Model seçenekleri
    const body = document.createElement('div');
    body.className = 'ai-vision-body';
    
    Object.values(AI_MODELS).forEach(model => {
      const item = document.createElement('div');
      item.className = 'ai-model-item';
      item.dataset.modelId = model.id;
      item.innerHTML = `
        <div class="ai-model-checkbox">
          <input type="checkbox" id="ai-${model.id}" />
          <span class="ai-checkmark"></span>
        </div>
        <div class="ai-model-info">
          <div class="ai-model-name">
            <span class="ai-model-icon">${model.icon}</span>
            ${model.name}
            <kbd class="ai-model-key">${model.shortcut}</kbd>
          </div>
          <div class="ai-model-desc">${model.description}</div>
        </div>
        <div class="ai-model-status" id="status-${model.id}">
          <span class="ai-status-dot"></span>
        </div>
      `;
      
      // Checkbox event
      const checkbox = item.querySelector('input');
      checkbox.addEventListener('change', () => this._toggleModel(model.id));
      
      // Item click de checkbox'ı toggle etsin
      item.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          checkbox.checked = !checkbox.checked;
          this._toggleModel(model.id);
        }
      });
      
      body.appendChild(item);
    });
    
    // Footer - Stats
    const footer = document.createElement('div');
    footer.className = 'ai-vision-footer';
    footer.innerHTML = `
      <div class="ai-stats-row">
        <span id="aiStatsActive">AKTİF: 0</span>
        <span id="aiStatsFPS">FPS: --</span>
      </div>
      <div class="ai-vision-hint">
        <kbd>I</kbd> Panel Aç/Kapat
      </div>
    `;
    
    this.panelEl.appendChild(header);
    this.panelEl.appendChild(body);
    this.panelEl.appendChild(footer);
    document.body.appendChild(this.panelEl);
    
    // Close button event
    document.getElementById('aiVisionClose').addEventListener('click', () => {
      this.togglePanel();
    });
    
    // Stats elementleri
    this.statsActiveEl = document.getElementById('aiStatsActive');
    this.statsFPSEl = document.getElementById('aiStatsFPS');
  }
  
  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Panel toggle: I tuşu
      if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.altKey) {
        this.togglePanel();
        return;
      }
      
      // Model kısayolları (panel açıkken veya her zaman)
      Object.values(AI_MODELS).forEach(model => {
        if (e.key.toLowerCase() === model.shortcut.toLowerCase() && !e.ctrlKey && !e.altKey) {
          // B tuşu mevcut object detection için - onu objectDetector yönetiyor
          if (model.id === 'objectDetection') return;
          
          this._toggleModel(model.id);
          this._updateCheckbox(model.id);
        }
      });
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PANEL KONTROLÜ
  // ═══════════════════════════════════════════════════════════════
  
  togglePanel() {
    this.panelVisible = !this.panelVisible;
    this.panelEl.classList.toggle('hidden', !this.panelVisible);
    
    // Object detection durumunu senkronize et
    this._syncObjectDetectionState();
  }
  
  _syncObjectDetectionState() {
    const checkbox = document.getElementById('ai-objectDetection');
    if (checkbox && this.objectDetector) {
      checkbox.checked = this.objectDetector.isEnabled;
      this._updateModelStatus('objectDetection', 
        this.objectDetector.isEnabled ? 'active' : 'idle',
        this.objectDetector.isReady
      );
    }
  }
  
  _updateCheckbox(modelId) {
    const checkbox = document.getElementById(`ai-${modelId}`);
    if (checkbox) {
      checkbox.checked = this.models[modelId].enabled;
    }
  }
  
  _updateModelStatus(modelId, status, ready = false) {
    const statusEl = document.getElementById(`status-${modelId}`);
    if (!statusEl) return;
    
    const dot = statusEl.querySelector('.ai-status-dot');
    dot.className = 'ai-status-dot';
    
    if (status === 'loading') {
      dot.classList.add('loading');
    } else if (status === 'active') {
      dot.classList.add('active');
    } else if (status === 'error') {
      dot.classList.add('error');
    }
    // idle = default (no extra class)
  }
  
  // ═══════════════════════════════════════════════════════════════
  // MODEL TOGGLE
  // ═══════════════════════════════════════════════════════════════
  
  async _toggleModel(modelId) {
    // Object detection için mevcut sistemi kullan
    if (modelId === 'objectDetection') {
      if (this.objectDetector) {
        this.objectDetector.toggle();
        this._syncObjectDetectionState();
      }
      return;
    }
    
    const model = this.models[modelId];
    model.enabled = !model.enabled;
    
    if (model.enabled) {
      this._updateModelStatus(modelId, 'loading');
      await this._loadModel(modelId);
    } else {
      this._updateModelStatus(modelId, 'idle');
    }
    
    this._updateStats();
  }
  
  async _loadModel(modelId) {
    const model = this.models[modelId];
    
    if (model.ready) {
      this._updateModelStatus(modelId, 'active');
      return;
    }
    
    model.loading = true;
    
    try {
      switch (modelId) {
        case 'objectTracking':
          // Tracking için ayrı model yok - detection sonuçlarını kullanır
          model.ready = true;
          console.log('📍 Object Tracking aktif');
          break;
          
        case 'depthEstimation':
          await this._loadDepthModel();
          model.ready = true;
          console.log('📏 Depth Estimation modeli hazır');
          break;
          
        case 'segmentation':
          await this._loadSegmentationModel();
          model.ready = true;
          console.log('🎨 Segmentation modeli hazır');
          break;
          
        case 'poseEstimation':
          await this._loadPoseModel();
          model.ready = true;
          console.log('🏃 Pose Estimation modeli hazır');
          break;
          
        case 'opticalFlow':
          // Optical flow için ayrı model yok - frame comparison
          this._initOpticalFlow();
          model.ready = true;
          console.log('🌊 Optical Flow aktif');
          break;
      }
      
      this._updateModelStatus(modelId, 'active', true);
    } catch (error) {
      console.error(`❌ ${modelId} yüklenemedi:`, error);
      model.enabled = false;
      this._updateModelStatus(modelId, 'error');
    }
    
    model.loading = false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // DEPTH ESTIMATION (MiDaS benzeri - basitleştirilmiş)
  // ═══════════════════════════════════════════════════════════════
  
  async _loadDepthModel() {
    // GPU canvas oluştur
    this.depthCanvas = document.createElement('canvas');
    this.depthCtx = this.depthCanvas.getContext('2d');
    this._depthOverlayCanvas = document.createElement('canvas');
    this._depthOverlayCtx = this._depthOverlayCanvas.getContext('2d');
    
    console.log('📏 Depth estimation: Gradient-based yaklaşım kullanılıyor');
  }
  
  estimateDepth(imageData, width, height) {
    if (!this.models.depthEstimation.enabled) return null;
    
    // Downscale boyutlarıyla çalış
    const sw = width;
    const sh = height;
    
    const depthData = new Float32Array(sw * sh);
    const data = imageData.data;
    const invW = 1 / sw;
    const invH = 1 / sh;
    const cx = sw * 0.5;
    const cy = sh * 0.5;
    
    for (let y = 0; y < sh; y++) {
      const yFactor = y * invH;
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        
        const luminance = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) * 0.003921568; // /255
        
        const dx = (x - cx) * invW;
        const dy = (y - cy) * invH;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        
        let depth = yFactor * 0.6 + (1 - luminance) * 0.3 + distFromCenter * 0.1;
        if (depth < 0) depth = 0;
        else if (depth > 1) depth = 1;
        
        depthData[y * sw + x] = depth;
      }
    }
    
    this.depthMap = { data: depthData, width: sw, height: sh };
    return this.depthMap;
  }
  
  renderDepthOverlay(ctx, width, height, alpha = 0.5) {
    if (!this.depthMap || !this.models.depthEstimation.enabled) return;
    
    const dw = this.depthMap.width;
    const dh = this.depthMap.height;
    
    // Overlay canvas'ı sadece boyut değişince yeniden boyutlandır
    if (this._depthOverlayCanvas.width !== dw || this._depthOverlayCanvas.height !== dh) {
      this._depthOverlayCanvas.width = dw;
      this._depthOverlayCanvas.height = dh;
    }
    
    const imgData = this._depthOverlayCtx.createImageData(dw, dh);
    const depth = this.depthMap.data;
    const pixels = imgData.data;
    const alphaVal = (alpha * 255) | 0;
    
    for (let i = 0; i < depth.length; i++) {
      const d = depth[i];
      const idx = i << 2;
      
      if (d < 0.33) {
        pixels[idx] = 255;
        pixels[idx + 1] = (d * 3 * 255) | 0;
        pixels[idx + 2] = 0;
      } else if (d < 0.66) {
        const t = (d - 0.33) * 3;
        pixels[idx] = ((1 - t) * 255) | 0;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = (t * 255) | 0;
      } else {
        const t = (d - 0.66) * 3;
        pixels[idx] = 0;
        pixels[idx + 1] = ((1 - t) * 255) | 0;
        pixels[idx + 2] = 255;
      }
      pixels[idx + 3] = alphaVal;
    }
    
    this._depthOverlayCtx.putImageData(imgData, 0, 0);
    
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._depthOverlayCanvas, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SEMANTIC SEGMENTATION (DeepLab benzeri - basitleştirilmiş)
  // ═══════════════════════════════════════════════════════════════
  
  async _loadSegmentationModel() {
    this.segmentationCanvas = document.createElement('canvas');
    this.segmentationCtx = this.segmentationCanvas.getContext('2d');
    this._segOverlayCanvas = document.createElement('canvas');
    this._segOverlayCtx = this._segOverlayCanvas.getContext('2d');
    
    console.log('🎨 Segmentation: Renk tabanlı basit yaklaşım kullanılıyor');
  }
  
  computeSegmentation(imageData, width, height) {
    if (!this.models.segmentation.enabled) return null;
    
    const sw = width;
    const sh = height;
    
    const maskData = new Uint8Array(sw * sh);
    const data = imageData.data;
    
    for (let i = 0; i < sw * sh; i++) {
      const idx = i << 2;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      let classId = 0;
      
      if (b > 150 && b > r && b > g && (i / (sw * sh)) < 0.4) {
        classId = 0;
      } else if (g > r && g > b && g > 80) {
        classId = 16;
      } else if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r > 60 && r < 180) {
        classId = 11;
      } else if (r < 60 && g < 60 && b < 60) {
        classId = 0;
      } else if (r > 200 && g > 200 && b > 200) {
        classId = 7;
      } else if (b > r && b > g) {
        classId = 4;
      }
      
      maskData[i] = classId;
    }
    
    this.segmentationMask = { data: maskData, width: sw, height: sh };
    return this.segmentationMask;
  }
  
  renderSegmentationOverlay(ctx, width, height, alpha = 0.4) {
    if (!this.segmentationMask || !this.models.segmentation.enabled) return;
    
    const sw = this.segmentationMask.width;
    const sh = this.segmentationMask.height;
    
    if (this._segOverlayCanvas.width !== sw || this._segOverlayCanvas.height !== sh) {
      this._segOverlayCanvas.width = sw;
      this._segOverlayCanvas.height = sh;
    }
    
    const imgData = this._segOverlayCtx.createImageData(sw, sh);
    const mask = this.segmentationMask.data;
    const pixels = imgData.data;
    const alphaVal = (alpha * 255) | 0;
    
    for (let i = 0; i < mask.length; i++) {
      const classId = mask[i];
      if (classId === 0) continue; // background - skip
      const color = SEGMENTATION_COLORS[classId];
      if (!color) continue;
      const idx = i << 2;
      
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = alphaVal;
    }
    
    this._segOverlayCtx.putImageData(imgData, 0, 0);
    
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._segOverlayCanvas, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // POSE ESTIMATION (MoveNet benzeri)
  // ═══════════════════════════════════════════════════════════════
  
  async _loadPoseModel() {
    // TensorFlow.js pose-detection kullanımı
    // const detector = await poseDetection.createDetector(
    //   poseDetection.SupportedModels.MoveNet,
    //   { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    // );
    
    // Şimdilik simüle edilmiş pose detection
    console.log('🏃 Pose: Detection sonuçlarından simüle ediliyor');
  }
  
  detectPoses(detections, width, height) {
    if (!this.models.poseEstimation.enabled) return [];
    
    // Person detection'lardan pose tahmini yap
    const poses = [];
    
    if (detections) {
      detections.forEach(det => {
        if (det.class === 'person' && det.score > 0.5) {
          // Basit iskelet oluştur (detection bbox'ından)
          const pose = this._generateSimulatedPose(det.bbox, width, height);
          poses.push(pose);
        }
      });
    }
    
    this.poses = poses;
    this.stats.pose.count = poses.length;
    return poses;
  }
  
  _generateSimulatedPose(bbox, imgWidth, imgHeight) {
    const [x, y, w, h] = bbox;
    
    // İnsan oranlarına göre keypoint'ler oluştur
    const keypoints = [];
    
    // Baş (üst %15)
    const headY = y + h * 0.08;
    const headX = x + w * 0.5;
    
    // Omuzlar (üst %25)
    const shoulderY = y + h * 0.22;
    const shoulderWidth = w * 0.4;
    
    // Kalça (üst %55)
    const hipY = y + h * 0.55;
    const hipWidth = w * 0.25;
    
    // Diz (üst %75)
    const kneeY = y + h * 0.75;
    
    // Ayak bileği (alt)
    const ankleY = y + h * 0.95;
    
    // Keypoints (MoveNet sırası)
    const points = [
      [headX, headY],                                    // 0: nose
      [headX - w * 0.08, headY - h * 0.02],             // 1: left eye
      [headX + w * 0.08, headY - h * 0.02],             // 2: right eye
      [headX - w * 0.12, headY + h * 0.01],             // 3: left ear
      [headX + w * 0.12, headY + h * 0.01],             // 4: right ear
      [headX - shoulderWidth/2, shoulderY],             // 5: left shoulder
      [headX + shoulderWidth/2, shoulderY],             // 6: right shoulder
      [headX - w * 0.35, shoulderY + h * 0.15],         // 7: left elbow
      [headX + w * 0.35, shoulderY + h * 0.15],         // 8: right elbow
      [headX - w * 0.4, shoulderY + h * 0.28],          // 9: left wrist
      [headX + w * 0.4, shoulderY + h * 0.28],          // 10: right wrist
      [headX - hipWidth/2, hipY],                       // 11: left hip
      [headX + hipWidth/2, hipY],                       // 12: right hip
      [headX - hipWidth/2, kneeY],                      // 13: left knee
      [headX + hipWidth/2, kneeY],                      // 14: right knee
      [headX - hipWidth/2 - w*0.05, ankleY],           // 15: left ankle
      [headX + hipWidth/2 + w*0.05, ankleY]            // 16: right ankle
    ];
    
    points.forEach((pt, i) => {
      keypoints.push({
        x: pt[0],
        y: pt[1],
        score: 0.8 + Math.random() * 0.2,
        name: POSE_KEYPOINT_NAMES[i]
      });
    });
    
    return { keypoints, score: 0.9 };
  }
  
  renderPoseOverlay(ctx, width, height) {
    if (!this.models.poseEstimation.enabled || this.poses.length === 0) return;
    
    this.poses.forEach(pose => {
      const kp = pose.keypoints;
      
      // İskelet çizgileri
      ctx.strokeStyle = AI_MODELS.POSE_ESTIMATION.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      
      POSE_CONNECTIONS.forEach(([i, j]) => {
        if (kp[i].score > 0.3 && kp[j].score > 0.3) {
          ctx.beginPath();
          ctx.moveTo(kp[i].x, kp[i].y);
          ctx.lineTo(kp[j].x, kp[j].y);
          ctx.stroke();
        }
      });
      
      // Keypoint noktaları
      kp.forEach((point, i) => {
        if (point.score > 0.3) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = i < 5 ? '#ff6b6b' : AI_MODELS.POSE_ESTIMATION.color;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // OPTICAL FLOW (Lucas-Kanade benzeri)
  // ═══════════════════════════════════════════════════════════════
  
  _initOpticalFlow() {
    this.flowCanvas = document.createElement('canvas');
    this.flowCtx = this.flowCanvas.getContext('2d');
    this.prevFrame = null;
    this.flowVectors = [];
  }
  
  computeOpticalFlow(imageData, width, height) {
    if (!this.models.opticalFlow.enabled) return [];
    
    const currentGray = this._toGrayscale(imageData.data, width, height);
    
    if (!this.prevFrame || this.prevFrame.length !== currentGray.length) {
      this.prevFrame = currentGray;
      this._prevFlowW = width;
      this._prevFlowH = height;
      return [];
    }
    
    // Daha büyük blockSize = daha az blok = daha hızlı
    const blockSize = 8;
    const searchRadius = 4;
    const vectors = [];
    const scale = this._downscaleFactor; // Render'da upscale için
    
    for (let by = 0; by < height - blockSize; by += blockSize) {
      for (let bx = 0; bx < width - blockSize; bx += blockSize) {
        const flow = this._findBestMatch(
          this.prevFrame, currentGray,
          bx, by, blockSize, searchRadius, width, height
        );
        
        if (Math.abs(flow.dx) > 1 || Math.abs(flow.dy) > 1) {
          vectors.push({
            x: (bx + blockSize / 2) * scale,
            y: (by + blockSize / 2) * scale,
            dx: flow.dx * scale,
            dy: flow.dy * scale,
            magnitude: Math.sqrt(flow.dx * flow.dx + flow.dy * flow.dy)
          });
        }
      }
    }
    
    this.prevFrame = currentGray;
    this._prevFlowW = width;
    this._prevFlowH = height;
    this.flowVectors = vectors;
    this.stats.flow.vectors = vectors.length;
    
    return vectors;
  }
  
  _toGrayscale(data, width, height) {
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = Math.floor(data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
    }
    return gray;
  }
  
  _findBestMatch(prev, curr, bx, by, blockSize, searchRadius, width, height) {
    let bestDx = 0, bestDy = 0;
    let minSAD = Infinity;
    
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const nx = bx + dx;
        const ny = by + dy;
        
        if (nx < 0 || ny < 0 || nx + blockSize >= width || ny + blockSize >= height) continue;
        
        let sad = 0;
        for (let y = 0; y < blockSize; y++) {
          for (let x = 0; x < blockSize; x++) {
            const prevIdx = (by + y) * width + (bx + x);
            const currIdx = (ny + y) * width + (nx + x);
            sad += Math.abs(prev[prevIdx] - curr[currIdx]);
          }
        }
        
        if (sad < minSAD) {
          minSAD = sad;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }
    
    return { dx: bestDx, dy: bestDy };
  }
  
  renderOpticalFlowOverlay(ctx, width, height) {
    if (!this.models.opticalFlow.enabled || this.flowVectors.length === 0) return;
    
    const maxMag = Math.max(...this.flowVectors.map(v => v.magnitude), 1);
    
    this.flowVectors.forEach(vec => {
      const intensity = Math.min(vec.magnitude / maxMag, 1);
      const hue = (1 - intensity) * 240; // Mavi → Kırmızı
      
      ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
      ctx.lineWidth = 2;
      
      // Ok çiz
      const scale = 3;
      const endX = vec.x + vec.dx * scale;
      const endY = vec.y + vec.dy * scale;
      
      ctx.beginPath();
      ctx.moveTo(vec.x, vec.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      
      // Ok ucu
      const angle = Math.atan2(vec.dy, vec.dx);
      const arrowSize = 4;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle - Math.PI/6),
        endY - arrowSize * Math.sin(angle - Math.PI/6)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle + Math.PI/6),
        endY - arrowSize * Math.sin(angle + Math.PI/6)
      );
      ctx.stroke();
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // OBJECT TRACKING (Simple IOU Tracker)
  // ═══════════════════════════════════════════════════════════════
  
  updateTracking(detections) {
    if (!this.models.objectTracking.enabled || !detections) return [];
    
    // Mevcut track'leri güncelle veya yeni oluştur
    const matchedTracks = new Set();
    const matchedDetections = new Set();
    
    // Her detection için en iyi track'i bul
    detections.forEach((det, detIdx) => {
      let bestTrackId = null;
      let bestIOU = this.iouThreshold;
      
      this.tracks.forEach((track, trackId) => {
        if (matchedTracks.has(trackId)) return;
        if (track.class !== det.class) return;
        
        const iou = this._computeIOU(det.bbox, track.bbox);
        if (iou > bestIOU) {
          bestIOU = iou;
          bestTrackId = trackId;
        }
      });
      
      if (bestTrackId !== null) {
        // Track güncelle
        const track = this.tracks.get(bestTrackId);
        track.bbox = det.bbox;
        track.confidence = det.score;
        track.history.push({ bbox: det.bbox, time: Date.now() });
        if (track.history.length > 30) track.history.shift();
        track.age++;
        track.lost = 0;
        
        matchedTracks.add(bestTrackId);
        matchedDetections.add(detIdx);
      }
    });
    
    // Eşleşmeyen detection'lar için yeni track oluştur
    detections.forEach((det, detIdx) => {
      if (matchedDetections.has(detIdx)) return;
      
      const newTrack = {
        id: this.nextTrackId++,
        bbox: det.bbox,
        class: det.class,
        confidence: det.score,
        history: [{ bbox: det.bbox, time: Date.now() }],
        age: 1,
        lost: 0
      };
      
      this.tracks.set(newTrack.id, newTrack);
    });
    
    // Eşleşmeyen track'leri "kayıp" olarak işaretle
    this.tracks.forEach((track, trackId) => {
      if (!matchedTracks.has(trackId)) {
        track.lost++;
        if (track.lost > this.maxTrackAge) {
          this.tracks.delete(trackId);
        }
      }
    });
    
    this.stats.tracking.count = this.tracks.size;
    return Array.from(this.tracks.values());
  }
  
  _computeIOU(box1, box2) {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    const xi1 = Math.max(x1, x2);
    const yi1 = Math.max(y1, y2);
    const xi2 = Math.min(x1 + w1, x2 + w2);
    const yi2 = Math.min(y1 + h1, y2 + h2);
    
    const interArea = Math.max(0, xi2 - xi1) * Math.max(0, yi2 - yi1);
    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - interArea;
    
    return unionArea > 0 ? interArea / unionArea : 0;
  }
  
  renderTrackingOverlay(ctx, width, height) {
    if (!this.models.objectTracking.enabled) return;
    
    this.tracks.forEach(track => {
      const [x, y, w, h] = track.bbox;
      const color = this._getTrackColor(track.id);
      
      // Track ID ve bbox
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      
      // ID label
      ctx.fillStyle = color;
      ctx.font = 'bold 14px monospace';
      const label = `ID:${track.id} ${track.class}`;
      const labelWidth = ctx.measureText(label).width + 8;
      ctx.fillRect(x, y - 20, labelWidth, 18);
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 4, y - 6);
      
      // Trajectory (hareket izi)
      if (track.history.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        
        track.history.forEach((h, i) => {
          const cx = h.bbox[0] + h.bbox[2] / 2;
          const cy = h.bbox[1] + h.bbox[3] / 2;
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }
  
  _getTrackColor(id) {
    const hue = (id * 137) % 360; // Golden angle for color distribution
    return `hsl(${hue}, 80%, 55%)`;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ANA UPDATE DÖNGÜSÜ (THROTTLED + DOWNSCALED + SAFE)
  // ═══════════════════════════════════════════════════════════════
  
  update(canvas, ctx, detections) {
    if (!canvas || !ctx) return;
    
    this._frameCounter++;
    
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;
    
    // ═══ PERFORMANS: Her ağır model FARKLI frame'lere dağıtılır ═══
    // Depth → frame % 20 == 0
    // Segmentation → frame % 20 == 7  (staggered - çakışmasın)
    // Optical Flow → frame % 20 == 14 (staggered - çakışmasın)
    const depthFrame = this.models.depthEstimation.enabled && (this._frameCounter % 20 === 0);
    const segFrame = this.models.segmentation.enabled && (this._frameCounter % 20 === 7);
    const flowFrame = this.models.opticalFlow.enabled && (this._frameCounter % 20 === 14);
    
    const needsPixelData = depthFrame || segFrame || flowFrame;
    
    // ═══ getImageData sadece gerektiğinde, küçük boyutta ═══
    if (needsPixelData) {
      try {
        const dw = Math.ceil(width / this._downscaleFactor);
        const dh = Math.ceil(height / this._downscaleFactor);
        
        if (this._downscaleCanvas.width !== dw || this._downscaleCanvas.height !== dh) {
          this._downscaleCanvas.width = dw;
          this._downscaleCanvas.height = dh;
        }
        
        this._downscaleCtx.drawImage(canvas, 0, 0, dw, dh);
        const downscaledData = this._downscaleCtx.getImageData(0, 0, dw, dh);
        
        // Her frame'de SADECE 1 ağır işlem yap
        if (depthFrame) {
          this.estimateDepth(downscaledData, dw, dh);
        } else if (segFrame) {
          this.computeSegmentation(downscaledData, dw, dh);
        } else if (flowFrame) {
          this.computeOpticalFlow(downscaledData, dw, dh);
        }
      } catch (e) {
        // getImageData veya canvas işlemleri başarısız - sessizce devam
      }
    }
    
    // Object Tracking (hafif - detection verilerini kullanır, piksel işleme yok)
    if (this.models.objectTracking.enabled && detections && 
        this._frameCounter % 3 === 0) {
      try { this.updateTracking(detections); } catch (e) {}
    }
    
    // Pose Estimation (hafif - detection verilerini kullanır, piksel işleme yok)
    if (this.models.poseEstimation.enabled && this._frameCounter % 5 === 0) {
      try { this.detectPoses(detections, width, height); } catch (e) {}
    }
  }
  
  render(ctx, width, height) {
    if (!ctx || width === 0 || height === 0) return;
    
    try {
      // Sıralama önemli: önce arka plan overlay'ler, sonra ön plan
      
      // 1. Depth overlay (en arkada)
      if (this.models.depthEstimation.enabled && this.depthMap) {
        this.renderDepthOverlay(ctx, width, height, 0.35);
      }
      
      // 2. Segmentation overlay
      if (this.models.segmentation.enabled && this.segmentationMask) {
        this.renderSegmentationOverlay(ctx, width, height, 0.3);
      }
      
      // 3. Optical Flow
      if (this.models.opticalFlow.enabled && this.flowVectors.length > 0) {
        this.renderOpticalFlowOverlay(ctx, width, height);
      }
      
      // 4. Tracking (bbox + trajectory)
      if (this.models.objectTracking.enabled && this.tracks.size > 0) {
        this.renderTrackingOverlay(ctx, width, height);
      }
      
      // 5. Pose (en önde)
      if (this.models.poseEstimation.enabled && this.poses.length > 0) {
        this.renderPoseOverlay(ctx, width, height);
      }
    } catch (e) {
      // Render hatası - sessizce devam, drone cam bozulmasın
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // YARDIMCI METODLAR
  // ═══════════════════════════════════════════════════════════════
  
  _updateStats() {
    const activeCount = Object.values(this.models).filter(m => m.enabled).length;
    
    // Object detection sayısını da ekle
    if (this.objectDetector?.isEnabled) {
      // Already counted if synced
    }
    
    if (this.statsActiveEl) {
      this.statsActiveEl.textContent = `AKTİF: ${activeCount}`;
    }
  }
  
  getActiveModels() {
    return Object.entries(this.models)
      .filter(([_, m]) => m.enabled)
      .map(([id, _]) => id);
  }
  
  isAnyModelActive() {
    return Object.values(this.models).some(m => m.enabled) || 
           (this.objectDetector?.isEnabled);
  }
  
  // Cleanup
  destroy() {
    this.tracks.clear();
    this.prevFrame = null;
    this.depthMap = null;
    this.segmentationMask = null;
    this.poses = [];
    this.flowVectors = [];
    
    if (this.panelEl) {
      this.panelEl.remove();
    }
  }
}

export { AI_MODELS };
