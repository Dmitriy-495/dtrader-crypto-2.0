/**
 * Движок (ядро) торговой системы dtrader
 * Управляет WebSocket подключением и основным циклом работы
 */

import WebSocket from "ws";
import { GateIO } from "./GateIO";
import { OrderBookManager } from "./core/OrderBookManager";
import { BroadcastManager } from "./core/BroadcastManager";
import { Logger } from "./core/Logger";
import { TickSpeedIndicator } from "./indicators/TickSpeedIndicator";
import {
  OrderBookPressureIndicator,
  OrderBookPressureResult,
} from "./indicators/OrderBookPressureIndicator";
import { VolumeConfirmationIndicator } from "./indicators/VolumeConfirmationIndicator";
import { TVPStrategy } from "./strategy/tvp/TVPStrategy";
import { MessageType, Candle, Tick, SignalType } from "./types";

// ============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация движка
 */
export interface DTraderConfig {
  gateio: GateIO;
  wsUrl?: string;
  pingInterval?: number;
  orderBookSymbol?: string;
  orderBookDepth?: number;
  broadcastManager?: BroadcastManager;
  logger?: Logger;
}

/**
 * Состояние движка
 */
enum EngineState {
  STOPPED = "STOPPED",
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  STOPPING = "STOPPING",
}

// ============================================================================
// КЛАСС DTRADER (ДВИЖОК)
// ============================================================================

export class DTrader {
  private gateio: GateIO;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private pingInterval: number;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private lastPingSentTime: number = 0;
  private connectionStartTime: number = 0;
  private state: EngineState = EngineState.STOPPED;

  // Order Book Manager
  private orderBookManager: OrderBookManager | null = null;

  // Broadcast Manager
  private broadcastManager: BroadcastManager | null = null;
  private logger: Logger | null = null;

  // ✅ ИНДИКАТОРЫ
  private tickSpeedIndicator: TickSpeedIndicator;
  private obPressureIndicator: OrderBookPressureIndicator;
  private volumeConfirmationIndicator: VolumeConfirmationIndicator;
  private previousOBPressure: OrderBookPressureResult | null = null;
  private tickCounter: number = 0;
  private obUpdateCounter: number = 0;

  // ✅ СТРАТЕГИЯ
  private strategy: TVPStrategy | null = null;
  private strategyEnabled: boolean = false;

  // ✅ ФОРМИРОВАНИЕ СВЕЧЕЙ
  private currentCandle: Candle | null = null;
  private candleHistory: Candle[] = [];
  private maxCandleHistory: number = 200;
  private candleInterval: number = 60000; // 1 минута в миллисекундах

  constructor(config: DTraderConfig) {
    this.gateio = config.gateio;
    this.wsUrl = config.wsUrl || "wss://api.gateio.ws/ws/v4/";
    this.pingInterval = config.pingInterval || 15000;

    this.broadcastManager = config.broadcastManager || null;
    this.logger = config.logger || null;

    if (this.logger && this.broadcastManager) {
      this.logger.setBroadcaster(this.broadcastManager);
    }

    if (config.orderBookSymbol) {
      this.orderBookManager = new OrderBookManager({
        symbol: config.orderBookSymbol,
        depth: config.orderBookDepth || 10,
        gateio: this.gateio,
        broadcastManager: this.broadcastManager || undefined,
      });
    }

    // ✅ Инициализируем индикаторы
    this.tickSpeedIndicator = new TickSpeedIndicator({
      windowMinutes: 1,
      alertThresholds: {
        low: 20,
        normal: 100,
        high: 300,
        extreme: 600,
      },
    });

    this.obPressureIndicator = new OrderBookPressureIndicator({
      depthLevels: 10,
      weightedMode: true,
    });

    this.volumeConfirmationIndicator = new VolumeConfirmationIndicator({
      period: 20,
      volumeThreshold: 1.5,
      priceChangeThreshold: 0.1,
    });

    console.log(
      "✅ Индикаторы инициализированы: TickSpeed, OrderBookPressure, VolumeConfirmation"
    );

    // ✅ Инициализируем стратегию TVP (опционально)
    try {
      this.strategy = new TVPStrategy();
      this.strategyEnabled = true;
      console.log("✅ Стратегия TVP инициализирована");
    } catch (error: any) {
      console.log("⚠️  Стратегия TVP не загружена:", error.message);
      this.strategyEnabled = false;
    }
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ ЖИЗНЕННЫМ ЦИКЛОМ
  // ==========================================================================

  async start(): Promise<void> {
    if (this.state !== EngineState.STOPPED) {
      console.log("⚠️  Движок уже запущен или запускается");
      return;
    }

    this.state = EngineState.STARTING;
    console.log("\n🚀 Запуск движка dtrader...");

    try {
      await this.connectWebSocket();
      this.startPingPong();
      this.subscribeToBalances();
      this.subscribeToTicker();

      if (this.orderBookManager) {
        this.subscribeToOrderBookUpdates();
        await this.sleep(500);
        await this.orderBookManager.initialize();
      }

      this.state = EngineState.RUNNING;
      console.log("✅ Движок успешно запущен и работает\n");

      // ✅ Запускаем стратегию
      if (this.strategy && this.strategyEnabled) {
        this.strategy.onStart();
      }
    } catch (error: any) {
      this.state = EngineState.STOPPED;
      throw new Error(`Ошибка запуска движка: ${error.message}`);
    }
  }

  async stop(): Promise<void> {
    if (this.state !== EngineState.RUNNING) {
      console.log("⚠️  Движок не запущен");
      return;
    }

    this.state = EngineState.STOPPING;
    console.log("\n🛑 Остановка движка...");

    this.stopPingPong();

    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.broadcastManager) {
      this.broadcastManager.stop();
    }

    if (this.logger) {
      this.logger.stopIntercepting();
    }

    // ✅ Останавливаем стратегию
    if (this.strategy && this.strategyEnabled) {
      this.strategy.onStop();
    }

    this.state = EngineState.STOPPED;
    console.log("✅ Движок остановлен\n");
  }

