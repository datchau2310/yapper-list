const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ====== Cấu hình ======
const token = process.env.BOT_TOKEN;
const ADMIN_ID = 487606557; // ID Telegram của bạn (lấy từ @userinfobot)
const ALLOWED_TOPIC_ID = 2217607; // ID topic được phép hoạt động

// ====== Khởi tạo bot ======
const bot = new TelegramBot(token, { polling: true });
const dataFile = path.join(__dirname, 'links.json');

// ====== Hàm đọc file ======
function loadLinks() {
    try {
        if (fs.existsSync(dataFile)) {
            const raw = fs.readFileSync(dataFile);
            return JSON.parse(raw);
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

// ====== Lệnh /link ======
bot.onText(/^\/link (.+)/, async (msg, match) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const linkContent = match[1].trim();

    links.push({
        user: msg.from.username || msg.from.first_name,
        content: linkContent,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    });

    saveLinks(links);

    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (err) {
        console.error('Không thể xóa tin nhắn:', err.message);
    }

    bot.sendMessage(chatId, `✅ Link đã được lưu!`, { message_thread_id: ALLOWED_TOPIC_ID });
});

// ====== Lệnh /list ======
// Lệnh /list
bot.onText(/^\/list$/, (msg) => {
    if (!isAllowedTopic(msg)) return;

    const chatId = msg.chat.id;

    if (links.length === 0) {
        return bot.sendMessage(chatId, '📭 Chưa có link nào được lưu.', { message_thread_id: ALLOWED_TOPIC_ID });
    }

    let message = '📌 Danh sách link đã lưu:\n\n';
    links.forEach((item, index) => {
        message += `${index + 1}. ${item.content} (by ${item.user} - ${item.time})\n`;
    });

    // Nếu là admin → gửi kèm nút reset
    if (msg.from.id === ADMIN_ID) {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗑 Reset Data', callback_data: 'reset_data' }]
                ]
            },
            message_thread_id: ALLOWED_TOPIC_ID
        };
        bot.sendMessage(chatId, message, opts);
    } else {
        // Người thường → chỉ gửi danh sách
        bot.sendMessage(chatId, message, { message_thread_id: ALLOWED_TOPIC_ID });
    }
});


// ====== Xử lý nút Reset ======
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'reset_data') {
        if (query.from.id !== ADMIN_ID) {
            return bot.answerCallbackQuery(query.id, { text: '❌ Bạn không có quyền reset dữ liệu', show_alert: true });
        }

        links = [];
        saveLinks(links);
        bot.answerCallbackQuery(query.id, { text: '✅ Dữ liệu đã được reset' });
        bot.sendMessage(chatId, '🗑 Dữ liệu đã được làm mới thủ công!', { message_thread_id: ALLOWED_TOPIC_ID });
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
