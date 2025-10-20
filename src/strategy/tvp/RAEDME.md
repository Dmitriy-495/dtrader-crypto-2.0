# 🎯 TVP Strategy (Tick-Volume-Pressure)

Комбинированная торговая стратегия на основе трёх индикаторов.

---

## 📊 Три столпа стратегии

### 1. **Tick Speed** (Активность рынка)
- Измеряет количество сделок в минуту
- Определяет состояние рынка: DEAD → LOW → NORMAL → HIGH → EXTREME
- **Роль:** Фильтрует мёртвые периоды

### 2. **Volume Confirmation** (Подтверждение объёмом)
- Сравнивает текущий объём со средним
- Проверяет синхронизацию движения цены и объёма
- **Роль:** Подтверждает надёжность движения

### 3. **Order Book Pressure** (Давление в стакане)
- Анализирует соотношение bid/ask объёмов
- Рассчитывает Order Book Imbalance (OBI)
- **Роль:** Показывает направление давления

---

## ⚙️ Режимы работы

### 🛡️ Conservative (Консервативный)
```json
{
  "minConfirmations": 3,
  "requireVolumeConfirmation": true,
  "requireStrongSignals": true
}
```

**Характеристики:**
- ✅ Все 3 индикатора должны подтверждать
- ✅ Только STRONG_BUY / STRONG_SELL сигналы
- ✅ Минимум ложных сигналов
- ❌ Меньше торговых возможностей

**Когда использовать:** Боковой рынок, высокая волатильность, неуверенность.

---

### ⚖️ Normal (Нормальный) - По умолчанию
```json
{
  "minConfirmations": 2,
  "requireVolumeConfirmation": true,
  "requireStrongSignals": false
}
```

**Характеристики:**
- ✅ Минимум 2 из 3 индикаторов
- ✅ Принимает BUY/SELL (не только STRONG)
- ⚖️ Баланс между надёжностью и частотой
- ⚖️ Оптимально для большинства ситуаций

**Когда использовать:** Обычные рыночные условия, трендовые движения.

---

### 🚀 Aggressive (Агрессивный)
```json
{
  "minConfirmations": 1,
  "requireVolumeConfirmation": false,
  "requireStrongSignals": false
}
```

**Характеристики:**
- ✅ Достаточно 1 индикатора
- ✅ Больше торговых возможностей
- ❌ Больше ложных сигналов
- ❌ Выше риск

**Когда использовать:** Сильные тренды, высокая ликвидность, скальпинг.

---

## 🎲 Примеры сигналов

### Пример 1: BUY в режиме NORMAL

**Состояние индикаторов:**
```
Volume Confirmation:  STRONG_BUY (volumeRatio: 2.3x)  ✅
Order Book Pressure:  BUY (imbalance: 0.15)          ✅
Tick Speed:           NORMAL (125 t/min)             ✅
```

**Результат:** 3/3 подтверждения → **СИЛЬНЫЙ СИГНАЛ BUY** 🟢🟢

---

### Пример 2: SELL в режиме NORMAL

**Состояние индикаторов:**
```
Volume Confirmation:  SELL (volumeRatio: 1.6x)       ✅
Order Book Pressure:  STRONG_SELL (imbalance: -0.35) ✅
Tick Speed:           HIGH (280 t/min)               ⚪ (нейтрально)
```

**Результат:** 2/3 подтверждения → **СИГНАЛ SELL** 🔴

---

### Пример 3: НЕТ СИГНАЛА

**Состояние индикаторов:**
```
Volume Confirmation:  NO_VOLUME (volumeRatio: 0.8x)  ❌
Order Book Pressure:  NEUTRAL (imbalance: 0.05)     ❌
Tick Speed:           DEAD (15 t/min)               ❌
```

**Результат:** 0/3 подтверждения → **НЕТ СИГНАЛА** ⚪

---

## 🔧 Настройка параметров

Все параметры находятся в `settings.json`.

### Основные настройки:

```json
{
  "strategy": {
    "mode": "normal"  // conservative | normal | aggressive
  }
}
```

### Пороги для индикаторов:

```json
{
  "rules": {
    "normal": {
      "minVolumeRatio": 1.5,        // Минимальный объём (1.5x от среднего)
      "minPressureImbalance": 0.1   // Минимальный дисбаланс стакана
    }
  }
}
```

### Фильтры:

```json
{
  "filters": {
    "ignoreDeadMarket": true,         // Не торговать на мёртвом рынке
    "ignoreNoVolume": true,           // Игнорировать движения без объёма
    "ignoreExtremeVolatility": false, // Торговать на экстремальной волатильности
    "minTicksBeforeSignal": 100       // Минимум тиков перед первым сигналом
  }
}
```

---

## 📈 Интеграция в DTrader

```typescript
import { TVPStrategy } from './strategy/tvp/TVPStrategy';

// Создание стратегии
const strategy = new TVPStrategy();

// Запуск
strategy.onStart();

// Обновление индикаторов (из DTrader)
strategy.onTick(tick);
strategy.updateOrderBookPressure(pressureResult);

// Анализ свечи
const signal = strategy.onCandle(candle, history);

if (signal && signal.type !== SignalType.HOLD) {
  console.log(`Сигнал: ${signal.type}`);
  // Выполнить торговое действие
}

// Переключение режима
strategy.setMode('aggressive');

// Статистика
const stats = strategy.getStats();
console.log(`Обработано тиков: ${stats.tickCount}`);
console.log(`Сгенерировано сигналов: ${stats.signalCount}`);
```

---

## 📊 Бэктестинг (в разработке)

Функционал для тестирования стратегии на исторических данных будет добавлен позже.

---

## ⚠️ Дисклеймер

Эта стратегия предназначена **только для образовательных целей**. 

- ❌ Не является финансовой рекомендацией
- ❌ Не гарантирует прибыль
- ✅ Используйте на свой риск
- ✅ Тестируйте на демо-счёте перед реальной торговлей

---

## 📝 Changelog

### v1.0.0
- ✅ Базовая реализация стратегии TVP
- ✅ Три режима работы (conservative, normal, aggressive)
- ✅ Система фильтров
- ✅ Настраиваемые параметры через settings.json