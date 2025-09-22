const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ====== Cấu hình ======
const token = process.env.BOT_TOKEN;
const ADMIN_ID = 487606557;
const ALLOWED_TOPIC_ID = 2217607;
const ALLOWED_DOMAIN = "https://x.com";

// ====== Khởi tạo bot ======
const bot = new TelegramBot(token, { polling: true });
const dataFile = path.join(__dirname, 'links.json');
const pinFile = path.join(__dirname, 'pin.json');

// ====== Hàm đọc file ======
function loadLinks() {
    try {
        if (fs.existsSync(dataFile)) {
            const raw = fs.readFileSync(dataFile, 'utf8');
            if (!raw || raw.trim() === '') return [];
            return JSON.parse(raw);
        }
        return [];
    } catch (err) {
        console.error('Lỗi đọc file:', err);
        return [];
    }
}

function loadPinnedMessageId() {
    try {
        if (fs.existsSync(pinFile)) {
            const raw = fs.readFileSync(pinFile, 'utf8');
            if (!raw || raw.trim() === '') return null;
            return JSON.parse(raw);
        }
        return null;
    } catch (err) {
        console.error('Lỗi đọc file pin:', err);
        return null;
    }
}

function saveLinks(data) {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Lỗi ghi file:', err);
    }
}

function savePinnedMessageId(id) {
    try {
        fs.writeFileSync(pinFile, JSON.stringify(id));
    } catch (err) {
        console.error('Lỗi ghi file pin:', err);
    }
}

// ====== Dữ liệu ban đầu ======
let links = loadLinks();

// ====== Hàm kiểm tra topic ======
function isAllowedTopic(msg) {
    return msg.message_thread_id === ALLOWED_TOPIC_ID;
}

// ====== Hàm gửi tin nhắn tự xoá ======
async function sendTempMessage(chatId, text, options = {}) {
    const sent = await bot.sendMessage(chatId, text, options);
    setTimeout(() => {
        bot.deleteMessage(chatId, sent.message_id).catch(() => { });
    }, 5000);
}

// ====== Hàm cập nhật và ghim danh sách ======
async function updatePinnedList(chatId) {
    if (links.length === 0) return;

    const grouped = {};
    links.forEach((item) => {
        const username = item.user || 'Không rõ';
        if (!grouped[username]) grouped[username] = [];
        grouped[username].push(item);
    });

    let message = '📌 *Danh sách link đã lưu*\n\n';
    for (const [user, items] of Object.entries(grouped)) {
        message += `*👤 ${user}*\n`;
        items.forEach((item) => {
            const short = item.content.replace(/^https?:\/\//, '');
            message += `• [${short}](${item.content}) — _${item.time}_\n`;
        });
        message += '\n';
    }

    try {
        const oldPinId = loadPinnedMessageId();
        if (oldPinId) {
            await bot.unpinChatMessage(chatId, { message_id: oldPinId }).catch((err) => {
                console.error('❌ Không thể xoá pin cũ:', err.message);
            });
        }

        const sent = await bot.sendMessage(chatId, message.trim(), {
            parse_mode: 'Markdown',
            message_thread_id: ALLOWED_TOPIC_ID
        });

        await bot.pinChatMessage(chatId, sent.message_id, { disable_notification: true });
        savePinnedMessageId(sent.message_id);
        console.log('📌 Đã ghim tin nhắn mới:', sent.message_id);
    } catch (err) {
        console.error('❌ Lỗi khi cập nhật pin:', err.message);
    }
}



// ====== Lệnh /link ======
bot.onText(/^\/link (.+)/, async (msg, match) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const linkContent = match[1].trim();

    if (!linkContent.startsWith(ALLOWED_DOMAIN)) {
        return sendTempMessage(chatId, `❌ Chỉ chấp nhận link bắt đầu bằng: ${ALLOWED_DOMAIN}`, { message_thread_id: ALLOWED_TOPIC_ID });
    }

    const isDuplicate = links.some(item => item.content === linkContent);
    if (isDuplicate) {
        return sendTempMessage(chatId, `⚠️ Link này đã tồn tại trong danh sách!`, { message_thread_id: ALLOWED_TOPIC_ID });
    }

    links.push({
        user: msg.from.username || msg.from.first_name,
        content: linkContent,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    });

    saveLinks(links);
    await updatePinnedList(chatId);

    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (err) {
        console.error('Không thể xóa tin nhắn:', err.message);
    }

    sendTempMessage(chatId, `✅ Link đã được lưu!`, { message_thread_id: ALLOWED_TOPIC_ID });
});

// ====== Lệnh /list ======
bot.onText(/^\/list$/, (msg) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;

    if (links.length === 0) {
        return bot.sendMessage(chatId, '📭 Chưa có link nào được lưu.', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    const grouped = {};
    links.forEach((item) => {
        const username = item.user || 'Không rõ';
        if (!grouped[username]) grouped[username] = [];
        grouped[username].push(item);
    });

    let message = '📌 *Danh sách link đã lưu*\n\n';
    for (const [user, items] of Object.entries(grouped)) {
        message += `*👤 ${user}*\n`;
        items.forEach((item) => {
            const short = item.content.replace(/^https?:\/\//, '');
            message += `• [${short}](${item.content}) — _${item.time}_\n`;
        });
        message += '\n';
    }

    bot.sendMessage(chatId, message.trim(), {
        parse_mode: 'Markdown',
        message_thread_id: ALLOWED_TOPIC_ID
    });
});


// ====== Lệnh /remove ======
bot.onText(/^\/remove (\d+)$/, (msg, match) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;
    const index = parseInt(match[1], 10) - 1;

    if (isNaN(index) || index < 0 || index >= links.length) {
        return sendTempMessage(chatId, '⚠️ Số thứ tự không hợp lệ!', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    const link = links[index];
    if (msg.from.id !== ADMIN_ID && link.user !== (msg.from.username || msg.from.first_name)) {
        return sendTempMessage(chatId, '❌ Bạn không có quyền xóa link này!', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    links.splice(index, 1);
    saveLinks(links);
    sendTempMessage(chatId, `🗑 Đã xóa link: ${link.content}`, { message_thread_id: ALLOWED_TOPIC_ID });
    updatePinnedList(chatId);
});

// ====== Xử lý nút Reset ======
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'reset_data') {
        if (query.from.id !== ADMIN_ID) {
            return bot.answerCallbackQuery(query.id, {
                text: '❌ Bạn không có quyền reset dữ liệu',
                show_alert: true
            });
        }

        links = [];
        saveLinks(links);
        bot.answerCallbackQuery(query.id, { text: '✅ Dữ liệu đã được reset' });
        sendTempMessage(chatId, '🗑 Dữ liệu đã được làm mới thủ công!', { message_thread_id: ALLOWED_TOPIC_ID });
        updatePinnedList(chatId);
    }
});

// ====== Cron job reset 7h sáng ======
cron.schedule('0 0 7 * * *', () => {
    links = [];
    saveLinks(links);
    console.log('🗑 Dữ liệu đã được làm mới lúc 7h sáng UTC+7');
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

console.log('🚀 Bot đang chạy...');
