/**
 * OrderBookManager - управление локальной книгой ордеров
 * Реализует алгоритм синхронизации согласно документации Gate.io
 * ОПТИМИЗИРОВАН: Минимум логов, только данные для клиентов
 */

import {
  OrderBook,
  OrderBookLevel,
  OrderBookUpdate,
  MessageType,
} from "../types";
import { GateIO } from "../GateIO";
import { BroadcastManager } from "./BroadcastManager";

export interface OrderBookManagerConfig {
  symbol: string;
  depth: number;
  gateio: GateIO;
  broadcastManager?: BroadcastManager;
}

enum SyncState {
  NOT_INITIALIZED = "NOT_INITIALIZED",
  CACHING_UPDATES = "CACHING_UPDATES",
  SYNCHRONIZED = "SYNCHRONIZED",
}

export class OrderBookManager {
  private config: OrderBookManagerConfig;
  private orderBook: OrderBook | null = null;
  private updateCache: OrderBookUpdate[] = [];
  private syncState: SyncState = SyncState.NOT_INITIALIZED;
  private broadcastManager: BroadcastManager | null = null;
  private maxCacheSize: number = 1000; // Защита от переполнения

  constructor(config: OrderBookManagerConfig) {
    this.config = config;
    this.broadcastManager = config.broadcastManager || null;
    console.log(
      `📖 OrderBookManager: ${config.symbol} (глубина: ${config.depth})`
    );
  }

  async initialize(): Promise<void> {
    console.log(`🔄 Инициализация Order Book для ${this.config.symbol}...`);

    try {
      this.syncState = SyncState.CACHING_UPDATES;
      await this.sleep(1000);

      const snapshot = await this.config.gateio.getOrderBook(
        this.config.symbol,
        this.config.depth
      );

      const baseId = parseInt(snapshot.id);
      console.log(`✅ Снапшот получен (ID: ${baseId})`);

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

      let appliedUpdates = 0;
      for (const update of this.updateCache) {
        if (
          update.firstUpdateId <= baseId + 1 &&
          update.lastUpdateId >= baseId + 1
        ) {
          this.applyUpdate(update);
          appliedUpdates++;
        }
      }

      this.updateCache = [];
      this.syncState = SyncState.SYNCHRONIZED;

      console.log(
        `✅ Order Book синхронизирован (обновлений: ${appliedUpdates})`
      );
    } catch (error: any) {
      console.error("❌ Ошибка инициализации Order Book:", error.message);
      this.syncState = SyncState.NOT_INITIALIZED;
      throw error;
    }
  }

  processUpdate(updateData: any): void {
    // Защита от переполнения кэша
    if (
      this.syncState === SyncState.CACHING_UPDATES &&
      this.updateCache.length > this.maxCacheSize
    ) {
      console.error("❌ Кэш обновлений переполнен! Пересинхронизация...");
      this.resync();
      return;
    }

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

    if (this.syncState === SyncState.CACHING_UPDATES) {
      this.updateCache.push(update);
      return;
    }

    if (this.syncState === SyncState.SYNCHRONIZED) {
      if (update.firstUpdateId > this.orderBook!.lastUpdateId + 1) {
        console.error(
          `⚠️ Пропущены обновления! Ожидалось: ${
            this.orderBook!.lastUpdateId + 1
          }, Получено: ${update.firstUpdateId}`
        );
        this.resync();
        return;
      }

      if (update.lastUpdateId <= this.orderBook!.lastUpdateId) {
        return;
      }

      this.applyUpdate(update);
    }
  }

  private applyUpdate(update: OrderBookUpdate): void {
    if (!this.orderBook) return;

    for (const bid of update.bids) {
      this.updateLevel(this.orderBook.bids, bid, "desc");
    }

    for (const ask of update.asks) {
      this.updateLevel(this.orderBook.asks, ask, "asc");
    }

    this.orderBook.lastUpdateId = update.lastUpdateId;
    this.orderBook.timestamp = update.timestamp;
  }

  private updateLevel(
    levels: OrderBookLevel[],
    newLevel: OrderBookLevel,
    order: "asc" | "desc"
  ): void {
    const index = levels.findIndex((l) => l.price === newLevel.price);

    if (newLevel.amount === 0) {
      if (index !== -1) {
        levels.splice(index, 1);
      }
      return;
    }

    if (index !== -1) {
      levels[index].amount = newLevel.amount;
    } else {
      levels.push(newLevel);
      levels.sort((a, b) =>
        order === "desc" ? b.price - a.price : a.price - b.price
      );
    }

    if (levels.length > this.config.depth) {
      levels.length = this.config.depth;
    }
  }

  private async resync(): Promise<void> {
    this.syncState = SyncState.NOT_INITIALIZED;
    this.orderBook = null;
    this.updateCache = [];
    await this.sleep(1000);
    await this.initialize();
  }

  getOrderBook(): OrderBook | null {
    return this.orderBook;
  }

  getBestBid(): number | null {
    if (!this.orderBook || this.orderBook.bids.length === 0) return null;
    return this.orderBook.bids[0].price;
  }

  getBestAsk(): number | null {
    if (!this.orderBook || this.orderBook.asks.length === 0) return null;
    return this.orderBook.asks[0].price;
  }

  getSpread(): number | null {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === null || ask === null) return null;
    return ask - bid;
  }

  getMidPrice(): number | null {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === null || ask === null) return null;
    return (bid + ask) / 2;
  }

  getAsksVolume(levels?: number): number {
    if (!this.orderBook) return 0;
    const depth = levels !== undefined ? levels : this.config.depth;
    return this.orderBook.asks
      .slice(0, depth)
      .reduce((sum, ask) => sum + ask.price * ask.amount, 0);
  }

  getBidsVolume(levels?: number): number {
    if (!this.orderBook) return 0;
    const depth = levels !== undefined ? levels : this.config.depth;
    return this.orderBook.bids
      .slice(0, depth)
      .reduce((sum, bid) => sum + bid.price * bid.amount, 0);
  }

  getVolumeRatio(levels?: number): {
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

  isSynchronized(): boolean {
    return this.syncState === SyncState.SYNCHRONIZED;
  }

  // Убрана displayOrderBook() - вся визуализация на клиенте
  // Данные передаются через BroadcastManager в DTrader

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
