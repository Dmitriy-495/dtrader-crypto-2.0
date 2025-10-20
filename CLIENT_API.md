# dtrader-crypto-2.0 - WebSocket API для клиента

## 📡 Подключение

```
ws://[SERVER_IP]:8080
```

По умолчанию сервер слушает на порту `8080` (настраивается в `.env`).

---

## 🔌 Жизненный цикл подключения

### 1. Подключение к серверу

После установки WebSocket соединения клиент **автоматически** получает приветственное сообщение:

```json
{
  "type": "connect",
  "clientId": "client_1760785757876_u6ionr2pp",
  "clientInfo": {
    "hostname": "server",
    "platform": "linux"
  },
  "timestamp": 1760785757877
}
```

**Поля:**

- `clientId` - уникальный идентификатор клиента на время сессии
- `clientInfo.hostname` - имя хоста сервера
- `clientInfo.platform` - платформа сервера (linux, win32, darwin)
- `timestamp` - время подключения (Unix timestamp в миллисекундах)

---

### 2. Ping-Pong механизм

Для контроля соединения клиент может отправлять PING запросы.

**Запрос от клиента:**

```json
{
  "type": "ping",
  "timestamp": 1760785757877
}
```

**Ответ от сервера:**

```json
{
  "type": "pong",
  "timestamp": 1760785757900
}
```

**Рекомендация:** Отправляйте PING каждые 30 секунд для контроля соединения.

---

### 3. Отключение от сервера

При остановке сервера клиент получит:

```json
{
  "type": "disconnect",
  "clientId": "client_1760785757876_u6ionr2pp",
  "reason": "server_shutdown",
  "timestamp": 1760785757877
}
```

---

## 📥 Подписки на каналы

По умолчанию клиент **НЕ получает никаких данных**. Необходимо подписаться на нужные каналы.

### Доступные каналы:

| Канал        | Описание                                                                                                                                  | Подписка                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `system`     | **Системные сообщения** (состояние сервера, связь с биржей, ping-pong, подключения клиентов, подписки на биржу, синхронизация Order Book) | ✅ **Автоматическая** (нельзя отписаться) |
| `logs`       | Остальные логи сервера (внутренние, отладочные)                                                                                           | Вручную                                   |
| `ticks`      | Тиковые данные (каждая сделка)                                                                                                            | Вручную                                   |
| `balance`    | Обновления баланса                                                                                                                        | Вручную                                   |
| `indicators` | Данные индикаторов (tick_speed, orderbook_pressure, ema, rsi)                                                                             | Вручную                                   |

**Важно:**

- Канал `system` **подключается автоматически** для всех новых клиентов
- От канала `system` **нельзя отписаться** - он всегда активен
- Через `system` приходят **ВСЕ** критически важные сообщения:
  - Запуск/остановка сервера и компонентов
  - Подключение/отключение клиентов
  - Связь с биржей Gate.io (ping-pong, задержка)
  - Подписки на каналы биржи
  - Синхронизация Order Book (внутри сервера)
  - Переподключения к бирже
- Канал `indicators` содержит **полную информацию** об Order Book через индикатор `orderbook_pressure` - отдельная подписка не требуется!

---

### Подписка на каналы

**Запрос:**

```json
{
  "type": "subscribe",
  "channels": ["indicators", "ticks", "orderbook"],
  "timestamp": 1760785757877
}
```

**Ответ:**

```json
{
  "type": "subscribed",
  "channels": ["indicators", "ticks", "orderbook"],
  "message": "Successfully subscribed to 3 channel(s)",
  "timestamp": 1760785757900
}
```

---

### Отписка от каналов

**Запрос:**

```json
{
  "type": "unsubscribe",
  "channels": ["logs"],
  "timestamp": 1760785757877
}
```

**Ответ:**

```json
{
  "type": "unsubscribed",
  "channels": ["logs"],
  "message": "Successfully unsubscribed from 1 channel(s)",
  "timestamp": 1760785757900
}
```

---

## 📊 Формат данных по каналам

### 1. 📝 Канал `system` (автоматическая подписка)

Все критически важные сообщения о состоянии сервера и биржи.

**✅ Этот канал активен автоматически для всех клиентов!**

#### Примеры сообщений:

**Запуск сервера:**

