import { MarketType, FeedType, ConditionType, OrderStatus, FeedOrder, FeederRank, FeedHistoryItem } from './types';

export const MOCK_ORDERS: FeedOrder[] = [
  {
    orderId: 'ORD-12345',
    symbol: '600519.SH',
    market: MarketType.CN_STOCK,
    country: 'CN',
    exchange: 'SSE',
    feedType: FeedType.SETTLEMENT,
    notionalAmount: 500000,
    requiredFeeders: 5,
    consensusThreshold: '3/5',
    specialConditions: [
      { type: ConditionType.CONSECUTIVE_LIMIT, description: 'Three consecutive limit moves require manual confirmation.', highlightLevel: 'critical' },
      { type: ConditionType.EX_DIVIDEND, description: 'Ex-dividend adjustment required before settlement.', highlightLevel: 'warning' },
    ],
    rewardAmount: 25,
    status: OrderStatus.OPEN,
    timeRemaining: 210,
  },
  {
    orderId: 'ORD-12346',
    symbol: 'BTC/USDT',
    market: MarketType.CRYPTO,
    country: 'GLOBAL',
    exchange: 'BINANCE',
    feedType: FeedType.DYNAMIC,
    notionalAmount: 50000,
    requiredFeeders: 3,
    consensusThreshold: '2/3',
    specialConditions: [
      { type: ConditionType.VOLATILITY_HIGH, description: 'Volatility has exceeded the normal intraday threshold.', highlightLevel: 'warning' },
    ],
    rewardAmount: 10,
    status: OrderStatus.GRABBED,
    timeRemaining: 145,
  },
  {
    orderId: 'ORD-12347',
    symbol: 'AAPL',
    market: MarketType.US_STOCK,
    country: 'US',
    exchange: 'NASDAQ',
    feedType: FeedType.INITIAL,
    notionalAmount: 120000,
    requiredFeeders: 3,
    consensusThreshold: '2/3',
    specialConditions: [],
    rewardAmount: 15,
    status: OrderStatus.OPEN,
    timeRemaining: 400,
  },
  {
    orderId: 'ORD-12348',
    symbol: 'NVDA',
    market: MarketType.US_STOCK,
    country: 'US',
    exchange: 'NASDAQ',
    feedType: FeedType.SETTLEMENT,
    notionalAmount: 2500000,
    requiredFeeders: 7,
    consensusThreshold: '5/7',
    specialConditions: [
      { type: ConditionType.VOLATILITY_HIGH, description: 'Earnings report expected shortly.', highlightLevel: 'critical' },
    ],
    rewardAmount: 150,
    status: OrderStatus.OPEN,
    timeRemaining: 300,
  },
];

export const MOCK_HISTORY: FeedHistoryItem[] = [
  { id: '1', symbol: 'TSLA', price: 184.52, deviation: 0.01, reward: 15, timestamp: Date.now() - 3600000 },
  { id: '2', symbol: 'ETH/USDT', price: 2451.2, deviation: 0.03, reward: 12, timestamp: Date.now() - 7200000 },
  { id: '3', symbol: '600036.SH', price: 32.15, deviation: 0.0, reward: 25, timestamp: Date.now() - 10800000 },
  { id: '4', symbol: 'GOLD', price: 2150.3, deviation: 0.05, reward: 30, timestamp: Date.now() - 86400000 },
];

export const MOCK_LEADERBOARD = [
  { address: '0x88...f123', nickname: 'OracleMaster', rank: FeederRank.S, xp: 185200, feeds: 1240, accuracy: 99.8 },
  { address: '0x32...a987', nickname: 'FlashTrader', rank: FeederRank.A, xp: 92400, feeds: 850, accuracy: 99.1 },
  { address: '0x12...b456', nickname: 'DataSentinel', rank: FeederRank.A, xp: 81200, feeds: 720, accuracy: 98.9 },
  { address: '0x77...c221', nickname: 'ZenFeeder', rank: FeederRank.B, xp: 45000, feeds: 410, accuracy: 99.5 },
  { address: '0x44...d110', nickname: 'BullRunner', rank: FeederRank.B, xp: 38000, feeds: 320, accuracy: 97.4 },
];

export const RANK_COLORS = {
  [FeederRank.F]: 'text-slate-400',
  [FeederRank.E]: 'text-emerald-400',
  [FeederRank.D]: 'text-blue-400',
  [FeederRank.C]: 'text-indigo-400',
  [FeederRank.B]: 'text-purple-400',
  [FeederRank.A]: 'text-amber-400',
  [FeederRank.S]: 'text-rose-400',
};

export const MARKET_ICONS = {
  [MarketType.CRYPTO]: 'CR',
  [MarketType.US_STOCK]: 'US',
  [MarketType.CN_STOCK]: 'CN',
  [MarketType.HK_STOCK]: 'HK',
  [MarketType.FOREX]: 'FX',
  [MarketType.COMMODITY]: 'CM',
};

export const STATUS_CONFIG = {
  [OrderStatus.OPEN]: { label: 'Signal Open', color: 'text-slate-500 bg-slate-50 border-slate-200', icon: 'OPEN', animate: false },
  [OrderStatus.GRABBED]: { label: 'Secured', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: 'LOCK', animate: false },
  [OrderStatus.FEEDING]: { label: 'Syncing', color: 'text-cyan-600 bg-cyan-50 border-cyan-200', icon: 'SYNC', animate: true },
  [OrderStatus.CONSENSUS]: { label: 'Quorum', color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: 'QRM', animate: true },
  [OrderStatus.SETTLED]: { label: 'Finalized', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: 'OK', animate: false },
  [OrderStatus.DISPUTED]: { label: 'Conflict', color: 'text-rose-600 bg-rose-50 border-rose-200', icon: 'ERR', animate: true },
  [OrderStatus.CANCELLED]: { label: 'Cancelled', color: 'text-gray-500 bg-gray-50 border-gray-300', icon: 'OFF', animate: false },
  [OrderStatus.EXPIRED]: { label: 'Expired', color: 'text-orange-500 bg-orange-50 border-orange-200', icon: 'EXP', animate: false },
};

export const getReferenceData = (symbol: string) => {
  const prices: Record<string, number> = {
    '600519.SH': 1750,
    'BTC/USDT': 68000,
    'AAPL': 195,
    'NVDA': 125,
    'TSLA': 185,
    'ETH/USDT': 2450,
    GOLD: 2150,
  };

  return prices[symbol] || 100;
};
