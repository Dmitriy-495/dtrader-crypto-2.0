/**
 * dtrader-crypto-2.0 - Серверная часть торгового бота
 * Точка входа в приложение
 */

import * as dotenv from 'dotenv';
import { GateIO, SpotBalance } from './GateIO';
import { DTrader } from './DTrader';
import { LogBroadcaster } from './core/LogBroadcaster';
import { Logger } from './core/Logger';

// ============================================================================
// ЗАГРУЗКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
// ============================================================================

// Загружаем переменные из файла .env
dotenv.config();

// Проверяем наличие обязательных переменных
const GATE_API_KEY = process.env.GATE_API_KEY;
const GATE_API_SECRET = process.env.GATE_API_SECRET;
const GATE_API_URL = process.env.GATE_API_URL || 'https://api.gateio.ws';
const GATE_WS_URL = process.env.GATE_WS_URL || 'wss://api.gateio.ws/ws/v4/';

// Интервалы из конфигурации (в секундах, конвертируем в миллисекунды)
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL || '15') * 1000;

// Order Book конфигурация
const ORDER_BOOK_SYMBOL = process.env.ORDER_BOOK_SYMBOL || 'ETH_USDT';
const ORDER_BOOK_DEPTH = parseInt(process.env.ORDER_BOOK_DEPTH || '20');

// Log Broadcasting конфигурация
const LOG_BROADCAST_ENABLED = process.env.LOG_BROADCAST_ENABLED === 'true';
const LOG_BROADCAST_PORT = parseInt(process.env.LOG_BROADCAST_PORT || '8080');

if (!GATE_API_KEY || !GATE_API_SECRET) {
  console.error('❌ Ошибка: Не заданы GATE_API_KEY или GATE_API_SECRET в .env файле!');
  process.exit(1);
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Форматирует и выводит балансы в консоль красиво
 * 
 * @param balances - Массив балансов от API
 */
function displayBalances(balances: SpotBalance[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('💰 БАЛАНС СПОТОВОГО КОШЕЛЬКА GATE.IO');
  console.log('='.repeat(70));
  
  if (balances.length === 0) {
    console.log('   Балансы отсутствуют или равны нулю');
  } else {
    // Фильтруем только ненулевые балансы для удобства
    const nonZeroBalances = balances.filter(
      b => parseFloat(b.available) > 0 || parseFloat(b.locked) > 0
    );
    
    if (nonZeroBalances.length === 0) {
      console.log('   Все балансы равны нулю');
    } else {
      console.log('\n   Валюта       Доступно              В заказах            Всего');
      console.log('   ' + '-'.repeat(66));
      
      nonZeroBalances.forEach(balance => {
        const currency = balance.currency.padEnd(12);
        const available = parseFloat(balance.available).toFixed(8).padStart(20);
        const locked = parseFloat(balance.locked).toFixed(8).padStart(20);
        const total = (
          parseFloat(balance.available) + parseFloat(balance.locked)
        ).toFixed(8).padStart(20);
        
        console.log(`   ${currency} ${available}  ${locked}  ${total}`);
      });
    }
  }
  
  console.log('='.repeat(70) + '\n');
}

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================================

/**
 * Основная функция приложения
 */
async function main(): Promise<void> {
  console.clear(); // Очистка экрана при запуске
  
  console.log('\n🚀 Запуск dtrader-crypto-2.0 [Server v1.0]');
  console.log('📍 Подключение к Gate.io API...');
  console.log(`📍 REST API URL: ${GATE_API_URL}`);
  console.log(`📍 WebSocket URL: ${GATE_WS_URL}`);
  console.log(`📍 Ping интервал: ${PING_INTERVAL / 1000}с`);
  
  try {
    // Инициализируем LogBroadcaster и Logger
    let logBroadcaster: LogBroadcaster | undefined;
    let logger: Logger | undefined;
    
    if (LOG_BROADCAST_ENABLED) {
      logBroadcaster = new LogBroadcaster({
        port: LOG_BROADCAST_PORT,
        enabled: LOG_BROADCAST_ENABLED
      });
      
      logger = new Logger();
      
      // Запускаем LogBroadcaster
      logBroadcaster.start();
      
      // Запускаем перехват console
      logger.startIntercepting();
    }
    
    // Создаем экземпляр класса GateIO для REST API
    const gateio = new GateIO({
      apiKey: GATE_API_KEY!,
      apiSecret: GATE_API_SECRET!,
      apiUrl: GATE_API_URL
    });
    
    // Получаем и выводим баланс для проверки REST API подключения
    console.log('\n📡 Проверка REST API: запрос баланса...');
    
    try {
      const balances = await gateio.getSpotBalance();
      displayBalances(balances);
      console.log('✅ REST API работает успешно!');
    } catch (error: any) {
      console.error('❌ Ошибка получения баланса:', error.message);
      console.log('⚠️  Проверьте API ключи в .env файле');
      console.log('⚠️  Убедитесь что ключи имеют права на чтение баланса');
      process.exit(1);
    }
    
    // Создаем экземпляр движка с Order Book и Log Broadcasting
    const dtrader = new DTrader({
      gateio: gateio,
      wsUrl: GATE_WS_URL,
      pingInterval: PING_INTERVAL,
      orderBookSymbol: ORDER_BOOK_SYMBOL,
      orderBookDepth: ORDER_BOOK_DEPTH,
      logBroadcaster: logBroadcaster,
      logger: logger
    });
    
    // Запускаем движок
    await dtrader.start();
    
    // Обработка сигналов для корректного завершения
    process.on('SIGINT', async () => {
      console.log('\n\n⚠️  Получен сигнал SIGINT (Ctrl+C)');
      await dtrader.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n\n⚠️  Получен сигнал SIGTERM');
      await dtrader.stop();
      process.exit(0);
    });
    
    // Движок работает в бесконечном цикле, пока не будет остановлен
    console.log('💡 Движок работает. Для остановки нажмите Ctrl+C\n');
    
  } catch (error: any) {
    console.error('\n❌ Критическая ошибка в работе программы:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

// ============================================================================
// ТОЧКА ВХОДА
// ============================================================================

// Запускаем главную функцию
main();