```json
{
  "type": "log",
  "level": "success",
  "message": "✅ Движок успешно запущен и работает",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Подключение к бирже:**

```json
{
  "type": "log",
  "level": "success",
  "message": "✅ WebSocket соединение установлено",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Ping-Pong с биржей:**

```json
{
  "type": "log",
  "level": "info",
  "message": "🏓 PING отправлен [2025-01-18T10:23:45.123Z]",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

```json
{
  "type": "log",
  "level": "info",
  "message": "🏓 PONG получен [2025-01-18T10:23:45.200Z] задержка: 77ms",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Подписки на каналы биржи:**

```json
{
  "type": "log",
  "level": "success",
  "message": "✅ Успешная подписка на тикер ETH_USDT",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Синхронизация Order Book:**

```json
{
  "type": "log",
  "level": "info",
  "message": "🔄 Инициализация Order Book для ETH_USDT...",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

```json
{
  "type": "log",
  "level": "success",
  "message": "✅ Снапшот получен (ID: 12345678)",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

```json
{
  "type": "log",
  "level": "success",
  "message": "✅ Order Book синхронизирован (обновлений: 42)",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Переподключение:**

```json
{
  "type": "log",
  "level": "warn",
  "message": "⚠️ PONG не получен в течение 30 секунд",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

```json
{
  "type": "log",
  "level": "info",
  "message": "🔄 Переподключение к WebSocket...",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Подключение клиентов:**

```json
{
  "type": "log",
  "level": "info",
  "message": "🔌 Клиент подключен: client_123_abc (всего клиентов: 2)",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Категории в канале system:**

- Все сообщения с `category: "system"` - критически важные события
- Запуск/остановка сервера и компонентов
- Связь с биржей Gate.io (ping-pong, задержка, переподключения)
- Подписки на каналы биржи
- Синхронизация данных (Order Book)
- Управление клиентами

**Частота:** При возникновении событий

---

### 2. 📝 Канал `logs` (требует подписки)

Внутренние и отладочные логи сервера.

```json
{
  "type": "log",
  "level": "info",
  "message": "Индикатор рассчитан успешно",
  "source": "server",
  "category": "internal",
  "timestamp": 1760785757877
}
```

**Категории:**

- Все сообщения с `category: "internal"` - обычные логи
- Отладочная информация
- Расчёты индикаторов (если нужна детализация)
- Внутренние процессы

**Уровни логирования:**

- `info` - информационные сообщения
- `warn` - предупреждения
- `error` - ошибки
- `debug` - отладочная информация
- `success` - успешные операции

---

### 2. 📈 Канал `ticks`

Каждая сделка на бирже.

```json
{
  "type": "tick",
  "symbol": "ETH_USDT",
  "price": 2345.67,
  "volume": 123456.78,
  "timestamp": 1760785757877
}
```

**Поля:**

- `symbol` - торговая пара
- `price` - цена последней сделки
- `volume` - объем торгов за 24 часа
- `timestamp` - время получения тика

**Частота:** ~1-10 сообщений в секунду (зависит от активности рынка)

**Примечание:** Если нужна детальная информация о состоянии Order Book (объёмы, давление bid/ask), подпишитесь на канал `indicators` - индикатор `orderbook_pressure` содержит всё необходимое.

---

### 3. 💰 Канал `balance`

Обновления баланса (требуется аутентификация на бирже).

```json
{
  "type": "balance",
  "balances": [
    {
      "currency": "USDT",
      "available": 1000.5,
      "locked": 50.25
    },
    {
      "currency": "ETH",
      "available": 0.5,
      "locked": 0.0
    }
  ],
  "timestamp": 1760785757877
}
```

**Поля:**

- `currency` - валюта
- `available` - доступный баланс
- `locked` - заблокированный баланс (в открытых ордерах)

**Частота:** При изменении баланса (выполнение ордеров)

---

### 4. 🎯 Канал `indicators`

Данные всех индикаторов, включая **полную информацию об Order Book**.

#### 4.1 ⚡ Индикатор: `tick_speed`

Скорость тиков (активность рынка).

```json
{
  "type": "indicator",
  "name": "tick_speed",
  "data": {
    "ticksPerMinute": 125,
    "activityLevel": "NORMAL",
    "isSpike": false,
    "trend": "rising"
  },
  "timestamp": 1760785757877
}
```

**Поля:**

- `ticksPerMinute` - количество тиков в минуту (целое число)
- `activityLevel` - уровень активности:
  - `DEAD` - рынок мертв (< 20 t/min)
  - `LOW` - низкая активность (20-100 t/min)
  - `NORMAL` - нормальная активность (100-300 t/min)
  - `HIGH` - высокая активность (300-600 t/min)
  - `EXTREME` - экстремальная активность (> 600 t/min, возможен памп/дамп)
- `isSpike` - резкий всплеск активности (boolean)
- `trend` - тренд скорости:
  - `rising` - растет
  - `falling` - падает
  - `stable` - стабильна

**Частота:** Каждые 20 тиков (~5-20 секунд)

---

#### 4.2 📊 Индикатор: `orderbook_pressure`

Давление в стакане (соотношение bid/ask) и **полная информация об Order Book**.

**✅ Содержит ВСЕ данные Order Book - отдельная подписка не требуется!**

**❓ Зачем этот индикатор?**

- Показывает **направление давления** на рынке (покупатели vs продавцы)
- Содержит **все данные Order Book** (объёмы, проценты, спред)
- **Order Book синхронизируется автоматически** на сервере (OrderBookManager)
- Клиент получает **готовые рассчитанные метрики** каждые 1-2 секунды

```json
{
  "type": "indicator",
  "name": "orderbook_pressure",
  "data": {
    "bidVolume": 15234.56,
    "askVolume": 13456.78,
    "totalVolume": 28691.34,
    "bidPercent": 53.1,
    "askPercent": 46.9,
    "imbalance": 0.062,
    "direction": "BUY",
    "spread": 0.15,
    "spreadPercent": 0.0064
  },
  "timestamp": 1760785757877
}
```

**Поля:**

- `bidVolume` - объем bid в USDT (первые 10 уровней стакана)
- `askVolume` - объем ask в USDT (первые 10 уровней стакана)
- `totalVolume` - общий объем
- `bidPercent` - процент bid (0-100)
- `askPercent` - процент ask (0-100)
- `imbalance` - Order Book Imbalance (OBI):
  - `-1.0` до `-0.3` - сильное давление продаж (STRONG_SELL)
  - `-0.3` до `-0.1` - давление продаж (SELL)
  - `-0.1` до `0.1` - нейтрально (NEUTRAL)
  - `0.1` до `0.3` - давление покупок (BUY)
  - `0.3` до `1.0` - сильное давление покупок (STRONG_BUY)
- `direction` - направление давления (STRONG_SELL, SELL, NEUTRAL, BUY, STRONG_BUY)
- `spread` - спред между лучшими bid/ask (USDT)
- `spreadPercent` - спред в процентах от средней цены

**Частота:** Каждые 50 обновлений стакана (~1-2 секунды)

**💡 Как использовать:**

```javascript
// Определение тренда по давлению
if (data.direction === "STRONG_BUY" && data.imbalance > 0.4) {
  console.log("🟢 Сильное давление покупок - возможен рост!");
}

// Контроль спреда
if (data.spreadPercent > 0.1) {
  console.log("⚠️ Широкий спред - низкая ликвидность");
}

// Дисбаланс стакана
if (data.bidPercent > 60) {
  console.log("📊 Покупатели доминируют");
}
```

---

#### 4.3 📊 Индикатор: `volume_confirmation`

Подтверждение сигналов на основе роста объёмов.

**✅ Ключевая идея:** Сильное движение цены должно подтверждаться ростом объёма!

```json
{
  "type": "indicator",
  "name": "volume_confirmation",
  "data": {
    "signal": "STRONG_BUY",
    "volumeRatio": 2.35,
    "averageVolume": 125000.5,
    "currentVolume": 293751.18,
    "priceChange": 0.25,
    "isVolumeSpike": true,
    "isConfirmed": true
  },
  "timestamp": 1760785757877
}
```

**Поля:**

- `signal` - тип сигнала:
  - `STRONG_BUY` - сильный объём + рост цены (надёжный сигнал на покупку)
  - `BUY` - повышенный объём + рост цены (подтверждение покупки)
  - `STRONG_SELL` - сильный объём + падение цены (надёжный сигнал на продажу)
  - `SELL` - повышенный объём + падение цены (подтверждение продажи)
  - `NO_VOLUME` - движение без объёма (слабый сигнал, не торговать!)
  - `NEUTRAL` - нет подтверждения
- `volumeRatio` - отношение текущего объёма к среднему (2.35 = объём в 2.35 раза выше среднего)
- `averageVolume` - средний объём за последние 20 периодов
- `currentVolume` - текущий объём
- `priceChange` - изменение цены в % (положительное = рост, отрицательное = падение)
- `isVolumeSpike` - резкий всплеск объёма (> 2.25x от среднего)
- `isConfirmed` - сигнал подтверждён (объём достаточен + изменение цены значительное)

**Частота:** Каждые 20 тиков (~5-20 секунд)

**💡 Как использовать:**

```javascript
// Основная логика подтверждения сигналов
if (data.signal === "STRONG_BUY" && data.isConfirmed) {
  console.log("🟢🟢 Сильное подтверждение ПОКУПКИ объёмом!");
  console.log(`   Объём: ${data.volumeRatio.toFixed(2)}x от среднего`);
  console.log(`   Рост цены: ${data.priceChange.toFixed(2)}%`);
  // ДЕЙСТВИЕ: Открыть позицию на покупку
}

// Опасность: движение БЕЗ объёма
if (data.signal === "NO_VOLUME") {
  console.log("⚠️ Движение цены без объёма - слабый сигнал!");
  // ДЕЙСТВИЕ: Не торговать, ждать подтверждения
}

// Всплеск объёма
if (data.isVolumeSpike) {
  console.log("💥 Резкий всплеск объёма - возможно важное событие!");
}

// Комбинация с другими индикаторами
if (
  volumeConfirmation.signal === "STRONG_BUY" &&
  orderbookPressure.direction === "STRONG_BUY" &&
  tickSpeed.activityLevel === "HIGH"
) {
  console.log("🚀 ВСЕ индикаторы подтверждают ПОКУПКУ!");
  // ДЕЙСТВИЕ: Высокая вероятность роста, можно входить
}
```

---

#### 4.4 📈 Индикатор: `ema` (в разработке)

Экспоненциальная скользящая средняя.

```json
{
  "type": "indicator",
  "name": "ema",
  "data": {
    "symbol": "ETH_USDT",
    "period": 20,
    "value": 2345.67,
    "trend": "up"
  },
  "timestamp": 1760785757877
}
```

**Поля:**

- `symbol` - торговая пара
- `period` - период EMA (9, 20, 50, 200)
- `value` - текущее значение EMA
- `trend` - тренд относительно цены:
  - `up` - цена выше EMA (восходящий тренд)
  - `down` - цена ниже EMA (нисходящий тренд)
  - `flat` - цена на уровне EMA

**Частота:** При формировании новой свечи (зависит от таймфрейма)

---

#### 4.5 📉 Индикатор: `rsi` (в разработке)

Индекс относительной силы.

```json
{
  "type": "indicator",
  "name": "rsi",
  "data": {
    "symbol": "ETH_USDT",
    "period": 14,
    "value": 65.5,
    "zone": "neutral"
  },
  "timestamp": 1760785757877
}
```

**Поля:**

- `symbol` - торговая пара
- `period` - период RSI (обычно 14)
- `value` - значение RSI (0-100)
- `zone` - зона:
  - `oversold` - перепроданность (RSI < 30)
  - `neutral` - нейтральная зона (30-70)
  - `overbought` - перекупленность (RSI > 70)

**Частота:** При формировании новой свечи

---

## 🔗 Мониторинг состояния связи с биржей

Все сообщения о состоянии связи с Gate.io автоматически приходят через канал `system`.

**Вам НЕ нужно** подписываться на этот канал - он активен по умолчанию!

### Типичные сообщения:

**Успешное подключение:**

```json
{
  "type": "log",
  "level": "success",
  "message": "✅ WebSocket соединение установлено",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Ping-Pong с биржей:**

```json
{
  "type": "log",
  "level": "info",
  "message": "🏓 PING отправлен [2025-01-18T10:23:45.123Z]",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

```json
{
  "type": "log",
  "level": "info",
  "message": "🏓 PONG получен [2025-01-18T10:23:45.200Z] задержка: 77ms",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Потеря соединения:**

```json
{
  "type": "log",
  "level": "warn",
  "message": "⚠️ PONG не получен в течение 30 секунд",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

**Переподключение:**

```json
{
  "type": "log",
  "level": "info",
  "message": "🔄 Переподключение к WebSocket...",
  "source": "server",
  "category": "system",
  "timestamp": 1760785757877
}
```

### Извлечение задержки (latency):

Для мониторинга качества связи парсите сообщения PONG:

```javascript
if (message.category === "system" && message.message.includes("PONG")) {
  const latencyMatch = message.message.match(/задержка: (\d+)ms/);
  if (latencyMatch) {
    const latency = parseInt(latencyMatch[1]);
    console.log(`Задержка: ${latency}ms`);

    if (latency > 1000) {
      console.warn("⚠️ Высокая задержка!");
    }
  }
}
```

---

## ⚠️ Обработка ошибок

### Ошибка формата сообщения:

```json
{
  "type": "error",
  "error": "Invalid message format",
  "details": "Unexpected token in JSON",
  "timestamp": 1760785757877
}
```

### Неизвестный тип сообщения:

```json
{
  "type": "error",
  "error": "Unknown message type",
  "details": "Type 'unknown' is not supported",
  "timestamp": 1760785757877
}
```

---

## 📖 Примеры использования

### Пример 1: Получение системных сообщений (автоматически)

```javascript
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:8080");

ws.on("open", () => {
  console.log("✅ Подключено к серверу");
  // Канал 'system' УЖЕ активен! Не нужно подписываться
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());

  // Отслеживаем только system логи (все критичные события)
  if (message.type === "log" && message.category === "system") {
    console.log(`[SYSTEM] ${message.message}`);

    // Парсим задержку из PONG
    if (message.message.includes("PONG")) {
      const latencyMatch = message.message.match(/задержка: (\d+)ms/);
      if (latencyMatch) {
        console.log(`Latency: ${latencyMatch[1]}ms`);
      }
    }
  }
});
```

---

### Пример 2: Подписка на индикаторы и тики

```javascript
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:8080");

ws.on("open", () => {
  console.log("Подключено к серверу");

  // Подписываемся на индикаторы и тики
  ws.send(
    JSON.stringify({
      type: "subscribe",
      channels: ["indicators", "ticks"],
      timestamp: Date.now(),
    })
  );
});

ws.on("message", (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === "indicator") {
    console.log(`Индикатор: ${message.name}`, message.data);
  }

  if (message.type === "tick") {
    console.log(`Тик: ${message.symbol} @ ${message.price}`);
  }
});
```

---

### Пример 2: Мониторинг состояния соединения с биржей

```javascript
let lastPongTime = null;
let exchangeLatency = null;

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  // Отслеживаем только system логи
  if (message.type === 'log' && message.category === 'system') {

    if (message.message.includes('PONG')) {
      lastPongTime = Date.now();

      // Извлекаем задержку
      const latencyMatch = message.message.match(/задержка: (\d+)ms/);
      if (latencyMatch) {
        exchangeLatency = parseInt(latencyMatch[1]);
        console.log(`📡 Связь с биржей: ${exchangeLatency}ms`);

        if (exchangeLatency > 1000) {
          console.warn('⚠️ Высокая задержка!');
        }
      }
    }

    if (message.message.includes('Переподключение')) {
      console.warn('⚠️ Потеряна связь с биржей, переподключение...');
    }

    if (message.message.includes('соединение установлено')) {
      console.log('✅ Связь с биржей восстановлена');
    }
  }
});message.type === 'log' && message.category === 'exchange') {

    if (message.message.includes('PONG')) {
      lastPongTime = Date.now();

      // Извлекаем задержку
      const latencyMatch = message.message.match(/задержка: (\d+)ms/);
      if (latencyMatch) {
        exchangeLatency = parseInt(latencyMatch[1]);
        console.log(`📡 Связь с биржей: ${exchangeLatency}ms`);

        if (exchangeLatency > 1000) {
          console.warn('⚠️ Высокая задержка!');
        }
      }
    }

    if (message.message.includes('Переподключение')) {
      console.warn('⚠️ Потеряна связь с биржей, переподключение...');
    }

    if (message.message.includes('соединение установлено')) {
      console.log('✅ Связь с биржей восстановлена');
    }
  }
});

