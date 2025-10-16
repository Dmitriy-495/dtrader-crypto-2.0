/**
 * Стратегия на минутном графике
 * Простая демонстрационная стратегия для тестирования системы
 */

import { BaseStrategy, BaseStrategyConfig } from "./BaseStrategy";
import { Candle, Tick, Signal, SignalType } from "../types";

// ============================================================================
// ИНТЕРФЕЙСЫ
// ============================================================================

/**
 * Конфигурация Strategy1min
 */
export interface Strategy1minConfig extends BaseStrategyConfig {
  minCandlesRequired: number; // Минимальное количество свечей для анализа
}

// ============================================================================
// КЛАСС STRATEGY1MIN
// ============================================================================

export class Strategy1min extends BaseStrategy {
  private strategy1minConfig: Strategy1minConfig;
  private tickCount: number = 0;

  /**
   * Конструктор
   */
  constructor(config: Strategy1minConfig) {
    super("Strategy1min", config);
    this.strategy1minConfig = config;
  }

  // ==========================================================================
  // РЕАЛИЗАЦИЯ АБСТРАКТНЫХ МЕТОДОВ
  // ==========================================================================

  /**
   * Запуск стратегии
   */
  onStart(): void {
    console.log(`\n🎯 Стратегия ${this.name} запущена`);
    console.log(`   Пара: ${this.strategy1minConfig.symbol}`);
    console.log(`   Интервал: ${this.strategy1minConfig.interval}`);
    console.log(
      `   Минимум свечей: ${this.strategy1minConfig.minCandlesRequired}`
    );
  }

  /**
   * Остановка стратегии
   */
  onStop(): void {
    console.log(`\n🛑 Стратегия ${this.name} остановлена`);
    console.log(`   Обработано тиков: ${this.tickCount}`);
  }

  /**
   * Обработка нового тика
   */
  onTick(tick: Tick): void {
    this.tickCount++;

    // Пока просто логируем каждый 10-й тик для уменьшения спама
    if (this.tickCount % 10 === 0) {
      console.log(
        `📊 Тик #${this.tickCount} ${tick.symbol}: ${tick.price.toFixed(
          2
        )} USDT`
      );
    }
  }

  /**
   * Анализ новой свечи и генерация сигналов
   */
  onCandle(candle: Candle, history: Candle[]): Signal | null {
    console.log(`\n🔍 ${this.name}: Анализ новой свечи...`);

    // Проверяем, достаточно ли данных для анализа
    if (history.length < this.strategy1minConfig.minCandlesRequired) {
      console.log(
        `   ⏳ Недостаточно данных: ${history.length}/${this.strategy1minConfig.minCandlesRequired} свечей`
      );
      return null;
    }

    // Простая демонстрационная логика:
    // Анализируем последние 3 свечи
    const lastCandles = history.slice(-3);

    // Проверяем тренд
    const isUptrend = this.checkUptrend(lastCandles);
    const isDowntrend = this.checkDowntrend(lastCandles);

    console.log(`   📈 Восходящий тренд: ${isUptrend ? "ДА" : "НЕТ"}`);
    console.log(`   📉 Нисходящий тренд: ${isDowntrend ? "ДА" : "НЕТ"}`);

    // Генерируем сигнал (пока только для демонстрации, без реальной торговли)
    if (isUptrend) {
      return this.createSignal(
        SignalType.BUY,
        candle,
        "Обнаружен восходящий тренд"
      );
    } else if (isDowntrend) {
      return this.createSignal(
        SignalType.SELL,
        candle,
        "Обнаружен нисходящий тренд"
      );
    }

    return this.createSignal(SignalType.HOLD, candle, "Нет четкого тренда");
  }

  // ==========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================================================

  /**
   * Проверка на восходящий тренд
   * Простая логика: каждая следующая свеча закрывается выше предыдущей
   */
  private checkUptrend(candles: Candle[]): boolean {
    if (candles.length < 2) return false;

    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close <= candles[i - 1].close) {
        return false;
      }
    }
    return true;
  }

  /**
   * Проверка на нисходящий тренд
   * Простая логика: каждая следующая свеча закрывается ниже предыдущей
   */
  private checkDowntrend(candles: Candle[]): boolean {
    if (candles.length < 2) return false;

    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close >= candles[i - 1].close) {
        return false;
      }
    }
    return true;
  }

  /**
   * Создать торговый сигнал
   */
  private createSignal(
    type: SignalType,
    candle: Candle,
    reason: string
  ): Signal {
    const signal: Signal = {
      type,
      symbol: candle.symbol,
      price: candle.close,
      amount: 0, // Пока не рассчитываем количество
      timestamp: Date.now(),
      reason,
    };

    // Логируем сигнал
    const emoji =
      type === SignalType.BUY ? "🟢" : type === SignalType.SELL ? "🔴" : "⚪";
    console.log(`\n${emoji} СИГНАЛ: ${type}`);
    console.log(`   Причина: ${reason}`);
    console.log(`   Цена: ${signal.price.toFixed(2)} USDT`);

    return signal;
  }
}
