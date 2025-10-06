export interface GateIOConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export interface CurrencyPair {
  id: string;
  base: string;
  quote: string;
  fee: string;
  min_base_amount: string;
  min_quote_amount: string;
  amount_precision: number;
  precision: number;
  trade_status: string;
  sell_start: number;
  buy_start: number;
}
