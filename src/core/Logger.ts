/**
 * Logger - перехватчик console для трансляции логов клиентам
 */

import { BroadcastManager } from "./BroadcastManager";
import { LogLevel } from "../types";

export class Logger {
  private broadcaster: BroadcastManager | null = null;
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
  };
  private isIntercepting: boolean = false;

  constructor() {
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
    };
  }

  setBroadcaster(broadcaster: BroadcastManager): void {
    this.broadcaster = broadcaster;
  }

  startIntercepting(): void {
    if (this.isIntercepting) {
      return;
    }

    console.log = (...args: any[]) => {
      this.handleLog(LogLevel.INFO, args);
    };

    console.error = (...args: any[]) => {
      this.handleLog(LogLevel.ERROR, args);
    };

    console.warn = (...args: any[]) => {
      this.handleLog(LogLevel.WARN, args);
    };

    console.info = (...args: any[]) => {
      this.handleLog(LogLevel.INFO, args);
    };

    this.isIntercepting = true;
    this.originalConsole.log("✅ Logger: перехват console активирован");
  }

  stopIntercepting(): void {
    if (!this.isIntercepting) {
      return;
    }

    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;

    this.isIntercepting = false;
    this.originalConsole.log("✅ Logger: перехват console деактивирован");
  }

  private handleLog(level: LogLevel, args: any[]): void {
    const message = args
      .map((arg) => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    // Выводим в оригинальный console
    switch (level) {
      case LogLevel.ERROR:
        this.originalConsole.error(message);
        break;
      case LogLevel.WARN:
        this.originalConsole.warn(message);
        break;
      default:
        this.originalConsole.log(message);
    }

    // Определяем категорию по содержимому сообщения
    const category = this.detectCategory(message);

    // ✅ ВСЕГДА транслируем клиентам если есть broadcaster
    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(level, message, "server", category);
    }
  }

  /**
   * Определяет категорию лога по содержимому
   */
  private detectCategory(message: string): "system" | "internal" {
    // Системные сообщения (запуск, остановка, подключения, связь с биржей)
    if (
      message.includes("Запуск") ||
      message.includes("Остановка") ||
      message.includes("запущен") ||
      message.includes("остановлен") ||
      message.includes("Клиент подключен") ||
      message.includes("Клиент отключен") ||
      message.includes("BroadcastManager") ||
      // ✅ Всё о бирже - в system
      message.includes("PING") ||
      message.includes("PONG") ||
      message.includes("WebSocket") ||
      message.includes("подписк") ||
      message.includes("Переподключение") ||
      message.includes("Gate.io") ||
      message.includes("Order Book") ||
      message.includes("Снапшот") ||
      message.includes("Инициализация") ||
      message.includes("синхронизирован")
    ) {
      return "system";
    }

    // Остальное - внутренние логи
    return "internal";
  }

  directLog(message: string): void {
    this.originalConsole.log(message);
  }

  directError(message: string): void {
    this.originalConsole.error(message);
  }

  directWarn(message: string): void {
    this.originalConsole.warn(message);
  }

  success(message: string): void {
    const formattedMessage = `✅ ${message}`;
    this.originalConsole.log(formattedMessage);

    const category = this.detectCategory(message);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(
        LogLevel.SUCCESS,
        formattedMessage,
        "server",
        category
      );
    }
  }

  info(message: string): void {
    const formattedMessage = `ℹ️  ${message}`;
    this.originalConsole.info(formattedMessage);

    const category = this.detectCategory(message);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(
        LogLevel.INFO,
        formattedMessage,
        "server",
        category
      );
    }
  }

  warn(message: string): void {
    const formattedMessage = `⚠️  ${message}`;
    this.originalConsole.warn(formattedMessage);

    const category = this.detectCategory(message);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(
        LogLevel.WARN,
        formattedMessage,
        "server",
        category
      );
    }
  }

  error(message: string): void {
    const formattedMessage = `❌ ${message}`;
    this.originalConsole.error(formattedMessage);

    const category = this.detectCategory(message);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(
        LogLevel.ERROR,
        formattedMessage,
        "server",
        category
      );
    }
  }

  debug(message: string): void {
    const formattedMessage = `🔍 ${message}`;
    this.originalConsole.log(formattedMessage);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(
        LogLevel.DEBUG,
        formattedMessage,
        "server",
        "internal"
      );
    }
  }
}
