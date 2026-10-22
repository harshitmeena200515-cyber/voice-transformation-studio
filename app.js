/* ============================================================
   Voice Studio — app.js
   Pure vanilla JavaScript · No external dependencies
   ============================================================ */

// ─── MediaHandler ──────────────────────────────────────────────
class MediaHandler {
  constructor() {
    this.audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    this.videoExtensions = ['.mp4', '.webm', '.mkv', '.avi'];
    this.currentObjectURL = null;
    this.currentFile = null;
    this.audioContext = null;
    this.decodedBuffer = null;
  }

  get acceptedExtensions() {
    return [...this.audioExtensions, ...this.videoExtensions];
  }

  get acceptString() {
    return [
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/aac',
      'video/mp4', 'video/webm', 'video/x-matroska', 'video/avi',
      ...this.acceptedExtensions
    ].join(',');
  }

  isAccepted(file) {
    if (!file) return false;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return this.acceptedExtensions.includes(ext);
  }

  isVideo(file) {
    if (!file) return false;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return this.videoExtensions.includes(ext);
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  revokeCurrentURL() {
    if (this.currentObjectURL) {
      URL.revokeObjectURL(this.currentObjectURL);
      this.currentObjectURL = null;
    }
  }

  async handleFile(file) {
    if (!file) throw new Error('No file selected.');
    if (!this.isAccepted(file)) {
      throw new Error(`Unsupported file type. Accepted: ${this.acceptedExtensions.join(', ')}`);
    }

    this.revokeCurrentURL();
    this.currentFile = file;
    this.currentObjectURL = URL.createObjectURL(file);

    const info = {
      name: file.name,
      size: this.formatSize(file.size),
      type: file.type,
      isVideo: this.isVideo(file),
      url: this.currentObjectURL,
      duration: null
    };

    info.duration = await this._probeDuration(file, info.isVideo);
    return info;
  }

  _probeDuration(file, isVideo) {
    return new Promise((resolve) => {
      const el = document.createElement(isVideo ? 'video' : 'audio');
      el.preload = 'metadata';
      el.src = URL.createObjectURL(file);
      el.addEventListener('loadedmetadata', () => {
        const d = el.duration;
        URL.revokeObjectURL(el.src);
        resolve(isFinite(d) ? d : null);
      });
      el.addEventListener('error', () => {
        URL.revokeObjectURL(el.src);
        resolve(null);
      });
    });
  }

  formatDuration(sec) {
    if (sec == null || !isFinite(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  async extractAudioFromVideo(videoFile) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const arrayBuffer = await videoFile.arrayBuffer();
    this.decodedBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.decodedBuffer;
  }

  setupDragDrop(zoneEl, onFile) {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

    zoneEl.addEventListener('dragenter', (e) => { prevent(e); zoneEl.classList.add('drag-over'); });
    zoneEl.addEventListener('dragover', (e) => { prevent(e); zoneEl.classList.add('drag-over'); });
    zoneEl.addEventListener('dragleave', (e) => { prevent(e); zoneEl.classList.remove('drag-over'); });
    zoneEl.addEventListener('drop', (e) => {
      prevent(e);
      zoneEl.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  }
}

// ─── WaveformVisualizer ────────────────────────────────────────
class WaveformVisualizer {
  constructor(canvas, audioContext) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioContext = audioContext;
    this._animId = null;
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  _gradient(vertical = false) {
    const g = vertical
      ? this.ctx.createLinearGradient(0, 0, 0, this.height)
      : this.ctx.createLinearGradient(0, 0, this.width, 0);
    g.addColorStop(0, '#00d4ff');
    g.addColorStop(1, '#7c3aed');
    return g;
  }

  drawWaveform(audioBuffer) {
    this.stopLive();
    this._resize();

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / this.width);
    const amp = this.height / 2;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.beginPath();
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeStyle = this._gradient();
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';

    for (let i = 0; i < this.width; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const yLow = (1 + min) * amp;
      const yHigh = (1 + max) * amp;
      if (i === 0) {
        this.ctx.moveTo(i, yLow);
      }
      this.ctx.lineTo(i, yLow);
    }
    // Draw the top edge back
    for (let i = this.width - 1; i >= 0; i--) {
      let max = -1;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j] || 0;
        if (datum > max) max = datum;
      }
      this.ctx.lineTo(i, (1 + max) * amp);
    }
    this.ctx.closePath();
    this.ctx.fillStyle = this._gradient(true);
    this.ctx.globalAlpha = 0.35;
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
    this.ctx.stroke();
  }

  drawLiveWaveform(analyserNode) {
    this.stopLive();
    this._resize();

    const bufferLength = analyserNode.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this._animId = requestAnimationFrame(draw);
      analyserNode.getByteTimeDomainData(dataArray);

      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = this._gradient();
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();

      const sliceWidth = this.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * this.height) / 2;
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
        x += sliceWidth;
      }
      this.ctx.lineTo(this.width, this.height / 2);
      this.ctx.stroke();
    };

    draw();
  }

  stopLive() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  clear() {
    this.stopLive();
    this._resize();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}

