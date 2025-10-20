const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:8080");

let signals = {
  BUY: 0,
  SELL: 0,
  HOLD: 0,
};

ws.on("open", () => {
  console.log("✅ Подключено");

  // Подписываемся на логи чтобы видеть сигналы
  setTimeout(() => {
    ws.send(
      JSON.stringify({
        type: "subscribe",
        channels: ["logs", "indicators"],
        timestamp: Date.now(),
      })
    );
  }, 1000);
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());

  // Ловим сигналы TVP из логов
  if (
    message.type === "log" &&
    message.message.includes("ТОРГОВЫЙ СИГНАЛ от TVP")
  ) {
    if (message.message.includes("BUY")) {
      signals.BUY++;
      console.log(`\n🟢 СИГНАЛ BUY #${signals.BUY}`);
    } else if (message.message.includes("SELL")) {
      signals.SELL++;
      console.log(`\n🔴 СИГНАЛ SELL #${signals.SELL}`);
    }
  }

  // Выводим индикаторы
  if (message.type === "indicator") {
    if (message.name === "volume_confirmation") {
      console.log(
        `📊 Volume: ${message.data.signal} (${message.data.volumeRatio}x)`
      );
    }
    if (message.name === "orderbook_pressure") {
      console.log(
        `📖 Pressure: ${
          message.data.direction
        } (OBI: ${message.data.imbalance.toFixed(3)})`
      );
    }
  }
});

// Статистика каждые 60 секунд
setInterval(() => {
  console.log("\n📊 СТАТИСТИКА СИГНАЛОВ:");
  console.log(`   BUY:  ${signals.BUY}`);
  console.log(`   SELL: ${signals.SELL}`);
  console.log(`   Всего: ${signals.BUY + signals.SELL}\n`);
}, 60000);
