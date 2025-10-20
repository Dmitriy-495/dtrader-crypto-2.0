# dtrader-crypto-2.0 - Торговый бот для Gate.io

Консольный торговый бот для криптовалютной биржи Gate.io.

**Стек:** NodeJS + TypeScript

---

## 📋 Структура проекта

Приложение состоит из двух частей:

### 1. Серверная часть (этот репозиторий)

Работает на удаленном VPS в режиме демона и выполняет:

- Подключение к бирже по протоколам REST API & WebSocket
- Получение и накопление торговых данных, балансов
- Анализ данных, расчет индикаторов согласно стратегии
- Генерация торговых сигналов
- Передача данных клиентам через WebSocket

### 2. Клиентская часть

Работает на локальных компьютерах с `terminal-kit`:

- Соединение с сервером по REST API & WebSocket
- Прием и отображение данных в терминале
- Отправка команд управления сервером

---

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка

Создай файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Заполни API ключи Gate.io:

```env
GATE_API_KEY=your_api_key_here
GATE_API_SECRET=your_api_secret_here
```

Получить ключи: https://www.gate.io/myaccount/apiv4keys

### 3. Запуск в режиме разработки

```bash
npm run dev
```

**✨ С nodemon:** Автоматическая перезагрузка при изменении файлов!

- Редактируй код → nodemon перезапустит автоматически
- Для ручной перезагрузки набери `rs` и нажми Enter

### 4. Сборка и запуск в продакшене

```bash
npm run build
npm start
```

### 5. Запуск через PM2 (на VPS)

```bash
npm run pm2:start    # Запуск
npm run pm2:stop     # Остановка
npm run pm2:restart  # Перезапуск
npm run pm2:logs     # Логи
npm run pm2:status   # Статус
npm run pm2:monit    # Мониторинг
```

---

## 📊 Индикаторы

### 1. ⚡ Tick Speed

Измеряет активность рынка (количество сделок в минуту).

### 2. 📊 Volume Confirmation

Подтверждает движения цены ростом объёма.

### 3. 📖 Order Book Pressure

Анализирует давление в стакане (bid/ask соотношение).

---

## 🎯 Стратегия TVP

**TVP (Tick-Volume-Pressure)** - комбинированная стратегия на основе трёх индикаторов.

### Режимы работы:

| Режим        | Подтверждений | Риск    | Сигналов |
| ------------ | ------------- | ------- | -------- |
| Conservative | 3/3           | Низкий  | Мало     |
| Normal       | 2/3           | Средний | Средне   |
| Aggressive   | 1/3           | Высокий | Много    |

Настройки: `src/strategy/tvp/settings.json`

Документация: `src/strategy/tvp/README.md`

---

## 📡 WebSocket API

Сервер предоставляет WebSocket API для клиентов на порту `8080` (по умолчанию).

### Доступные каналы:

- `system` - Системные сообщения (автоматически)
- `logs` - Логи сервера
- `ticks` - Тиковые данные
- `indicators` - Индикаторы (tick_speed, volume_confirmation, orderbook_pressure)
- `balance` - Обновления баланса

Полная документация: `CLIENT_API.md`

---

## 🔧 Команды разработки

```bash
npm run dev          # Разработка с автоперезагрузкой (nodemon)
npm run build        # Компиляция TypeScript
npm run watch        # Компиляция в режиме watch
npm start            # Запуск скомпилированного кода
```

### Nodemon команды:

Во время работы `npm run dev`:

- `rs` + Enter - ручная перезагрузка
- `Ctrl+C` - остановка

---

## 📁 Структура проекта

```
src/
  index.ts              # Точка входа
  DTrader.ts            # Движок
  GateIO.ts             # Работа с Gate.io API
  types.ts              # Типы TypeScript

  core/
    BroadcastManager.ts # WebSocket сервер для клиентов
    Logger.ts           # Логирование с трансляцией
    OrderBookManager.ts # Управление Order Book

  indicators/
    TickSpeedIndicator.ts           # Скорость тиков
    VolumeConfirmationIndicator.ts  # Подтверждение объёмом
    OrderBookPressureIndicator.ts   # Давление в стакане

  strategy/
    BaseStrategy.ts     # Базовый класс стратегии
    tvp/
      TVPStrategy.ts    # Стратегия TVP
      settings.json     # Настройки стратегии
      README.md         # Документация TVP
```

---

## ⚙️ Конфигурация

### Переменные окружения (.env):

```env
# API ключи Gate.io
GATE_API_KEY=your_api_key
GATE_API_SECRET=your_api_secret

# Настройки подключения
GATE_API_URL=https://api.gateio.ws
GATE_WS_URL=wss://api.gateio.ws/ws/v4/

# Интервалы
PING_INTERVAL=15

# Order Book
ORDER_BOOK_SYMBOL=ETH_USDT
ORDER_BOOK_DEPTH=20

# Трансляция логов
LOG_BROADCAST_ENABLED=true
LOG_BROADCAST_PORT=8080

# Режим (production/testnet)
MODE=production
```

---

## 🧪 Тестирование

### Тест WebSocket сервера:

```bash
wscat -c ws://localhost:8080
```

Подписка на индикаторы:

```json
{ "type": "subscribe", "channels": ["indicators"], "timestamp": 1234567890 }
```

### Тест стратегии:

```bash
node test-tvp-live.js
```

---

## 📚 Документация

- `CLIENT_API.md` - WebSocket API для клиентов
- `src/strategy/tvp/README.md` - Документация стратегии TVP

---

## ⚠️ Дисклеймер

Этот проект разработан **только для образовательных целей**.

- ❌ Не является финансовой рекомендацией
- ❌ Не гарантирует прибыль
- ✅ Используйте на свой страх и риск
- ✅ Тестируйте на демо-счёте перед реальной торговлей

---

## 📝 Changelog

### v1.0.0

- ✅ Базовая архитектура сервера
- ✅ Подключение к Gate.io (REST & WebSocket)
- ✅ Три индикатора (TickSpeed, VolumeConfirmation, OrderBookPressure)
- ✅ Стратегия TVP с тремя режимами
- ✅ WebSocket API для клиентов
- ✅ Система логирования с трансляцией
- ✅ Автоматическая перезагрузка в dev режиме (nodemon)

---

## 👨‍💻 Разработка

Проект разрабатывается для личного использования.

**Стек:**

- Node.js 20+
- TypeScript 5.3+
- WebSocket (ws)
- Axios
- PM2 (для продакшена)
- Nodemon (для разработки)
