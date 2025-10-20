/**
 * TVP Strategy - Tick-Volume-Pressure
 * Комбинированная стратегия на основе трёх индикаторов:
 * - Tick Speed (активность рынка)
 * - Volume Confirmation (подтверждение объёмом)
 * - Order Book Pressure (давление в стакане)
 */

import { BaseStrategy, BaseStrategyConfig } from "../BaseStrategy";
import { Candle, Tick, Signal, SignalType } from "../../types";
import {
  TickSpeedIndicator,
  TickSpeedResult,
  ActivityLevel,
} from "../../indicators/TickSpeedIndicator";
import {
  VolumeConfirmationIndicator,
  VolumeConfirmationResult,
  VolumeSignal,
} from "../../indicators/VolumeConfirmationIndicator";
import {
  OrderBookPressureIndicator,
  OrderBookPressureResult,
  PressureDirection,
} from "../../indicators/OrderBookPressureIndicator";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// ============================================================================

interface TVPSettings {
  strategy: {
    name: string;
    description: string;
    version: string;
    enabled: boolean;
    symbol: string;
    mode: "conservative" | "normal" | "aggressive";
  };
  indicators: {
    tickSpeed: any;
    volumeConfirmation: any;
    orderBookPressure: any;
  };
  rules: {
    conservative: RuleSet;
    normal: RuleSet;
    aggressive: RuleSet;
  };
  signalWeights: {
    volumeConfirmation: number;
    orderBookPressure: number;
    tickSpeed: number;
  };
  filters: {
    ignoreDeadMarket: boolean;
    ignoreNoVolume: boolean;
    ignoreExtremeVolatility: boolean;
    minTicksBeforeSignal: number;
  };
}

interface RuleSet {
  description: string;
  minConfirmations: number;
  requireVolumeConfirmation: boolean;
  requireStrongSignals: boolean;
  allowedActivityLevels: string[];
  minVolumeRatio: number;
  minPressureImbalance: number;
}

interface IndicatorState {
  tickSpeed: TickSpeedResult | null;
  volumeConfirmation: VolumeConfirmationResult | null;
  orderBookPressure: OrderBookPressureResult | null;
}

// ============================================================================
// КЛАСС TVPSTRATEGY
// ============================================================================

export class TVPStrategy extends BaseStrategy {
  private settings: TVPSettings;
  private currentRules: RuleSet;

  // Индикаторы
  private tickSpeedIndicator: TickSpeedIndicator;
  private volumeConfirmationIndicator: VolumeConfirmationIndicator;
  private orderBookPressureIndicator: OrderBookPressureIndicator;

  // Состояние
  private indicatorState: IndicatorState = {
    tickSpeed: null,
    volumeConfirmation: null,
    orderBookPressure: null,
  };

  private tickCount: number = 0;
  private signalCount: number = 0;

  constructor() {
    // Загружаем настройки
    const settingsPath = path.join(__dirname, "settings.json");
    const settingsData = fs.readFileSync(settingsPath, "utf-8");
    const settings: TVPSettings = JSON.parse(settingsData);

    // Инициализируем базовый класс
    super("TVP", {
      symbol: settings.strategy.symbol,
      interval: "1m",
      enabled: settings.strategy.enabled,
    });

    this.settings = settings;
    this.currentRules = this.settings.rules[this.settings.strategy.mode];

    // Создаём индикаторы с настройками из файла
    this.tickSpeedIndicator = new TickSpeedIndicator(
      settings.indicators.tickSpeed
    );

    this.volumeConfirmationIndicator = new VolumeConfirmationIndicator(
      settings.indicators.volumeConfirmation
    );

    this.orderBookPressureIndicator = new OrderBookPressureIndicator(
      settings.indicators.orderBookPressure
    );
  }

  // ==========================================================================
  // РЕАЛИЗАЦИЯ АБСТРАКТНЫХ МЕТОДОВ
  // ==========================================================================

  onStart(): void {
    console.log(
      `\n🎯 ${this.settings.strategy.name} v${this.settings.strategy.version}`
    );
    console.log(`📝 ${this.settings.strategy.description}`);
    console.log(`⚙️  Режим: ${this.settings.strategy.mode.toUpperCase()}`);
    console.log(`📊 Правила: ${this.currentRules.description}`);
    console.log(
      `   - Минимум подтверждений: ${this.currentRules.minConfirmations}`
    );
    console.log(
      `   - Обязательно объём: ${
        this.currentRules.requireVolumeConfirmation ? "ДА" : "НЕТ"
      }`
    );
    console.log(
      `   - Только сильные сигналы: ${
        this.currentRules.requireStrongSignals ? "ДА" : "НЕТ"
      }`
    );
  }

  onStop(): void {
    console.log(`\n🛑 ${this.name} остановлена`);
    console.log(`   Обработано тиков: ${this.tickCount}`);
    console.log(`   Сгенерировано сигналов: ${this.signalCount}`);
  }