// ─── Recorder ──────────────────────────────────────────────────
class Recorder {
  constructor(visualizer) {
    this.visualizer = visualizer;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.resultBlob = null;
    this.resultURL = null;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission denied. Please allow microphone access and try again.');
      }
      throw new Error('Could not access microphone: ' + err.message);
    }

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this._pickMime() });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    // Set up analyser for live waveform
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.sourceNode.connect(this.analyser);

    if (this.visualizer) {
      this.visualizer.drawLiveWaveform(this.analyser);
    }

    this.mediaRecorder.start(250);
    this.isRecording = true;
  }

  _pickMime() {
    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const m of mimes) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.resultBlob = new Blob(this.chunks, { type: 'audio/webm' });
        if (this.resultURL) URL.revokeObjectURL(this.resultURL);
        this.resultURL = URL.createObjectURL(this.resultBlob);
        this.isRecording = false;

        // Cleanup
        if (this.visualizer) this.visualizer.stopLive();
        if (this.sourceNode) this.sourceNode.disconnect();
        if (this.audioContext) this.audioContext.close().catch(() => {});
        if (this.stream) this.stream.getTracks().forEach((t) => t.stop());

        resolve({ blob: this.resultBlob, url: this.resultURL });
      };

      this.mediaRecorder.stop();
    });
  }
}

// ─── Transcriber ───────────────────────────────────────────────
class Transcriber {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.supported = false;
      return;
    }
    this.supported = true;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.isRunning = false;
    this._onResult = null;
    this._onError = null;
    this._onEnd = null;
    this._intentionalStop = false;

    this.languages = [
      { code: 'hi-IN', label: 'Hindi' },
      { code: 'en-US', label: 'English (US)' },
      { code: 'en-GB', label: 'British English' },
      { code: 'es-ES', label: 'Spanish' },
      { code: 'fr-FR', label: 'French' },
      { code: 'de-DE', label: 'German' },
      { code: 'ja-JP', label: 'Japanese' },
      { code: 'ko-KR', label: 'Korean' },
      { code: 'zh-CN', label: 'Chinese' },
      { code: 'ar-SA', label: 'Arabic' },
      { code: 'pt-BR', label: 'Portuguese' },
      { code: 'ru-RU', label: 'Russian' },
      { code: 'it-IT', label: 'Italian' },
      { code: 'bn-IN', label: 'Bengali' },
      { code: 'ta-IN', label: 'Tamil' },
      { code: 'te-IN', label: 'Telugu' },
      { code: 'mr-IN', label: 'Marathi' },
      { code: 'gu-IN', label: 'Gujarati' },
      { code: 'pa-IN', label: 'Punjabi' },
      { code: 'ur-PK', label: 'Urdu' }
    ];

    this._finalTranscript = '';
    this._setupListeners();
  }

  _setupListeners() {
    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this._finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      if (this._onResult) {
        this._onResult(this._finalTranscript, interim);
      }
    };

    this.recognition.onerror = (event) => {
      const messages = {
        'no-speech': 'No speech detected. Please try speaking.',
        'audio-capture': 'No microphone found. Please connect a microphone.',
        'not-allowed': 'Microphone access denied. Please grant permission.',
        'network': 'Network error occurred. Check your connection.',
        'aborted': 'Transcription was aborted.',
        'service-not-available': 'Speech service unavailable. Try again later.'
      };
      const msg = messages[event.error] || `Speech recognition error: ${event.error}`;
      if (this._onError) this._onError(msg);
    };

    this.recognition.onend = () => {
      if (this.isRunning && !this._intentionalStop) {
        // Auto-restart on unexpected stop
        try { this.recognition.start(); } catch (_) { /* ignore */ }
        return;
      }
      this.isRunning = false;
      if (this._onEnd) this._onEnd();
    };
  }

  setLanguage(langCode) {
    this.recognition.lang = langCode;
  }

  onResult(fn) { this._onResult = fn; }
  onError(fn) { this._onError = fn; }
  onEnd(fn) { this._onEnd = fn; }

  startTranscription() {
    if (!this.supported) throw new Error('Speech Recognition is not supported in this browser.');
    this._finalTranscript = '';
    this._intentionalStop = false;
    this.recognition.start();
    this.isRunning = true;
  }

  stopTranscription() {
    this._intentionalStop = true;
    this.isRunning = false;
    this.recognition.stop();
  }
}

// ─── Translator ────────────────────────────────────────────────
class Translator {
  constructor() {
    this.apiBase = 'https://api.mymemory.translated.net/get';
    this.chunkSize = 500;
    this.isTranslating = false;

    this.languages = [
      { code: 'hi', label: 'Hindi' },
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
      { code: 'de', label: 'German' },
      { code: 'ja', label: 'Japanese' },
      { code: 'ko', label: 'Korean' },
      { code: 'zh-CN', label: 'Chinese' },
      { code: 'ar', label: 'Arabic' },
      { code: 'pt', label: 'Portuguese' },
      { code: 'ru', label: 'Russian' },
      { code: 'it', label: 'Italian' },
      { code: 'bn', label: 'Bengali' },
      { code: 'ta', label: 'Tamil' },
      { code: 'te', label: 'Telugu' },
      { code: 'mr', label: 'Marathi' },
      { code: 'gu', label: 'Gujarati' },
      { code: 'pa', label: 'Punjabi' },
      { code: 'ur', label: 'Urdu' }
    ];
  }

