/**
 * LogBroadcaster - WebSocket сервер для трансляции логов клиентам
 */

import { WebSocketServer, WebSocket } from "ws";
import { ClientMessage, LogMessage, LogLevel, MessageType } from "../types";

// ============================================================================
// ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация LogBroadcaster
 */
export interface LogBroadcasterConfig {
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
}

// ============================================================================
// КЛАСС LOGBROADCASTER
// ============================================================================

export class LogBroadcaster {
  private config: LogBroadcasterConfig;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private messageBuffer: ClientMessage[] = [];
  private maxBufferSize: number = 100;
  private isRunning: boolean = false;

  /**
   * Конструктор
   */
  constructor(config: LogBroadcasterConfig) {
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
      console.log("📡 LogBroadcaster отключен в конфигурации");
      return;
    }

    if (this.isRunning) {
      console.log("⚠️  LogBroadcaster уже запущен");
      return;
    }

    try {
      console.log(`\n📡 Запуск LogBroadcaster на порту ${this.config.port}...`);

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
        `✅ LogBroadcaster запущен на ws://0.0.0.0:${this.config.port}`
      );
      console.log(`📊 Ожидание подключения клиентов...\n`);
    } catch (error: any) {
      console.error("❌ Ошибка запуска LogBroadcaster:", error.message);
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

    console.log("\n🛑 Остановка LogBroadcaster...");

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
    console.log("✅ LogBroadcaster остановлен\n");
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
    };

    this.clients.set(clientId, clientInfo);

    console.log(
      `🔌 Новый клиент подключен: ${clientId} (всего клиентов: ${this.clients.size})`
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

    // Отправляем буферизованные сообщения
    this.messageBuffer.forEach((msg) => {
      this.sendToClient(clientId, msg);
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
      const message = JSON.parse(data.toString());

      // Обрабатываем PONG от клиента
      if (message.type === MessageType.PING) {
        this.sendToClient(clientId, {
          type: MessageType.PONG,
          timestamp: Date.now(),
        });

        const client = this.clients.get(clientId);
        if (client) {
          client.lastPing = Date.now();
        }
      }
    } catch (error: any) {
      console.error(
        `❌ Ошибка парсинга сообщения от ${clientId}:`,
        error.message
      );
    }
  }

  /**
   * Обрабатывает отключение клиента
   */
  private handleClientDisconnect(clientId: string): void {
    this.clients.delete(clientId);
    console.log(
      `🔌 Клиент отключен: ${clientId} (осталось клиентов: ${this.clients.size})`
    );
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

    // Добавляем в буфер
    this.addToBuffer(message);

    // Отправляем всем подключенным клиентам
    this.clients.forEach((client, clientId) => {
      this.sendToClient(clientId, message);
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
