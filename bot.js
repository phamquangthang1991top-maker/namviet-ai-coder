require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

const CONFIG = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  allowedUsers: (process.env.ALLOWED_USER_IDS || '').split(',').map(id => parseInt(id.trim())),
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  maxHistoryMessages: 20,
};

if (!CONFIG.telegramToken) { console.error('Thieu TELEGRAM_BOT_TOKEN'); process.exit(1); }
if (!CONFIG.anthropicKey) { console.error('Thieu ANTHROPIC_API_KEY'); process.exit(1); }

const bot = new TelegramBot(CONFIG.telegramToken, { polling: true });
const claude = new Anthropic({ apiKey: CONFIG.anthropicKey });
const conversations = new Map();

const SYSTEM_PROMPT = `Ban la AI Agent Coder chuyen dung cho cong ty Gom su Nam Viet (Bat Trang, Ha Noi).

VAI TRO:
- Ban la Senior Full-stack Developer, kiem System Architect
- Viet code thuc te, chay duoc ngay
- Uu tien: React/Next.js, Node.js, TailwindCSS, Supabase/PostgreSQL

QUY TAC:
1. Khi nhan yeu cau code, hoi lai 2-3 cau de lam ro truoc khi code
2. Code co comment tieng Viet giai thich logic chinh
3. Tao app/tool phai co huong dan cai dat va chay cu the
4. Task phuc tap thi chia nho thanh cac buoc
5. Luon nghi ve bao mat: khong hardcode API key, validate input

BOI CANH CONG TY:
- Gom su Nam Viet: 23 nhan vien, doanh thu ~25 ty/nam
- San pham: hu dung gao, luc binh, mai binh, gom qua tang
- Kenh ban: gomsunamviet.vn, TikTok Shop, Shopee
- Dang can: tool quan ly kho, tracking don hang, dashboard marketing, tool content AI

PHONG CACH: Tieng Viet, chuyen gia, thang than, code block co syntax highlighting.`;

function isAllowed(userId) {
  if (CONFIG.allowedUsers.length === 1 && isNaN(CONFIG.allowedUsers[0])) return true;
  return CONFIG.allowedUsers.includes(userId);
}

function getHistory(userId) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  return conversations.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  while (history.length > CONFIG.maxHistoryMessages * 2) history.shift();
}

function splitMessage(text, maxLength = 4000) {
  if (text.length <= maxLength) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) { parts.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n\n', maxLength);
    if (cut === -1 || cut < maxLength * 0.3) cut = remaining.lastIndexOf('\n', maxLength);
    if (cut === -1 || cut < maxLength * 0.3) cut = maxLength;
    parts.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut).trimStart();
  }
  return parts;
}

async function sendLong(chatId, text) {
  for (const part of splitMessage(text)) {
    try { await bot.sendMessage(chatId, part, { parse_mode: 'Markdown', disable_web_page_preview: true }); }
    catch { try { await bot.sendMessage(chatId, part); } catch(e) { console.error(e.message); } }
    await new Promise(r => setTimeout(r, 300));
  }
}

bot.onText(/\/start/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, `🤖 *AI Agent Coder - Gom su Nam Viet*\n\n/reset - Bat dau moi\n/status - Trang thai\n\nGui yeu cau code truc tiep!`, { parse_mode: 'Markdown' });
});

bot.onText(/\/reset/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  conversations.delete(msg.from.id);
  bot.sendMessage(msg.chat.id, '🔄 Da xoa lich su. Bat dau moi.');
});

bot.onText(/\/status/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  const h = getHistory(msg.from.id);
  bot.sendMessage(msg.chat.id, `Model: ${CONFIG.model}\nLich su: ${h.length} tin nhan\nUser: ${msg.from.id}`);
});

bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  if (!isAllowed(msg.from.id)) return;
  if (!msg.text || !msg.text.trim()) return;

  await bot.sendChatAction(msg.chat.id, 'typing');
  addToHistory(msg.from.id, 'user', msg.text);

  try {
    const res = await claude.messages.create({
      model: CONFIG.model, max_tokens: 8192,
      system: SYSTEM_PROMPT, messages: getHistory(msg.from.id),
    });
    const reply = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    addToHistory(msg.from.id, 'assistant', reply);
    await sendLong(msg.chat.id, reply);
    console.log(`[${new Date().toISOString()}] User:${msg.from.id} In:${res.usage.input_tokens} Out:${res.usage.out