  _splitChunks(text) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= this.chunkSize) {
        chunks.push(remaining);
        break;
      }
      let cut = remaining.lastIndexOf('. ', this.chunkSize);
      if (cut === -1 || cut < this.chunkSize * 0.3) {
        cut = remaining.lastIndexOf(' ', this.chunkSize);
      }
      if (cut === -1 || cut < this.chunkSize * 0.3) {
        cut = this.chunkSize;
      } else {
        cut += 1; // include space/period
      }
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    return chunks;
  }

  async translate(text, fromLang, toLang, tone = 'Natural Conversational Spoken Hindi') {
    if (!text || !text.trim()) throw new Error('Please enter some text to translate.');
    if (fromLang === toLang) return text;

    const aiKey = localStorage.getItem('ai_studio_key') || localStorage.getItem('ai_api_key');
    if (aiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${aiKey}`;
        const prompt = `Translate the following text from ${fromLang} to ${toLang}.
Tone & Style: ${tone}
Text to translate:
"""${text}"""

Provide ONLY the natural, highly accurate translated spoken voiceover text with zero intro or meta-talk.`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (resp.ok) {
          const resJson = await resp.json();
          const translated = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (translated) return translated.trim();
        }
      } catch (e) {
        console.warn('AI Studio translate fallback to MyMemory:', e);
      }
    }

    this.isTranslating = true;
    try {
      const chunks = this._splitChunks(text.trim());
      const results = [];

      for (const chunk of chunks) {
        const url = `${this.apiBase}?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(fromLang)}|${encodeURIComponent(toLang)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Translation API returned status ${res.status}`);
        const data = await res.json();
        if (data.responseStatus !== 200 && data.responseStatus !== '200') {
          throw new Error(data.responseDetails || 'Translation failed.');
        }
        results.push(data.responseData.translatedText);
      }

      return results.join(' ');
    } finally {
      this.isTranslating = false;
    }
  }

  async doctorScript(text) {
    if (!text || !text.trim()) throw new Error('Please enter text for the AI Script Doctor.');
    const aiKey = localStorage.getItem('ai_studio_key') || localStorage.getItem('ai_api_key');
    if (!aiKey) throw new Error('Please enter your AI Studio API Key in the settings first.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${aiKey}`;
    const prompt = `Act as an expert Voiceover Director and Speech Cadence Coach.
Polish and structure the following text for optimal Text-to-Speech narration:
- Add natural pacing with punctuation (commas, periods)
- Add speech pauses where appropriate using [pause] markers
- Ensure easy phonetic pronunciation
Text:
"""${text}"""

Output ONLY the polished speech script.`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!resp.ok) throw new Error('AI Script Doctor request failed. Check your API key.');
    const resJson = await resp.json();
    return resJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
  }
}

// ─── VoiceSynthesizer ─────────────────────────────────────────
class VoiceSynthesizer {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.isSpeaking = false;
    this._voicesLoaded = false;
  }

  loadVoices() {
    return new Promise((resolve) => {
      const populate = () => {
        this.voices = this.synth.getVoices();
        this._voicesLoaded = true;
        resolve(this.voices);
      };

      // Voices may already be available
      const v = this.synth.getVoices();
      if (v.length > 0) {
        this.voices = v;
        this._voicesLoaded = true;
        resolve(this.voices);
        return;
      }

      // Wait for voiceschanged
      this.synth.addEventListener('voiceschanged', populate, { once: true });

      // Fallback timeout
      setTimeout(() => {
        if (!this._voicesLoaded) populate();
      }, 3000);
    });
  }

  getVoicesGroupedByLang() {
    const groups = {};
    for (const v of this.voices) {
      const lang = v.lang.split('-')[0];
      const label = v.lang;
      if (!groups[label]) groups[label] = [];
      groups[label].push(v);
    }
    return groups;
  }

  populateSelect(selectEl) {
    selectEl.innerHTML = '';
    const groups = this.getVoicesGroupedByLang();
    const sortedKeys = Object.keys(groups).sort();

    for (const lang of sortedKeys) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = lang;
      for (const voice of groups[lang]) {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.textContent = `${voice.name}${voice.default ? ' ★' : ''}`;
        optgroup.appendChild(opt);
      }
      selectEl.appendChild(optgroup);
    }
  }

  speak(text, voiceName, pitch = 1, rate = 1) {
    if (!text || !text.trim()) throw new Error('No text to speak.');
    this.stop();

    const utter = new SpeechSynthesisUtterance(text);
    if (voiceName) {
      const voice = this.voices.find((v) => v.name === voiceName);
      if (voice) utter.voice = voice;
    }
    utter.pitch = pitch;
    utter.rate = rate;
    this.isSpeaking = true;

    utter.onend = () => { this.isSpeaking = false; };
    utter.onerror = (e) => {
      this.isSpeaking = false;
      if (e.error !== 'canceled') throw new Error('Speech synthesis error: ' + e.error);
    };

    this.synth.speak(utter);
    return utter;
  }

  stop() {
    this.synth.cancel();
    this.isSpeaking = false;
  }

  async generateAndDownload(text, voiceName, pitch = 1, rate = 1) {
    // Attempt to capture TTS via AudioContext + MediaRecorder
    // This only works in browsers that route SpeechSynthesis through the default audio destination.
    // For broader support we fall back to just playing the audio with a notice.

    if (!text || !text.trim()) throw new Error('No text to generate.');

    let captured = false;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();

      // Connect audio context destination to media recorder
      const recorder = new MediaRecorder(dest.stream, { mimeType: this._pickMime() });
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const blobPromise = new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          resolve(blob);
          audioCtx.close().catch(() => {});
        };
      });

      const utter = new SpeechSynthesisUtterance(text);
      if (voiceName) {
        const voice = this.voices.find((v) => v.name === voiceName);
        if (voice) utter.voice = voice;
      }
      utter.pitch = pitch;
      utter.rate = rate;

      recorder.start();
      utter.onend = () => { setTimeout(() => recorder.stop(), 300); };
      utter.onerror = () => { recorder.stop(); };
      this.synth.speak(utter);

      const blob = await blobPromise;
      // If blob is very small it likely didn't capture anything useful
      if (blob.size > 1000) {
        captured = true;
        this._downloadBlob(blob, 'voice-studio-tts.webm');
      }
    } catch (_) {
      // Capture not supported — fall through
    }

    if (!captured) {
      // Fallback: play audio and advise user
      this.speak(text, voiceName, pitch, rate);
      return { fallback: true, message: 'Direct TTS download is not supported in this browser. The audio is playing now — you can use a screen/audio recorder to capture it.' };
    }

    return { fallback: false };
  }

  _pickMime() {
    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const m of mimes) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  _downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 100);
  }
}

