import makeWASocket, { DisconnectReason, useMultiFileAuthState, makeInMemoryStore, fetchLatestBaileysVersion, delay } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration and Constants ---

// Load config
const configPath = path.resolve(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
    console.error("config.json not found! Please create it based on config.example.json.");
    process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const OWNER_NUMBER = config.ownerNumber;
const BOT_PREFIX = config.prefix;
const BOT_NAME = config.botName;
const ADMIN_JID = OWNER_NUMBER + '@s.whatsapp.net';

// Payment Details
const BOT_PAYMENT_DETAILS = "OPay Account: 9136098875 Name: Simon Chukwuemeka Ezugwu";

// Virtual Number Prices (NGN)
const NUMBER_PRICES = {
    whatsapp: {"usa": 5000, "united kingdom": 2000, "uk": 2000, "canada": 1500, "mexico": 4000, "china": 3000, "ukraine": 2000, "philippine": 600, "indonesia": 600, "vietnam": 600, "poland": 1000, "germany": 3000, "thailand": 1000, "brazil": 2000, "afghanistan": 1500, "france": 2500, "kuwait": 3000},
    facebook: {"mexico": 500, "uk": 500, "united kingdom": 500, "ukraine": 500, "philippine": 300, "indonesia": 500, "vietnam": 300, "poland": 300, "india": 200, "nigeria": 300, "canada": 200, "germany": 200, "brazil": 500, "france": 300, "kuwait": 800},
    telegram: {"ukraine": 5000, "china": 3000, "philippine": 1500, "vietnam": 2000, "uk": 3000, "united kingdom": 3000, "germany": 3000},
    tiktok: {"germany": 300, "canada": 200, "philippine": 300, "_default": 300},
    instagram: {"_default": 600},
    gmail: {"usa": 800, "uk": 800, "canada": 700, "germany": 700, "nigeria": 500, "_default": 600},
    yahoo: {"usa": 600, "uk": 600, "canada": 500, "_default": 400},
    outlook: {"usa": 700, "uk": 700, "canada": 600, "_default": 500}
};

// Services
const SERVICES = {
    numbers: { name: "Virtual Numbers", description: "Virtual Numbers for WhatsApp, Facebook, Telegram, TikTok, Instagram, Gmail, Yahoo, Outlook", auto: true },
    web: { name: "Website Development", description: "Professional website development services.", auto: true, price: 20000 },
    vpn: { name: "Paid VPN", description: "Premium VPN access for secure browsing.", auto: true, price: 1500 },
    proxy: { name: "Premium Proxy", description: "High-quality proxy servers for various needs.", auto: true, price: 2000 },
    graphics: { name: "Graphics Design / Working Pictures", description: "Custom graphics design and image editing.", auto: false },
    boost: { name: "Followers Boosting", description: "Boost your social media presence with followers.", auto: false }
};

// --- Global State & Utilities ---

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

const userStates = new Map(); // Stores current conversational state for each user
// userStates.get(jid) = { step: 'awaiting_platform', data: { orderId: 'RB...' } }

const orders = new Map(); // Stores active orders
// orders.get(orderId) = { id, userJid, service, platform?, country?, price?, details?, status, timestamp, paymentProofUrl? }

const userCooldowns = new Map(); // Stores last message timestamp for cooldown

// Logger setup
const logger = pino({
    level: 'silent'
}).child({
    level: 'silent',
    stream: 'bot'
});

// Generate a unique order ID
const generateOrderId = () => {
    const randomDigits = Math.floor(100000 + Math.random() * 900000); // 6 random digits
    return `RB${randomDigits}`;
};

// Send a message with delay
const sendMessageWithDelay = async (sock, jid, message, quotedMessage = null) => {
    await delay(3000); // 3-second delay before every reply
    return sock.sendMessage(jid, message, { quoted: quotedMessage });
};

// --- Main Bot Logic ---

async function connectToWhatsApp() {
    logger.info('Connecting to WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    logger.info(`Baileys version: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['RB-STORE-BOT', 'Safari', '1.0'],
        // Default mobile will lead to QR not showing if not passed
        // userAgent: ['Chrome (Linux)', ''], // This is just an example, Baileys handles it
    });

    store.bind(sock.ev);

    // Event handlers
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
            logger.info('QR Code generated. Scan with WhatsApp.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.error('Connection closed due to ', lastDisconnect.error, ', reconnecting: ', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                logger.info('Logged out. Please delete auth_info folder and restart.');
            }
        } else if (connection === 'open') {
            logger.info('Bot connected to WhatsApp!');
            console.log('RB-STORE-BOT is online!');
            // Optionally send an online message to owner
            sendMessageWithDelay(sock, ADMIN_JID, { text: `${BOT_NAME} is online!` });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Ignore self messages and messages without content
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;

            const senderJid = msg.key.remoteJid;
            const pushName = msg.pushName || 'User';
            const isGroup = senderJid.endsWith('@g.us');

            // Ignore messages from groups
            if (isGroup) {
                logger.info(`Ignoring group message from ${pushName} (${senderJid})`);
                continue;
            }

            // Cooldown check (3 seconds per user)
            const now = Date.now();
            const lastTime = userCooldowns.get(senderJid) || 0;
            if (now - lastTime < 3000) {
                logger.warn(`Ignoring message from ${pushName} (${senderJid}) due to cooldown.`);
                continue;
            }
            userCooldowns.set(senderJid, now);

            const textMessage = msg.message?.extendedTextMessage?.text || msg.message?.conversation || msg.message?.imageMessage?.caption || '';
            const isImage = msg.message?.imageMessage;
            const isOwner = senderJid === ADMIN_JID;
            const command = textMessage.startsWith(BOT_PREFIX) ? textMessage.slice(BOT_PREFIX.length).trim().split(' ')[0].toLowerCase() : null;
            const args = command ? textMessage.slice(BOT_PREFIX.length).trim().split(' ').slice(1) : [];

            logger.info(`Received message from ${pushName} (${senderJid}): "${textMessage}"`);

            // Mark message as read
            await sock.sendReadReceipt(senderJid, msg.key.participant, [msg.key.id]);

            // --- Admin Commands ---
            if (isOwner && command) {
                switch (command) {
                    case 'restart':
                        await sendMessageWithDelay(sock, senderJid, { text: `Restarting ${BOT_NAME}...` }, msg);
                        console.log('Bot is restarting...');
                        process.exit(0);
                        break;
                    case 'stop':
                        await sendMessageWithDelay(sock, senderJid, { text: `Stopping ${BOT_NAME}...` }, msg);
                        console.log('Bot is stopping...');
                        process.exit(0);
                        break;
                    case 'broadcast':
                        if (args.length === 0) {
                            await sendMessageWithDelay(sock, senderJid, { text: 'Usage: !broadcast <message>' }, msg);
                            return;
                        }
                        const broadcastMessage = args.join(' ');
                        let sentCount = 0;
                        const allChats = store.chats.all(); // Get all chats from in-memory store

                        for (const chat of allChats) {
                            if (chat.id.endsWith('@s.whatsapp.net') && chat.id !== senderJid) { // Only DMs and not the admin themselves
                                try {
                                    await sendMessageWithDelay(sock, chat.id, { text: broadcastMessage });
                                    sentCount++;
                                } catch (error) {
                                    logger.error(`Failed to send broadcast to ${chat.id}:`, error);
                                }
                            }
                        }
                        await sendMessageWithDelay(sock, senderJid, { text: `Broadcast sent to ${sentCount} chats.` }, msg);
                        break;
                    case 'status':
                        const uptime = process.uptime();
                        const days = Math.floor(uptime / (3600 * 24));
                        const hours = Math.floor((uptime % (3600 * 24)) / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const seconds = Math.floor(uptime % 60);
                        const memoryUsage = process.memoryUsage();
                        const totalChats = store.chats.size;
                        const statusMessage = `╭─『 🤖 ${BOT_NAME} STATUS 』
│ Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s
│ Memory: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB (RSS)
│ Total Chats: ${totalChats}
╰───────────────`;
                        await sendMessageWithDelay(sock, senderJid, { text: statusMessage }, msg);
                        break;
                    case 'send': // Admin delivery command
                        if (!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                            await sendMessageWithDelay(sock, senderJid, { text: 'Please reply to an order notification with the order ID to deliver.' }, msg);
                            return;
                        }
                        // Parse order ID from quoted message, or from command args
                        let targetOrderId = args[0] || null;
                        if (!targetOrderId) {
                             // Try to extract order ID from the quoted message text if no arg is given
                            const quotedText = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation || msg.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text || '';
                            const orderIdMatch = quotedText.match(/Order ID is (RB\d{6})/i);
                            if (orderIdMatch) {
                                targetOrderId = orderIdMatch[1];
                            }
                        }

                        if (!targetOrderId || !orders.has(targetOrderId)) {
                            await sendMessageWithDelay(sock, senderJid, { text: `Order ID ${targetOrderId || '(not found)'} is invalid or not found. Please provide a valid order ID.` }, msg);
                            return;
                        }

                        const orderToDeliver = orders.get(targetOrderId);
                        if (orderToDeliver.status === 'delivered') {
                            await sendMessageWithDelay(sock, senderJid, { text: `Order ${targetOrderId} has already been delivered.` }, msg);
                            return;
                        }

                        orderToDeliver.status = 'delivered';
                        orders.set(targetOrderId, orderToDeliver);
                        userStates.delete(orderToDeliver.userJid); // Clear user state after delivery
                        await sendMessageWithDelay(sock, senderJid, { text: `Order ${targetOrderId} for ${orderToDeliver.service.name} has been marked as delivered.` }, msg);
                        await sendMessageWithDelay(sock, orderToDeliver.userJid, { text: `🎉 Your order *${targetOrderId}* for *${orderToDeliver.service.name}* has been delivered! Thank you for choosing ${BOT_NAME}!` });
                        break;
                    default:
                        // If it's an admin command but not recognized, just ignore or send a generic response
                        break;
                }
            }

            // --- Public Commands ---
            if (command) {
                switch (command) {
                    case 'help':
                    case 'menu':
                        const menuMessage = `╭─『 🤖 ${BOT_NAME} 』
│ Status: Online
│ Prefix: ${BOT_PREFIX}
│ Owner: +${OWNER_NUMBER}
╰───────────────

*📜 PUBLIC COMMANDS*
${BOT_PREFIX}help / ${BOT_PREFIX}menu - Show this menu
${BOT_PREFIX}ping - Check bot speed
${BOT_PREFIX}orders - Check your orders
${BOT_PREFIX}contact - Contact admin

*🛒 SERVICES*
Reply with these words:
numbers - Virtual Numbers
web - Website Development
vpn - Paid VPN
proxy - Premium Proxy
graphics - Graphics Design
boost - Followers Boosting`;
                        await sendMessageWithDelay(sock, senderJid, { text: menuMessage }, msg);
                        break;
                    case 'ping':
                        const startTime = Date.now();
                        const pongMsg = await sendMessageWithDelay(sock, senderJid, { text: 'Pong!' }, msg);
                        const endTime = Date.now();
                        const latency = endTime - startTime - 3000; // Subtract delay
                        await sock.sendMessage(senderJid, { text: `Pong! Latency: ${latency}ms` }, { quoted: pongMsg });
                        break;
                    case 'orders':
                        const userOrders = Array.from(orders.values()).filter(order => order.userJid === senderJid);
                        if (userOrders.length === 0) {
                            await sendMessageWithDelay(sock, senderJid, { text: 'You have no active orders. Start by exploring our services!' }, msg);
                            return;
                        }
                        let ordersText = '*🛒 Your Order History:*
';
                        userOrders.forEach(order => {
                            ordersText += `
*ID:* ${order.id}
*Service:* ${order.service.name}
*Status:* ${order.status.replace(/_/g, ' ').toUpperCase()}
`;
                            if (order.platform) ordersText += `*Platform:* ${order.platform}\n`;
                            if (order.country) ordersText += `*Country:* ${order.country}\n`;
                            if (order.price) ordersText += `*Price:* ${order.price} NGN\n`;
                            if (order.details) ordersText += `*Details:* ${order.details}\n`;
                        });
                        await sendMessageWithDelay(sock, senderJid, { text: ordersText }, msg);
                        break;
                    case 'contact':
                        await sendMessageWithDelay(sock, senderJid, { text: `You can contact the admin directly at +${OWNER_NUMBER}. Please mention your query or order ID if applicable.` }, msg);
                        break;
                    default:
                        // If it's a command but not recognized, fallback to service flow or menu
                        await handleServiceFlow(sock, senderJid, textMessage.toLowerCase(), msg, isImage);
                        break;
                }
            } else { // No prefix - check for service flow triggers
                await handleServiceFlow(sock, senderJid, textMessage.toLowerCase(), msg, isImage);
            }
        }
    });
}