// Контроль таймаута PONG
setInterval(() => {
  if (lastPongTime && Date.now() - lastPongTime > 60000) {
    console.error('❌ Нет PONG от биржи более 60 секунд!');
  }
}, 10000);
```

---

### Пример 3: Визуализация Order Book через индикатор

```javascript
ws.on("message", (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === "indicator" && message.name === "orderbook_pressure") {
    const { bidPercent, askPercent, direction, imbalance, spread } =
      message.data;

    // ASCII бар
    const barWidth = 50;
    const bidWidth = Math.round((bidPercent / 100) * barWidth);
    const askWidth = barWidth - bidWidth;

    const bar = "█".repeat(bidWidth) + "|" + "█".repeat(askWidth);

    console.log(`🟢${bar}🔴`);
    console.log(
      `Direction: ${direction}, OBI: ${imbalance.toFixed(
        3
      )}, Spread: ${spread.toFixed(2)}`
    );
  }
});
```

---

## 🎯 Рекомендации для клиентской части

### 1. Управление подписками

- Канал `system` **активен автоматически** - не пытайтесь подписаться на него вручную
- Для торговых ботов рекомендуем: `indicators` (содержит Order Book + метрики), `ticks`, `balance`
- Для мониторинга: `system` уже активен (состояние сервера и биржи), добавьте `logs` для детальной информации
- Для разработки/отладки: подпишитесь на `logs`, `ticks`, `indicators` (канал `system` уже есть)

### 2. Категории логов

- `system` - запуск/остановка, подключения клиентов (канал `system`)
- `exchange` - связь с Gate.io, ping-pong, подписки (канал `system`)
- `internal` - остальные логи (канал `logs`, требует подписки)

### 3. Обработка отключений

- Реализуйте автоматическое переподключение
- При переподключении заново подписывайтесь на нужные каналы
- Канал `system` восстановится автоматически
- Храните состояние подписок локально

### 3. Ping-Pong

- Отправляйте PING каждые 30 секунд
- Если PONG не приходит 60 секунд - переподключайтесь
- Мониторьте задержку (latency)

### 4. Буферизация данных

- Индикаторы приходят не синхронно
- Сохраняйте последние значения локально
- Используйте timestamp для синхронизации

### 5. Производительность

- Не логируйте каждый тик на экран (слишком много)
- Агрегируйте данные перед отображением
- Используйте debounce для частых обновлений

---

## 🎯 Торговая стратегия TVP

Сервер включает встроенную стратегию **TVP (Tick-Volume-Pressure)** на основе трёх индикаторов.

### Принцип работы:

Стратегия анализирует **три столпа**:

1. **Tick Speed** - активность рынка
2. **Volume Confirmation** - подтверждение объёмом
3. **Order Book Pressure** - давление в стакане

Сигнал генерируется только когда **минимум 2 из 3** индикаторов подтверждают направление.

### Режимы работы:

| Режим          | Описание                    | Мин. подтверждений | Риск    |
| -------------- | --------------------------- | ------------------ | ------- |
| `conservative` | Только сильные сигналы      | 3/3                | Низкий  |
| `normal`       | Баланс надёжности и частоты | 2/3                | Средний |
| `aggressive`   | Больше сигналов             | 1/3                | Высокий |

### Пример торговой логики:

```javascript
// BUY сигнал в режиме NORMAL
if (
  volumeConfirmation.signal === "STRONG_BUY" && // ✅ 1. Объём подтверждает
  orderBookPressure.direction === "BUY" && // ✅ 2. Давление покупок
  tickSpeed.activityLevel === "NORMAL" // ✅ 3. Нормальная активность
) {
  // 2 из 3 подтверждений → СИГНАЛ BUY
}

