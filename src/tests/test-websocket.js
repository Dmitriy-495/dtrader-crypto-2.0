const WebSocket = require("ws");

const ws = new WebSocket("ws:localhost:8080");

let stats = {
  system: 0,
  internal: 0,
  ticks: 0,
  indicators: 0,
  orderbook: 0,
};

let lastTickTime = null;
let ticksPerSecond = [];

ws.on("open", () => {
  console.log("✅ Подключено к серверу\n");

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

  // Системные логи
  if (message.type === "log" && message.category === "system") {
    stats.system++;
    if (message.message.includes("PONG")) {
      const latencyMatch = message.message.match(/задержка: (\d+)ms/);
      if (latencyMatch) {
        console.log(`🏓 PONG | Задержка: ${latencyMatch[1]}ms`);
      }
    }
  }

  // Внутренние логи
  if (message.type === "log" && message.category === "internal") {
    stats.internal++;
  }

  // ТИКИ - детальный вывод
  if (message.type === "tick") {
    stats.ticks++;
    const now = Date.now();

    if (lastTickTime) {
      const interval = now - lastTickTime;
      ticksPerSecond.push(1000 / interval);
      if (ticksPerSecond.length > 10) ticksPerSecond.shift();
    }

    lastTickTime = now;

    const avgTPS =
      ticksPerSecond.length > 0
        ? (
            ticksPerSecond.reduce((a, b) => a + b) / ticksPerSecond.length
          ).toFixed(1)
        : 0;

    console.log(
      `📈 TICK #${stats.ticks} | ${message.symbol} @ $${message.price.toFixed(
        2
      )} | Avg: ${avgTPS} t/s`
    );
  }

  // ИНДИКАТОРЫ
  if (message.type === "indicator") {
    stats.indicators++;

    if (message.name === "tick_speed") {
      console.log(
        `⚡ TICK SPEED | ${message.data.ticksPerMinute} t/min | ${
          message.data.activityLevel
        } | Trend: ${message.data.trend}${
          message.data.isSpike ? " 💥 SPIKE!" : ""
        }`
      );
    }

    if (message.name === "orderbook_pressure") {
      const d = message.data;
      console.log(
        `📊 PRESSURE | ${d.direction} | BID: ${d.bidPercent.toFixed(
          1
        )}% | ASK: ${d.askPercent.toFixed(1)}% | OBI: ${d.imbalance.toFixed(3)}`
      );
    }

    if (message.name === "volume_confirmation") {
      const d = message.data;
      const emoji =
        d.signal === "STRONG_BUY" || d.signal === "STRONG_SELL" ? "💥" : "";
      console.log(
        `📊 VOLUME | ${d.signal} ${emoji} | Ratio: ${d.volumeRatio.toFixed(
          2
        )}x | Price: ${d.priceChange > 0 ? "+" : ""}${d.priceChange.toFixed(
          2
        )}% | ${d.isConfirmed ? "✅ CONFIRMED" : "⚪"}`
      );
    }
  }

  // ORDER BOOK
  if (message.type === "orderbook") {
    stats.orderbook++;
    const d = message.data;
    console.log(
      `📖 ORDERBOOK #${stats.orderbook} | ${
        message.symbol
      } | BID: ${d.bidPercent.toFixed(1)}% | ASK: ${d.askPercent.toFixed(
        1
      )}% | Spread: $${d.spread?.toFixed(2) || "?"}`
    );
  }

  if (message.type === "subscribed") {
    console.log("✅ Подписан на:", message.channels.join(", "), "\n");
  }
});

ws.on("error", (error) => {
  console.error("❌ Ошибка:", error.message);
});

// Статистика каждые 15 секунд
setInterval(() => {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log("\n" + "=".repeat(60));
  console.log("📊 СТАТИСТИКА (промежуточная)");
  console.log("=".repeat(60));
  console.log(`   SYSTEM:      ${stats.system}`);
  console.log(`   INTERNAL:    ${stats.internal}`);
  console.log(`   TICKS:       ${stats.ticks}`);
  console.log(`   INDICATORS:  ${stats.indicators}`);
  console.log(`   ORDERBOOK:   ${stats.orderbook}`);
  console.log(`   ВСЕГО:       ${total}`);
  console.log("=".repeat(60) + "\n");
}, 15000);

// Финал через 60 секунд
setTimeout(() => {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log("\n" + "=".repeat(60));
  console.log("🏁 ФИНАЛЬНАЯ СТАТИСТИКА");
  console.log("=".repeat(60));
  console.log(`   SYSTEM логов:    ${stats.system}`);
  console.log(`   INTERNAL логов:  ${stats.internal}`);
  console.log(`   Тиков:           ${stats.ticks}`);
  console.log(`   Индикаторов:     ${stats.indicators}`);
  console.log(`   Order Book:      ${stats.orderbook}`);
  console.log(`   ВСЕГО:           ${total}`);
  console.log("=".repeat(60));

  if (stats.ticks === 0) {
    console.log("\n⚠️  ТИКИ НЕ ПОЛУЧЕНЫ!");
    console.log("Возможные причины:");
    console.log("  - Нет активности на рынке ETH_USDT");
    console.log("  - Не подписались на канал ticks");
    console.log("  - Проблема с подпиской на Gate.io");
  } else {
    const avgPerMin = (stats.ticks / 60).toFixed(1);
    console.log(`\n✅ Средняя скорость: ${avgPerMin} тиков/мин`);
  }

  ws.close();
  process.exit(0);
}, 60000);
