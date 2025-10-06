export interface WebSocketMessage {
  id: number;
  method: string;
  params?: any[];
  result?: any;
  error?: any;
}

export interface SystemStatus {
  isConnected: boolean;
  lastPing: Date | null;
  lastPong: Date | null;
}
