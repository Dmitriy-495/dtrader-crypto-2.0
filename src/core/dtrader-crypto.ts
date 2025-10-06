import WebSocket from "ws";

interface WebSocketMessage {
  id: number;
  method: string;
  params?: any[];
  result?: any;
  error?: any;
}

export class DTraderCore {
  private ws: WebSocket | null = null;
  private isRunning: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly WS_URL = "wss://ws.gate.io/v3/";

  constructor() {
    console.log("🎯 DTrader Core initialized");
  }

  async start(): Promise<void> {
    console.log("🚀 Starting DTrader Core...");
    this.isRunning = true;

    // Подключаемся к WebSocket
    await this.connectWebSocket();

    // Запускаем основной цикл
    this.startMainLoop();
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping DTrader Core...");
    this.isRunning = false;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    if (this.ws) {
      this.ws.close();
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to WebSocket: ${this.WS_URL}`);

      this.ws = new WebSocket(this.WS_URL);

      this.ws.on("open", () => {
        console.log("✅ WebSocket connected successfully");
        this.setupWebSocketHandlers();
        this.startPingPong();
        resolve();
      });

      this.ws.on("error", (error) => {
        console.error("❌ WebSocket connection error:", error);
        reject(error);
      });

      this.ws.on("close", () => {
        console.log("🔌 WebSocket connection closed");
        this.handleReconnection();
      });
    });
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    // Обработка входящих сообщений
    this.ws.on("message", (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error("❌ Error parsing WebSocket message:", error);
      }
    });
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    // Обработка pong ответа - подтверждение активного подключения
    if (message.result === "pong") {
      console.log("🏓 Pong received - connection active");
      return;
    }

    // Логируем другие сообщения (для отладки)
    if (message.method && message.method !== "server.pong") {
      console.log("📥 WebSocket message:", {
        method: message.method,
        id: message.id,
      });
    }
  }

  private startPingPong(): void {
    // Ping каждые 15 секунд для поддержания соединения
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 15000);

    // Первый ping через 1 секунду после подключения
    setTimeout(() => this.sendPing(), 1000);
  }

  private sendPing(): void {
    if (!this.ws) return;

    const pingMessage: WebSocketMessage = {
      id: Date.now(),
      method: "server.ping",
      params: [],
    };

    try {
      this.ws.send(JSON.stringify(pingMessage));
      console.log("📤 Ping sent");
    } catch (error) {
      console.error("❌ Error sending ping:", error);
    }
  }

  private handleReconnection(): void {
    if (!this.isRunning) return;

    console.log("🔄 Attempting to reconnect in 5 seconds...");

    setTimeout(async () => {
      console.log("🔄 Reconnecting...");
      try {
        await this.connectWebSocket();
      } catch (error) {
        console.error("❌ Reconnection failed:", error);
        this.handleReconnection();
      }
    }, 5000);
  }

  private startMainLoop(): void {
    console.log("🔄 Starting main system loop...");

    const mainLoop = () => {
      if (!this.isRunning) return;

      // Основная логика торгового бота будет здесь
      // Сейчас просто ждем следующей итерации

      // Следующий цикл через 10 секунд
      setTimeout(mainLoop, 10000);
    };

    // Запускаем первый цикл
    mainLoop();
  }
}
