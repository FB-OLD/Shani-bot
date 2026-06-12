const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise(resolve => rl.question(q, resolve));

let OWNER_NUMBER = '';
let BOT_NUMBER = '';
let sock;

// ===== SETTINGS =====
let autoReact = true;
let antiDelete = true;
let welcomeMsg = 'Welcome to Shani-bot group! 🎉';
const deletedMsgs = new Map();
const EMOJIS = ['❤️','😂','😮','🔥','👍','💯','😎','🚀','⚡','💥','🥰','🤩','😍','🙏','💕','✨','🌟','💎','🎯','🎉','✅','⭐','💫','🌈','🎊','🎁','🏆','💪','👏','🤝','😊','😁','🤣','😇','🥳'];

async function askNumbers() {
    console.log('\n===== 👑 SHANI-BOT SETUP =====\n');
    console.log('Format: Country code + Number without + or 0');
    console.log('Pakistan: 923001234567');
    console.log('India: 919876543210\n');

    OWNER_NUMBER = await question('👑 Owner Number: ');
    OWNER_NUMBER = OWNER_NUMBER.replace(/[^0-9]/g, '');

    BOT_NUMBER = await question('📱 Bot Number: ');
    BOT_NUMBER = BOT_NUMBER.replace(/[^0-9]/g, '');

    rl.close();
    console.log('\n✅ Numbers Saved!\n');
    return BOT_NUMBER;
}