  onTick(tick: Tick): void {
    this.tickCount++;

    // Обновляем индикаторы
    this.tickSpeedIndicator.addTick(tick.timestamp);
    this.volumeConfirmationIndicator.addTick(
      tick.price,
      tick.volume,
      tick.timestamp
    );

    // Рассчитываем индикаторы каждые 20 тиков
    if (this.tickCount % 20 === 0) {
      this.indicatorState.tickSpeed = this.tickSpeedIndicator.calculate();
      this.indicatorState.volumeConfirmation =
        this.volumeConfirmationIndicator.calculate();
    }
  }

  onCandle(candle: Candle, history: Candle[]): Signal | null {
    // Проверяем фильтры
    if (!this.passFilters()) {
      return null;
    }

    // Анализируем состояние всех индикаторов
    const signal = this.analyzeIndicators();

    if (signal) {
      this.signalCount++;
      this.logSignal(signal);
    }

    return signal;
  }

  // ==========================================================================
  // ОБНОВЛЕНИЕ ИНДИКАТОРОВ (вызывается извне)
  // ==========================================================================

  /**
   * Обновляет состояние Order Book Pressure
   */
  updateOrderBookPressure(result: OrderBookPressureResult): void {
    this.indicatorState.orderBookPressure = result;
  }

  // ==========================================================================
  // АНАЛИЗ И ГЕНЕРАЦИЯ СИГНАЛОВ
  // ==========================================================================

  /**
   * Анализирует все индикаторы и генерирует сигнал
   */
  private analyzeIndicators(): Signal | null {
    const { tickSpeed, volumeConfirmation, orderBookPressure } =
      this.indicatorState;

    // Проверяем наличие данных
    if (!tickSpeed || !volumeConfirmation || !orderBookPressure) {
      return null;
    }

    // Подсчитываем подтверждения для BUY
    const buyConfirmations = this.countBuyConfirmations(
      tickSpeed,
      volumeConfirmation,
      orderBookPressure
    );

    // Подсчитываем подтверждения для SELL
    const sellConfirmations = this.countSellConfirmations(
      tickSpeed,
      volumeConfirmation,
      orderBookPressure
    );

    // Проверяем достаточно ли подтверждений
    if (buyConfirmations >= this.currentRules.minConfirmations) {
      return this.createSignal(SignalType.BUY, buyConfirmations);
    }

    if (sellConfirmations >= this.currentRules.minConfirmations) {
      return this.createSignal(SignalType.SELL, sellConfirmations);
    }

    return this.createSignal(SignalType.HOLD, 0);
  }

  /**
   * Подсчитывает подтверждения для покупки
   */
  private countBuyConfirmations(
    tickSpeed: TickSpeedResult,
    volumeConfirmation: VolumeConfirmationResult,
    orderBookPressure: OrderBookPressureResult
  ): number {
    let confirmations = 0;
    const reasons: string[] = [];

    // 1. Volume Confirmation
    if (this.currentRules.requireStrongSignals) {
      if (volumeConfirmation.signal === VolumeSignal.STRONG_BUY) {
        confirmations++;
        reasons.push("Volume: STRONG_BUY");
      }
    } else {
      if (
        volumeConfirmation.signal === VolumeSignal.STRONG_BUY ||
        volumeConfirmation.signal === VolumeSignal.BUY
      ) {
        if (
          volumeConfirmation.volumeRatio >= this.currentRules.minVolumeRatio
        ) {
          confirmations++;
          reasons.push(`Volume: ${volumeConfirmation.signal}`);
        }
      }
    }

    // 2. Order Book Pressure
    if (this.currentRules.requireStrongSignals) {
      if (orderBookPressure.direction === PressureDirection.STRONG_BUY) {
        confirmations++;
        reasons.push("Pressure: STRONG_BUY");
      }
    } else {
      if (
        orderBookPressure.direction === PressureDirection.STRONG_BUY ||
        orderBookPressure.direction === PressureDirection.BUY
      ) {
        if (
          orderBookPressure.imbalance >= this.currentRules.minPressureImbalance
        ) {
          confirmations++;
          reasons.push(`Pressure: ${orderBookPressure.direction}`);
        }
      }
    }

    // 3. Tick Speed (активность рынка)
    if (
      this.currentRules.allowedActivityLevels.includes(tickSpeed.activityLevel)
    ) {
      if (
        tickSpeed.trend === "rising" ||
        tickSpeed.activityLevel === ActivityLevel.HIGH
      ) {
        confirmations++;
        reasons.push(`Activity: ${tickSpeed.activityLevel}`);
      }
    }

    return confirmations;
  }