// --- Service Flow Handler ---
async function handleServiceFlow(sock, jid, text, msg, isImage) {
    let userState = userStates.get(jid) || { step: 'initial', data: {} };
    const serviceKeywords = Object.keys(SERVICES);

    // Handle payment proof image
    if (isImage && userState.step === 'awaiting_payment_proof') {
        try {
            const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            const imagePath = path.join(__dirname, 'payment_proofs', `${userState.data.orderId}.jpg`);
            fs.mkdirSync(path.dirname(imagePath), { recursive: true });
            fs.writeFileSync(imagePath, buffer);

            const order = orders.get(userState.data.orderId);
            if (order) {
                order.status = 'payment_proof_received';
                order.paymentProofUrl = imagePath;
                orders.set(userState.data.orderId, order);
                userState.step = 'initial'; // Clear state after receiving proof
                userStates.set(jid, userState);

                await sendMessageWithDelay(sock, jid, { text: 'Thank you for your payment proof! We will verify it shortly and process your order.' }, msg);
                await sendMessageWithDelay(sock, ADMIN_JID, { text: `🔔 *Payment Proof Received!*\nOrder ID: *${order.id}*\nService: *${order.service.name}*\nFrom: @${jid.split('@')[0]}\n\nPlease verify payment and proceed with delivery.`}, msg);
                // Optionally send the image to admin
                await delay(1000);
                await sock.sendMessage(ADMIN_JID, { image: buffer, caption: `Payment proof for Order ID: ${order.id}` });
            }
            return;
        } catch (error) {
            logger.error('Error handling payment proof image:', error);
            await sendMessageWithDelay(sock, jid, { text: 'Sorry, I had trouble processing your payment proof. Please try again or contact support.' }, msg);
            return;
        }
    }

    // Handle conversational steps
    switch (userState.step) {
        case 'initial':
            if (['menu', 'hi', 'hello', 'start'].includes(text)) {
                const sections = [
                    {
                        title: "PUBLIC COMMANDS",
                        rows: [
                            { title: `${BOT_PREFIX}help / ${BOT_PREFIX}menu`, description: "Show this menu" },
                            { title: `${BOT_PREFIX}ping`, description: "Check bot speed" },
                            { title: `${BOT_PREFIX}orders`, description: "Check your orders" },
                            { title: `${BOT_PREFIX}contact`, description: "Contact admin" }
                        ]
                    },
                    {
                        title: "SERVICES",
                        rows: Object.entries(SERVICES).map(([key, service]) => ({
                            title: key, 
                            description: service.description || service.name
                        }))
                    }
                ];

                try {
                    await sendMessageWithDelay(sock, jid, {
                        text: `Hello! I'm ${BOT_NAME}. How can I help you today?`, // Main message
                        footer: "Select an option from below",
                        title: BOT_NAME, // Optional title above the list
                        buttonText: "VIEW OPTIONS",
                        sections
                    }, msg);
                } catch (listError) {
                    logger.error('Failed to send listMessage, falling back to text:', listError);
                    const fallbackMenu = `Hello! I'm ${BOT_NAME}. How can I help you today?\n\n*📜 PUBLIC COMMANDS*
${BOT_PREFIX}help / ${BOT_PREFIX}menu - Show this menu
${BOT_PREFIX}ping - Check bot speed
${BOT_PREFIX}orders - Check your orders
${BOT_PREFIX}contact - Contact admin
\n*🛒 SERVICES*
Reply with these words to start a service:\n${Object.keys(SERVICES).join(', ')}`;
                    await sendMessageWithDelay(sock, jid, { text: fallbackMenu }, msg);
                }
                return;
            }

            // Check if the text matches any service keyword
            const matchedService = serviceKeywords.find(keyword => text.includes(keyword));
            if (matchedService) {
                const service = SERVICES[matchedService];
                const orderId = generateOrderId();
                const newOrder = { id: orderId, userJid: jid, service: service, status: 'pending', timestamp: Date.now() };
                orders.set(orderId, newOrder);

                if (matchedService === 'numbers') {
                    userStates.set(jid, { step: 'awaiting_platform', data: { orderId: orderId } });
                    await sendMessageWithDelay(sock, jid, { text: `You've selected *${service.name}*. Which platform are you interested in? (e.g., WhatsApp, Facebook, Telegram, TikTok, Instagram, Gmail, Yahoo, Outlook)` }, msg);
                } else if (!service.auto) { // Manual services (graphics, boost)
                    userStates.set(jid, { step: 'awaiting_manual_details', data: { orderId: orderId } });
                    await sendMessageWithDelay(sock, jid, { text: `You've selected *${service.name}*. Please describe your requirements in detail.` }, msg);
                } else { // Auto services with fixed price (web, vpn, proxy)
                    newOrder.price = service.price;
                    newOrder.status = 'awaiting_confirmation';
                    orders.set(orderId, newOrder);
                    userStates.set(jid, { step: 'awaiting_auto_confirmation', data: { orderId: orderId } });
                    await sendMessageWithDelay(sock, jid, { text: `You've selected *${service.name}*. The price is *${service.price} NGN*. Reply 'confirm' to proceed.` }, msg);
                }
                return;
            }
            // If no command or service keyword, just ignore for now or send default menu
            break;

        case 'awaiting_platform':
            const platform = text.toLowerCase();
            if (NUMBER_PRICES[platform]) {
                userState.data.platform = platform;
                userState.step = 'awaiting_country';
                userStates.set(jid, userState);
                const availableCountries = Object.keys(NUMBER_PRICES[platform]).filter(c => c !== '_default');
                await sendMessageWithDelay(sock, jid, { text: `Which country for *${platform}*? (Available: ${availableCountries.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') || 'Default price only'})` }, msg);
            } else {
                await sendMessageWithDelay(sock, jid, { text: 'Sorry, that platform is not supported or recognized. Please choose from: WhatsApp, Facebook, Telegram, TikTok, Instagram, Gmail, Yahoo, Outlook.' }, msg);
            }
            break;

        case 'awaiting_country':
            const country = text.toLowerCase();
            const currentPlatform = userState.data.platform;
            const priceList = NUMBER_PRICES[currentPlatform];
            const price = priceList[country] || priceList['_default'];

            if (price) {
                userState.data.country = country;
                userState.data.price = price;
                userState.step = 'awaiting_confirmation';
                userStates.set(jid, userState);

                const order = orders.get(userState.data.orderId);
                if (order) {
                    order.platform = currentPlatform;
                    order.country = country;
                    order.price = price;
                    orders.set(userState.data.orderId, order);
                }
                await sendMessageWithDelay(sock, jid, { text: `The price for a *${currentPlatform}* number in *${country.charAt(0).toUpperCase() + country.slice(1)}* is *${price} NGN*. Reply 'confirm' to proceed.` }, msg);
            } else {
                const availableCountries = Object.keys(priceList).filter(c => c !== '_default');
                await sendMessageWithDelay(sock, jid, { text: `Sorry, we don't have numbers for *${currentPlatform}* in *${country}*. Please choose from: ${availableCountries.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') || 'Default price only'}.` }, msg);
            }
            break;

        case 'awaiting_confirmation':
        case 'awaiting_auto_confirmation':
            if (text.toLowerCase() === 'confirm') {
                const order = orders.get(userState.data.orderId);
                if (order) {
                    order.status = 'awaiting_payment';
                    orders.set(userState.data.orderId, order);
                    userState.step = 'awaiting_payment_proof';
                    userStates.set(jid, userState);

                    const paymentMsg = `Your order ID is *${order.id}*.\nPlease send *${order.price} NGN* to:\n*${BOT_PAYMENT_DETAILS}*\n\nAfter payment, send a screenshot of the payment confirmation.`;
                    await sendMessageWithDelay(sock, jid, { text: paymentMsg }, msg);
                    await sendMessageWithDelay(sock, ADMIN_JID, { text: `🔔 *New Order!*\nOrder ID: *${order.id}*\nService: *${order.service.name}*\n${order.platform ? `Platform: ${order.platform}\n` : ''}${order.country ? `Country: ${order.country}\n` : ''}Price: *${order.price} NGN*\nFrom: @${jid.split('@')[0]}\nStatus: Awaiting payment proof.`});
                }
            } else {
                await sendMessageWithDelay(sock, jid, { text: "Please reply 'confirm' to proceed with the order, or type 'cancel' to restart." }, msg);
            }
            break;
        
        case 'awaiting_manual_details':
            if (text.toLowerCase() === 'cancel') {
                orders.delete(userState.data.orderId);
                userStates.delete(jid);
                await sendMessageWithDelay(sock, jid, { text: 'Order cancelled. How else can I help you?' }, msg);
                return;
            }

            const order = orders.get(userState.data.orderId);
            if (order) {
                order.details = text; // User's detailed requirements
                order.status = 'pending_quote';
                orders.set(userState.data.orderId, order);
                userStates.set(jid, { step: 'initial', data: {} }); // Reset state

                await sendMessageWithDelay(sock, jid, { text: `Thank you for your request! Your order ID is *${order.id}*. We have notified the admin and they will get back to you soon to discuss details and provide a quote.` }, msg);
                await sendMessageWithDelay(sock, ADMIN_JID, { text: `📝 *New Manual Service Request!*\nOrder ID: *${order.id}*\nService: *${order.service.name}*\nFrom: @${jid.split('@')[0]}\nDetails: *${text}*\n\nPlease follow up with the user for a quote and delivery.`});
            }
            break;
        
        // Default case: if user is in a state but sends an unexpected message, guide them
        default:
            // If user typed 'cancel' at any point, clear their state
            if (text.toLowerCase() === 'cancel' && userState.step !== 'initial') {
                if (userState.data.orderId && orders.has(userState.data.orderId)) {
                    orders.delete(userState.data.orderId);
                }
                userStates.delete(jid);
                await sendMessageWithDelay(sock, jid, { text: 'Your current process has been cancelled. How else can I help you?' }, msg);
                return;
            }

            // If not in a known state and not a service keyword, maybe offer menu or help
            if (userState.step === 'initial' && !serviceKeywords.includes(text) && !['menu', 'hi', 'hello', 'start', 'orders', 'contact'].includes(text) && !text.startsWith(BOT_PREFIX)) {
                 // Generic fallback for unhandled text, avoids spamming user with menu for every random message
                // await sendMessageWithDelay(sock, jid, { text: `I'm not sure what you mean. Type '${BOT_PREFIX}help' or 'menu' to see available commands and services.` }, msg);
            }
            break;
    }
}

// --- Anti-crash handlers ---
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err, origin) => {
    logger.error('Uncaught Exception at:', err, 'origin:', origin);
    console.error('Uncaught Exception:', err);
    process.exit(1); // Exit with failure code
});

// Download content utility for payment proofs
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

// Start the bot
connectToWhatsApp();
