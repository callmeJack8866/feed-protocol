# FeedEngine 项目修改优化方案

> **审核时间**: 2026-03-11  
> **涉及范围**: 后端 API、事件监听、前端数据流、WebSocket、与 NST 交互  
> **执行方**: FeedEngine 项目侧（另一个 AI 执行）  
> **上下文**: FeedEngine 是独立的去中心化喂价协议平台，与 NST Options OTC 协议集成

---

## 项目现状概述

### 目录结构
```
FeedEngine/
├── feed-engine/                  # 前端 (React + Vite, :5174)
│   ├── App.tsx                   # 主应用 — 使用 MOCK 数据 ❌
│   ├── store.ts                  # Zustand 三个 Store
│   ├── hooks/useData.ts          # 后端 API hooks（存在但未在 App 中使用）
│   ├── services/api.ts           # API 服务
│   ├── services/transform.ts     # 数据转换
│   ├── services/websocket.ts     # WebSocket 实时更新
│   └── components/               # UI 组件
├── feed-engine-backend/          # 后端 (Express + Prisma + SQLite, :3001)
│   ├── src/index.ts              # 入口
│   ├── src/controllers/          # 11 个控制器
│   ├── src/services/
│   │   ├── blockchain.service.ts # 合约地址 + ABI
│   │   └── event-listener.service.ts  # 链上事件监听
│   ├── src/config/               # 数据库/Redis配置
│   └── prisma/dev.db             # SQLite 开发数据库
└── contracts/                    # FeedEngine 自己的链上合约（已部署）
```

### 关键合约地址 (BSC Testnet)
| 合约 | 地址 | 来源 |
|------|------|------|
| FeedEngine | 0x4E5b...c420 | FeedEngine 自有 |
| FeedConsensus | 0x7fd1...4703 | FeedEngine 自有 |
| RewardPenalty | 0x02D8...babA | FeedEngine 自有 |
| FEEDToken | 0xD07a...1471 | FeedEngine 自有 |
| FeederLicense | 0x4E42...F08E | FeedEngine 自有 |
| **NST OptionsCore** | 0x98505C...A19a | NST 外部协议 |
| **NST FeedProtocol** | 0xa4d3d2...79C7 | NST 外部协议 |

---

## 一、前端问题与修复 (feed-engine/)

### 1.1 App.tsx 使用 MOCK_ORDERS 不走后端 API ⚠️ 严重

**文件**: `feed-engine/App.tsx` L334-354

**问题**: `App.tsx` 在 useEffect 中直接使用 `MOCK_ORDERS` 常量填充 Zustand Store，**完全不调用后端 API**。虽然已经有 `useOrders` hook（`hooks/useData.ts`），但 App 未使用它。

**当前代码**:
```tsx
// App.tsx L351
if (orders.length === 0) {
    useFeederStore.getState().setOrders(MOCK_ORDERS);
}
// 虽然最近加了 api.getOrders() 调用，但它是后加的补丁逻辑
```

**修复方案**: 
1. 移除 `MOCK_ORDERS` 依赖，改为 **启动时从后端 API 加载**
2. 使用 `useOrders` hook 替代直接调用 `useFeederStore.setOrders`
3. 保留 mock 数据作为 fallback（后端不可用时的 demo 模式）
4. 加载状态应有 Loading UI

**具体步骤**:
```tsx
// App.tsx 修改
const { orders: apiOrders, loading, error } = useOrders();

React.useEffect(() => {
    if (apiOrders.length > 0) {
        useFeederStore.getState().setOrders(apiOrders);
    } else if (!loading && error) {
        // 后端不可用，降级使用 demo 数据
        useFeederStore.getState().setOrders(MOCK_ORDERS);
    }
}, [apiOrders, loading, error]);
```

---

### 1.2 QuestHall filteredOrders 的偏好过滤不兼容 NST 订单

**文件**: `feed-engine/App.tsx` L384-393

**问题**: `filteredOrders` 使用 `prefs` 过滤（countries、exchanges、assets），但 NST 订单的 `market`、`country` 值可能不在默认偏好列表中。

**默认偏好**（`store.ts` L118-121）:
```ts
preferences: {
    countries: ['CN', 'US', 'GLOBAL'],
    exchanges: ['SSE', 'NASDAQ', 'BINANCE'],
    assets: ['CRYPTO', 'US_STOCK', 'CN_STOCK'],
}
```

