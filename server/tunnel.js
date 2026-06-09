require('dotenv').config();
const localtunnel = require('localtunnel');
const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

async function updateBotMenuButton(url) {
  const body = JSON.stringify({
    menu_button: {
      type: 'web_app',
      text: 'Play',
      web_app: { url }
    }
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/setChatMenuButton`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = JSON.parse(data);
        resolve(result.ok);
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log('\n  TapKing — запуск туннеля...\n');

  try {
    const tunnel = await localtunnel({ port: PORT });

    console.log('  ✅ Туннель открыт!');
    console.log(`  🌐 URL: ${tunnel.url}\n`);

    // Обновляем кнопку бота
    if (BOT_TOKEN) {
      const ok = await updateBotMenuButton(tunnel.url);
      if (ok) {
        console.log('  ✅ Кнопка бота обновлена!');
        console.log(`  🤖 Бот: https://t.me/miniap_pp_bot\n`);
      } else {
        console.log('  ⚠️  Не удалось обновить кнопку бота');
        console.log(`  👉 Вставьте вручную в BotFather: ${tunnel.url}\n`);
      }
    }

    console.log('  Не закрывайте это окно!\n');

    tunnel.on('close', () => {
      console.log('\n  Туннель закрыт.');
    });

    tunnel.on('error', (err) => {
      console.error('  Ошибка туннеля:', err.message);
    });

  } catch (err) {
    console.error('  ❌ Не удалось открыть туннель:', err.message);
    console.log('\n  Попробуйте запустить ещё раз.');
    process.exit(1);
  }
})();
