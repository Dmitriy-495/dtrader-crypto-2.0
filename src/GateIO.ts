/**
 * Класс для работы с Gate.io API
 * Инкапсулирует всю логику взаимодействия с биржей
 */

import * as crypto from "crypto";
import axios, { AxiosRequestConfig } from "axios";

// ============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация для подключения к Gate.io
 */
export interface GateIOConfig {
  apiKey: string;
  apiSecret: string;
  apiUrl?: string;
}

/**
 * Структура баланса аккаунта
 */
export interface SpotBalance {
  currency: string; // Валюта (BTC, USDT и т.д.)
  available: string; // Доступный баланс
  locked: string; // Заблокированный баланс (в заказах)
}

/**
 * Параметры для запроса к API
 */
interface ApiRequestParams {
  method: string;
  path: string;
  queryParams?: Record<string, any>;
  body?: any;
}

// ============================================================================
// КЛАСС GATEIO
// ============================================================================

export class GateIO {
  private apiKey: string;
  private apiSecret: string;
  private apiUrl: string;

  /**
   * Конструктор класса GateIO
   * @param config - Конфигурация подключения
   */
  constructor(config: GateIOConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.apiUrl = config.apiUrl || "https://api.gateio.ws";

    // Проверяем наличие обязательных параметров
    if (!this.apiKey || !this.apiSecret) {
      throw new Error("API Key и API Secret обязательны для инициализации");
    }
  }

  // ==========================================================================
  // ПРИВАТНЫЕ МЕТОДЫ (вспомогательные)
  // ==========================================================================

  /**
   * Генерирует подпись для аутентификации запроса
   * Gate.io использует HMAC SHA512
   *
   * @param method - HTTP метод
   * @param path - Путь к эндпоинту
   * @param queryString - Query параметры
   * @param bodyPayload - Тело запроса
   * @param timestamp - Временная метка
   * @returns Подпись запроса
   */
  private generateSignature(
    method: string,
    path: string,
    queryString: string,
    bodyPayload: string,
    timestamp: string
  ): string {
    // Хешируем payload с помощью SHA512
    const hashedPayload = crypto
      .createHash("sha512")
      .update(bodyPayload)
      .digest("hex");

    // Формируем строку для подписи
    // Формат: {method}\n{path}\n{query_string}\n{hashed_payload}\n{timestamp}
    const signString = `${method}\n${path}\n${queryString}\n${hashedPayload}\n${timestamp}`;

    // Создаем HMAC SHA512 подпись
    const signature = crypto
      .createHmac("sha512", this.apiSecret)
      .update(signString)
      .digest("hex");

    return signature;
  }

