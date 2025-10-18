/**
 * OrderBookPressureIndicator - индикатор давления в стакане
 * Анализирует соотношение bid/ask объемов для определения направления давления
 */

import { OrderBook } from "../types";

export interface OrderBookPressureConfig {
  depthLevels: number; // Сколько уровней стакана учитывать (5-20)
  weightedMode: boolean; // Использовать взвешенный расчет по ценам
}

export enum PressureDirection {
  STRONG_BUY = "STRONG_BUY", // Сильное давление покупок
  BUY = "BUY", // Давление покупок
  NEUTRAL = "NEUTRAL", // Нейтрально
  SELL = "SELL", // Давление продаж
  STRONG_SELL = "STRONG_SELL", // Сильное давление продаж
}

export interface OrderBookPressureResult {
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  bidPercent: number;
  askPercent: number;
  imbalance: number; // OBI: от -1 (sell) до +1 (buy)
  direction: PressureDirection;
  spread: number;
  spreadPercent: number;
}

export class OrderBookPressureIndicator {
  private config: OrderBookPressureConfig;

  constructor(config: OrderBookPressureConfig) {
    this.config = {
      depthLevels: config.depthLevels || 10,
      weightedMode:
        config.weightedMode !== undefined ? config.weightedMode : true,
    };
  }

  calculate(orderBook: OrderBook): OrderBookPressureResult {
    const bids = orderBook.bids.slice(0, this.config.depthLevels);
    const asks = orderBook.asks.slice(0, this.config.depthLevels);

    let bidVolume = 0;
    let askVolume = 0;

    if (this.config.weightedMode) {
      bidVolume = this.calculateWeightedVolume(bids);
      askVolume = this.calculateWeightedVolume(asks);
    } else {
      bidVolume = this.calculateSimpleVolume(bids);
      askVolume = this.calculateSimpleVolume(asks);
    }

    const totalVolume = bidVolume + askVolume;
    const bidPercent = totalVolume > 0 ? (bidVolume / totalVolume) * 100 : 50;
    const askPercent = totalVolume > 0 ? (askVolume / totalVolume) * 100 : 50;
    const imbalance =
      totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0;
    const direction = this.getDirection(imbalance);

    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || 0;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    return {
      bidVolume: Math.round(bidVolume * 100) / 100,
      askVolume: Math.round(askVolume * 100) / 100,
      totalVolume: Math.round(totalVolume * 100) / 100,
      bidPercent: Math.round(bidPercent * 10) / 10,
      askPercent: Math.round(askPercent * 10) / 10,
      imbalance: Math.round(imbalance * 1000) / 1000,
      direction,
      spread: Math.round(spread * 100) / 100,
      spreadPercent: Math.round(spreadPercent * 10000) / 10000,
    };
  }

  private calculateSimpleVolume(
    levels: Array<{ price: number; amount: number }>
  ): number {
    return levels.reduce((sum, level) => {
      return sum + level.price * level.amount;
    }, 0);
  }

  private calculateWeightedVolume(
    levels: Array<{ price: number; amount: number }>
  ): number {
    let weightedSum = 0;
    const totalLevels = levels.length;

    levels.forEach((level, index) => {
      const weight = 1 - (index / totalLevels) * 0.5;
      weightedSum += level.price * level.amount * weight;
    });

    return weightedSum;
  }

  private getDirection(imbalance: number): PressureDirection {
    if (imbalance > 0.3) return PressureDirection.STRONG_BUY;
    if (imbalance > 0.1) return PressureDirection.BUY;
    if (imbalance < -0.3) return PressureDirection.STRONG_SELL;
    if (imbalance < -0.1) return PressureDirection.SELL;
    return PressureDirection.NEUTRAL;
  }

  comparePressure(
    current: OrderBookPressureResult,
    previous: OrderBookPressureResult
  ): {
    imbalanceChange: number;
    isIncreasing: boolean;
    isSignificant: boolean;
  } {
    const imbalanceChange = current.imbalance - previous.imbalance;
    const isIncreasing = imbalanceChange > 0;
    const isSignificant = Math.abs(imbalanceChange) > 0.1;

    return {
      imbalanceChange: Math.round(imbalanceChange * 1000) / 1000,
      isIncreasing,
      isSignificant,
    };
  }

  updateConfig(config: Partial<OrderBookPressureConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
