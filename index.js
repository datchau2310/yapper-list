const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ====== Cấu hình ======
const token = process.env.BOT_TOKEN;
const ADMIN_ID = 487606557; // ID Telegram của bạn
const ALLOWED_TOPIC_ID = 2217607; // ID topic được phép hoạt động
const ALLOWED_DOMAIN = "https://x.com"; // Chỉ cho phép link này

// ====== Khởi tạo bot ======
const bot = new TelegramBot(token, { polling: true });
const dataFile = path.join(__dirname, 'links.json');


// ====== Hàm đọc file ======
function loadLinks() {
    try {
        if (fs.existsSync(dataFile)) {
            return JSON.parse(fs.readFileSync(dataFile));
        }
        return [];
    } catch (err) {
        console.error('Lỗi đọc file:', err);
        return [];
    }
}

// ====== Hàm ghi file ======
function saveLinks(data) {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Lỗi ghi file:', err);
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
    }, 5000); // 5 giây
}

// ====== Lệnh /link ======
bot.onText(/^\/link (.+)/, async (msg, match) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const linkContent = match[1].trim();

    // Kiểm tra domain hợp lệ
    if (!linkContent.startsWith(ALLOWED_DOMAIN)) {
        return sendTempMessage(chatId, `❌ Chỉ chấp nhận link bắt đầu bằng: ${ALLOWED_DOMAIN}`, { message_thread_id: ALLOWED_TOPIC_ID });
    }

    // Kiểm tra trùng link
    const isDuplicate = links.some(item => item.content === linkContent);
    if (isDuplicate) {
        return sendTempMessage(chatId, `⚠️ Link này đã tồn tại trong danh sách!`, { message_thread_id: ALLOWED_TOPIC_ID });
    }

    // Lưu link
    links.push({
        user: msg.from.username || msg.from.first_name,
        content: linkContent,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    });

    saveLinks(links);

    // Xoá tin nhắn gốc
    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (err) {
        console.error('Không thể xóa tin nhắn:', err.message);
    }

    // Gửi thông báo tự xoá
    sendTempMessage(chatId, `✅ Link đã được lưu!`, { message_thread_id: ALLOWED_TOPIC_ID });
});

// ====== Lệnh /list ======
bot.onText(/^\/list$/, (msg) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;

    if (links.length === 0) {
        return bot.sendMessage(chatId, '📭 Chưa có link nào được lưu.', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    // Gom nhóm theo người gửi
    const grouped = {};
    links.forEach((item) => {
        const username = item.user || 'Không rõ';
        if (!grouped[username]) grouped[username] = [];
        grouped[username].push(item);
    });

    let message = '📌 Danh sách link đã lưu:\n\n';
    for (const [user, items] of Object.entries(grouped)) {
        message += `👤 ${user}\n`;
        items.forEach((item) => {
            message += `• ${item.content} (${item.time})\n`;
        });
        message += '\n';
    }

    bot.sendMessage(chatId, message.trim(), { message_thread_id: ALLOWED_TOPIC_ID });
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
    }
});

// ====== Lệnh /remove ======
bot.onText(/^\/remove (\d+)$/, (msg, match) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;
    const index = parseInt(match[1], 10) - 1; // chuyển số thứ tự sang index mảng

    if (isNaN(index) || index < 0 || index >= links.length) {
        return sendTempMessage(chatId, '⚠️ Số thứ tự không hợp lệ!', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    const link = links[index];

    // Chỉ admin hoặc chủ link mới được xóa
    if (msg.from.id !== ADMIN_ID && link.user !== (msg.from.username || msg.from.first_name)) {
        return sendTempMessage(chatId, '❌ Bạn không có quyền xóa link này!', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    links.splice(index, 1);
    saveLinks(links);

    sendTempMessage(chatId, `🗑 Đã xóa link: ${link.content}`, { message_thread_id: ALLOWED_TOPIC_ID });

    // Cập nhật lại danh sách ghim
    updatePinnedList(chatId);
});


async function updatePinnedList(chatId) {
    if (links.length === 0) return;

    // Gom nhóm theo người gửi
    const grouped = {};
    links.forEach((item) => {
        const username = item.user || 'Không rõ';
        if (!grouped[username]) grouped[username] = [];
        grouped[username].push(item);
    });

    let message = '📌 Danh sách link đã lưu:\n\n';
    for (const [user, items] of Object.entries(grouped)) {
        message += `👤 ${user}\n`;
        items.forEach((item) => {
            message += `• ${item.content} (${item.time})\n`;
        });
        message += '\n';
    }

    try {
        const oldPinId = loadPinnedMessageId();
        if (oldPinId) {
            await bot.unpinChatMessage(chatId, { message_id: oldPinId }).catch(() => { });
        }

        const sent = await bot.sendMessage(chatId, message.trim(), {
            message_thread_id: ALLOWED_TOPIC_ID
        });

        await bot.pinChatMessage(chatId, sent.message_id, { disable_notification: true });
        savePinnedMessageId(sent.message_id);
    } catch (err) {
        console.error('Lỗi cập nhật pin:', err.message);
    }
}




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
