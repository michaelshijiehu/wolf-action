const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// ==========================================
// 配置区域
// ==========================================
// 请在运行前设置环境变量，或直接填入您的 Key
const APP_ID = process.env.BAIDU_APP_ID || '36629731';
const API_KEY = process.env.BAIDU_API_KEY || 'bjf1Rj7KQvdILc321yRvht2A';
const SECRET_KEY = process.env.BAIDU_SECRET_KEY || 'f2rFvS6CSHVQsgsrzjrlIGrZoDDZS546';

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '../miniprogram/audio_assets');

// 语音配置
const TTS_OPTIONS = {
    per: 5003, // 发音人: 5003(度逍遥-精品), 5118(度小鹿-精品), 106(度博文-精品), 111(度小萌-精品)
    spd: 5, // 语速 0-15
    pit: 5, // 音调 0-15
    vol: 5, // 音量 0-15
    cuid: 'wolf_game_generator',
    lan: 'zh',
    ctp: 1
};

// ==========================================
// 语音资源定义 (Atomic Assets)
// ==========================================
const ASSETS = {
    // --- 数字 (已废弃，使用 PLAYER_X 替代) ---

    // --- 通用 ---
    // PLAYER_SUFFIX (已废弃)
    'DIED_IN_BLOOD': '倒在了血泊中',
    'SAFE_NIGHT': '昨晚，是平安夜',
    'YESTERDAY_NIGHT': '昨晚',
    'GAME_OVER': '游戏结束',
    'WOLF_WIN_VILLAGER': '狼人屠杀所有村民，狼人阵营胜利！',
    'WOLF_WIN_GOD': '狼人屠杀所有神职，狼人阵营胜利！',
    'VILLAGER_WIN': '狼人全部出局，好人阵营胜利！',
    'THIRD_PARTY_WIN': '游戏结束，第三方阵营胜利！',

    // --- 阶段通用 (Context Aware) ---
    'EYES_CLOSE': '请闭眼',
    'EYES_OPEN': '请睁眼',
    'DAWN': '天亮了',
    'DARK': '天黑',
    'DAWN_FULL': '天亮了，请大家睁眼。',
    'DARK_FULL': '天黑请闭眼。',

    // --- 开场 ---
    'WELCOME': '欢迎来到狼人杀游戏。',
    'DEAL_CARDS': '正在发牌，请看牌。',
    'GAME_START_FULL': '天黑请闭眼。',

    // --- 丘比特 ---
    'CUPID_WAKE': '丘比特请睁眼。',
    'CUPID_OPERATE': '请连情侣。',
    'CUPID_SLEEP': '丘比特请闭眼。',
    'LOVER_WAKE': '情侣请睁眼。',
    'LOVER_END': '情侣请闭眼。',

    // --- 守卫 ---
    'GUARD_WAKE': '守卫请睁眼。',
    'GUARD_OPERATE': '请守护。',
    'GUARD_SLEEP': '守卫请闭眼。',

    // --- 狼人 ---
    'WEREWOLF_WAKE': '狼人请睁眼。',
    'WEREWOLF_OPERATE': '请杀人。',
    'WEREWOLF_SLEEP': '狼人请闭眼。',

    // --- 女巫 ---
    'WITCH_WAKE': '女巫请睁眼。',
    'WITCH_OPERATE': '请用药。',
    'WITCH_SLEEP': '女巫请闭眼。',

    // --- 预言家 ---
    'SEER_WAKE': '预言家请睁眼。',
    'SEER_OPERATE': '请验人。',
    'SEER_SLEEP': '预言家请闭眼。',

    // --- 猎人 ---
    'HUNTER_WAKE': '猎人请睁眼。',
    'HUNTER_OPERATE': '请确认状态。',
    'HUNTER_SLEEP': '猎人请闭眼。',

    'HUNTER_SLEEP': '猎人请闭眼。',

    // --- 新增角色 ---
    'WILD_CHILD_WAKE': '野孩子请睁眼。',
    'WILD_CHILD_OPERATE': '请选择榜样。',
    'WILD_CHILD_SLEEP': '野孩子请闭眼。',

    'MAGICIAN_WAKE': '魔术师请睁眼。',
    'MAGICIAN_OPERATE': '请交换号码。',
    'MAGICIAN_SLEEP': '魔术师请闭眼。',

    'DREAM_CATCHER_WAKE': '摄梦人请睁眼。',
    'DREAM_CATCHER_OPERATE': '请选择。',
    'DREAM_CATCHER_SLEEP': '摄梦人请闭眼。',

    'WOLF_BEAUTY_WAKE': '狼美人请睁眼。',
    'WOLF_BEAUTY_OPERATE': '请魅惑。',
    'WOLF_BEAUTY_SLEEP': '狼美人请闭眼。',

    'GARGOYLE_WAKE': '石像鬼请睁眼。',
    'GARGOYLE_OPERATE': '请查验。',
    'GARGOYLE_SLEEP': '石像鬼请闭眼。',

    'MERCHANT_WAKE': '黑商请睁眼。',
    'MERCHANT_OPERATE': '请交易。',
    'MERCHANT_SLEEP': '黑商请闭眼。',

    'SILENCER_WAKE': '禁言长老请睁眼。',
    'SILENCER_OPERATE': '请禁言。',
    'SILENCER_SLEEP': '禁言长老请闭眼。',

    'GRAVEKEEPER_WAKE': '守墓人请睁眼。',
    'GRAVEKEEPER_OPERATE': '请确认。',
    'GRAVEKEEPER_SLEEP': '守墓人请闭眼。',

    'BEAR_WAKE': '熊请睁眼。',
    'BEAR_OPERATE': '......',
    'BEAR_SLEEP': '熊请闭眼。',

    'KNIGHT_ACTION': '骑士请决斗',
    'GAP_NOISE': '。', // 短暂停顿，或使用特殊音效

    // --- 警长 ---
    'ELECTION_START': '天亮了，竞选警长请举手。',
    'ELECTED': '当选警长',
    'BE_EXILED': '被放逐',
    'PK_START': '平票PK开始，请双方轮流发言',
    'TIE_VOTE': '无人当选或再次平票，直接流局',
    'TIE_RE_VOTE': '平票，请重新投票',
    'TIE_PK': '平票，进入PK',
    'SPEECH_START': '请竞选玩家按顺序发言',
    'VOTE_START_SHERIFF': '请所有玩家进行投票',
    'VOTE_START_EXILE': '请所有玩家进行放逐投票',
    'DISCUSSION_START': '请开始自由讨论',
    'HUNTER_ACTION': '请猎人选择开枪目标或跳过',
    'HANDOVER_BADGE': '请移交警徽',
    'LEAVE_SPEECH': '请被放逐玩家发表遗言'
};