NST 订单：`market=NASDAQ`，但 `assets` 列表中没有 `NASDAQ`（有 `US_STOCK`）。过滤 `prefs.assets.includes(order.market)` 会排除 NST 订单。

**修复方案**: 
1. NST 来源的订单跳过偏好过滤，直接显示
2. 添加 `sourceProtocol` 到 `FeedOrder` 类型中
3. 或者扩展默认偏好列表以兼容 NST 的 market 命名

**推荐修复**:
```tsx
const filteredOrders = useMemo(() => {
    return orders.filter(order => {
        const matchesTab = /* ... existing tab filter ... */;
        if (!matchesTab) return false;
        
        // 外部协议订单不受偏好过滤
        if (order.sourceProtocol) return true;
        
        return prefs.countries.includes(order.country)
            && prefs.exchanges.includes(order.exchange)
            && prefs.assets.includes(order.market);
    });
}, [orders, activeTab, prefs]);
```

---

### 1.3 transform.ts 缺少 sourceProtocol 字段传递

**文件**: `feed-engine/services/transform.ts` L20-36

**问题**: `transformOrder` 返回的 `FeedOrder` 类型不包含 `sourceProtocol`，导致前端无法区分 NST 订单和 FeedEngine 自有订单。

**修复方案**: 
1. 在 `FeedOrder` type 中添加 `sourceProtocol?: string`
2. 在 `transformOrder` 中传递 `sourceProtocol`
3. 更新 `types.ts` 中的 `FeedOrder` 接口

---

### 1.4 profile 使用硬编码 mock 数据

**文件**: `feed-engine/App.tsx` L336-350

**问题**: 用户 profile（Sophia Lane、B级、342次喂价等）全部是硬编码 mock。正式使用时应从后端 `useFeederProfile` hook 获取。

**修复方案**: 
1. 用户钱包连接后从后端 API `/api/feeders/me` 获取真实 profile
2. 未连接钱包时显示"请连接钱包"
3. 移除硬编码的 mock profile

---

## 二、后端 API 问题与修复 (feed-engine-backend/)

### 2.1 event-listener 监听 OptionsCore 的 FeedRequestEmitted 事件 → 无用

**文件**: `feed-engine-backend/src/services/event-listener.service.ts` L57-59, L107-113

**问题**: 设置了 `NST_OPTIONS_CORE_EVENTS` 监听 `FeedRequestEmitted` 事件，但 NST 前端实际调用的是 `FeedProtocol.requestFeedPublic`（发出 `FeedRequested` 事件），不是 `OptionsCore.requestFeed`（发出 `FeedRequestEmitted`）。所以 OptionsCore 的监听器永远不会触发。

**修复方案**: 移除 `setupNstListeners()`（监听 OptionsCore）中的 FeedRequestEmitted 相关代码，只保留 `setupNstFeedProtocolListeners()`（监听 FeedProtocol）。

---

### 2.2 setupNstFeedProtocolListeners 中 symbol 优先级问题 ⚠️ 已修复

**文件**: `event-listener.service.ts` L506, L518

**已修复状态**: 已从 `underlyingCode || underlyingName` 改为 `underlyingName || underlyingCode`。

**仍需注意**: 事件 emit 的数据全部为空字符串（NST 合约侧问题），回退查询 OptionsCore 是必需的。如果 `NST_OPTIONS_CORE` 地址未配置或不可达，将获得 UNKNOWN 标识。

---

### 2.3 scanHistoricalFeedRequests 不持久化扫描进度

**文件**: `event-listener.service.ts` L576-680

**问题**: 启动时扫描最近 5000 区块的历史事件，但扫描进度（lastProcessedBlock）不持久化。如果后端频繁重启，每次都重复扫描。短期可接受，但不够健壮。

**修复方案**: 
1. 在数据库中添加 `ScanProgress` 表记录最后扫描区块号
2. 启动时从记录点继续扫描，而非固定 5000 区块
3. 或者用 Redis 存 `lastScanBlock`

---

### 2.4 nst.controller.ts 的 feedType 枚举不匹配

**文件**: `feed-engine-backend/src/controllers/nst.controller.ts` L103