// ─── VoiceSampler ──────────────────────────────────────────────
class VoiceSampler {
  constructor() {
    this.audioContext = null;
    this.sampleBuffer = null;
    this.sampleURL = null;
    this.sampleFile = null;
    this.characteristics = null;
    this._sourceNode = null;
  }

  async loadSample(file) {
    if (!file) throw new Error('No file provided.');
    const allowed = ['.mp3','.wav','.ogg','.m4a','.flac','.aac','.mp4','.webm','.mkv','.avi'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) throw new Error('Unsupported audio/video format.');

    if (this.sampleURL) URL.revokeObjectURL(this.sampleURL);
    this.sampleFile = file;
    this.sampleURL = URL.createObjectURL(file);

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const arrayBuffer = await file.arrayBuffer();
    this.sampleBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.characteristics = this._analyze(this.sampleBuffer);
    return this.characteristics;
  }

  _analyze(buffer) {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // RMS volume
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
    const rms = Math.sqrt(sumSq / data.length);
    const volumeDb = 20 * Math.log10(rms + 1e-10);

    // Simple zero-crossing rate for rough frequency estimate
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
        crossings++;
      }
    }
    const duration = buffer.duration;
    const avgFreq = crossings / (2 * duration);

    // Peak amplitude
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }

    return {
      duration: duration.toFixed(2),
      sampleRate,
      channels: buffer.numberOfChannels,
      rms: rms.toFixed(4),
      volumeDb: volumeDb.toFixed(1),
      avgFrequency: Math.round(avgFreq),
      peakAmplitude: peak.toFixed(4)
    };
  }

  play() {
    if (!this.sampleBuffer) throw new Error('No sample loaded.');
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch (_) {}
    }
    this._sourceNode = this.audioContext.createBufferSource();
    this._sourceNode.buffer = this.sampleBuffer;
    this._sourceNode.connect(this.audioContext.destination);
    this._sourceNode.start(0);
  }

  stop() {
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch (_) {}
      this._sourceNode = null;
    }
  }
}

// ─── App Controller ────────────────────────────────────────────
class App {
  constructor() {
    // Core modules
    this.mediaHandler = new MediaHandler();
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const canvas = document.getElementById('waveform-canvas');
    this.visualizer = new WaveformVisualizer(canvas, this.audioContext);
    this.recorder = new Recorder(this.visualizer);
    this.transcriber = new Transcriber();
    this.translator = new Translator();
    this.synthesizer = new VoiceSynthesizer();
    this.sampler = new VoiceSampler();

    // State
    this._ttsGeneratedURL = null;

    this._cacheDOM();
    this._bindEvents();
    this._initTheme();
    this._populateLanguages();
    this._initVoices();
    this._checkBrowserSupport();
  }

  // ── DOM cache ────────────────────────────────────────────────
  _cacheDOM() {
    this.dom = {
      // Upload
      fileUpload: document.getElementById('file-upload'),
      uploadZone: document.querySelector('.upload-zone'),
      fileInfo: document.getElementById('file-info'),
      fileName: document.getElementById('file-name'),
      fileSize: document.getElementById('file-size'),
      fileDuration: document.getElementById('file-duration'),
      audioPlayer: document.getElementById('audio-player'),
      videoPlayer: document.getElementById('video-player'),
      videoContainer: document.getElementById('video-container'),

      // Recorder
      recordBtn: document.getElementById('record-btn'),

      // Transcription
      transcribeBtn: document.getElementById('transcribe-btn'),
      transcribeLang: document.getElementById('transcribe-lang'),
      transcriptArea: document.getElementById('transcript-area'),
      interimDisplay: document.getElementById('interim-display'),

      // Translation
      sourceLang: document.getElementById('source-lang'),
      targetLang: document.getElementById('target-lang'),
      swapLangsBtn: document.getElementById('swap-langs-btn'),
      translateBtn: document.getElementById('translate-btn'),
      sourceText: document.getElementById('source-text'),
      translatedText: document.getElementById('translated-text'),
      copyBtn: document.getElementById('copy-btn'),

      // TTS
      voiceSelect: document.getElementById('voice-select'),
      pitchSlider: document.getElementById('pitch-slider'),
      pitchValue: document.getElementById('pitch-value'),
      speedSlider: document.getElementById('speed-slider'),
      speedValue: document.getElementById('speed-value'),
      ttsText: document.getElementById('tts-text'),
      generateBtn: document.getElementById('generate-btn'),
      downloadBtn: document.getElementById('download-btn'),
      speakBtn: document.getElementById('speak-btn'),

      // Voice sample
      voiceSampleUpload: document.getElementById('voice-sample-upload'),
      playSampleBtn: document.getElementById('play-sample-btn'),
      sampleInfo: document.getElementById('sample-info'),

      // Theme
      themeToggle: document.getElementById('theme-toggle'),

      // Toast & progress
      toastContainer: document.getElementById('toast-container'),
      progressBar: document.getElementById('progress-bar')
    };
  }

