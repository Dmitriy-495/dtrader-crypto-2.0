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
  high24h: number; // Максимум за 24 часа
  low24h: number; // Минимум за 24 часа
  changePercent: number; // Изменение цены в %
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