**问题**: API 接受的 `validFeedTypes` 是 `['SETTLEMENT', 'EXERCISE', 'MARGIN_CALL', 'DYNAMIC']`，但事件监听器使用的是 `['INITIAL', 'DYNAMIC', 'FINAL', 'ARBITRATION']`（`FEED_TYPE_MAP`）。两套命名不一致。

**修复方案**: 统一使用 `INITIAL/DYNAMIC/FINAL/ARBITRATION` 命名，与 NST 合约的 `FeedType` enum 保持一致。

---

### 2.5 数据库使用 SQLite 但 .env 配置的是 PostgreSQL

**文件**: `feed-engine-backend/.env` L8, `prisma/dev.db`

**问题**: `.env` 配置了 `DATABASE_URL="postgresql://..."` 但实际使用的是 SQLite（`prisma/dev.db` 存在）。Prisma schema 可能切了 SQLite 用于开发。

**修复方案**: 确认 Prisma schema 的 provider 配置，确保开发和生产使用正确的数据库。

---

## 三、喂价完成后的 NST 回调（最关键交互）

### 3.1 FeedEngine 喂价完成后如何回传 NST ⚠️ 最重要

**现状流程**:
```
NST 用户 → FeedProtocol.requestFeedPublic → FeedRequested 事件
    ↓
FeedEngine 后端监听事件 → 创建内部订单 → 喂价员任务大厅显示
    ↓
喂价员提交价格 → FeedEngine 共识 → 确定最终价格
    ↓
??? → NST FeedProtocol.submitFeed(requestId, price) ← 谁来调用？
    ↓
FeedProtocol.finalizeFeed → 自动回调 OptionsCore.processFeedCallback
```

**缺失环节**: FeedEngine 完成共识后，需要链上调用 `FeedProtocol.submitFeed(requestId, price)` 将价格写回 NST 合约。**目前没有任何逻辑实现这一步。**

**修复方案**: 

#### 方案 A — FeedEngine 后端直接链上写入（推荐）
1. FeedEngine 后端使用一个 EOA 钱包（私钥在 .env 中配置）
2. 该钱包在 NST FeedProtocol 合约上注册为活跃喂价员（`registerFeeder` + stake）
3. FeedEngine 共识完成后，[后端自动] 调用 `FeedProtocol.submitFeed(requestId, finalPrice)`
4. FeedProtocol 自动 finalize → 回调 OptionsCore.processFeedCallback

**需要的配置**:
```env
# .env 新增
NST_FEED_SUBMITTER_PRIVATE_KEY=0x...  # FeedEngine 的喂价员钱包私钥
```

**需要的代码**:
- 新增 `services/nst-callback.service.ts`
- 在订单共识完成时触发回调
- 调用 `FeedProtocol.submitFeed(requestId, consensusPrice)`

#### 方案 B — Webhook 回调（链下）
1. NST 侧部署一个 HTTP 回调服务
2. FeedEngine 创建订单时可指定 `callbackUrl`
3. 共识完成后 POST 到 callbackUrl
4. NST 回调服务验证数据后链上写入

**不推荐**: 引入中心化依赖，增加故障点。

---

### 3.2 externalOrderId 与 requestId 的关联

**文件**: `event-listener.service.ts` L543

**问题**: FeedEngine 创建订单时存储 `externalOrderId = orderId.toString()`（NST 的 orderId），但没有存 `requestId`。后续回调时需要 `requestId` 来调用 `FeedProtocol.submitFeed(requestId, price)`。

**修复方案**: 
1. Prisma schema 添加 `externalRequestId` 字段
2. 事件监听时同步存储 `requestId`
3. 回调时使用 `externalRequestId`

---

## 四、WebSocket 实时通信问题

### 4.1 前端 WebSocket 数据处理不完整

**文件**: `feed-engine/services/websocket.ts`

**问题**: 需要确认 WebSocket 消息格式和事件类型的一致性。后端 emit 了 `nst:feedRequest` 事件，但前端的 `useRealtimeOrders` hook 是否监听了该事件？

**修复方案**: 
1. 审核前端 WebSocket 监听的事件列表
2. 确保 `nst:feedRequest` 事件能触发前端订单列表刷新
3. 添加 `order:updated`、`order:settled` 等事件处理

---

### 4.2 WebSocket 重连机制

**问题**: 检查前端是否有 WebSocket 断线重连逻辑。长时间运行时 WebSocket 可能断开。

