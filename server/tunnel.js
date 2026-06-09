require('dotenv').config();
const { Client } = require('ssh2');
const { SocksClient } = require('socks');
const https = require('https');
const net   = require('net');

const BOT_TOKEN  = process.env.BOT_TOKEN;
const LOCAL_PORT = parseInt(process.env.PORT || '3000', 10);
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 10808;
const SSH_HOST   = 'localhost.run';
const SSH_PORT   = 22;

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
      res.on('end', () => { try { resolve(JSON.parse(d).ok); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

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

function extractUrl(text) {
  const m = text.match(/https:\/\/[a-z0-9][-a-z0-9.]+\.(lhr\.life|localhost\.run|localto\.net)/);
  return m ? m[0] : null;
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
    console.error('  ❌ SOCKS ошибка:', err.message);
    process.exit(1);
  }

  const conn = new Client();

  conn.on('ready', () => {
    console.log('  ✅ SSH соединение установлено');
    console.log('  ⏳ Ожидаем URL туннеля...\n');

    // Просим reverse port forwarding (порт 0 = сервер назначит сам)
    conn.forwardIn('', 0, (err, port) => {
      if (err) console.warn('  forwardIn warn:', err.message);
    });

    // localhost.run пишет URL через shell-сессию
    conn.shell({ term: 'xterm' }, (err, stream) => {
      if (err) {
        console.error('  ❌ Shell ошибка:', err.message);
        return;
      }

      const onData = (d) => {
        const text = d.toString();
        const url = extractUrl(text);
        if (url) handleUrl(url);
      };

      stream.on('data', onData);
      stream.stderr.on('data', onData);
    });
  });

  // Входящие соединения через туннель → пробрасываем на localhost:3000
  conn.on('tcp connection', (info, accept) => {
    const remote = accept();
    const local  = net.createConnection(LOCAL_PORT, '127.0.0.1');
    remote.pipe(local).pipe(remote);
    remote.on('close', () => local.destroy());
    local.on('close',  () => remote.close());
    local.on('error',  () => remote.close());
    remote.on('error', () => local.destroy());
  });

  conn.on('error', (err) => {
    console.error('  ❌ SSH ошибка:', err.message);
    process.exit(1);
  });

  conn.connect({
    sock:     socket,
    username: 'nokey',
    algorithms: {
      serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256']
    }
  });
}

start();