  /**
   * Выполняет аутентифицированный запрос к Gate.io API
   *
   * @param params - Параметры запроса
   * @returns Ответ от API
   */
  private async request(params: ApiRequestParams): Promise<any> {
    const { method, path, queryParams = {}, body = null } = params;

    try {
      // Формируем query string
      const queryString =
        Object.keys(queryParams).length > 0
          ? Object.entries(queryParams)
              .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
              .join("&")
          : "";

      // Формируем body payload
      const bodyPayload = body ? JSON.stringify(body) : "";

      // Получаем timestamp в секундах
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // Генерируем подпись
      const signature = this.generateSignature(
        method,
        path,
        queryString,
        bodyPayload,
        timestamp
      );

      // Формируем полный URL
      const fullUrl = `${this.apiUrl}${path}${
        queryString ? "?" + queryString : ""
      }`;

      // Заголовки для аутентификации
      const headers: Record<string, string> = {
        KEY: this.apiKey,
        SIGN: signature,
        Timestamp: timestamp,
        "Content-Type": "application/json",
      };

      // Конфигурация запроса
      const config: AxiosRequestConfig = {
        method: method,
        url: fullUrl,
        headers: headers,
        ...(body && { data: bodyPayload }),
      };

      // Выполняем запрос
      const response = await axios(config);
      return response.data;
    } catch (error: any) {
      // Обрабатываем ошибки
      let errorMessage = "Неизвестная ошибка при запросе к Gate.io API";

      if (error.response) {
        // Сервер ответил с ошибкой
        errorMessage = `Gate.io API Error: ${
          error.response.status
        } - ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        // Запрос отправлен, но ответа нет
        errorMessage = "Нет ответа от Gate.io API сервера";
      } else {
        // Ошибка при настройке запроса
        errorMessage = `Ошибка настройки запроса: ${error.message}`;
      }

      throw new Error(errorMessage);
    }
  }

  // ==========================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ (API методы)
  // ==========================================================================

  /**
   * Получает баланс спотового кошелька через REST API
   *
   * @param currency - Конкретная валюта (опционально)
   * @returns Массив балансов
   */
  async getSpotBalance(currency?: string): Promise<SpotBalance[]> {
    const path = "/api/v4/spot/accounts";
    const queryParams = currency ? { currency } : {};

    return await this.request({
      method: "GET",
      path,
      queryParams,
    });
  }

  /**
   * Получает Order Book (книгу ордеров) через REST API
   * Используется для получения базового снапшота
   *
   * @param currencyPair - Валютная пара (например, "ETH_USDT")
   * @param limit - Глубина order book (по умолчанию 10)
   * @returns Order Book с ID для синхронизации
   */
  async getOrderBook(currencyPair: string, limit: number = 10): Promise<any> {
    const path = "/api/v4/spot/order_book";
    const queryParams = {
      currency_pair: currencyPair,
      limit: limit.toString(),
      with_id: "true", // ВАЖНО: получаем ID для синхронизации с WebSocket
    };

    return await this.request({
      method: "GET",
      path,
      queryParams,
    });
  }

  /**
   * Генерирует подпись для WebSocket аутентификации
   *
   * @param channel - Канал WebSocket (например, "spot.balances")
   * @param event - Событие ("subscribe" или "unsubscribe")
   * @param timestamp - Unix timestamp в секундах
   * @returns Объект с подписью для auth
   */
  generateWebSocketAuth(
    channel: string,
    event: string,
    timestamp: number
  ): any {
    // Формируем строку для подписи: channel + event + timestamp
    const message = `channel=${channel}&event=${event}&time=${timestamp}`;

    // Создаем HMAC SHA512 подпись
    const signature = crypto
      .createHmac("sha512", this.apiSecret)
      .update(message)
      .digest("hex");

    return {
      method: "api_key",
      KEY: this.apiKey,
      SIGN: signature,
    };
  }

  /**
   * Создает сообщение для подписки на тикеры (без аутентификации)
   *
   * @param symbols - Массив торговых пар (например, ["ETH_USDT", "BTC_USDT"])
   * @returns Объект сообщения для отправки через WebSocket
   */
  createTickerSubscription(symbols: string[]): any {
    const currentTime = Math.floor(Date.now() / 1000);

    return {
      time: currentTime,
      channel: "spot.tickers",
      event: "subscribe",
      payload: symbols,
    };
  }

  /**
   * Создает сообщение для подписки на лучшие bid/ask (без аутентификации)
   *
   * @param symbols - Массив торговых пар
   * @returns Объект сообщения для отправки через WebSocket
   */
  createBookTickerSubscription(symbols: string[]): any {
    const currentTime = Math.floor(Date.now() / 1000);

    return {
      time: currentTime,
      channel: "spot.book_ticker",
      event: "subscribe",
      payload: symbols,
    };
  }

  /**
   * Создает сообщение для подписки на инкрементальные обновления Order Book
   *
   * @param symbol - Торговая пара (например, "ETH_USDT")
   * @param interval - Интервал обновлений (по умолчанию "100ms")
   * @returns Объект сообщения для отправки через WebSocket
   */
  createOrderBookUpdateSubscription(
    symbol: string,
    interval: string = "100ms"
  ): any {
    const currentTime = Math.floor(Date.now() / 1000);

    return {
      time: currentTime,
      channel: "spot.order_book_update",
      event: "subscribe",
      payload: [symbol, interval],
    };
  }
}