**修复方案**: 使用 `socket.io-client` 的自动重连配置 + 重连后重新拉取最新数据。

---

## 五、安全与健壮性

### 5.1 后端无 Rate Limiting

**问题**: 所有 API 端点均无限流保护。

**修复方案**: 添加 express-rate-limit 中间件。

### 5.2 .env 中的私钥管理

**问题**: 如果添加 NST_FEED_SUBMITTER_PRIVATE_KEY，需要确保安全存储。

**修复方案**: 
- 开发环境使用 .env
- 生产环境使用环境变量注入（K8s secrets 等）

---

## 六、执行优先级

| 优先级 | 编号 | 描述 | 难度 | 备注 |
|--------|------|------|------|------|
| 🔴 P0 | 3.1 | 喂价完成→NST 回调 | 高 | **整个流程的断裂点** |
| 🔴 P0 | 1.1 | App.tsx 移除 MOCK 数据 | 中 | 使用真实 API 数据 |
| 🔴 P0 | 3.2 | 存储 requestId | 低 | 回调依赖 |
| 🟡 P1 | 1.2 | filteredOrders 偏好过滤 | 低 | NST 订单不显示 |
| 🟡 P1 | 1.3 | sourceProtocol 字段传递 | 低 | 配合 1.2 |
| 🟡 P1 | 2.1 | 移除无用 OptionsCore 监听 | 低 | 清理代码 |
| 🟡 P1 | 2.4 | feedType 枚举统一 | 低 | 数据一致性 |
| 🟢 P2 | 1.4 | 真实 profile 数据 | 中 | UX 提升 |
| 🟢 P2 | 2.3 | 扫描进度持久化 | 中 | 健壮性 |
| 🟢 P2 | 4.1 | WebSocket 事件完善 | 中 | 实时性 |
| 🟢 P2 | 5.1 | Rate Limiting | 低 | 安全性 |

---

## 七、NST 合约侧需要的配合

以下操作需要 NST 项目侧完成后，FeedEngine 才能执行：

1. **FeedProtocol 合约部署后地址更新** — 如果 NST 修复了 emit 空数据问题，FeedEngine `.env` 需要同步更新 `NST_FEED_PROTOCOL_CONTRACT`
2. **喂价员注册** — FeedEngine 的回调钱包需要在 FeedProtocol 上注册为喂价员
3. **FEED_PROTOCOL_ROLE 授权** — 如果回调逻辑需要特殊角色

---

## 八、当前合约配置参考

FeedEngine 后端 `.env` 中需要的 NST 相关配置:
```env
# NST 协议地址（当前值）
NST_OPTIONS_CORE_CONTRACT=0x98505CE913E9Dc70142Ca6C9ca0c9a1af3EfA19a
NST_FEED_PROTOCOL_CONTRACT=0xa4d3d2D56902f91e92caDE54993f45b4376979C7

# 新增（回调所需）
NST_FEED_SUBMITTER_PRIVATE_KEY=  # 需要提供一个注册过的喂价员钱包
```

---

## 九、验证计划

### 9.1 单项验证
- API 数据加载：启动前端，检查 Network 面板是否有 `/api/orders` 请求
- NST 订单显示：确认 QuestHall 中 Primary Sync 标签显示正确的订单名/市场
- WebSocket：打开浏览器控制台，确认 socket 连接和事件接收

### 9.2 回调流程验证
1. NST 发起喂价请求（requestFeedPublic）
2. FeedEngine 后端日志确认事件捕获
3. FeedEngine 前端显示新订单
4. 模拟喂价员提交价格
5. 共识完成后，后端日志确认回调 FeedProtocol.submitFeed
6. NST OptionsCore 订单状态变为 LIVE
7. NST 前端确认状态更新

### 9.3 手动测试步骤
1. **启动 FeedEngine 后端**: `cd feed-engine-backend && npm run dev`
2. **验证 API**: 浏览器访问 `http://localhost:3001/api/orders`，确认返回 NST 订单
3. **启动 FeedEngine 前端**: `cd feed-engine && npx vite --port 5174`
4. **检查任务大厅**: 确认 Primary Sync 标签下显示 NST 订单（非 NVDA，而是正确的中文名）
5. **检查 WebSocket**: 浏览器 F12 → Network → WS，确认 socket.io 连接存在