  getState(): string {
    return this.state;
  }

  // ==========================================================================
  // WEBSOCKET
  // ==========================================================================

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`📡 Подключение к WebSocket: ${this.wsUrl}`);

      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => {
          this.connectionStartTime = Date.now();
          console.log("✅ WebSocket соединение установлено");
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          this.handleWebSocketMessage(data);
        });

        this.ws.on("error", (error: Error) => {
          console.error("❌ WebSocket ошибка:", error.message);
          reject(error);
        });

        this.ws.on("close", (code: number, reason: string) => {
          console.log(
            `🔌 WebSocket соединение закрыто. Код: ${code}, Причина: ${
              reason || "не указана"
            }`
          );

          if (this.state === EngineState.RUNNING) {
            console.log("🔄 Попытка переподключения через 5 секунд...");
            setTimeout(() => {
              if (this.state === EngineState.RUNNING) {
                this.reconnectWebSocket();
              }
            }, 5000);
          }
        });
      } catch (error: any) {
        reject(error);
      }
    });
  }

  private async reconnectWebSocket(): Promise<void> {
    const uptime = this.connectionStartTime
      ? Math.floor((Date.now() - this.connectionStartTime) / 1000)
      : 0;
    console.log(
      `🔄 Переподключение к WebSocket... (предыдущее соединение работало ${uptime}с)`
    );

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    try {
      await this.connectWebSocket();
      console.log("✅ Переподключение успешно");

      this.subscribeToBalances();
      this.subscribeToTicker();
    } catch (error: any) {
      console.error("❌ Ошибка переподключения:", error.message);
      console.log("🔄 Повторная попытка через 5 секунд...");

      setTimeout(() => {
        if (this.state === EngineState.RUNNING) {
          this.reconnectWebSocket();
        }
      }, 5000);
    }
  }

  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      const receivedTime = Date.now();
      const timeISO = new Date(receivedTime).toISOString();

      if (message.channel === "spot.pong") {
        this.lastPongTime = receivedTime;
        const latency = receivedTime - this.lastPingSentTime;
        console.log(`🏓 PONG получен [${timeISO}] задержка: ${latency}ms`);

        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
        return;
      }

      if (message.channel === "spot.balances") {
        this.handleBalanceUpdate(message);
        return;
      }

      if (message.channel === "spot.tickers") {
        this.handleTickerUpdate(message);
        return;
      }

      if (message.channel === "spot.order_book_update") {
        this.handleOrderBookUpdate(message);
        return;
      }
    } catch (error: any) {
      console.error("❌ Ошибка парсинга WebSocket сообщения:", error.message);
    }
  }

  private handleBalanceUpdate(message: any): void {
    if (message.event === "subscribe") {
      if (message.error) {
        console.error("❌ Ошибка подписки на балансы:", message.error);
      } else {
        console.log("✅ Успешная подписка на обновления балансов");
      }
      return;
    }

    if (message.event === "update" && message.result) {
      console.log("\n💰 Обновление баланса:");
      message.result.forEach((balance: any) => {
        const currency = balance.currency;
        const available = parseFloat(balance.available).toFixed(8);
        const locked = parseFloat(balance.freeze).toFixed(8);
        const change = balance.change;

        console.log(
          `   ${currency}: доступно ${available}, заблокировано ${locked}, изменение: ${change}`
        );
      });
      console.log("");

      // ✅ Транслируем балансы клиентам
      if (this.broadcastManager && this.broadcastManager.isActive()) {
        const balances = message.result.map((balance: any) => ({
          currency: balance.currency,
          available: parseFloat(balance.available),
          locked: parseFloat(balance.freeze),
        }));

        this.broadcastManager.broadcast({
          type: MessageType.BALANCE,
          balances,
          timestamp: Date.now(),
        });
      }
    }
  }

  private handleTickerUpdate(message: any): void {
    if (message.event === "subscribe") {
      if (message.error) {
        console.error("❌ Ошибка подписки на тикер:", message.error);
      } else {
        console.log("✅ Успешная подписка на тикер ETH_USDT");
      }
      return;
    }

    if (message.event === "update" && message.result) {
      const ticker = message.result;
      const price = parseFloat(ticker.last);
      const volume = parseFloat(ticker.base_volume);
      const timestamp = Date.now();

      // Регистрируем тик в индикаторах
      this.tickSpeedIndicator.addTick(timestamp);
      this.volumeConfirmationIndicator.addTick(price, volume, timestamp);
      this.tickCounter++;

      // ✅ Формируем свечи и передаём тик в стратегию
      if (this.strategy && this.strategyEnabled) {
        const tick: Tick = {
          symbol: ticker.currency_pair,
          price: price,
          volume: volume,
          timestamp: timestamp,
          high24h: parseFloat(ticker.high_24h) || price,
          low24h: parseFloat(ticker.low_24h) || price,
          changePercent: parseFloat(ticker.change_percentage) || 0,
        };

        // Передаём тик в стратегию
        this.strategy.onTick(tick);

        // Формируем свечу
        this.updateCandle(tick);
      }

      // Каждые 20 тиков рассчитываем и транслируем индикаторы
      if (this.tickCounter % 20 === 0) {
        const tickSpeed = this.tickSpeedIndicator.calculate();
        const volumeConfirmation = this.volumeConfirmationIndicator.calculate();

        // Транслируем tick_speed
        if (this.broadcastManager && this.broadcastManager.isActive()) {
          this.broadcastManager.broadcast({
            type: MessageType.INDICATOR,
            name: "tick_speed",
            data: tickSpeed,
            timestamp: Date.now(),
          });

          // Транслируем volume_confirmation если есть данные
          if (volumeConfirmation) {
            this.broadcastManager.broadcast({
              type: MessageType.INDICATOR,
              name: "volume_confirmation",
              data: volumeConfirmation,
              timestamp: Date.now(),
            });
          }
        }
      }

      // Отправляем тик клиентам
      if (this.broadcastManager && this.broadcastManager.isActive()) {
        this.broadcastManager.broadcast({
          type: MessageType.TICK,
          symbol: ticker.currency_pair,
          price: price,
          volume: volume,
          timestamp: Date.now(),
        });
      }
    }
  }

  private handleOrderBookUpdate(message: any): void {
    if (message.event === "subscribe") {
      if (message.error) {
        console.error("❌ Ошибка подписки на Order Book:", message.error);
      } else {
        console.log(`✅ Успешная подписка на обновления Order Book`);
      }
      return;
    }

    if (message.event === "update" && message.result && this.orderBookManager) {
      this.orderBookManager.processUpdate(message.result);

      this.obUpdateCounter++;

      // ✅ Добавим диагностический лог
      if (this.obUpdateCounter === 1) {
        console.log("📊 Order Book: начали получать обновления");
      }

      // Каждое 50-е обновление рассчитываем давление и транслируем
      if (this.obUpdateCounter % 50 === 0) {
        console.log(
          `📊 Order Book: обновление #${this.obUpdateCounter}, отправка индикатора`
        );

        const orderBook = this.orderBookManager.getOrderBook();
        if (orderBook) {
          // Рассчитываем давление
          const pressure = this.obPressureIndicator.calculate(orderBook);

          // ✅ Транслируем ТОЛЬКО индикатор давления (содержит все данные)
          if (this.broadcastManager && this.broadcastManager.isActive()) {
            this.broadcastManager.broadcast({
              type: MessageType.INDICATOR,
              name: "orderbook_pressure",
              data: pressure,
              timestamp: Date.now(),
            });
            console.log("  ✅ Индикатор orderbook_pressure отправлен");
          } else {
            console.log("  ⚠️ BroadcastManager неактивен");
          }

          this.previousOBPressure = pressure;
        } else {
          console.log("  ⚠️ Order Book не готов");
        }
      }
    }
  }

  // ==========================================================================
  // PING-PONG МЕХАНИЗМ
  // ==========================================================================

  private startPingPong(): void {
    console.log(
      `🏓 Запуск ping-pong с интервалом ${this.pingInterval / 1000} секунд`
    );
    this.sendPing();
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.pingInterval);
  }

  private stopPingPong(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      console.log("🏓 Ping-pong остановлен");
    }
  }

  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log("⚠️  WebSocket не подключен, пропускаем ping");
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const pingMessage = {
      time: currentTime,
      channel: "spot.ping",
    };

    try {
      this.lastPingSentTime = Date.now();
      const timeISO = new Date(this.lastPingSentTime).toISOString();

      this.ws.send(JSON.stringify(pingMessage));
      console.log(`🏓 PING отправлен [${timeISO}]`);

      this.pongTimeout = setTimeout(() => {
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        console.log(
          `⚠️  PONG не получен в течение 30 секунд (последний: ${Math.floor(
            timeSinceLastPong / 1000
          )}с назад)`
        );
        console.log("🔄 Принудительное переподключение...");

        if (this.state === EngineState.RUNNING) {
          if (this.ws) {
            this.ws.close();
          }
        }
      }, 30000);
    } catch (error: any) {
      console.error("❌ Ошибка отправки ping:", error.message);
    }
  }

  // ==========================================================================
  // ПОДПИСКИ НА КАНАЛЫ WEBSOCKET
  // ==========================================================================

  private subscribeToBalances(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(
        "⚠️  WebSocket не подключен, невозможно подписаться на балансы"
      );
      return;
    }

    console.log("📡 Подписка на обновления балансов...");

    const currentTime = Math.floor(Date.now() / 1000);
    const channel = "spot.balances";
    const event = "subscribe";

    const auth = this.gateio.generateWebSocketAuth(channel, event, currentTime);

    const subscribeMessage = {
      time: currentTime,
      channel: channel,
      event: event,
      auth: auth,
    };

    try {
      this.ws.send(JSON.stringify(subscribeMessage));
    } catch (error: any) {
      console.error("❌ Ошибка подписки на балансы:", error.message);
    }
  }

  private subscribeToTicker(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(
        "⚠️  WebSocket не подключен, невозможно подписаться на тикер"
      );
      return;
    }

    console.log("📡 Подписка на тикер ETH_USDT...");

    const subscribeMessage = this.gateio.createTickerSubscription(["ETH_USDT"]);

    try {
      this.ws.send(JSON.stringify(subscribeMessage));
    } catch (error: any) {
      console.error("❌ Ошибка подписки на тикер:", error.message);
    }
  }

  private subscribeToOrderBookUpdates(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(
        "⚠️  WebSocket не подключен, невозможно подписаться на Order Book"
      );
      return;
    }

    if (!this.orderBookManager) {
      console.log("⚠️  OrderBookManager не инициализирован");
      return;
    }

    const symbol = this.orderBookManager.getOrderBook()?.symbol || "ETH_USDT";
    console.log(`📡 Подписка на обновления Order Book для ${symbol}...`);

    const subscribeMessage = this.gateio.createOrderBookUpdateSubscription(
      symbol,
      "100ms"
    );

    try {
      this.ws.send(JSON.stringify(subscribeMessage));
    } catch (error: any) {
      console.error("❌ Ошибка подписки на Order Book:", error.message);
    }
  }

  // ==========================================================================
  // ФОРМИРОВАНИЕ СВЕЧЕЙ
  // ==========================================================================

  /**
   * Обновляет текущую свечу или создаёт новую
   */
  private updateCandle(tick: Tick): void {
    const candleStartTime =
      Math.floor(tick.timestamp / this.candleInterval) * this.candleInterval;

    // Если свеча ещё не создана или время новой свечи
    if (
      !this.currentCandle ||
      this.currentCandle.timestamp !== candleStartTime
    ) {
      // Закрываем предыдущую свечу если есть
      if (this.currentCandle) {
        this.closeCandle(this.currentCandle);
      }

      // Создаём новую свечу
      this.currentCandle = {
        symbol: tick.symbol,
        timestamp: candleStartTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        interval: "1m",
      };
    } else {
      // Обновляем текущую свечу
      this.currentCandle.high = Math.max(this.currentCandle.high, tick.price);
      this.currentCandle.low = Math.min(this.currentCandle.low, tick.price);
      this.currentCandle.close = tick.price;
      this.currentCandle.volume = tick.volume;
    }
  }

  /**
   * Закрывает свечу и передаёт в стратегию
   */
  private closeCandle(candle: Candle): void {
    // Добавляем в историю
    this.candleHistory.push(candle);

    // Ограничиваем размер истории
    if (this.candleHistory.length > this.maxCandleHistory) {
      this.candleHistory.shift();
    }

    // Передаём в стратегию
    if (this.strategy && this.strategyEnabled) {
      const signal = this.strategy.onCandle(candle, this.candleHistory);

      // Обрабатываем сигнал если есть
      if (signal && signal.type !== SignalType.HOLD) {
        console.log(`\n🎯 ТОРГОВЫЙ СИГНАЛ от TVP: ${signal.type}`);
        console.log(`   ${signal.reason}`);
        // TODO: Здесь будет логика исполнения ордеров
      }
    }
  }

  // ==========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
