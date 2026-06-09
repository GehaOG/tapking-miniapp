require('dotenv').config();
const { Client } = require('ssh2');
const { SocksClient } = require('socks');
const https = require('https');

const BOT_TOKEN  = process.env.BOT_TOKEN;
const LOCAL_PORT = parseInt(process.env.PORT || '3000', 10);

// SOCKS5 прокси Clash/V2Ray
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 10808;

// SSH-туннель сервис
const SSH_HOST = 'localhost.run';
const SSH_PORT = 22;

async function updateBot(url) {
  const body = JSON.stringify({
    menu_button: { type: 'web_app', text: 'Play', web_app: { url } }
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/setChatMenuButton`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).ok));
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function start() {
  console.log('\n  TapKing — запуск туннеля через SOCKS...\n');

  let socket;
  try {
    const info = await SocksClient.createConnection({
      proxy:       { host: PROXY_HOST, port: PROXY_PORT, type: 5 },
      command:     'connect',
      destination: { host: SSH_HOST, port: SSH_PORT }
    });
    socket = info.socket;
    console.log('  ✅ SOCKS-подключение установлено');
  } catch (err) {
    console.error('  ❌ Не удалось подключиться через SOCKS:', err.message);
    console.log('  Убедитесь что VPN (Clash) запущен и SOCKS-порт 10808 активен.');
    process.exit(1);
  }

  const conn = new Client();

  conn.on('ready', () => {
    console.log('  ✅ SSH соединение установлено\n');

    // Запрашиваем reverse tunnel — localhost.run выдаёт URL в потоке
    conn.forwardIn('', 0, (err) => {
      if (err) {
        console.error('  ❌ Ошибка туннеля:', err.message);
        process.exit(1);
      }
    });
  });

  conn.on('tcp connection', (info, accept) => {
    const stream = accept();
    const net = require('net');
    const local = net.createConnection(LOCAL_PORT, '127.0.0.1');
    stream.pipe(local).pipe(stream);
    stream.on('close', () => local.destroy());
    local.on('close', () => stream.close());
  });

  // localhost.run пишет URL в stderr/stdout SSH сессии
  conn.on('banner', (msg) => {
    const match = msg.match(/https:\/\/[^\s]+/);
    if (match) handleUrl(match[0]);
  });

  conn.shell((err, stream) => {
    if (err) return;
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const match = buf.match(/https:\/\/[a-z0-9-]+\.[a-z.]+/);
      if (match) handleUrl(match[0]);
    });
    stream.stderr.on('data', (d) => {
      const text = d.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.[a-z.]+/);
      if (match) handleUrl(match[0]);
    });
  });

  let announced = false;
  async function handleUrl(url) {
    if (announced) return;
    announced = true;
    console.log(`  🌐 Публичный URL: ${url}\n`);
    if (BOT_TOKEN) {
      const ok = await updateBot(url);
      console.log(ok
        ? `  ✅ Кнопка бота обновлена!\n  🤖 https://t.me/miniap_pp_bot\n`
        : `  ⚠️  Вставьте URL вручную в BotFather: ${url}\n`
      );
    }
    console.log('  Не закрывайте это окно!\n');
  }

  conn.connect({
    sock:     socket,
    username: 'nokey',
    algorithms: {
      serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256']
    }
  });

  conn.on('error', (err) => {
    console.error('  ❌ SSH ошибка:', err.message);
    process.exit(1);
  });
}

start();
