const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, '../miniprogram/audio_assets');
const OUTPUT_FILE = path.join(__dirname, '../miniprogram/audioManifest.js');
const CLOUD_BASE_PATH = 'cloud://cloud1-0gam6qm6bbb261bd.636c-cloud1-0gam6qm6bbb261bd-1395070804/audio/';

function main() {
    if (!fs.existsSync(AUDIO_DIR)) {
        console.error('Audio directory not found:', AUDIO_DIR);
        return;
    }

    const files = fs.readdirSync(AUDIO_DIR).filter(file => file.endsWith('.mp3'));
    const manifest = {};

    files.forEach(file => {
        const key = path.basename(file, '.mp3');
        manifest[key] = CLOUD_BASE_PATH + file;
    });

    const content = `module.exports = ${JSON.stringify(manifest, null, 2)};\n`;
    fs.writeFileSync(OUTPUT_FILE, content);
    console.log(`Generated manifest with ${Object.keys(manifest).length} entries at ${OUTPUT_FILE}`);
}

main();