// 动态生成 PLAYER_X (1-18号玩家) 以优化播报流畅度
for (let i = 1; i <= 18; i++) {
    ASSETS[`PLAYER_${i}`] = `${i}号玩家`;
}

// ==========================================
// 工具函数
// ==========================================

async function getAccessToken(ak, sk) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            grant_type: 'client_credentials',
            client_id: ak,
            client_secret: sk
        });

        const req = https.request({
            hostname: 'aip.baidubce.com',
            path: '/oauth/2.0/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const result = JSON.parse(data);
                if (result.access_token) resolve(result.access_token);
                else reject(result);
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function tts(token, text, filename) {
    return new Promise((resolve, reject) => {
        const params = { ...TTS_OPTIONS, tex: encodeURIComponent(text), tok: token };
        const query = querystring.stringify(params);

        const req = https.get('https://tsn.baidu.com/text2audio?' + query, (res) => {
            if (res.headers['content-type'] !== 'audio/mp3') {
                let errData = '';
                res.on('data', c => errData += c);
                res.on('end', () => reject(new Error('TTS Failed: ' + errData)));
                return;
            }

            const filePath = path.join(OUTPUT_DIR, filename + '.mp3');
            const fileStream = fs.createWriteStream(filePath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`[Generated] ${filename}.mp3: "${text}"`);
                resolve();
            });
        });

        req.on('error', reject);
    });
}

async function main() {
    if (!API_KEY || !SECRET_KEY) {
        console.error('Error: Please set BAIDU_API_KEY and BAIDU_SECRET_KEY environment variables.');
        return;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    try {
        console.log('Fetching Access Token...');
        const token = await getAccessToken(API_KEY, SECRET_KEY);
        console.log('Token acquired. Starting generation...');

        const keys = Object.keys(ASSETS);
        for (const key of keys) {
            const text = ASSETS[key];
            const filePath = path.join(OUTPUT_DIR, key + '.mp3');

            if (fs.existsSync(filePath)) {
                console.log(`[Skipped] ${key}.mp3 aleady exists.`);
                continue;
            }

            // Sleep slightly to avoid QPS limit (Baidu free tier 5QPS)
            await new Promise(r => setTimeout(r, 250));
            await tts(token, text, key);
        }

        console.log('----------------------------------------');
        console.log(`All ${keys.length} assets generated in: ${OUTPUT_DIR}`);
        console.log('You can now upload these files to WeChat Cloud Storage.');
    } catch (e) {
        console.error('Execution Failed:', e);
    }
}

if (require.main === module) {
    main();
}

module.exports = { ASSETS };
