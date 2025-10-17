/**
 * OrderBookManager - управление локальной книгой ордеров
 * Реализует алгоритм синхронизации согласно документации Gate.io
 */

import { OrderBook, OrderBookLevel, OrderBookUpdate } from "../types";
import { GateIO } from "../GateIO";
import { LogBroadcaster } from "./LogBroadcaster";
import { MessageType } from "../types";

// ============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация OrderBookManager
 */
export interface OrderBookManagerConfig {
  symbol: string; // Торговая пара (ETH_USDT)
  depth: number; // Глубина order book (10, 20, 50, 100)
  gateio: GateIO; // Экземпляр GateIO для REST запросов
}

/**
 * Состояние синхронизации
 */
enum SyncState {
  NOT_INITIALIZED = "NOT_INITIALIZED",
  CACHING_UPDATES = "CACHING_UPDATES",
  SYNCHRONIZED = "SYNCHRONIZED",
}

// ============================================================================
// КЛАСС ORDERBOOKMANAGER
// ============================================================================

export class OrderBookManager {
  private config: OrderBookManagerConfig;
  private orderBook: OrderBook | null = null;
  private updateCache: OrderBookUpdate[] = [];
  private syncState: SyncState = SyncState.NOT_INITIALIZED;

  /**
   * Конструктор
   */
  constructor(config: OrderBookManagerConfig) {
    this.config = config;
    console.log(
      `📖 OrderBookManager создан для ${config.symbol} (глубина: ${config.depth})`
    );
  }

  // ==========================================================================
  // ИНИЦИАЛИЗАЦИЯ И СИНХРОНИЗАЦИЯ
  // ==========================================================================

  /**
   * Инициализирует Order Book
   * Шаги согласно документации Gate.io:
   * 1. Начать кэшировать обновления
   * 2. Получить снапшот через REST API
   * 3. Применить кэшированные обновления
   */
  async initialize(): Promise<void> {
    console.log(`\n🔄 Инициализация Order Book для ${this.config.symbol}...`);

    try {
      // Шаг 1: Переходим в режим кэширования
      this.syncState = SyncState.CACHING_UPDATES;
      console.log("📦 Начато кэширование обновлений...");

      // Ждем немного чтобы накопить обновления
      await this.sleep(1000);

      // Шаг 2: Получаем базовый снапшот через REST API
      console.log("📡 Получение базового снапшота через REST API...");
      const snapshot = await this.config.gateio.getOrderBook(
        this.config.symbol,
        this.config.depth
      );

      // Парсим снапшот
      const baseId = parseInt(snapshot.id);
      console.log(`📊 Снапшот получен (baseID: ${baseId})`);

      // Создаем локальный order book
      this.orderBook = {
        symbol: this.config.symbol,
        lastUpdateId: baseId,
        bids: snapshot.bids.map((b: string[]) => ({
          price: parseFloat(b[0]),
          amount: parseFloat(b[1]),
        })),
        asks: snapshot.asks.map((a: string[]) => ({
          price: parseFloat(a[0]),
          amount: parseFloat(a[1]),
        })),
        timestamp: Date.now(),
      };

      // Шаг 3: Применяем кэшированные обновления
      console.log(
        `📦 Применение ${this.updateCache.length} кэшированных обновлений...`
      );

      let appliedUpdates = 0;
      for (const update of this.updateCache) {
        // Применяем только обновления которые идут после базового снапшота
        // Условие: U <= baseID+1 AND u >= baseID+1
        if (
          update.firstUpdateId <= baseId + 1 &&
          update.lastUpdateId >= baseId + 1
        ) {
          this.applyUpdate(update);
          appliedUpdates++;
        }
      }

      // Очищаем кэш
      this.updateCache = [];
      this.syncState = SyncState.SYNCHRONIZED;

      console.log(
        `✅ Order Book синхронизирован! Применено обновлений: ${appliedUpdates}`
      );
      this.displayOrderBook();
    } catch (error: any) {
      console.error("❌ Ошибка инициализации Order Book:", error.message);
      this.syncState = SyncState.NOT_INITIALIZED;
      throw error;
    }
  }

  /**
   * Обрабатывает входящее обновление от WebSocket
   */
  processUpdate(updateData: any): void {
    const update: OrderBookUpdate = {
      firstUpdateId: updateData.U,
      lastUpdateId: updateData.u,
      symbol: updateData.s,
      bids: updateData.b.map((b: string[]) => ({
        price: parseFloat(b[0]),
        amount: parseFloat(b[1]),
      })),
      asks: updateData.a.map((a: string[]) => ({
        price: parseFloat(a[0]),
        amount: parseFloat(a[1]),
      })),
      timestamp: Date.now(),
    };

    // Если еще не синхронизированы, кэшируем обновления
    if (this.syncState === SyncState.CACHING_UPDATES) {
      this.updateCache.push(update);
      return;
    }

    // Если синхронизированы, применяем обновление
    if (this.syncState === SyncState.SYNCHRONIZED) {
      // Проверяем последовательность: U должно быть baseID+1
      if (update.firstUpdateId > this.orderBook!.lastUpdateId + 1) {
        console.error(
          `⚠️  Пропущены обновления! Expected: ${
            this.orderBook!.lastUpdateId + 1
          }, Got: ${update.firstUpdateId}`
        );
        console.log("🔄 Требуется пересинхронизация...");
        this.resync();
        return;
      }

      // Если обновление слишком старое, игнорируем
      if (update.lastUpdateId <= this.orderBook!.lastUpdateId) {
        return;
      }

      this.applyUpdate(update);
    }
  }

