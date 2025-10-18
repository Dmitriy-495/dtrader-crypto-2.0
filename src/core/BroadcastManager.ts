/**
 * BroadcastManager - центральный хаб для трансляции данных клиентам
 * Управляет WebSocket сервером, клиентами и подписками
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  ClientMessage,
  LogMessage,
  LogLevel,
  MessageType,
  SubscriptionChannel,
} from "../types";

// ============================================================================
// ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация BroadcastManager
 */
export interface BroadcastManagerConfig {
  port: number; // Порт для WebSocket сервера
  enabled: boolean; // Включен ли broadcaster
}

/**
 * Информация о подключенном клиенте
 */
interface ClientInfo {
  id: string;
  ws: WebSocket;
  connectedAt: number;
  lastPing: number;
  subscriptions: Set<SubscriptionChannel>; // Подписки клиента
}

// ============================================================================
// КЛАСС BROADCASTMANAGER
// ============================================================================

export class BroadcastManager {
  private config: BroadcastManagerConfig;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private messageBuffer: ClientMessage[] = [];
  private maxBufferSize: number = 100;
  private isRunning: boolean = false;

  /**
   * Конструктор
   */
  constructor(config: BroadcastManagerConfig) {
    this.config = config;
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ ЖИЗНЕННЫМ ЦИКЛОМ
  // ==========================================================================

  /**
   * Запускает WebSocket сервер
   */
  start(): void {
    if (!this.config.enabled) {
      console.log("📡 BroadcastManager отключен в конфигурации");
      return;
    }

    if (this.isRunning) {
      console.log("⚠️  BroadcastManager уже запущен");
      return;
    }

    try {
      console.log(
        `\n📡 Запуск BroadcastManager на порту ${this.config.port}...`
      );

      this.wss = new WebSocketServer({
        port: this.config.port,
        perMessageDeflate: false,
      });

      this.wss.on("connection", (ws: WebSocket) => {
        this.handleNewConnection(ws);
      });

      this.wss.on("error", (error: Error) => {
        console.error("❌ Ошибка WebSocket сервера:", error.message);
      });

      this.isRunning = true;
      console.log(
        `✅ BroadcastManager запущен на ws://0.0.0.0:${this.config.port}`
      );
      console.log(`📊 Ожидание подключения клиентов...\n`);
    } catch (error: any) {
      console.error("❌ Ошибка запуска BroadcastManager:", error.message);
      throw error;
    }
  }

  /**
   * Останавливает WebSocket сервер
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("\n🛑 Остановка BroadcastManager...");

    // Отключаем всех клиентов
    this.clients.forEach((client, clientId) => {
      this.sendToClient(clientId, {
        type: MessageType.DISCONNECT,
        clientId,
        reason: "server_shutdown",
        timestamp: Date.now(),
      });
      client.ws.close();
    });

    this.clients.clear();

    // Закрываем сервер
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.isRunning = false;
    console.log("✅ BroadcastManager остановлен\n");
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ ПОДКЛЮЧЕНИЯМИ
  // ==========================================================================

  /**
   * Обрабатывает новое подключение клиента
   */
  private handleNewConnection(ws: WebSocket): void {
    const clientId = this.generateClientId();

    const clientInfo: ClientInfo = {
      id: clientId,
      ws: ws,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      subscriptions: new Set(), // Изначально без подписок
    };

    this.clients.set(clientId, clientInfo);

    console.log(
      `🔌 Клиент подключен: ${clientId} (всего клиентов: ${this.clients.size})`
    );

    // Отправляем клиенту его ID
    this.sendToClient(clientId, {
      type: MessageType.CONNECT,
      clientId,
      clientInfo: {
        hostname: "server",
        platform: process.platform,
      },
      timestamp: Date.now(),
    });

    // Обработчики событий клиента
    ws.on("message", (data: Buffer) => {
      this.handleClientMessage(clientId, data);
    });

    ws.on("close", () => {
      this.handleClientDisconnect(clientId);
    });

    ws.on("error", (error: Error) => {
      console.error(`❌ Ошибка клиента ${clientId}:`, error.message);
    });
  }

  /**
   * Обрабатывает сообщение от клиента
   */
  private handleClientMessage(clientId: string, data: Buffer): void {
    try {
      const rawMessage = data.toString().trim();

      // ✅ Игнорируем пустые сообщения
      if (!rawMessage || rawMessage.length === 0) {
        return;
      }

      const message = JSON.parse(rawMessage);

      // Обрабатываем PING от клиента
      if (message.type === MessageType.PING) {
        this.sendToClient(clientId, {
          type: MessageType.PONG,
          timestamp: Date.now(),
        });

        const client = this.clients.get(clientId);
        if (client) {
          client.lastPing = Date.now();
        }
        return;
      }

      // Обрабатываем SUBSCRIBE
      if (message.type === MessageType.SUBSCRIBE) {
        this.handleSubscribe(clientId, message.channels);
        return;
      }

      // Обрабатываем UNSUBSCRIBE
      if (message.type === MessageType.UNSUBSCRIBE) {
        this.handleUnsubscribe(clientId, message.channels);
        return;
      }

      // ✅ Если сообщение не распознано
      console.warn(
        `⚠️  Неизвестный тип сообщения от ${clientId}:`,
        message.type || "undefined"
      );
      this.sendToClient(clientId, {
        type: MessageType.ERROR,
        error: "Unknown message type",
        details: `Type '${message.type}' is not supported`,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      console.error(
        `❌ Ошибка парсинга сообщения от ${clientId}:`,
        error.message
      );
      this.sendToClient(clientId, {
        type: MessageType.ERROR,
        error: "Invalid message format",
        details: error.message,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Обрабатывает отключение клиента
   */
  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      const channels = Array.from(client.subscriptions);
      console.log(
        `🔌 Клиент отключен: ${clientId} (подписки: ${
          channels.join(", ") || "нет"
        }) (осталось: ${this.clients.size - 1})`
      );
    }
    this.clients.delete(clientId);
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ ПОДПИСКАМИ
  // ==========================================================================

  /**
   * Обрабатывает подписку клиента на каналы
   */
  private handleSubscribe(
    clientId: string,
    channels: SubscriptionChannel[]
  ): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Добавляем подписки
    channels.forEach((channel) => {
      client.subscriptions.add(channel);
    });

    console.log(`📥 Клиент ${clientId} подписался на: ${channels.join(", ")}`);

    // Отправляем подтверждение
    this.sendToClient(clientId, {
      type: MessageType.SUBSCRIBED,
      channels: channels,
      message: `Successfully subscribed to ${channels.length} channel(s)`,
      timestamp: Date.now(),
    });
  }

  /**
   * Обрабатывает отписку клиента от каналов
   */
  private handleUnsubscribe(
    clientId: string,
    channels: SubscriptionChannel[]
  ): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Удаляем подписки
    channels.forEach((channel) => {
      client.subscriptions.delete(channel);
    });

    console.log(`📤 Клиент ${clientId} отписался от: ${channels.join(", ")}`);

    // Отправляем подтверждение
    this.sendToClient(clientId, {
      type: MessageType.UNSUBSCRIBED,
      channels: channels,
      message: `Successfully unsubscribed from ${channels.length} channel(s)`,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // ОТПРАВКА СООБЩЕНИЙ
  // ==========================================================================

  /**
   * Отправляет сообщение всем клиентам
   */
  broadcast(message: ClientMessage): void {
    if (!this.config.enabled || !this.isRunning) {
      return;
    }

    // ✅ Не добавляем в буфер и не отправляем если нет клиентов
    if (this.clients.size === 0) {
      return;
    }

    // Определяем канал сообщения
    let channel: SubscriptionChannel | null = null;
    switch (message.type) {
      case MessageType.LOG:
        channel = SubscriptionChannel.LOGS;
        break;
      case MessageType.TICK:
        channel = SubscriptionChannel.TICKS;
        break;
      case MessageType.ORDERBOOK:
        channel = SubscriptionChannel.ORDERBOOK;
        break;
      case MessageType.BALANCE:
        channel = SubscriptionChannel.BALANCE;
        break;
    }

    // Добавляем в буфер только логи
    if (message.type === MessageType.LOG) {
      this.addToBuffer(message);
    }

    // Отправляем только подписанным клиентам
    this.clients.forEach((client, clientId) => {
      // Если канал не определен (системные сообщения) или клиент подписан - отправляем
      if (channel === null || client.subscriptions.has(channel)) {
        this.sendToClient(clientId, message);
      }
    });
  }

  /**
   * Отправляет сообщение конкретному клиенту
   */
  private sendToClient(clientId: string, message: ClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error: any) {
      console.error(
        `❌ Ошибка отправки сообщения клиенту ${clientId}:`,
        error.message
      );
    }
  }

  /**
   * Отправляет лог-сообщение
   */
  broadcastLog(level: LogLevel, message: string, source?: string): void {
    this.broadcast({
      type: MessageType.LOG,
      level,
      message,
      source,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // БУФЕРИЗАЦИЯ
  // ==========================================================================

  /**
   * Добавляет сообщение в буфер
   */
  private addToBuffer(message: ClientMessage): void {
    this.messageBuffer.push(message);

    // Ограничиваем размер буфера
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer.shift();
    }
  }

  // ==========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================================================

  /**
   * Генерирует уникальный ID клиента
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Получает количество подключенных клиентов
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Проверяет, запущен ли broadcaster
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
