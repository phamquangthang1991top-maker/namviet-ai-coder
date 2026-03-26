require('dotenv').config();
var TelegramBot = require('node-telegram-bot-api');
var Anthropic = require('@anthropic-ai/sdk');

var telegramToken = process.env.TELEGRAM_BOT_TOKEN;
var anthropicKey = process.env.ANTHROPIC_API_KEY;
var allowedUsers = (process.env.ALLOWED_USER_IDS || '').split(',').map(function(id) { return parseInt(id.trim()); });
var model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

if (!telegramToken) { console.error('Thieu TELEGRAM_BOT_TOKEN'); process.exit(1); }
if (!anthropicKey) { console.error('Thieu ANTHROPIC_API_KEY'); process.exit(1); }

var bot = new TelegramBot(telegramToken, { polling: true });
var claude = new Anthropic({ apiKey: anthropicKey });
var conversations = {};

var SYSTEM_PROMPT = 'Ban la AI Agent Coder chuyen dung cho cong ty Gom su Nam Viet (Bat Trang, Ha Noi). Ban la Senior Full-stack Developer. Viet code thuc te, chay duoc ngay. Uu tien React/Next.js, Node.js, TailwindCSS, Supabase. Khi nhan yeu cau code, hoi lai 2-3 cau de lam ro. Code co comment tieng Viet. Luon co huong dan cai dat. Boi canh: Gom su Nam Viet, 23 nhan vien, doanh thu 25 ty/nam. San pham: hu gao, luc binh, mai binh, gom qua tang. Kenh ban: gomsunamviet.vn, TikTok Shop, Shopee. Can: tool quan ly kho, tracking don hang, dashboard marketing. Tra loi bang tieng Viet, chuyen gia, thang than.';

function isAllowed(userId) {
  if (allowedUsers.length === 1 && isNaN(allowedUsers[0])) return true;
  return allowedUsers.indexOf(userId) !== -1;
}

function getHistory(userId) {
  if (!conversations[userId]) conversations[userId] = [];
  return conversations[userId];
}

function addToHistory(userId, role, content) {
  var history = getHistory(userId);
  history.push({ role: role, content: content });
  while (history.length > 40) history.shift();
}

function splitMessage(text) {
  if (text.length <= 4000) return [text];
  var parts = [];
  var remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 4000) { parts.push(remaining); break; }
    var cut = remaining.lastIndexOf('\n\n', 4000);
    if (cut === -1 || cut < 1200) cut = remaining.lastIndexOf('\n', 4000);
    if (cut === -1 || cut < 1200) cut = 4000;
    parts.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut).trimStart();
  }
  return parts;
}

function sendLong(chatId, text) {
  var parts = splitMessage(text);
  var i = 0;
  function sendNext() {
    if (i >= parts.length) return;
    var part = parts[i];
    i++;
    bot.sendMessage(chatId, part, { parse_mode: 'Markdown', disable_web_page_preview: true })
      .catch(function() { return bot.sendMessage(chatId, part); })
      .catch(function(e) { console.error(e.message); })
      .then(function() { setTimeout(sendNext, 300); });
  }
  sendNext();
}

bot.onText(/\/start/, function(msg) {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, 'AI Agent Coder - Gom su Nam Viet\n\n/reset - Bat dau moi\n/status - Trang thai\n\nGui yeu cau code truc tiep!');
});

bot.onText(/\/reset/, function(msg) {
  if (!isAllowed(msg.from.id)) return;
  delete conversations[msg.from.id];
  bot.sendMessage(msg.chat.id, 'Da xoa lich su. Bat dau moi.');
});

bot.onText(/\/status/, function(msg) {
  if (!isAllowed(msg.from.id)) return;
  var h = getHistory(msg.from.id);
  bot.sendMessage(msg.chat.id, 'Model: ' + model + '\nLich su: ' + h.length + ' tin nhan\nUser: ' + msg.from.id);
});

bot.on('message', function(msg) {
  if (msg.text && msg.text.charAt(0) === '/') return;
  if (!isAllowed(msg.from.id)) return;
  if (!msg.text || !msg.text.trim()) return;

  bot.sendChatAction(msg.chat.id, 'typing');
  addToHistory(msg.from.id, 'user', msg.text);

  claude.messages.create({
    model: model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: getHistory(msg.from.id)
  }).then(function(res) {
    var reply = '';
    for (var j = 0; j < res.content.length; j++) {
      if (res.content[j].type === 'text') reply += res.content[j].text;
    }
    addToHistory(msg.from.id, 'assistant', reply);
    sendLong(msg.chat.id, reply);
    console.log('User:' + msg.from.id + ' In:' + res.usage.input_tokens + ' Out:' + res.usage.output_tokens);
  }).catch(function(err) {
    console.error(err.message);
    var e = 'Co loi xay ra.';
    if (err.status === 429) e = 'Rate limit. Doi 30 giay.';
    else if (err.status === 401) e = 'API Key sai.';
    else if (err.status === 400) { e = 'Context qua dai. Dung /reset'; delete conversations[msg.from.id]; }
    bot.sendMessage(msg.chat.id, e);
  });
});

console.log('AI Agent Coder dang chay... Model: ' + model);