  /**
   * Применяет обновление к локальному Order Book
   */
  private applyUpdate(update: OrderBookUpdate): void {
    if (!this.orderBook) return;

    // Обновляем bids
    for (const bid of update.bids) {
      this.updateLevel(this.orderBook.bids, bid, "desc");
    }

    // Обновляем asks
    for (const ask of update.asks) {
      this.updateLevel(this.orderBook.asks, ask, "asc");
    }

    // Обновляем ID последнего обновления
    this.orderBook.lastUpdateId = update.lastUpdateId;
    this.orderBook.timestamp = update.timestamp;
  }

  /**
   * Обновляет уровень в массиве (bids или asks)
   * Если amount = 0, удаляем уровень
   * Иначе обновляем или добавляем
   */
  private updateLevel(
    levels: OrderBookLevel[],
    newLevel: OrderBookLevel,
    order: "asc" | "desc"
  ): void {
    const index = levels.findIndex((l) => l.price === newLevel.price);

    // Если amount = 0, удаляем уровень
    if (newLevel.amount === 0) {
      if (index !== -1) {
        levels.splice(index, 1);
      }
      return;
    }

    // Если уровень существует, обновляем
    if (index !== -1) {
      levels[index].amount = newLevel.amount;
    } else {
      // Иначе добавляем и сортируем
      levels.push(newLevel);
      levels.sort((a, b) =>
        order === "desc" ? b.price - a.price : a.price - b.price
      );
    }

    // Ограничиваем глубину
    if (levels.length > this.config.depth) {
      levels.length = this.config.depth;
    }
  }

  /**
   * Пересинхронизация при потере обновлений
   */
  private async resync(): Promise<void> {
    this.syncState = SyncState.NOT_INITIALIZED;
    this.orderBook = null;
    this.updateCache = [];

    // Ждем немного и пробуем заново
    await this.sleep(1000);
    await this.initialize();
  }

  // ==========================================================================
  // ПОЛУЧЕНИЕ ДАННЫХ
  // ==========================================================================

  /**
   * Получить текущий Order Book
   */
  getOrderBook(): OrderBook | null {
    return this.orderBook;
  }

  /**
   * Получить лучшую цену покупки (bid)
   */
  getBestBid(): number | null {
    if (!this.orderBook || this.orderBook.bids.length === 0) return null;
    return this.orderBook.bids[0].price;
  }

  /**
   * Получить лучшую цену продажи (ask)
   */
  getBestAsk(): number | null {
    if (!this.orderBook || this.orderBook.asks.length === 0) return null;
    return this.orderBook.asks[0].price;
  }

  /**
   * Получить спред (разницу между лучшим bid и ask)
   */
  getSpread(): number | null {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === null || ask === null) return null;
    return ask - bid;
  }

  /**
   * Получить середину спреда (mid price)
   */
  getMidPrice(): number | null {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === null || ask === null) return null;
    return (bid + ask) / 2;
  }

  /**
   * Рассчитать общий объем в USDT для asks (первые N уровней)
   */
  getAsksVolume(levels?: number): number {
    if (!this.orderBook) return 0;

    const depth = levels !== undefined ? levels : this.config.depth;

    return this.orderBook.asks
      .slice(0, depth)
      .reduce((sum, ask) => sum + ask.price * ask.amount, 0);
  }

  /**
   * Рассчитать общий объем в USDT для bids (первые N уровней)
   */
  getBidsVolume(levels?: number): number {
    if (!this.orderBook) return 0;

    const depth = levels !== undefined ? levels : this.config.depth;

    return this.orderBook.bids
      .slice(0, depth)
      .reduce((sum, bid) => sum + bid.price * bid.amount, 0);
  }

  /**
   * Получить соотношение объемов asks/bids в процентах
   */
  getVolumeRatio(
    levels?: number
  ): {
    askVolume: number;
    bidVolume: number;
    askPercent: number;
    bidPercent: number;
  } | null {
    if (!this.orderBook) return null;

    const depth = levels !== undefined ? levels : this.config.depth;

    const askVolume = this.getAsksVolume(depth);
    const bidVolume = this.getBidsVolume(depth);
    const totalVolume = askVolume + bidVolume;

    if (totalVolume === 0) return null;

    return {
      askVolume,
      bidVolume,
      askPercent: (askVolume / totalVolume) * 100,
      bidPercent: (bidVolume / totalVolume) * 100,
    };
  }

  /**
   * Проверить синхронизирован ли Order Book
   */
  isSynchronized(): boolean {
    return this.syncState === SyncState.SYNCHRONIZED;
  }

  // ==========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================================================

  /**
   * Вывести Order Book в консоль (компактный формат с объемами)
   */
  displayOrderBook(): void {
    if (!this.orderBook) {
      console.log("📖 Order Book не инициализирован");
      return;
    }

    const ratio = this.getVolumeRatio(); // Используем глубину из config
    if (!ratio) {
      console.log("📖 Order Book: недостаточно данных");
      return;
    }

    const timeISO = new Date(this.orderBook.timestamp).toISOString();

    console.log(
      `📖 ${this.orderBook.symbol} [${timeISO}] | ` +
        `ASK ${ratio.askVolume
          .toFixed(2)
          .padStart(12)} USDT (${ratio.askPercent.toFixed(1)}%) | ` +
        `BID ${ratio.bidVolume
          .toFixed(2)
          .padStart(12)} USDT (${ratio.bidPercent.toFixed(1)}%)`
    );
  }

  /**
   * Вспомогательная функция для ожидания
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
