/**
 * Движок (ядро) торговой системы dtrader
 * Управляет WebSocket подключением и основным циклом работы
 */

import WebSocket from "ws";
import { GateIO } from "./GateIO";
import { OrderBookManager } from "./core/OrderBookManager";
import { LogBroadcaster } from "./core/LogBroadcaster";
import { Logger } from "./core/Logger";

// ============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация движка
 */
export interface DTraderConfig {
  gateio: GateIO; // Экземпляр класса для работы с Gate.io REST API
  wsUrl?: string; // URL для WebSocket подключения
  pingInterval?: number; // Интервал ping в миллисекундах (по умолчанию 15 секунд)
  orderBookSymbol?: string; // Символ для Order Book (опционально)
  orderBookDepth?: number; // Глубина Order Book (опционально)
  logBroadcaster?: LogBroadcaster; // LogBroadcaster для трансляции логов (опционально)
  logger?: Logger; // Logger для перехвата console (опционально)
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

  // Log Broadcasting
  private logBroadcaster: LogBroadcaster | null = null;
  private logger: Logger | null = null;

  /**
   * Конструктор движка
   * @param config - Конфигурация
   */
  constructor(config: DTraderConfig) {
    this.gateio = config.gateio;
    this.wsUrl = config.wsUrl || "wss://api.gateio.ws/ws/v4/";
    this.pingInterval = config.pingInterval || 15000; // 15 секунд по умолчанию

    // Инициализируем OrderBookManager если указан символ
    if (config.orderBookSymbol) {
      this.orderBookManager = new OrderBookManager({
        symbol: config.orderBookSymbol,
        depth: config.orderBookDepth || 10,
        gateio: this.gateio,
      });
    }

    // Инициализируем LogBroadcaster и Logger
    this.logBroadcaster = config.logBroadcaster || null;
    this.logger = config.logger || null;

    // Связываем Logger с LogBroadcaster
    if (this.logger && this.logBroadcaster) {
      this.logger.setBroadcaster(this.logBroadcaster);
    }
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ ЖИЗНЕННЫМ ЦИКЛОМ
  // ==========================================================================

  /**
   * Запускает движок
   */
  async start(): Promise<void> {
    if (this.state !== EngineState.STOPPED) {
      console.log("⚠️  Движок уже запущен или запускается");
      return;
    }

    this.state = EngineState.STARTING;
    console.log("\n🚀 Запуск движка dtrader...");

    try {
      // Подключаемся к WebSocket
      await this.connectWebSocket();

      // Запускаем ping-pong механизм
      this.startPingPong();

      // Подписываемся на обновления балансов
      this.subscribeToBalances();

      // Подписываемся на тики для торговой пары
      this.subscribeToTicker();

      // Если есть OrderBookManager, подписываемся на обновления Order Book
      if (this.orderBookManager) {
        this.subscribeToOrderBookUpdates();

        // Ждем немного чтобы начать получать обновления
        await this.sleep(500);

        // Инициализируем Order Book
        await this.orderBookManager.initialize();
      }

      this.state = EngineState.RUNNING;
      console.log("✅ Движок успешно запущен и работает\n");
    } catch (error: any) {
      this.state = EngineState.STOPPED;
      throw new Error(`Ошибка запуска движка: ${error.message}`);
    }
  }

  /**
   * Останавливает движок
   */
  async stop(): Promise<void> {
    if (this.state !== EngineState.RUNNING) {
      console.log("⚠️  Движок не запущен");
      return;
    }

    this.state = EngineState.STOPPING;
    console.log("\n🛑 Остановка движка...");

    // Останавливаем ping-pong
    this.stopPingPong();

    // Очищаем таймер контроля pong
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }

    // Закрываем WebSocket соединение
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Останавливаем LogBroadcaster если есть
    if (this.logBroadcaster) {
      this.logBroadcaster.stop();
    }

    // Останавливаем Logger если есть
    if (this.logger) {
      this.logger.stopIntercepting();
    }

    this.state = EngineState.STOPPED;
    console.log("✅ Движок остановлен\n");
  }

  /**
   * Возвращает текущее состояние движка
   */
  getState(): string {
    return this.state;
  }

  // ==========================================================================
  // WEBSOCKET
  // ==========================================================================

