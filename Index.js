const express = require('express');
const bodyParser = require('body-parser');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const Tiktok = require('@tobyg74/tiktok-api-dl');

// Initialize Express app and configure bodyParser middleware
const app = express();
app.use(bodyParser.json());

// Initialize WhatsApp client with LocalAuth strategy and remote web version cache
const client = new Client({
    authStrategy: new LocalAuth(),
    webVersion: "2.2412.54v2",
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/guigo613/alternative-wa-version/main/html/2.2412.54v2.html',
    },
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: '/usr/bin/google-chrome',
    }
});

// Event listener for QR code generation
client.on('qr', (qr) => {
    // Display QR code to scan for authentication
    qrcode.generate(qr, { small: true });
});

// Event listener when client is ready
client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

// Initialize WhatsApp client
client.initialize().catch((err) => {
    console.error('Error initializing WhatsApp client:', err);
});

// Function to download and convert TikTok video
async function downloadAndConvertTikTokVideo(shortUrl, msg) {
    try {
        // Download video using the TikTok API
        const result = await Tiktok.Downloader(shortUrl, { version: 'v2' });

        if (result && result.result && result.result.video) {
            const videoUrl = result.result.video;
            console.log(`Video URL: ${videoUrl}`);

            // Download video file using axios
            const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });

            // Extract filename from Content-Disposition header
            let filename = 'video.mp4'; // Default filename if no header found
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match && match[1]) {
                    filename = match[1];
                }
            }

            console.log(`Downloaded filename: ${filename}`);

            // Ensure the 'videos' directory exists
            fs.mkdirSync('videos', { recursive: true });

            // Define paths for input and output files
            const inputFilePath = path.join('videos', filename);
            const outputFilePath = path.join('videos', 'output.mp4');

            // Save the downloaded video to a file
            fs.writeFileSync(inputFilePath, response.data);

            // Convert the video using ffmpeg
            const ffmpegProcess = ffmpeg(inputFilePath)
                .outputOptions(['-c:v libx264', '-c:a aac']) // Ensure options are provided as an array of strings
                .save(outputFilePath)
                .on('start', (commandLine) => {
                    console.log('FFmpeg command: ' + commandLine);
                })
                .on('end', async () => {
                    console.log('Video conversion completed.');

                    try {
                        // Read the converted video file
                        const convertedVideoBuffer = fs.readFileSync(outputFilePath);
                        const base64Video = convertedVideoBuffer.toString('base64');

                        // Create the MessageMedia object with the correct MIME type
                        const media = new MessageMedia('video/mp4', base64Video);

                        console.log("Start sending Video");
                        console.log(msg.from);

                        // Send the media
                        await client.sendMessage(msg.from, media);

                        console.log("Successfully sent Video");

                        // Clean up the temporary files
                        fs.unlinkSync(inputFilePath);
                        fs.unlinkSync(outputFilePath);

                        // Close the ffmpeg process to prevent unintended repeated events
                        ffmpegProcess.kill('SIGINT');
                    } catch (err) {
                        console.error('Error during video sending process:', err);
                    }
                })
                .on('error', (err, stdout, stderr) => {
                    console.error('Error converting video:', err.message);
                    console.error('FFmpeg stderr:', stderr);
                });
        } else {
            console.error('Error: Unable to fetch video URL from TikTok API result');
        }
    } catch (error) {
        console.error('Error downloading or converting TikTok video:', error);
    }
}


// Endpoint to handle incoming POST requests
app.post('/video', async (req, res) => {
    const { videoUrl, msg } = req.body;

    if (!videoUrl || !msg) {
        return res.status(400).json({ error: 'Missing required fields in request body' });
    }

    try {
        // Download and convert the TikTok video, then send it via WhatsApp
        await downloadAndConvertTikTokVideo(videoUrl, msg);
        res.status(200).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