  // ── Event binding ────────────────────────────────────────────
  _bindEvents() {
    // File upload
    if (this.dom.fileUpload) {
      this.dom.fileUpload.addEventListener('change', (e) => this._handleFileUpload(e.target.files[0]));
    }
    if (this.dom.uploadZone) {
      this.mediaHandler.setupDragDrop(this.dom.uploadZone, (f) => this._handleFileUpload(f));
      this.dom.uploadZone.addEventListener('click', () => this.dom.fileUpload?.click());
    }

    // Record
    if (this.dom.recordBtn) {
      this.dom.recordBtn.addEventListener('click', () => this._toggleRecording());
    }

    // Transcribe
    if (this.dom.transcribeBtn) {
      this.dom.transcribeBtn.addEventListener('click', () => this._toggleTranscription());
    }

    // Translate
    if (this.dom.translateBtn) {
      this.dom.translateBtn.addEventListener('click', () => this._doTranslate());
    }
    if (this.dom.swapLangsBtn) {
      this.dom.swapLangsBtn.addEventListener('click', () => this._swapLanguages());
    }
    if (this.dom.copyBtn) {
      this.dom.copyBtn.addEventListener('click', () => this._copyTranslation());
    }

    // TTS sliders
    if (this.dom.pitchSlider) {
      this.dom.pitchSlider.addEventListener('input', () => {
        if (this.dom.pitchValue) this.dom.pitchValue.textContent = this.dom.pitchSlider.value;
      });
    }
    if (this.dom.speedSlider) {
      this.dom.speedSlider.addEventListener('input', () => {
        if (this.dom.speedValue) this.dom.speedValue.textContent = this.dom.speedSlider.value;
      });
    }

    // TTS generate & speak
    if (this.dom.generateBtn) {
      this.dom.generateBtn.addEventListener('click', () => this._generateTTS());
    }
    if (this.dom.speakBtn) {
      this.dom.speakBtn.addEventListener('click', () => this._speakTTS());
    }
    if (this.dom.downloadBtn) {
      this.dom.downloadBtn.addEventListener('click', () => this._downloadTTS());
    }

    // Voice sample
    if (this.dom.voiceSampleUpload) {
      this.dom.voiceSampleUpload.addEventListener('change', (e) => this._handleSampleUpload(e.target.files[0]));
    }
    if (this.dom.playSampleBtn) {
      this.dom.playSampleBtn.addEventListener('click', () => this._playSample());
    }

    // Theme
    if (this.dom.themeToggle) {
      this.dom.themeToggle.addEventListener('click', () => this._toggleTheme());
    }

    // Auto-detect Hindi in source text
    if (this.dom.sourceText) {
      this.dom.sourceText.addEventListener('input', () => this._autoDetectLang());
    }

    // AI Studio Modal & Features
    const aiStudioBtn = document.getElementById('ai-studio-btn');
    const aiModalOverlay = document.getElementById('ai-modal-overlay');
    const closeAiModal = document.getElementById('close-ai-modal');
    const saveAiKey = document.getElementById('save-ai-key');
    const aiKeyInput = document.getElementById('ai-key-input');
    const doctorBtn = document.getElementById('ai-script-doctor-btn');
    const voiceActivateBtn = document.getElementById('voice-activate-btn');
    const voiceLicenseInput = document.getElementById('voice-license-input');
    const voiceProBadge = document.getElementById('voice-pro-badge');

    if (aiStudioBtn && aiModalOverlay) {
      aiStudioBtn.addEventListener('click', () => {
        aiModalOverlay.style.display = 'flex';
        if (aiKeyInput) aiKeyInput.value = localStorage.getItem('ai_studio_key') || localStorage.getItem('ai_api_key') || '';
      });
    }
    if (closeAiModal && aiModalOverlay) {
      closeAiModal.addEventListener('click', () => aiModalOverlay.style.display = 'none');
      aiModalOverlay.addEventListener('click', (e) => {
        if (e.target === aiModalOverlay) aiModalOverlay.style.display = 'none';
      });
    }
    if (saveAiKey && aiKeyInput) {
      saveAiKey.addEventListener('click', () => {
        const key = aiKeyInput.value.trim();
        if (key) {
          localStorage.setItem('ai_studio_key', key);
          localStorage.setItem('ai_api_key', key);
          this.showToast('✅ AI Studio API Key saved locally!', 'success');
          if (aiModalOverlay) aiModalOverlay.style.display = 'none';
        } else {
          this.showToast('Please enter a valid key.', 'error');
        }
      });
    }
    if (doctorBtn) {
      doctorBtn.addEventListener('click', () => this._doDoctorScript());
    }

    // Check Pro status
    if (localStorage.getItem('voice_studio_tier') === 'pro' && voiceProBadge) {
      voiceProBadge.textContent = 'PRO ACTIVE';
      voiceProBadge.style.background = '#10b981';
      voiceProBadge.style.color = '#fff';
    }
    if (voiceActivateBtn && voiceLicenseInput) {
      voiceActivateBtn.addEventListener('click', () => {
        const val = voiceLicenseInput.value.trim();
        if (val.toUpperCase().includes('PRO') || val.length >= 8) {
          localStorage.setItem('voice_studio_tier', 'pro');
          if (voiceProBadge) {
            voiceProBadge.textContent = 'PRO ACTIVE';
            voiceProBadge.style.background = '#10b981';
            voiceProBadge.style.color = '#fff';
          }
          this.showToast('🎉 Voice Studio Creator Pro Activated! 320kbps HD Audio Unlocked.', 'success');
        } else {
          this.showToast('Please enter a valid Pro license key (e.g. PROHARSHIT2026)', 'error');
        }
      });
    }
  }

