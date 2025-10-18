/**
 * TickSpeedIndicator - индикатор скорости тиков
 * Измеряет количество сделок в минуту для определения активности рынка
 */

export interface TickSpeedConfig {
  windowMinutes: number; // Размер окна для расчета (по умолчанию 1 минута)
  alertThresholds?: {
    low: number; // Низкая активность
    normal: number; // Нормальная активность
    high: number; // Высокая активность
    extreme: number; // Экстремальная активность
  };
}

export enum ActivityLevel {
  DEAD = "DEAD", // < low (рынок мертв)
  LOW = "LOW", // low - normal
  NORMAL = "NORMAL", // normal - high
  HIGH = "HIGH", // high - extreme
  EXTREME = "EXTREME", // > extreme (памп/дамп)
}

export interface TickSpeedResult {
  ticksPerMinute: number;
  activityLevel: ActivityLevel;
  isSpike: boolean; // Резкий всплеск активности
  trend: "rising" | "falling" | "stable";
}

export class TickSpeedIndicator {
  private config: TickSpeedConfig;
  private tickTimestamps: number[] = [];
  private windowMs: number;
  private previousSpeed: number = 0;
  private speedHistory: number[] = [];
  private maxHistoryLength: number = 10;

  constructor(config: TickSpeedConfig) {
    this.config = {
      windowMinutes: config.windowMinutes || 1,
      alertThresholds: config.alertThresholds || {
        low: 20,
        normal: 100,
        high: 300,
        extreme: 600,
      },
    };

    this.windowMs = this.config.windowMinutes * 60 * 1000;
  }

  /**
   * Регистрирует новый тик
   */
  addTick(timestamp: number = Date.now()): void {
    this.tickTimestamps.push(timestamp);
    this.cleanOldTicks(timestamp);
  }

  /**
   * Удаляет тики старше временного окна
   */
  private cleanOldTicks(currentTime: number): void {
    const cutoffTime = currentTime - this.windowMs;

    let firstValidIndex = 0;
    while (
      firstValidIndex < this.tickTimestamps.length &&
      this.tickTimestamps[firstValidIndex] < cutoffTime
    ) {
      firstValidIndex++;
    }

    if (firstValidIndex > 0) {
      this.tickTimestamps = this.tickTimestamps.slice(firstValidIndex);
    }
  }

  /**
   * Рассчитывает текущую скорость тиков
   */
  calculate(): TickSpeedResult {
    const now = Date.now();
    this.cleanOldTicks(now);

    const tickCount = this.tickTimestamps.length;
    const ticksPerMinute = tickCount / this.config.windowMinutes;

    this.speedHistory.push(ticksPerMinute);
    if (this.speedHistory.length > this.maxHistoryLength) {
      this.speedHistory.shift();
    }

    const activityLevel = this.getActivityLevel(ticksPerMinute);
    const isSpike = this.detectSpike(ticksPerMinute);
    const trend = this.getTrend();

    this.previousSpeed = ticksPerMinute;

    return {
      ticksPerMinute: Math.round(ticksPerMinute),
      activityLevel,
      isSpike,
      trend,
    };
  }

  /**
   * Определяет уровень активности рынка
   */
  private getActivityLevel(ticksPerMinute: number): ActivityLevel {
    const t = this.config.alertThresholds!;

    if (ticksPerMinute < t.low) return ActivityLevel.DEAD;
    if (ticksPerMinute < t.normal) return ActivityLevel.LOW;
    if (ticksPerMinute < t.high) return ActivityLevel.NORMAL;
    if (ticksPerMinute < t.extreme) return ActivityLevel.HIGH;
    return ActivityLevel.EXTREME;
  }

  /**
   * Определяет резкий всплеск активности
   */
  private detectSpike(currentSpeed: number): boolean {
    if (this.speedHistory.length < 3) return false;

    const avgSpeed =
      this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
    return (
      currentSpeed > avgSpeed * 2 &&
      currentSpeed > this.config.alertThresholds!.high
    );
  }

  /**
   * Определяет тренд скорости тиков
   */
  private getTrend(): "rising" | "falling" | "stable" {
    if (this.speedHistory.length < 3) return "stable";

    const recent = this.speedHistory.slice(-3);

    if (recent[2] > recent[1] && recent[1] > recent[0]) {
      if (recent[2] > recent[0] * 1.3) return "rising";
    }

    if (recent[2] < recent[1] && recent[1] < recent[0]) {
      if (recent[2] < recent[0] * 0.7) return "falling";
    }

    return "stable";
  }

  getCurrentTickCount(): number {
    this.cleanOldTicks(Date.now());
    return this.tickTimestamps.length;
  }

  getAverageSpeed(periods: number = 5): number {
    if (this.speedHistory.length === 0) return 0;

    const slice = this.speedHistory.slice(
      -Math.min(periods, this.speedHistory.length)
    );
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  reset(): void {
    this.tickTimestamps = [];
    this.speedHistory = [];
    this.previousSpeed = 0;
  }
}
