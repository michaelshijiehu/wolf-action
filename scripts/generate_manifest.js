const fs = require('fs');
const path = require('path');
const { ASSETS } = require('./generate_audio_assets');

const CLOUD_BASE = 'cloud://cloud1-0gam6qm6bbb261bd.636c-cloud1-0gam6qm6bbb261bd-1395070804/audio/';
const OUTPUT_FILE = path.join(__dirname, '../miniprogram/audioManifest.js');

function generate() {
    const manifest = {};
    const keys = Object.keys(ASSETS);

    keys.forEach(key => {
        manifest[key] = `${CLOUD_BASE}${key}.mp3`;
    });

    const content = `module.exports = ${JSON.stringify(manifest, null, 2)};`;
    fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
    console.log(`Manifest JS generated at: ${OUTPUT_FILE}`);
}

generate();