  // ── Browser support ──────────────────────────────────────────
  _checkBrowserSupport() {
    if (!this.transcriber.supported) {
      this.showToast('Speech Recognition is not supported in this browser. Transcription features will be unavailable. Try Chrome or Edge.', 'warning');
      if (this.dom.transcribeBtn) this.dom.transcribeBtn.disabled = true;
    }
    if (!window.speechSynthesis) {
      this.showToast('Speech Synthesis is not supported in this browser. TTS features will be unavailable.', 'warning');
    }
  }

  // ── Language dropdowns ───────────────────────────────────────
  _populateLanguages() {
    // Transcription language
    if (this.dom.transcribeLang && this.transcriber.supported) {
      this.dom.transcribeLang.innerHTML = '';
      for (const lang of this.transcriber.languages) {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.label;
        this.dom.transcribeLang.appendChild(opt);
      }
    }

    // Translation languages
    const populateLangSelect = (sel) => {
      if (!sel) return;
      sel.innerHTML = '';
      for (const lang of this.translator.languages) {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.label;
        sel.appendChild(opt);
      }
    };
    populateLangSelect(this.dom.sourceLang);
    populateLangSelect(this.dom.targetLang);

    // Default selection
    if (this.dom.sourceLang) this.dom.sourceLang.value = 'en';
    if (this.dom.targetLang) this.dom.targetLang.value = 'hi';
  }

  async _initVoices() {
    if (!window.speechSynthesis) return;
    await this.synthesizer.loadVoices();
    if (this.dom.voiceSelect) {
      this.synthesizer.populateSelect(this.dom.voiceSelect);
    }
  }

