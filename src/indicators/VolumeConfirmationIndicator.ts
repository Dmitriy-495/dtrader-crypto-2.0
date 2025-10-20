/**
 * VolumeConfirmationIndicator - индикатор подтверждения на основе объёмов
 * Анализирует рост объёма для подтверждения ценовых движений
 */

export interface VolumeConfirmationConfig {
  period: number; // Период для расчета средней (по умолчанию 20)
  volumeThreshold: number; // Порог роста объёма для подтверждения (1.5 = +50%)
  priceChangeThreshold: number; // Минимальное изменение цены в % для анализа
}

export enum VolumeSignal {
  STRONG_BUY = 'STRONG_BUY',       // Сильный объём + рост цены
  BUY = 'BUY',                     // Повышенный объём + рост цены
  STRONG_SELL = 'STRONG_SELL',     // Сильный объём + падение цены
  SELL = 'SELL',                   // Повышенный объём + падение цены
  NEUTRAL = 'NEUTRAL',             // Нет подтверждения
  NO_VOLUME = 'NO_VOLUME'          // Движение без объёма (слабый сигнал)
}

export interface VolumeConfirmationResult {
  signal: VolumeSignal;
  volumeRatio: number;           // Текущий объём / средний объём
  averageVolume: number;         // Средний объём за период
  currentVolume: number;         // Текущий объём
  priceChange: number;           // Изменение цены в %
  isVolumeSpike: boolean;        // Резкий всплеск объёма
  isConfirmed: boolean;          // Сигнал подтверждён объёмом
}

interface VolumeDataPoint {
  volume: number;
  price: number;
  timestamp: number;
}

export class VolumeConfirmationIndicator {
  private config: VolumeConfirmationConfig;
  private volumeHistory: VolumeDataPoint[] = [];
  private lastPrice: number | null = null;

  constructor(config: Partial<VolumeConfirmationConfig> = {}) {
    this.config = {
      period: config.period || 20,
      volumeThreshold: config.volumeThreshold || 1.5,
      priceChangeThreshold: config.priceChangeThreshold || 0.1
    };
  }

  /**
   * Добавляет новую точку данных (тик)
   */
  addTick(price: number, volume: number, timestamp: number = Date.now()): void {
    this.volumeHistory.push({ volume, price, timestamp });

    // Ограничиваем историю
    if (this.volumeHistory.length > this.config.period * 2) {
      this.volumeHistory.shift();
    }
  }

  /**
   * Рассчитывает подтверждение на основе объёмов
   */
  calculate(): VolumeConfirmationResult | null {
    if (this.volumeHistory.length < this.config.period) {
      return null; // Недостаточно данных
    }

    const currentData = this.volumeHistory[this.volumeHistory.length - 1];
    const previousData = this.volumeHistory[this.volumeHistory.length - 2];

    // Рассчитываем средний объём
    const recentHistory = this.volumeHistory.slice(-this.config.period);
    const averageVolume = recentHistory.reduce((sum, d) => sum + d.volume, 0) / this.config.period;

    // Рассчитываем изменение цены
    let priceChange = 0;
    if (this.lastPrice !== null && this.lastPrice !== 0) {
      priceChange = ((currentData.price - this.lastPrice) / this.lastPrice) * 100;
    }
    this.lastPrice = currentData.price;

    // Соотношение текущего объёма к среднему
    const volumeRatio = currentData.volume / averageVolume;

    // Определяем всплеск объёма
    const isVolumeSpike = volumeRatio > this.config.volumeThreshold * 1.5;

    // Определяем сигнал
    const signal = this.determineSignal(priceChange, volumeRatio);

    // Подтверждён ли сигнал объёмом?
    const isConfirmed = volumeRatio >= this.config.volumeThreshold && 
                        Math.abs(priceChange) >= this.config.priceChangeThreshold;

    return {
      signal,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      averageVolume: Math.round(averageVolume * 100) / 100,
      currentVolume: Math.round(currentData.volume * 100) / 100,
      priceChange: Math.round(priceChange * 1000) / 1000,
      isVolumeSpike,
      isConfirmed
    };
  }

  /**
   * Определяет сигнал на основе изменения цены и объёма
   */
  private determineSignal(priceChange: number, volumeRatio: number): VolumeSignal {
    const minChange = this.config.priceChangeThreshold;
    const threshold = this.config.volumeThreshold;

    // Нет значительного движения цены
    if (Math.abs(priceChange) < minChange) {
      return VolumeSignal.NEUTRAL;
    }

    // Рост цены
    if (priceChange > minChange) {
      if (volumeRatio < 1.0) {
        return VolumeSignal.NO_VOLUME; // Рост без объёма - слабый сигнал
      } else if (volumeRatio >= threshold * 1.5) {
        return VolumeSignal.STRONG_BUY; // Сильный объём
      } else if (volumeRatio >= threshold) {
        return VolumeSignal.BUY; // Повышенный объём
      }
      return VolumeSignal.NEUTRAL; // Объём недостаточен
    }

    // Падение цены
    if (priceChange < -minChange) {
      if (volumeRatio < 1.0) {
        return VolumeSignal.NO_VOLUME; // Падение без объёма
      } else if (volumeRatio >= threshold * 1.5) {
        return VolumeSignal.STRONG_SELL; // Сильный объём
      } else if (volumeRatio >= threshold) {
        return VolumeSignal.SELL; // Повышенный объём
      }
      return VolumeSignal.NEUTRAL; // Объём недостаточен
    }

    return VolumeSignal.NEUTRAL;
  }

  /**
   * Подтверждает сигнал от другого индикатора
   */
  confirmSignal(externalSignal: 'BUY' | 'SELL' | 'NEUTRAL'): boolean {
    const result = this.calculate();
    if (!result || !result.isConfirmed) {
      return false;
    }

    // Проверяем совпадение направления
    if (externalSignal === 'BUY') {
      return result.signal === VolumeSignal.BUY || result.signal === VolumeSignal.STRONG_BUY;
    }

    if (externalSignal === 'SELL') {
      return result.signal === VolumeSignal.SELL || result.signal === VolumeSignal.STRONG_SELL;
    }

    return false;
  }

  /**
   * Получить последние N точек истории
   */
  getHistory(count: number = 10): VolumeDataPoint[] {
    return this.volumeHistory.slice(-count);
  }

  /**
   * Сбросить индикатор
   */
  reset(): void {
    this.volumeHistory = [];
    this.lastPrice = null;
  }

  /**
   * Получить текстовое описание сигнала
   */
  static getSignalText(signal: VolumeSignal): string {
    switch (signal) {
      case VolumeSignal.STRONG_BUY: return 'Сильное подтверждение ПОКУПКИ';
      case VolumeSignal.BUY: return 'Подтверждение покупки';
      case VolumeSignal.STRONG_SELL: return 'Сильное подтверждение ПРОДАЖИ';
      case VolumeSignal.SELL: return 'Подтверждение продажи';
      case VolumeSignal.NO_VOLUME: return 'Движение без объёма (слабо)';
      case VolumeSignal.NEUTRAL: return 'Нет подтверждения';
    }
  }

  /**
   * Получить эмодзи для сигнала
   */
  static getSignalEmoji(signal: VolumeSignal): string {
    switch (signal) {
      case VolumeSignal.STRONG_BUY: return '🟢🟢';
      case VolumeSignal.BUY: return '🟢';
      case VolumeSignal.STRONG_SELL: return '🔴🔴';
      case VolumeSignal.SELL: return '🔴';
      case VolumeSignal.NO_VOLUME: return '⚠️';
      case VolumeSignal.NEUTRAL: return '⚪';
    }
  }
}