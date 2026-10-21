# 🎙️ Voice Studio — Multilingual Audio/Video Voice Transformation

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Speech API](https://img.shields.io/badge/API-Web%20Speech%20API-blue.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
[![Web Workers](https://img.shields.io/badge/Async-Web%20Workers-purple.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Voice Studio** is a cutting-edge web application designed for processing audio and video files. It transcribes spoken words, translates across 20+ languages (with specialized Hindi support), and synthesizes natural audio output using customizable browser voice profiles.

---

## ✨ Features

- 📂 **Multi-Format Input**: Upload audio (`.mp3`, `.wav`, `.ogg`, `.m4a`) or video (`.mp4`, `.webm`) files.
- 🗣️ **Live Speech-to-Text (STT)**: Browser-native speech recognition engine with real-time transcription.
- 🌐 **Multilingual Translation**: Seamless translation support between 20+ languages including Hindi, English, Spanish, French, German, Japanese, and more.
- 🔊 **Voice Synthesis (TTS)**: Custom pitch, rate, and voice profile selection with instant playback.
- ⚙️ **Web Worker Optimization**: Offloads heavy audio data parsing to background Web Workers to prevent UI freezing.
- 🌓 **Ambient Dark/Light Theme**: Eye-friendly glassmorphism interface with ambient glowing background effects.

---

## 📁 Project Structure

```text
voice/
├── index.html       # Voice Studio web application interface
├── app.js           # Core state management, STT/TTS controllers, UI bindings
├── styles.css       # Responsive styling, animations, ambient orbs
├── worker.js        # Background worker for performance optimization
├── .gitignore       # Git configuration
└── README.md        # Documentation
```

---

## 🚀 How to Run Locally

You can open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Brave) or serve it locally:

```bash
# Using Python
python -m http.server 3000

# Using Node (npx)
npx serve .
```

Navigate to `http://localhost:3000` to start transforming voice and audio files.

---

## 🔒 Privacy & Security

All speech recognition, audio parsing, and synthesis take place locally inside your web browser. No private voice recordings are sent to unauthorized third-party servers.

---

## 📜 License

MIT License. Free for personal, educational, and open-source use.
