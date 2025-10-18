const WebSocket = require("ws");

const ws = new WebSocket("ws://176.123.160.174:8080");

ws.on("open", () => {
  console.log("✅ Подключено к серверу");

  // Подписываемся на все каналы
  setTimeout(() => {
    console.log("\n📥 Подписка на каналы...");
    ws.send(
      JSON.stringify({
        type: "subscribe",
        channels: ["logs", "ticks", "orderbook", "balance"],
        timestamp: Date.now(),
      })
    );
  }, 1000);

  // Отправляем ping каждые 5 секунд
  setInterval(() => {
    console.log("\n🏓 Отправка PING...");
    ws.send(
      JSON.stringify({
        type: "ping",
        timestamp: Date.now(),
      })
    );
  }, 5000);
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());
  console.log("\n📨 Получено:", message.type);
  console.log(JSON.stringify(message, null, 2));
});

ws.on("close", () => {
  console.log("🔌 Отключено от сервера");
});

ws.on("error", (error) => {
  console.error("❌ Ошибка:", error.message);
});
2