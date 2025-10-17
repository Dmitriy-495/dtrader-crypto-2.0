/**
 * Logger - перехватчик console для трансляции логов клиентам
 */

import { LogBroadcaster } from "./LogBroadcaster";
import { LogLevel } from "../types";

// ============================================================================
// КЛАСС LOGGER
// ============================================================================

export class Logger {
  private broadcaster: LogBroadcaster | null = null;
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
  };
  private isIntercepting: boolean = false;

  /**
   * Конструктор
   */
  constructor() {
    // Сохраняем оригинальные методы console
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
    };
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ
  // ==========================================================================

  /**
   * Устанавливает LogBroadcaster для трансляции
   */
  setBroadcaster(broadcaster: LogBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Включает перехват console
   */
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

  /**
   * Останавливает перехват console
   */
  stopIntercepting(): void {
    if (!this.isIntercepting) {
      return;
    }

    // Восстанавливаем оригинальные методы
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;

    this.isIntercepting = false;
    this.originalConsole.log("✅ Logger: перехват console деактивирован");
  }

  // ==========================================================================
  // ОБРАБОТКА ЛОГОВ
  // ==========================================================================

  /**
   * Обрабатывает лог-сообщение
   */
  private handleLog(level: LogLevel, args: any[]): void {
    // Форматируем сообщение
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

    // Транслируем клиентам если есть broadcaster
    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(level, message);
    }
  }

  // ==========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ЛОГИРОВАНИЯ
  // ==========================================================================

  /**
   * Прямой вызов log (без перехвата)
   */
  directLog(message: string): void {
    this.originalConsole.log(message);
  }

  /**
   * Прямой вызов error (без перехвата)
   */
  directError(message: string): void {
    this.originalConsole.error(message);
  }

  /**
   * Прямой вызов warn (без перехвата)
   */
  directWarn(message: string): void {
    this.originalConsole.warn(message);
  }

  /**
   * Логирование с успехом
   */
  success(message: string): void {
    const formattedMessage = `✅ ${message}`;
    this.originalConsole.log(formattedMessage);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(LogLevel.SUCCESS, formattedMessage);
    }
  }

  /**
   * Логирование с информацией
   */
  info(message: string): void {
    const formattedMessage = `ℹ️  ${message}`;
    this.originalConsole.info(formattedMessage);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(LogLevel.INFO, formattedMessage);
    }
  }

  /**
   * Логирование с предупреждением
   */
  warn(message: string): void {
    const formattedMessage = `⚠️  ${message}`;
    this.originalConsole.warn(formattedMessage);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(LogLevel.WARN, formattedMessage);
    }
  }

  /**
   * Логирование с ошибкой
   */
  error(message: string): void {
    const formattedMessage = `❌ ${message}`;
    this.originalConsole.error(formattedMessage);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(LogLevel.ERROR, formattedMessage);
    }
  }

  /**
   * Логирование с отладкой
   */
  debug(message: string): void {
    const formattedMessage = `🔍 ${message}`;
    this.originalConsole.log(formattedMessage);

    if (this.broadcaster && this.broadcaster.isActive()) {
      this.broadcaster.broadcastLog(LogLevel.DEBUG, formattedMessage);
    }
  }
}
