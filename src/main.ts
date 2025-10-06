import dotenv from "dotenv";
import { DTraderCore } from "./core/dtrader-crypto";

// Загружаем переменные окружения
dotenv.config();

class TradingBot {
  private core: DTraderCore;

  constructor() {
    this.core = new DTraderCore();
  }

  async start(): Promise<void> {
    console.log("🚀 Starting DTrader Crypto 2.0...");
    console.log("📍 Target: Gate.io Exchange");
    console.log("=".repeat(50));

    try {
      // Проверяем REST API соединение
      await this.testRestConnection();

      // Запускаем ядро системы
      await this.core.start();

      console.log("🎉 DTrader Crypto 2.0 successfully initialized!");
    } catch (error) {
      console.error("💥 Failed to start trading bot:", error);
      process.exit(1);
    }
  }

  private async testRestConnection(): Promise<void> {
    console.log("🔗 Testing REST API connection...");

    try {
      const axios = await import("axios");

      const response = await axios.default.get(
        "https://api.gateio.ws/api/v4/spot/currency_pairs/BTC_USDT",
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      const pair = response.data;
      console.log("✅ REST API connection successful!");
      console.log(`   Pair: ${pair.id}`);
      console.log(`   Base: ${pair.base}, Quote: ${pair.quote}`);
      console.log(`   Status: ${pair.trade_status}`);
    } catch (error) {
      console.error("❌ REST API connection failed:", error);
      throw error;
    }
  }
}

// Создаем и запускаем бота
const bot = new TradingBot();

// Обработка graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received shutdown signal");
  console.log("👋 Shutting down DTrader Crypto 2.0...");
  process.exit(0);
});

// Запуск приложения
bot.start().catch((error) => {
  console.error("💥 Fatal error during startup:", error);
  process.exit(1);
});
