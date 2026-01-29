# Feed Engine Backend

去中心化人工预言机网络后端服务

## 技术栈

- Node.js 20 LTS + TypeScript
- Express.js
- PostgreSQL/SQLite + Prisma ORM
- Redis + Socket.io
- ethers.js v6

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env 填写数据库和 Redis 连接信息

# 3. 生成 Prisma 客户端
npm run db:generate

# 4. 推送数据库结构
npm run db:push

# 5. 启动开发服务器
npm run dev
```

## API 接口

### 认证 `/api/auth`
- `POST /connect` - 钱包签名登录
- `POST /register` - 喂价员注册
- `GET /profile` - 获取用户信息

### 订单 `/api/orders`
- `GET /` - 获取订单列表
- `GET /:id` - 获取订单详情
- `POST /:id/grab` - 抢单
- `POST /:id/submit` - 提交价格哈希 (Commit)
- `POST /:id/reveal` - 揭示价格 (Reveal)

### 喂价员 `/api/feeders`
- `GET /me` - 获取当前喂价员信息
- `PUT /preferences` - 更新偏好设置
- `GET /history` - 获取喂价历史
- `GET /leaderboard` - 获取排行榜

### 仲裁 `/api/arbitration`
- `GET /cases` - 获取仲裁案件列表
- `GET /cases/:id` - 获取案件详情
- `POST /cases` - 创建仲裁案件
- `POST /cases/:id/pay-deposit` - 支付押金
- `POST /cases/:id/vote` - 仲裁员投票
- `POST /cases/:id/appeal` - 发起 DAO 申诉
- `POST /appeals/:id/vote` - DAO 投票

### 质押 `/api/staking`
- `GET /info` - 获取质押信息
- `POST /stake` - 质押代币/NFT
- `POST /request-unlock` - 申请解锁（30天）
- `POST /withdraw` - 提取已解锁资产
- `GET /licenses` - 获取 NFT 执照列表
- `GET /requirements` - 获取各等级质押要求

### 管理后台 `/api/admin`
- `GET /stats` - 系统统计数据
- `POST /orders` - 创建喂价订单
- `POST /orders/batch` - 批量创建订单
- `PUT /orders/:id/cancel` - 取消订单
- `GET /feeders` - 喂价员列表
- `PUT /feeders/:id/ban` - 封禁喂价员
- `PUT /feeders/:id/unban` - 解封喂价员
- `POST /licenses/mint` - 铸造 NFT 执照

### 链上交互 `/api/chain`
- `GET /status` - 链上配置状态
- `POST /sync-stake` - 同步链上质押
- `POST /sync-nfts` - 同步 NFT 所有权
- `POST /verify-nft` - 验证 NFT 所有权
- `POST /submit-price` - 提交价格到链上
- `POST /reveal-price` - 揭示价格到链上

### WebSocket 事件
| 事件 | 说明 |
|-----|-----|
| `order:new` | 新订单推送 |
| `order:grabbed` | 订单被抢通知 |
| `order:consensus` | 共识达成通知 |
| `order:countdown` | 倒计时更新 |
| `arbitration:new` | 新仲裁案件 |
| `arbitration:vote` | 仲裁投票 |
| `arbitration:resolved` | 仲裁结果 |
| `chain:*` | 链上事件同步 |

## 项目结构

```
src/
├── config/           # 配置（数据库连接）
├── controllers/      # API 路由控制器
│   ├── auth.controller.ts
│   ├── order.controller.ts
│   ├── feeder.controller.ts
│   ├── arbitration.controller.ts
│   ├── staking.controller.ts
│   ├── admin.controller.ts
│   └── chain.controller.ts
├── services/         # 业务逻辑
│   ├── matching.service.ts
│   ├── consensus.service.ts
│   ├── rank.service.ts
│   ├── ipfs.service.ts
│   ├── blockchain.service.ts
│   └── event-listener.service.ts
├── websocket/        # WebSocket 处理
└── index.ts          # 应用入口
```

## 环境变量

```env
NODE_ENV=development
PORT=3001
DATABASE_URL="file:./dev.db"
REDIS_URL="redis://localhost:6379"
FRONTEND_URL="http://localhost:5173"
JWT_SECRET=your-secret
PINATA_API_KEY=
PINATA_SECRET_KEY=
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
FEED_ENGINE_CONTRACT=
STAKING_CONTRACT=
FEEDER_LICENSE_NFT_CONTRACT=
ADMIN_ADDRESSES=0x...
```