  /**
   * Устанавливает WebSocket подключение к Gate.io
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`📡 Подключение к WebSocket: ${this.wsUrl}`);

      try {
        this.ws = new WebSocket(this.wsUrl);

        // Обработчик открытия соединения
        this.ws.on("open", () => {
          this.connectionStartTime = Date.now();
          console.log("✅ WebSocket соединение установлено");
          resolve();
        });

        // Обработчик входящих сообщений
        this.ws.on("message", (data: WebSocket.Data) => {
          this.handleWebSocketMessage(data);
        });

        // Обработчик ошибок
        this.ws.on("error", (error: Error) => {
          console.error("❌ WebSocket ошибка:", error.message);
          reject(error);
        });

        // Обработчик закрытия соединения
        this.ws.on("close", (code: number, reason: string) => {
          console.log(
            `🔌 WebSocket соединение закрыто. Код: ${code}, Причина: ${
              reason || "не указана"
            }`
          );

          // Если соединение закрылось во время работы, пытаемся переподключиться
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

  /**
   * Переподключение к WebSocket
   */
  private async reconnectWebSocket(): Promise<void> {
    const uptime = this.connectionStartTime
      ? Math.floor((Date.now() - this.connectionStartTime) / 1000)
      : 0;
    console.log(
      `🔄 Переподключение к WebSocket... (предыдущее соединение работало ${uptime}с)`
    );

    // Очищаем старое соединение
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    try {
      await this.connectWebSocket();
      console.log("✅ Переподключение успешно");

      // После переподключения нужно заново подписаться
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

  /**
   * Обрабатывает входящие сообщения от WebSocket
   */
  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      const receivedTime = Date.now();
      const timeISO = new Date(receivedTime).toISOString();

      // Обрабатываем pong ответ
      if (message.channel === "spot.pong") {
        this.lastPongTime = receivedTime;

        // Вычисляем задержку
        const latency = receivedTime - this.lastPingSentTime;

        console.log(`🏓 PONG получен [${timeISO}] задержка: ${latency}ms`);

        // Сбрасываем таймер контроля pong
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }

        return;
      }

      // Обрабатываем обновления балансов
      if (message.channel === "spot.balances") {
        this.handleBalanceUpdate(message);
        return;
      }

      // Обрабатываем тиковые данные
      if (message.channel === "spot.tickers") {
        this.handleTickerUpdate(message);
        return;
      }

      // Обрабатываем обновления Order Book
      if (message.channel === "spot.order_book_update") {
        this.handleOrderBookUpdate(message);
        return;
      }

      // Здесь в будущем будет обработка других типов сообщений
    } catch (error: any) {
      console.error("❌ Ошибка парсинга WebSocket сообщения:", error.message);
    }
  }

  /**
   * Обрабатывает обновление балансов
   */
  private handleBalanceUpdate(message: any): void {
    // Проверяем статус подписки
    if (message.event === "subscribe") {
      if (message.error) {
        console.error("❌ Ошибка подписки на балансы:", message.error);
      } else {
        console.log("✅ Успешная подписка на обновления балансов");
      }
      return;
    }

    // Обрабатываем обновление данных
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
    }
  }

  /**
   * Обрабатывает обновление тикера
   */
  private handleTickerUpdate(message: any): void {
    // Проверяем статус подписки
    if (message.event === "subscribe") {
      if (message.error) {
        console.error("❌ Ошибка подписки на тикер:", message.error);
      } else {
        console.log("✅ Успешная подписка на тикер ETH_USDT");
      }
      return;
    }

    // Обрабатываем обновление тикера
    if (message.event === "update" && message.result) {
      const ticker = message.result;
      const price = parseFloat(ticker.last).toFixed(2);
      const timeISO = new Date().toISOString();

      console.log(
        `📊 Тикер ${ticker.currency_pair} [${timeISO}]: ${price} USDT`
      );
    }
  }

  /**
   * Обрабатывает обновление Order Book
   */
  private handleOrderBookUpdate(message: any): void {
    // Проверяем статус подписки
    if (message.event === "subscribe") {
      if (message.error) {
        console.error("❌ Ошибка подписки на Order Book:", message.error);
      } else {
        console.log(`✅ Успешная подписка на обновления Order Book`);
      }
      return;
    }

    // Обрабатываем обновление Order Book
    if (message.event === "update" && message.result && this.orderBookManager) {
      this.orderBookManager.processUpdate(message.result);

      // Выводим Order Book каждое 50-е обновление
      const updateId = message.result.u;
      if (updateId % 50 === 0) {
        this.orderBookManager.displayOrderBook();
      }
    }
  }

  // ==========================================================================
  // PING-PONG МЕХАНИЗМ
  // ==========================================================================

  /**
   * Запускает периодическую отправку ping сообщений
   */
  private startPingPong(): void {
    console.log(
      `🏓 Запуск ping-pong с интервалом ${this.pingInterval / 1000} секунд`
    );

    // Отправляем первый ping сразу
    this.sendPing();

    // Устанавливаем таймер для периодической отправки
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.pingInterval);
  }

  /**
   * Останавливает ping-pong механизм
   */
  private stopPingPong(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      console.log("🏓 Ping-pong остановлен");
    }
  }

  /**
   * Отправляет ping сообщение на сервер
   */
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

      // Устанавливаем таймер контроля - если через 30 секунд не получим pong, переподключаемся
      this.pongTimeout = setTimeout(() => {
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        console.log(
          `⚠️  PONG не получен в течение 30 секунд (последний: ${Math.floor(
            timeSinceLastPong / 1000
          )}с назад)`
        );
        console.log("🔄 Принудительное переподключение...");

        if (this.state === EngineState.RUNNING) {
          // Закрываем текущее соединение
          if (this.ws) {
            this.ws.close();
          }
          // Переподключение произойдет автоматически через обработчик 'close'
        }
      }, 30000); // 30 секунд на ожидание pong
    } catch (error: any) {
      console.error("❌ Ошибка отправки ping:", error.message);
    }
  }

  // ==========================================================================
  // ПОДПИСКИ НА КАНАЛЫ WEBSOCKET
  // ==========================================================================

  /**
   * Подписывается на обновления балансов через WebSocket
   */
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

    // Генерируем подпись для аутентификации
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

  /**
   * Подписывается на тикер торговой пары
   */
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

  /**
   * Подписывается на обновления Order Book
   */
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
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================================================

  /**
   * Вспомогательная функция для ожидания
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