  /**
   * Подсчитывает подтверждения для продажи
   */
  private countSellConfirmations(
    tickSpeed: TickSpeedResult,
    volumeConfirmation: VolumeConfirmationResult,
    orderBookPressure: OrderBookPressureResult
  ): number {
    let confirmations = 0;

    // 1. Volume Confirmation
    if (this.currentRules.requireStrongSignals) {
      if (volumeConfirmation.signal === VolumeSignal.STRONG_SELL) {
        confirmations++;
      }
    } else {
      if (
        volumeConfirmation.signal === VolumeSignal.STRONG_SELL ||
        volumeConfirmation.signal === VolumeSignal.SELL
      ) {
        if (
          volumeConfirmation.volumeRatio >= this.currentRules.minVolumeRatio
        ) {
          confirmations++;
        }
      }
    }

    // 2. Order Book Pressure
    if (this.currentRules.requireStrongSignals) {
      if (orderBookPressure.direction === PressureDirection.STRONG_SELL) {
        confirmations++;
      }
    } else {
      if (
        orderBookPressure.direction === PressureDirection.STRONG_SELL ||
        orderBookPressure.direction === PressureDirection.SELL
      ) {
        if (
          Math.abs(orderBookPressure.imbalance) >=
          this.currentRules.minPressureImbalance
        ) {
          confirmations++;
        }
      }
    }

    // 3. Tick Speed
    if (
      this.currentRules.allowedActivityLevels.includes(tickSpeed.activityLevel)
    ) {
      if (
        tickSpeed.trend === "falling" ||
        tickSpeed.activityLevel === ActivityLevel.HIGH
      ) {
        confirmations++;
      }
    }

    return confirmations;
  }

  /**
   * Проверяет фильтры
   */
  private passFilters(): boolean {
    const { tickSpeed, volumeConfirmation } = this.indicatorState;

    if (!tickSpeed || !volumeConfirmation) {
      return false;
    }

    // Фильтр: минимальное количество тиков
    if (this.tickCount < this.settings.filters.minTicksBeforeSignal) {
      return false;
    }

    // Фильтр: мёртвый рынок
    if (this.settings.filters.ignoreDeadMarket) {
      if (tickSpeed.activityLevel === ActivityLevel.DEAD) {
        return false;
      }
    }

    // Фильтр: движение без объёма
    if (this.settings.filters.ignoreNoVolume) {
      if (volumeConfirmation.signal === VolumeSignal.NO_VOLUME) {
        return false;
      }
    }

    // Фильтр: экстремальная волатильность
    if (this.settings.filters.ignoreExtremeVolatility) {
      if (
        tickSpeed.activityLevel === ActivityLevel.EXTREME &&
        volumeConfirmation.isVolumeSpike
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Создаёт сигнал
   */
  private createSignal(type: SignalType, confirmations: number): Signal {
    const price = this.indicatorState.volumeConfirmation?.currentVolume || 0;

    let reason = "";
    if (type === SignalType.BUY) {
      reason = `BUY: ${confirmations} подтверждений`;
    } else if (type === SignalType.SELL) {
      reason = `SELL: ${confirmations} подтверждений`;
    } else {
      reason = "HOLD: недостаточно подтверждений";
    }

    return {
      type,
      symbol: this.config.symbol,
      price: 0, // Будет заполнено позже
      amount: 0, // Будет рассчитано позже
      timestamp: Date.now(),
      reason,
    };
  }

  /**
   * Логирует сигнал
   */
  private logSignal(signal: Signal): void {
    const emoji =
      signal.type === SignalType.BUY
        ? "🟢"
        : signal.type === SignalType.SELL
        ? "🔴"
        : "⚪";
    console.log(`\n${emoji} СИГНАЛ TVP: ${signal.type}`);
    console.log(`   ${signal.reason}`);

    const { tickSpeed, volumeConfirmation, orderBookPressure } =
      this.indicatorState;

    if (volumeConfirmation) {
      console.log(
        `   📊 Volume: ${
          volumeConfirmation.signal
        } (${volumeConfirmation.volumeRatio.toFixed(2)}x)`
      );
    }

    if (orderBookPressure) {
      console.log(
        `   📖 Pressure: ${
          orderBookPressure.direction
        } (OBI: ${orderBookPressure.imbalance.toFixed(3)})`
      );
    }

    if (tickSpeed) {
      console.log(
        `   ⚡ Activity: ${tickSpeed.activityLevel} (${tickSpeed.ticksPerMinute} t/min)`
      );
    }
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ РЕЖИМАМИ
  // ==========================================================================

  /**
   * Переключает режим работы стратегии
   */
  setMode(mode: "conservative" | "normal" | "aggressive"): void {
    this.settings.strategy.mode = mode;
    this.currentRules = this.settings.rules[mode];
    console.log(`⚙️  Режим изменён на: ${mode.toUpperCase()}`);
    console.log(`📊 ${this.currentRules.description}`);
  }

  /**
   * Получает текущий режим
   */
  getMode(): string {
    return this.settings.strategy.mode;
  }

  /**
   * Получает статистику
   */
  getStats() {
    return {
      tickCount: this.tickCount,
      signalCount: this.signalCount,
      mode: this.settings.strategy.mode,
      currentState: this.indicatorState,
    };
  }
}
