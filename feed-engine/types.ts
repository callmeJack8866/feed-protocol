
export enum MarketType {
  CRYPTO = 'CRYPTO',
  US_STOCK = 'US_STOCK',
  CN_STOCK = 'CN_STOCK',
  HK_STOCK = 'HK_STOCK',
  FOREX = 'FOREX',
  COMMODITY = 'COMMODITY'
}

export enum FeedType {
  INITIAL = 'INITIAL',
  DYNAMIC = 'DYNAMIC',
  SETTLEMENT = 'SETTLEMENT',
  ARBITRATION = 'ARBITRATION'
}

export enum ConditionType {
  LIMIT_UP = 'limit_up',
  LIMIT_DOWN = 'limit_down',
  CONSECUTIVE_LIMIT = 'consecutive_limit',
  SUSPENSION = 'suspension',
  PRICE_ADJUSTMENT = 'price_adjustment',
  EX_DIVIDEND = 'ex_dividend',
  VOLATILITY_HIGH = 'volatility_high',
  SPECIAL_TREATMENT = 'special_treatment'
}

export interface SpecialCondition {
  type: ConditionType;
  description: string;
  highlightLevel: "normal" | "warning" | "critical";
}

export enum OrderStatus {
  OPEN = 'OPEN',
  GRABBED = 'GRABBED',
  FEEDING = 'FEEDING',
  CONSENSUS = 'CONSENSUS',
  SETTLED = 'SETTLED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

export enum FeederRank {
  F = 'F', E = 'E', D = 'D', C = 'C', B = 'B', A = 'A', S = 'S'
}

export interface FeedOrder {
  id?: string;              // 后端 DB id
  orderId: string;
  symbol: string;
  market: MarketType;
  country: string;
  exchange: string;
  feedType: FeedType;
  notionalAmount: number;
  requiredFeeders: number;
  consensusThreshold: string;
  specialConditions: SpecialCondition[];
  rewardAmount: number;
  status: OrderStatus;
  timeRemaining: number; // seconds
  sourceProtocol?: string; // 来源协议 (NST, etc.)
  // NST 订单详情扩展字段
  underlyingName?: string;   // 标的名称
  underlyingCode?: string;   // 标的代码
  direction?: string;        // 方向 (Call/Put)
  strikePrice?: number;      // 行权价
  expiryTimestamp?: number;  // 到期时间戳
  refPrice?: string;         // 参考价格
  externalOrderId?: string;  // NST 链上 orderId
}

export interface ArbitrationCase extends FeedOrder {
  disputeReason: string;
  submittedPrices: { feeder: string; price: number; timestamp: number }[];
  evidenceUrl: string;
  votes: { up: number; down: number };
}

export interface FeederProfile {
  address: string;
  nickname: string;
  rank: FeederRank;
  xp: number;
  totalFeeds: number;
  accuracyRate: number;
  balanceFEED: number;
  balanceUSDT: number;
  balanceNative?: number;
  history: FeedHistoryItem[];
  stakedAmount: number;
  stakeType: 'FEED' | 'USDT' | 'NFT';
}

export interface FeedHistoryItem {
  id: string;
  symbol: string;
  price: number;
  deviation: number;
  reward: number;
  timestamp: number;
}

export type ViewType =
  | 'Quest Hall'
  | 'Dashboard'
  | 'Leaderboard'
  | 'Inventory'
  | 'Achievements'
  | 'Training Center'
  | 'Staking'
  | 'Arbitration';

export interface TrainingCourse {
  id: string;
  title: string;
  category: string;
  xpReward: number;
  status: 'locked' | 'available' | 'completed';
  description: string;
}
