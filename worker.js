import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

// Disable local models to fetch from HuggingFace Hub
env.allowLocalModels = false;

let transcriber = null;

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    const { type, audioData } = event.data;

    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', message: 'Loading AI Model (Whisper Tiny)... This may take a minute on first run.' });
            
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                progress_callback: (progress) => {
                    self.postMessage({ status: 'progress', progress });
                }
            });
            
            self.postMessage({ status: 'ready', message: 'Model loaded successfully!' });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    } 
    else if (type === 'transcribe') {
        if (!transcriber) {
            self.postMessage({ status: 'error', error: 'Model not loaded yet!' });
            return;
        }

        try {
            self.postMessage({ status: 'transcribing', message: 'Transcribing audio...' });
            
            // Perform transcription
            const result = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe',
                return_timestamps: true
            });
            
            self.postMessage({ status: 'complete', result });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    }
});
