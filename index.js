const express = require('express');
const { SpeechClient } = require('@google-cloud/speech');
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const path = require('path'); // Although path and fs are included, fs is not directly used in the current version for file operations, but good to have for potential future enhancements.
const fs = require('fs'); // Same as above, not directly used for file operations, but good to have.

const app = express();
const port = process.env.PORT || 3000; // Use port from environment variable (Render sets this) or default to 3000

// Enable CORS for all origins.
// IMPORTANT: In a production environment, you should restrict this to your frontend's domain
// For example: cors({ origin: 'https://your-frontend-domain.com' })
app.use(cors());
app.use(express.json()); // To parse JSON bodies (though multer handles the main audio body)

// Set up multer for memory storage. This is suitable for smaller audio files.
// For very large audio files, consider storing them temporarily on disk or uploading directly to GCS from frontend.
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Google Cloud Speech-to-Text client
let speechClient;
try {
    // Parse the JSON string from the environment variable
    // This environment variable (GOOGLE_APPLICATION_CREDENTIALS_JSON) will be set on Render
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    speechClient = new SpeechClient({ credentials });
    console.log('Google Cloud Speech-to-Text client initialized successfully.');
} catch (error) {
    console.error('Failed to initialize Google Cloud Speech-to-Text client:', error);
    console.error('Ensure GOOGLE_APPLICATION_CREDENTIALS_JSON is set correctly in Render environment variables.');
    // In a real application, you might want to gracefully degrade or prevent server startup.
    // For now, we'll log the error and let the app potentially run but fail on transcription requests.
}

// Transcription endpoint
// This endpoint expects a file upload with the field name 'audio'
app.post('/transcribe', upload.single('audio'), async (req, res) => {
    // Check if an audio file was uploaded
    if (!req.file) {
        return res.status(400).send('No audio file uploaded.');
    }

    const audioBuffer = req.file.buffer; // Get the audio data as a Buffer

    // Configure the audio request for Google Cloud Speech-to-Text
    // IMPORTANT: You MUST set the correct encoding and sampleRateHertz for your audio files.
    // Common encodings: 'LINEAR16' (for WAV PCM), 'MP3', 'FLAC', 'OGG_OPUS'
    // SampleRateHertz: The sample rate of your audio (e.g., 16000, 44100).
    // If these are incorrect, transcription will fail or be inaccurate.
    // For a robust app, you might use a library to detect audio properties or
    // instruct users on required formats.
    const audioConfig = {
        encoding: 'MP3', // <--- ADJUST THIS based on your audio file type (e.g., 'LINEAR16', 'FLAC', 'MP3')
        sampleRateHertz: 16000, // <--- ADJUST THIS based on your audio's sample rate (e.g., 16000, 44100)
        languageCode: 'en-US', // <--- ADJUST THIS to the language of your audio (e.g., 'es-ES' for Spanish)
        enableWordTimeOffsets: false, // Set to true to get word-level timestamps
        enableAutomaticPunctuation: true, // Recommended for better readability
    };

    const audio = {
        content: audioBuffer.toString('base64'), // Send audio content as Base64 string
    };

    const request = {
        audio: audio,
        config: audioConfig,
    };

    try {
        // Perform the speech recognition
        // For long audio files (> 1 minute), consider using `longRunningRecognize`
        // which uses Google Cloud Storage for input and is asynchronous.
        const [response] = await speechClient.recognize(request);

        // Extract the transcription from the response
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n'); // Join multiple segments with newlines

        // Send the transcription back to the frontend
        res.json({ transcription: transcription || 'No transcription found.' });

    } catch (error) {
        console.error('ERROR during transcription:', error);
        // Provide a more informative error message to the client
        res.status(500).json({ error: 'Failed to transcribe audio.', details: error.message });
    }
});

// Simple root endpoint for health check or basic info
app.get('/', (req, res) => {
    res.send('Audio Transcriber Backend is running!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});