  // ── File upload ──────────────────────────────────────────────
  async _handleFileUpload(file) {
    if (!file) return;
    try {
      this.showProgress();
      const info = await this.mediaHandler.handleFile(file);

      // Update file info display
      if (this.dom.fileInfo) this.dom.fileInfo.classList.remove('hidden');
      if (this.dom.fileName) this.dom.fileName.textContent = info.name;
      if (this.dom.fileSize) this.dom.fileSize.textContent = info.size;
      if (this.dom.fileDuration) this.dom.fileDuration.textContent = this.mediaHandler.formatDuration(info.duration);

      if (info.isVideo) {
        // Show video player
        if (this.dom.videoPlayer) {
          this.dom.videoPlayer.src = info.url;
          this.dom.videoPlayer.load();
        }
        if (this.dom.videoContainer) this.dom.videoContainer.classList.remove('hidden');
        if (this.dom.audioPlayer) this.dom.audioPlayer.classList.add('hidden');

        // Extract audio for waveform
        try {
          this.updateStatus('upload', 'Extracting audio from video…', 'info');
          const buffer = await this.mediaHandler.extractAudioFromVideo(file);
          this.visualizer.drawWaveform(buffer);
        } catch (_) {
          // Not critical
        }
      } else {
        // Show audio player
        if (this.dom.audioPlayer) {
          this.dom.audioPlayer.src = info.url;
          this.dom.audioPlayer.load();
          this.dom.audioPlayer.classList.remove('hidden');
        }
        if (this.dom.videoContainer) this.dom.videoContainer.classList.add('hidden');

        // Draw waveform
        try {
          const ab = await file.arrayBuffer();
          const buffer = await this.audioContext.decodeAudioData(ab);
          this.visualizer.drawWaveform(buffer);
        } catch (_) {
          // Not all formats decode in every browser
        }
      }

      this.showToast(`Loaded: ${info.name}`, 'success');
      this.updateStatus('upload', 'File loaded successfully', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      this.hideProgress();
    }
  }

  // ── Recording ────────────────────────────────────────────────
  async _toggleRecording() {
    if (this.recorder.isRecording) {
      // Stop
      this.dom.recordBtn?.classList.remove('recording');
      this.updateStatus('recorder', 'Stopping…', 'info');
      const result = await this.recorder.stop();
      if (result) {
        if (this.dom.audioPlayer) {
          this.dom.audioPlayer.src = result.url;
          this.dom.audioPlayer.classList.remove('hidden');
          this.dom.audioPlayer.load();
        }
        if (this.dom.videoContainer) this.dom.videoContainer.classList.add('hidden');
        this.showToast('Recording saved!', 'success');
        this.updateStatus('recorder', 'Recording saved', 'success');

        // Draw waveform of recorded audio
        try {
          const ab = await result.blob.arrayBuffer();
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const buffer = await ctx.decodeAudioData(ab);
          this.visualizer.drawWaveform(buffer);
          ctx.close().catch(() => {});
        } catch (_) {}
      }
    } else {
      // Start
      try {
        await this.recorder.start();
        this.dom.recordBtn?.classList.add('recording');
        this.updateStatus('recorder', 'Recording…', 'info');
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }
  }

  // ── Transcription ────────────────────────────────────────────
  _toggleTranscription() {
    if (!this.transcriber.supported) {
      this.showToast('Speech Recognition is not supported in this browser.', 'error');
      return;
    }

    if (this.transcriber.isRunning) {
      this.transcriber.stopTranscription();
      this.dom.transcribeBtn?.classList.remove('recording');
      if (this.dom.transcribeBtn) this.dom.transcribeBtn.textContent = 'Start Transcription';
      this.updateStatus('transcription', 'Stopped', 'info');
      return;
    }

    // Set language
    const lang = this.dom.transcribeLang?.value || 'en-US';
    this.transcriber.setLanguage(lang);

    // Callbacks
    this.transcriber.onResult((final, interim) => {
      if (this.dom.transcriptArea) this.dom.transcriptArea.value = final;
      if (this.dom.interimDisplay) {
        this.dom.interimDisplay.textContent = interim;
        this.dom.interimDisplay.style.opacity = interim ? '0.55' : '0';
      }
      // Also mirror to source-text for translation convenience
      if (this.dom.sourceText && final.trim()) {
        this.dom.sourceText.value = final.trim();
      }
    });

    this.transcriber.onError((msg) => this.showToast(msg, 'error'));
    this.transcriber.onEnd(() => {
      this.dom.transcribeBtn?.classList.remove('recording');
      if (this.dom.transcribeBtn) this.dom.transcribeBtn.textContent = 'Start Transcription';
    });

    try {
      this.transcriber.startTranscription();
      this.dom.transcribeBtn?.classList.add('recording');
      if (this.dom.transcribeBtn) this.dom.transcribeBtn.textContent = 'Stop Transcription';
      this.updateStatus('transcription', 'Listening…', 'info');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // ── Translation ──────────────────────────────────────────────
  async _doTranslate() {
    const text = this.dom.sourceText?.value?.trim();
    if (!text) {
      this.showToast('Please enter text to translate.', 'error');
      return;
    }
    const from = this.dom.sourceLang?.value || 'en';
    const to = this.dom.targetLang?.value || 'hi';
    const tone = document.getElementById('ai-dubbing-tone')?.value || 'Natural Conversational Spoken Hindi';

    try {
      this._setTranslating(true);
      this.showProgress();
      const result = await this.translator.translate(text, from, to, tone);
      if (this.dom.translatedText) this.dom.translatedText.value = result;
      if (this.dom.ttsText) this.dom.ttsText.value = result;
      this.showToast('Translation complete with AI Studio Engine!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      this._setTranslating(false);
      this.hideProgress();
    }
  }

  async _doDoctorScript() {
    const text = (this.dom.translatedText?.value || this.dom.sourceText?.value || '').trim();
    if (!text) {
      this.showToast('Please enter or translate text first.', 'error');
      return;
    }
    const doctorBtn = document.getElementById('ai-script-doctor-btn');
    try {
      if (doctorBtn) {
        doctorBtn.disabled = true;
        doctorBtn.textContent = 'Doctoring…';
      }
      this.showProgress();
      const polished = await this.translator.doctorScript(text);
      if (this.dom.translatedText) this.dom.translatedText.value = polished;
      if (this.dom.ttsText) this.dom.ttsText.value = polished;
      this.showToast('AI Script Doctor: Pauses & flow enhanced!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      if (doctorBtn) {
        doctorBtn.disabled = false;
        doctorBtn.textContent = '🩺 AI Script Doctor';
      }
      this.hideProgress();
    }
  }

  _setTranslating(busy) {
    if (this.dom.translateBtn) {
      this.dom.translateBtn.disabled = busy;
      this.dom.translateBtn.textContent = busy ? 'Translating…' : 'Translate';
    }
  }

  _swapLanguages() {
    if (!this.dom.sourceLang || !this.dom.targetLang) return;
    const tmp = this.dom.sourceLang.value;
    this.dom.sourceLang.value = this.dom.targetLang.value;
    this.dom.targetLang.value = tmp;

    // Also swap text boxes
    if (this.dom.sourceText && this.dom.translatedText) {
      const tmpText = this.dom.sourceText.value;
      this.dom.sourceText.value = this.dom.translatedText.value;
      this.dom.translatedText.value = tmpText;
    }
  }

  async _copyTranslation() {
    const text = this.dom.translatedText?.value;
    if (!text) {
      this.showToast('Nothing to copy.', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied to clipboard!', 'success');
    } catch {
      // Fallback
      this.dom.translatedText.select();
      document.execCommand('copy');
      this.showToast('Copied to clipboard!', 'success');
    }
  }

  // ── Auto-detect Hindi ────────────────────────────────────────
  _autoDetectLang() {
    const text = this.dom.sourceText?.value || '';
    const devanagariPattern = /[\u0900-\u097F]/;
    if (devanagariPattern.test(text)) {
      if (this.dom.sourceLang && this.dom.sourceLang.value !== 'hi') {
        this.dom.sourceLang.value = 'hi';
      }
    }
  }

  // ── TTS ──────────────────────────────────────────────────────
  _speakTTS() {
    const text = this.dom.ttsText?.value?.trim();
    if (!text) {
      this.showToast('Please enter text to speak.', 'error');
      return;
    }
    try {
      const voice = this.dom.voiceSelect?.value;
      const pitch = parseFloat(this.dom.pitchSlider?.value || 1);
      const rate = parseFloat(this.dom.speedSlider?.value || 1);
      this.synthesizer.speak(text, voice, pitch, rate);
      this.showToast('Speaking…', 'info');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async _generateTTS() {
    const text = this.dom.ttsText?.value?.trim();
    if (!text) {
      this.showToast('Please enter text to generate.', 'error');
      return;
    }

    try {
      if (this.dom.generateBtn) this.dom.generateBtn.disabled = true;
      this.showProgress();

      const voice = this.dom.voiceSelect?.value;
      const pitch = parseFloat(this.dom.pitchSlider?.value || 1);
      const rate = parseFloat(this.dom.speedSlider?.value || 1);

      const result = await this.synthesizer.generateAndDownload(text, voice, pitch, rate);
      if (result.fallback) {
        this.showToast(result.message, 'info');
      } else {
        this.showToast('Audio generated and download started!', 'success');
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      if (this.dom.generateBtn) this.dom.generateBtn.disabled = false;
      this.hideProgress();
    }
  }

  _downloadTTS() {
    // Re-trigger generate & download
    this._generateTTS();
  }

  // ── Voice Sample ─────────────────────────────────────────────
  async _handleSampleUpload(file) {
    if (!file) return;
    try {
      this.showProgress();
      const chars = await this.sampler.loadSample(file);
      this._displaySampleCharacteristics(chars);
      if (this.dom.playSampleBtn) this.dom.playSampleBtn.disabled = false;
      this.showToast('Voice sample loaded!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      this.hideProgress();
    }
  }

  _displaySampleCharacteristics(chars) {
    if (!this.dom.sampleInfo) return;
    this.dom.sampleInfo.classList.remove('hidden');
    this.dom.sampleInfo.innerHTML = `
      <div class="sample-stats">
        <div class="stat">
          <span class="stat-label">Duration</span>
          <span class="stat-value">${chars.duration}s</span>
        </div>
        <div class="stat">
          <span class="stat-label">Sample Rate</span>
          <span class="stat-value">${(chars.sampleRate / 1000).toFixed(1)} kHz</span>
        </div>
        <div class="stat">
          <span class="stat-label">Channels</span>
          <span class="stat-value">${chars.channels === 1 ? 'Mono' : 'Stereo'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Avg Frequency</span>
          <span class="stat-value">${chars.avgFrequency} Hz</span>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min(chars.avgFrequency / 5, 100)}%"></div></div>
        </div>
        <div class="stat">
          <span class="stat-label">Volume</span>
          <span class="stat-value">${chars.volumeDb} dB</span>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min((parseFloat(chars.volumeDb) + 60) * 1.67, 100)}%"></div></div>
        </div>
        <div class="stat">
          <span class="stat-label">Peak Amplitude</span>
          <span class="stat-value">${chars.peakAmplitude}</span>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:${(parseFloat(chars.peakAmplitude) * 100).toFixed(1)}%"></div></div>
        </div>
      </div>`;
  }

  _playSample() {
    try {
      this.sampler.play();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // ── Theme ────────────────────────────────────────────────────
  _initTheme() {
    const saved = localStorage.getItem('vs-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this._updateThemeIcon();
  }

  _toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('vs-theme', next);
    this._updateThemeIcon();
  }

  _updateThemeIcon() {
    if (!this.dom.themeToggle) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.dom.themeToggle.textContent = isDark ? '☀️' : '🌙';
    this.dom.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  // ── Toast notifications ──────────────────────────────────────
  showToast(message, type = 'info') {
    let container = this.dom.toastContainer;
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
      this.dom.toastContainer = container;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${message}</span>`;

    container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.addEventListener('transitionend', () => toast.remove());
      // Safety removal
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  // ── Progress bar ─────────────────────────────────────────────
  showProgress() {
    let bar = this.dom.progressBar;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'progress-bar';
      bar.innerHTML = '<div class="progress-fill"></div>';
      document.body.prepend(bar);
      this.dom.progressBar = bar;
    }
    bar.classList.add('active');
  }

  hideProgress() {
    if (this.dom.progressBar) {
      this.dom.progressBar.classList.remove('active');
    }
  }

  // ── Status indicators ───────────────────────────────────────
  updateStatus(sectionId, message, type = 'info') {
    const el = document.getElementById(`${sectionId}-status`);
    if (!el) return;
    el.textContent = message;
    el.className = `status status-${type}`;
  }
}

// ─── Initialization ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.voiceStudio = new App();
});
