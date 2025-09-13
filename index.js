const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// 🔹 Token bot từ BotFather
const token = process.env.BOT_TOKEN;

// 🔹 Khởi tạo bot
const bot = new TelegramBot(token, { polling: true });

// 🔹 Đường dẫn file JSON
const dataFile = path.join(__dirname, 'links.json');

// Hàm đọc dữ liệu từ file JSON
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

// Hàm ghi dữ liệu vào file JSON
function saveLinks(data) {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Lỗi ghi file:', err);
    }
}

// 🔹 Load dữ liệu ban đầu
let links = loadLinks();

// Lệnh /link <nội dung>
bot.onText(/^\/link (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const linkContent = match[1].trim();

    // Lưu link vào mảng
    links.push({
        user: msg.from.username || msg.from.first_name,
        content: linkContent,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    });

    // Ghi vào file JSON
    saveLinks(links);

    // Xóa tin nhắn gốc
    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (err) {
        console.error('Không thể xóa tin nhắn:', err.message);
    }

    bot.sendMessage(chatId, `✅ Link đã được lưu!`);
});

// Lệnh /list
bot.onText(/^\/list$/, (msg) => {
    const chatId = msg.chat.id;

    if (links.length === 0) {
        return bot.sendMessage(chatId, '📭 Chưa có link nào được lưu.');
    }

    let message = '📌 Danh sách link đã lưu:\n\n';
    links.forEach((item, index) => {
        message += `${index + 1}. ${item.content} (by ${item.user} - ${item.time})\n`;
    });

    bot.sendMessage(chatId, message);
});

// Cron job: reset dữ liệu lúc 7h sáng UTC+7 mỗi ngày
cron.schedule('0 0 7 * * *', () => {
    links = [];
    saveLinks(links);
    console.log('🗑 Dữ liệu đã được làm mới lúc 7h sáng UTC+7');
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

console.log('🚀 Bot đang chạy...');