// SELL сигнал в режиме CONSERVATIVE
if (
  volumeConfirmation.signal === "STRONG_SELL" && // ✅ 1. Сильный объём продаж
  orderBookPressure.direction === "STRONG_SELL" && // ✅ 2. Сильное давление продаж
  tickSpeed.activityLevel === "HIGH" // ✅ 3. Высокая активность
) {
  // 3 из 3 подтверждений → СИГНАЛ SELL
}
```

### Фильтры:

Стратегия **НЕ торгует** если:

- ❌ Рынок мёртв (`activityLevel === 'DEAD'`)
- ❌ Движение без объёма (`signal === 'NO_VOLUME'`)
- ❌ Недостаточно данных (< 100 тиков)

---

## 📚 Следующие шаги

После реализации базового клиента:

1. Добавить визуализацию терминала с `terminal-kit`
2. Реализовать дашборд с индикаторами
3. Добавить алерты на основе индикаторов
4. Реализовать команды управления сервером

---

## 🔧 Технические детали

- **Протокол:** WebSocket (RFC 6455)
- **Формат данных:** JSON
- **Кодировка:** UTF-8
- **Максимальный размер сообщения:** 1MB
- **Reconnect timeout:** 5 секунд
- **Ping interval (сервер → биржа):** 15 секунд
- **Pong timeout (сервер → биржа):** 30 секунд
