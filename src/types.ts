/**
 * Общие типы данных для торговой системы
 */

// ============================================================================
// РЫНОЧНЫЕ ДАННЫЕ
// ============================================================================

/**
 * Тиковые данные
 */
export interface Tick {
  symbol: string; // Торговая пара (ETH_USDT)
  price: number; // Цена последней сделки
  volume: number; // Объем за 24 часа
  timestamp: number; // Временная метка (мс)
  high24h?: number; // Максимум за 24 часа
  low24h?: number; // Минимум за 24 часа
  changePercent?: number; // Изменение цены в %
}

/**
 * Уровень в Order Book (цена и объем)
 */
export interface OrderBookLevel {
  price: number; // Цена
  amount: number; // Объем
}

/**
 * Order Book (книга ордеров)
 */
export interface OrderBook {
  symbol: string; // Торговая пара
  lastUpdateId: number; // ID последнего обновления
  bids: OrderBookLevel[]; // Заявки на покупку (отсортированы по убыванию цены)
  asks: OrderBookLevel[]; // Заявки на продажу (отсортированы по возрастанию цены)
  timestamp: number; // Временная метка
}

/**
 * Обновление Order Book от WebSocket
 */
export interface OrderBookUpdate {
  firstUpdateId: number; // Первый ID обновления (U)
  lastUpdateId: number; // Последний ID обновления (u)
  symbol: string; // Торговая пара
  bids: OrderBookLevel[]; // Обновления bids
  asks: OrderBookLevel[]; // Обновления asks
  timestamp: number; // Временная метка
}

// ============================================================================
// ЛОГИРОВАНИЕ И ТРАНСЛЯЦИЯ КЛИЕНТАМ
// ============================================================================

/**
 * Уровень логирования
 */
export enum LogLevel {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  DEBUG = "debug",
  SUCCESS = "success",
}

/**
 * Тип сообщения для клиентов
 */
export enum MessageType {
  // Системные
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  PING = "ping",
  PONG = "pong",

  // Подписки (запросы от клиента)
  SUBSCRIBE = "subscribe",
  UNSUBSCRIBE = "unsubscribe",

  // Данные (от сервера к клиенту)
  LOG = "log",
  TICK = "tick",
  ORDERBOOK = "orderbook",
  BALANCE = "balance",
  INDICATOR = "indicator", // ✅ Новое: данные индикаторов

  // Ответы на подписки
  SUBSCRIBED = "subscribed",
  UNSUBSCRIBED = "unsubscribed",
  ERROR = "error",
}

/**
 * Каналы для подписки
 */
export enum SubscriptionChannel {
  SYSTEM = "system", // Системные сообщения (автоматическая подписка, нельзя отписаться)
  LOGS = "logs", // Все логи
  TICKS = "ticks", // Тики
  ORDERBOOK = "orderbook", // Order Book обновления
  BALANCE = "balance", // Балансы
  INDICATORS = "indicators", // Индикаторы
}

/**
 * Базовое сообщение для клиентов
 */
export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

/**
 * Сообщение подключения клиента
 */
export interface ConnectMessage extends BaseMessage {
  type: MessageType.CONNECT;
  clientId: string;
  clientInfo: {
    hostname: string;
    platform: string;
  };
}

/**
 * Лог-сообщение
 */
export interface LogMessage extends BaseMessage {
  type: MessageType.LOG;
  level: LogLevel;
  message: string;
  source?: string;
}

/**
 * Сообщение с тиком
 */
export interface TickMessage extends BaseMessage {
  type: MessageType.TICK;
  symbol: string;
  price: number;
  volume: number;
}

/**
 * Сообщение с Order Book
 */
export interface OrderBookMessage extends BaseMessage {
  type: MessageType.ORDERBOOK;
  symbol: string;
  data: {
    askVolume: number;
    bidVolume: number;
    askPercent: number;
    bidPercent: number;
    spread?: number;
    midPrice?: number;
  };
}

/**
 * Сообщение с балансом
 */
export interface BalanceMessage extends BaseMessage {
  type: MessageType.BALANCE;
  balances: Array<{
    currency: string;
    available: number;
    locked: number;
  }>;
}

/**
 * Сообщение с данными индикатора
 */
export interface IndicatorMessage extends BaseMessage {
  type: MessageType.INDICATOR;
  name: string; // tick_speed, orderbook_pressure
  data: any; // Данные индикатора
}

/**
 * Системное сообщение (статус соединения с биржей и т.д.)
 */
export interface SystemMessage extends BaseMessage {
  type: MessageType.LOG;
  level: LogLevel;
  message: string;
  source: string;
  category: "system" | "internal"; // Категория: system (критичное) или internal (обычное)
}

/**
 * Ping/Pong сообщения
 */
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

/**
 * Сообщение отключения
 */
export interface DisconnectMessage extends BaseMessage {
  type: MessageType.DISCONNECT;
  clientId: string;
  reason: string;
}

/**
 * Запрос на подписку от клиента
 */
export interface SubscribeRequest extends BaseMessage {
  type: MessageType.SUBSCRIBE;
  channels: SubscriptionChannel[]; // Массив каналов для подписки
}

/**
 * Запрос на отписку от клиента
 */
export interface UnsubscribeRequest extends BaseMessage {
  type: MessageType.UNSUBSCRIBE;
  channels: SubscriptionChannel[]; // Массив каналов для отписки
}

/**
 * Ответ на успешную подписку
 */
export interface SubscribedMessage extends BaseMessage {
  type: MessageType.SUBSCRIBED;
  channels: SubscriptionChannel[];
  message: string;
}

/**
 * Ответ на успешную отписку
 */
export interface UnsubscribedMessage extends BaseMessage {
  type: MessageType.UNSUBSCRIBED;
  channels: SubscriptionChannel[];
  message: string;
}

/**
 * Сообщение об ошибке
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: string;
}

/**
 * Объединенный тип всех сообщений (от сервера к клиенту и обратно)
 */
export type ClientMessage =
  // Системные сообщения
  | ConnectMessage
  | DisconnectMessage
  | PingMessage
  | PongMessage
  // Запросы от клиента
  | SubscribeRequest
  | UnsubscribeRequest
  // Ответы сервера
  | SubscribedMessage
  | UnsubscribedMessage
  | ErrorMessage
  // Данные от сервера
  | LogMessage
  | TickMessage
  | OrderBookMessage
  | BalanceMessage
  | IndicatorMessage; // ✅ Новое

/**
 * Свеча (Candlestick)
 */
export interface Candle {
  symbol: string; // Торговая пара
  timestamp: number; // Время открытия свечи (мс)
  open: number; // Цена открытия
  high: number; // Максимальная цена
  low: number; // Минимальная цена
  close: number; // Цена закрытия
  volume: number; // Объем торгов
  interval: string; // Интервал (1m, 5m, 15m, 1h и т.д.)
}

// ============================================================================
// ТОРГОВЫЕ СИГНАЛЫ
// ============================================================================

/**
 * Тип торгового сигнала
 */
export enum SignalType {
  BUY = "BUY", // Покупка
  SELL = "SELL", // Продажа
  HOLD = "HOLD", // Удержание позиции
}

/**
 * Торговый сигнал от стратегии
 */
export interface Signal {
  type: SignalType; // Тип сигнала
  symbol: string; // Торговая пара
  price: number; // Цена для исполнения
  amount: number; // Количество
  timestamp: number; // Время генерации сигнала
  reason: string; // Причина сигнала (для логирования)
}
