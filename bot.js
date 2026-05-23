const TG_TOKEN = process.env.BOT_TOKEN || '8179653144:AAFx4sm2_jWlhFpkxbWjX_QNBpADpIWd3fE';
const API_KEY  = process.env.SOCIAVAULT_KEY || 'sk_live_697723ebb316f09ccbd5ce1d72e572f1';
const BASE     = 'https://api.sociavault.com/v1/scrape';
const PORT     = process.env.PORT || 3000;

const http  = require('http');
const https = require('https');

// ── Telegram helpers ──────────────────────────────────────────────
async function tg(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TG_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const send = (chat_id, text, extra = {}) =>
  tg('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

// ── SociaVault fetch ──────────────────────────────────────────────
async function fetchVideo(url) {
  let endpoint, params;

  if (/tiktok\.com/i.test(url)) {
    endpoint = `${BASE}/tiktok/video`;
    params   = `url=${encodeURIComponent(url)}`;
  } else if (/instagram\.com/i.test(url)) {
    endpoint = `${BASE}/instagram/post`;
    params   = `url=${encodeURIComponent(url)}`;
  } else if (/twitter\.com|x\.com/i.test(url)) {
    const m = url.match(/status\/(\d+)/);
    if (!m) throw new Error('Invalid Twitter URL — copy the full tweet link.');
    endpoint = `${BASE}/twitter/tweet`;
    params   = `tweet_id=${m[1]}`;
  } else if (/youtube\.com|youtu\.be/i.test(url)) {
    endpoint = `${BASE}/youtube/video`;
    params   = `url=${encodeURIComponent(url)}`;
  } else {
    throw new Error('Unsupported platform. Send a TikTok, Instagram, Twitter/X or YouTube link.');
  }

  const result = await new Promise((resolve, reject) => {
    https.get(`${endpoint}?${params}`, { headers: { 'X-API-Key': API_KEY } }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Bad response from API')); }
      });
    }).on('error', reject);
  });

  if (!result.success) throw new Error(result.message || result.error || 'API error');

  const d = result.data;
  let dlUrl, title, meta;

  if (/tiktok\.com/i.test(url)) {
    const urls = d.video?.download_no_watermark_addr?.url_list;
    dlUrl = urls?.['0'] || urls?.[0];
    if (!dlUrl) throw new Error('No download URL — video may be private.');
    title = d.desc?.slice(0, 80) || 'TikTok Video';
    meta  = `@${d.author?.unique_id || 'unknown'}`;
  } else if (/instagram\.com/i.test(url)) {
    dlUrl = d.video_url;
    if (!dlUrl) throw new Error('No video found — Reels/videos only, not photos.');
    title = d.caption?.slice(0, 80) || 'Instagram Reel';
    meta  = `@${d.owner?.username || 'unknown'}`;
  } else if (/twitter\.com|x\.com/i.test(url)) {
    const variants = d.extended_entities?.media?.[0]?.video_info?.variants || [];
    const best = variants
      .filter(v => v.content_type === 'video/mp4')
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    dlUrl = best?.url;
    if (!dlUrl) throw new Error('No video in this tweet.');
    title = d.full_text?.slice(0, 80) || 'Twitter Video';
    meta  = `@${d.user?.screen_name || 'unknown'}`;
  } else {
    title = d.title || 'YouTube Video';
    meta  = d.channel?.title || '';
    dlUrl = null; // YouTube metadata only
  }

  return { dlUrl, title, meta, isYoutube: /youtube\.com|youtu\.be/i.test(url) };
}

// ── Update handler ────────────────────────────────────────────────
async function handleUpdate(update) {
  const msg  = update.message;
  if (!msg) return;

  const chat_id = msg.chat.id;
  const text    = msg.text?.trim();
  if (!text) return;

  // Commands
  if (text === '/start') {
    return send(chat_id,
      `👋 <b>Welcome to VidSnap!</b>\n\n` +
      `Send me a video link and I'll get the download URL for you.\n\n` +
      `<b>Supported:</b>\n` +
      `• TikTok (no watermark)\n` +
      `• Instagram Reels\n` +
      `• Twitter/X videos\n` +
      `• YouTube (info only)\n\n` +
      `Just paste a link to get started! ⬇️`
    );
  }

  if (text === '/help') {
    return send(chat_id,
      `<b>How to use VidSnap:</b>\n\n` +
      `1. Copy a video link\n` +
      `2. Paste it here\n` +
      `3. Tap the download link I send back\n\n` +
      `<b>Commands:</b>\n` +
      `/start — Welcome message\n` +
      `/help — This message`
    );
  }

  // URL check
  let url;
  try { url = new URL(text); } catch {
    return send(chat_id, `❌ That doesn't look like a valid URL.\n\nSend a TikTok, Instagram, Twitter/X or YouTube link.`);
  }

  // Processing
  await send(chat_id, `⏳ Fetching video...`);

  try {
    const { dlUrl, title, meta, isYoutube } = await fetchVideo(text);

    if (isYoutube) {
      return send(chat_id,
        `📺 <b>${title}</b>\n${meta}\n\n` +
        `⚠️ YouTube direct download isn't available on the free API tier.\n\n` +
        `Try: <a href="https://y2mate.com">y2mate.com</a>`
      );
    }

    return send(chat_id,
      `✅ <b>${title}</b>\n<i>${meta}</i>\n\n` +
      `<a href="${dlUrl}">⬇️ Tap here to download</a>\n\n` +
      `<i>Link expires after a few hours.</i>`
    );

  } catch (err) {
    return send(chat_id, `❌ <b>Error:</b> ${err.message}`);
  }
}

// ── Polling loop ──────────────────────────────────────────────────
let offset = 0;
async function poll() {
  try {
    const res = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
    if (res.result?.length) {
      for (const update of res.result) {
        offset = update.update_id + 1;
        handleUpdate(update).catch(console.error);
      }
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 1000);
}

// ── Keep-alive HTTP server (for Render free tier) ─────────────────
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('VidSnap Bot is running ✅');
}).listen(PORT, () => console.log(`Server on port ${PORT}`));

// ── Start ─────────────────────────────────────────────────────────
console.log('🤖 VidSnap Bot starting...');
poll();
