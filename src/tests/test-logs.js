const WebSocket = require("ws");

const ws = new WebSocket("ws://176.123.160.174:8080");

let stats = {
  system: 0,
  internal: 0,
  ticks: 0,
  indicators: 0,
  orderbook: 0,
};

ws.on("open", () => {
  console.log("✅ Подключено");

  // Подписываемся на ВСЕ каналы
  setTimeout(() => {
    console.log("📥 Подписка на все каналы...\n");
    ws.send(
      JSON.stringify({
        type: "subscribe",
        channels: ["logs", "ticks", "indicators", "orderbook"],
        timestamp: Date.now(),
      })
    );
  }, 1000);
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());

  // Логи
  if (message.type === "log") {
    if (message.category === "system") {
      stats.system++;
      console.log(`[SYSTEM] ${message.message}`);
    } else if (message.category === "internal") {
      stats.internal++;
      console.log(`[INTERNAL] ${message.message}`);
    }
  }

  // Тики
  if (message.type === "tick") {
    stats.ticks++;
    console.log(`[TICK] ${message.symbol} @ ${message.price} USDT`);
  }

  // Индикаторы
  if (message.type === "indicator") {
    stats.indicators++;
    console.log(
      `[INDICATOR] ${message.name}:`,
      JSON.stringify(message.data, null, 2)
    );
  }

  // Order Book
  if (message.type === "orderbook") {
    stats.orderbook++;
    console.log(
      `[ORDERBOOK] ${message.symbol}: BID ${message.data.bidPercent}% | ASK ${message.data.askPercent}%`
    );
  }

  if (message.type === "subscribed") {
    console.log("✅ Подписан на:", message.channels);
  }
});

ws.on("error", (error) => {
  console.error("❌ Ошибка:", error.message);
});

// Каждые 10 секунд показываем статистику
setInterval(() => {
  console.log("\n📊 СТАТИСТИКА:");
  console.log(`   SYSTEM логов: ${stats.system}`);
  console.log(`   INTERNAL логов: ${stats.internal}`);
  console.log(`   Тиков: ${stats.ticks}`);
  console.log(`   Индикаторов: ${stats.indicators}`);
  console.log(`   Order Book: ${stats.orderbook}`);
  console.log(
    `   Всего сообщений: ${Object.values(stats).reduce((a, b) => a + b, 0)}\n`
  );
}, 10000);

// Через 60 секунд завершаем
setTimeout(() => {
  console.log("\n📊 ФИНАЛЬНАЯ СТАТИСТИКА:");
  console.log(`   SYSTEM логов: ${stats.system}`);
  console.log(`   INTERNAL логов: ${stats.internal}`);
  console.log(`   Тиков: ${stats.ticks}`);
  console.log(`   Индикаторов: ${stats.indicators}`);
  console.log(`   Order Book: ${stats.orderbook}`);
  console.log(`   Всего: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);
  ws.close();
  process.exit(0);
}, 60000);