async function startSock() {
    const BOT_NUMBER_FULL = await askNumbers();
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Chrome', 'Ubuntu', '22.04.1'],
        connectTimeoutMs: 60000,
        getMessage: async key => deletedMsgs.get(key.id)
    });

    sock.ev.on('creds.update', saveCreds);

    // ===== PAIRING CODE =====
    if(!state.creds.registered) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
            console.log('🔄 Generating Pairing Code...');
            const code = await sock.requestPairingCode(BOT_NUMBER_FULL);
            console.log('\n===================================');
            console.log(`🔑 SHANI-BOT CODE: ${code}`);
            console.log('===================================');
            console.log('1. WhatsApp > Settings > Linked Devices');
            console.log('2. Tap "Link with Phone Number" - NOT QR');
            console.log('3. Paste 8 digit code within 20 seconds\n');
        } catch(e) {
            console.log('❌ Error:', e.message);
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'open') {
            console.log('✅ Shani-bot Connected 24/7!');
            console.log(`👑 Owner: ${OWNER_NUMBER}`);
            console.log(`📱 Bot: ${BOT_NUMBER}\n`);
        }
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
            console.log('❌ Connection Lost. Reconnecting...');
            if(shouldReconnect) setTimeout(startSock, 3000);
        }
    });

    // ===== MESSAGE HANDLER =====
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if(type!== 'notify') return;
        const msg = messages[0];
        if(!msg?.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const senderNum = sender.split('@')[0];
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const isGroup = from.endsWith('@g.us');
        const isOwner = senderNum === OWNER_NUMBER;

        // Save for Anti-Delete
        if(isGroup && antiDelete && msg.message) {
            deletedMsgs.set(msg.key.id, msg.message);
            setTimeout(() => deletedMsgs.delete(msg.key.id), 5 * 60 * 1000);
        }

        // ===== OWNER ONLY COMMANDS =====
        if(body.startsWith('.')) {
            if(!isOwner) {
                await sock.sendMessage(from, { text: '🚫 Access Denied!\nOnly Owner can use commands' });
                return;
            }

            const args = body.slice(1).trim().split(/ +/);
            const cmd = args.shift().toLowerCase();

            switch(cmd) {
                case 'ping':
                    await sock.sendMessage(from, { text: `✅ Shani-bot Online 24/7!\n👑 Owner: ${OWNER_NUMBER}\n📱 Bot: ${BOT_NUMBER}\n🔒 Access: Owner Only\n🤖 Status: Active` });
                    break;

                case 'autoreact':
                    autoReact = args[0] === 'on';
                    await sock.sendMessage(from, { text: autoReact? '✅ Auto React ON - 30+ Emojis Active' : '❌ Auto React OFF' });
                    break;

                case 'antidelete':
                    antiDelete = args[0] === 'on';
                    await sock.sendMessage(from, { text: antiDelete? '🛡️ Anti-Delete ON - Deleted messages exposed' : '❌ Anti-Delete OFF' });
                    break;

                case 'welcome':
                    if(args.length > 0) {
                        welcomeMsg = args.join(' ');
                        await sock.sendMessage(from, { text: `✅ Welcome Message Set:\n"${welcomeMsg}"` });
                    } else {
                        await sock.sendMessage(from, { text: `Current Welcome:\n"${welcomeMsg}"\n\nUse:.welcome Your Text Here` });
                    }
                    break;

                case 'kick':
                    if(!isGroup) return await sock.sendMessage(from, { text: '❌ Group only command' });
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if(mentioned && mentioned[0]) {
                        await sock.groupParticipantsUpdate(from, [mentioned[0]], 'remove');
                        await sock.sendMessage(from, { text: `👢 Kicked Successfully`, mentions: [mentioned[0]] });
                    } else {
                        await sock.sendMessage(from, { text: 'Usage:.kick @tag' });
                    }
                    break;

                case 'status':
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    await sock.sendMessage(from, {
                        text: `📊 *SHANI-BOT STATUS*\n\n👑 Owner: ${OWNER_NUMBER}\n📱 Bot: ${BOT_NUMBER}\n⏱️ Uptime: ${hours}h ${minutes}m\n🌍 Platform: Render VPS 24/7\n🔄 Auto React: ${autoReact? 'ON ✅' : 'OFF ❌'}\n🛡️ Anti-Delete: ${antiDelete? 'ON ✅' : 'OFF ❌'}\n👋 Welcome: ${welcomeMsg}\n📦 Emojis: ${EMOJIS.length}\n🔒 Access: Owner Only`
                    });
                    break;

                case 'menu':
                case 'help':
                    await sock.sendMessage(from, {
                        text: `*[ SHANI-BOT ]* —●
| 👑 Owner : ${OWNER_NUMBER}
| ⚙️ Mode : PRIVATE
| 🔤 Prefix :.
| 📚 Commands : 7

*[ SYSTEM STATS ]* —●
| 💻 Platform : Render VPS 24/7
| 🤖 Version : 1.0.0
| 🔒 Access : Owner Only

*[ COMMANDS ]* —●
| 1️⃣.ping - Check bot online
| 2️⃣.autoreact on/off
| 3️⃣.antidelete on/off
| 4️⃣.welcome [text]
| 5️⃣.kick @tag
| 6️⃣.status - Full details
| 7️⃣.menu - Show menu

🚫 صرف Owner ${OWNER_NUMBER} استعمال کر سکتا ہے`
                    });
                    break;
            }
            return;
        }

        // ===== INSTANT AUTO REACT =====
        if(autoReact &&!msg.key.fromMe) {
            const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            await sock.sendMessage(from, { react: { text: randomEmoji, key: msg.key } }).catch(() => {});
        }
    });

    // ===== ANTI-DELETE =====
    sock.ev.on('messages.update', async (updates) => {
        if(!antiDelete) return;
        for(const update of updates) {
            if(update.update.message === null && update.key.remoteJid.endsWith('@g.us')) {
                const msg = deletedMsgs.get(update.key.id);
                if(msg) {
                    const text = msg.conversation || msg.extendedTextMessage?.text || '[Media/Sticker]';
                    const sender = update.key.participant;
                    await sock.sendMessage(update.key.remoteJid, {
                        text: `🗑️ *Anti-Delete Alert*\n\n@${sender.split('@')[0]} deleted:\n"${text}"`,
                        mentions: [sender]
                    });
                }
            }
        }
    });

    // ===== WELCOME =====
    sock.ev.on('group-participants.update', async (update) => {
        if(update.action === 'add') {
            for(const participant of update.participants) {
                await sock.sendMessage(update.id, {
                    text: `@${participant.split('@')[0]} ${welcomeMsg}`,
                    mentions: [participant]
                });
            }
        }
    });
}

startSock();
