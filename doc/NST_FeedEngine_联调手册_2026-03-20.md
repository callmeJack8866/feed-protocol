# NST × FeedEngine 联调手册

更新时间：2026-03-19  
适用范围：`F:\Unstandardized_Products\NST` 与 `F:\Unstandardized_Products\FeedEngine` 本地联调  
目标：明天按本文档完成一次完整的 `NST 发起喂价 -> FeedEngine 接单共识 -> NST 收到回写` 联调

---

## 1. 联调目标

明天联调建议至少完成下面 4 条主线：

1. `NST 前端` 能正常连接钱包并创建订单
2. `NST -> FeedProtocol` 发起喂价后，`FeedEngine 后端` 能监听到 `FeedRequested` 并创建喂价订单
3. `FeedEngine 前端` 能完成 `抢单 -> commit -> reveal -> settle`
4. 共识完成后，`FeedEngine` 能把价格写回 `NST`，NST 订单状态和价格同步更新

---

## 2. 明天固定使用的地址和端口

### 2.1 服务端口

| 服务 | 地址 |
|---|---|
| NST 前端 | `http://localhost:5173` |
| FeedEngine 前端 | `http://localhost:3000` |
| FeedEngine 后端 | `http://127.0.0.1:3001` |
| FeedEngine 健康检查 | `http://127.0.0.1:3001/health` |

### 2.2 NST 当前测试网合约地址

来源：`F:\Unstandardized_Products\NST\deployed-addresses.json`

| 合约 | 地址 |
|---|---|
| USDT | `0x6ae0833E637D1d99F3FCB6204860386f6a6713C0` |
| Config | `0x63aE7d11Ed0d939DEe6FC67e8bE89De79610c4Ea` |
| VaultManager | `0x9214D7f7b532E0fa1e6aFF7a0a6d3b6CE0754454` |
| OptionsCore | `0x98505CE913E9Dc70142Ca6C9ca0c9a1af3EfA19a` |
| OptionsSettlement | `0x8DF881593368FD8be3F40722fcb9f555593a8257` |
| FeedProtocol | `0x98BA4261835533FEBf2335a4edA04d1a69D45311` |
| SeatManager | `0xB364f37b3fD3e1f373907478e532449b4bA09343` |
| PointsManager | `0x22074e05314c3A20cdD40C8D127E8306dc919dEC` |
| VolumeBasedFeed | `0xa4d3d2D56902f91e92caDE54993f45b4376979C7` |

### 2.3 链配置

- 网络：`BSC Testnet`
- Chain ID：`97`
- RPC：`https://data-seed-prebsc-1-s1.binance.org:8545/`
- 浏览器：`https://testnet.bscscan.com`

---

## 3. 明天联调前必须先统一的配置

### 3.1 NST 前端 `.env`

文件：`F:\Unstandardized_Products\NST\frontend\.env`

建议确认至少这两项：

```env
VITE_TARGET_CHAIN_ID=97
VITE_FEED_ENGINE_URL=http://localhost:3000
```

说明：

- 当前 `NST` 代码里 `FeederPanel` 默认跳转 `http://localhost:5173`，这会跳回 `NST` 自己，不是 `FeedEngine`。
- 明天联调前必须把 `VITE_FEED_ENGINE_URL` 指向 `FeedEngine 前端` 的真实地址，也就是 `http://localhost:3000`。

### 3.2 FeedEngine 前端 `.env.local`

文件：`F:\Unstandardized_Products\FeedEngine\feed-engine\.env.local`

```env
VITE_API_URL=http://127.0.0.1:3001
VITE_WS_URL=http://127.0.0.1:3001
```

说明：

- `FeedEngine` 当前 Vite dev port 是 `3000`，不是旧文档里出现过的 `5173/5174`。
- 前端构建和脚本已经按 `3000` 对齐。

### 3.3 FeedEngine 后端 `.env`

文件：`F:\Unstandardized_Products\FeedEngine\feed-engine-backend\.env`

明天联调建议至少确认这些值：

```env
NODE_ENV=development
PORT=3001

FRONTEND_URL=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173

BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
CHAIN_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
BSC_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

NST_OPTIONS_CORE_CONTRACT=0x98505CE913E9Dc70142Ca6C9ca0c9a1af3EfA19a
NST_FEED_PROTOCOL_CONTRACT=0x98BA4261835533FEBf2335a4edA04d1a69D45311
USDT_TOKEN_CONTRACT=0x6ae0833E637D1d99F3FCB6204860386f6a6713C0

PROTOCOL_API_KEYS=nst-local-key:NST
```

如果要验证 `FeedEngine -> NST 链上回写`，还必须确认：

```env
NST_FEED_SUBMITTER_PRIVATE_KEY=你的有权限 submitFeed 的私钥
```

建议一并确认：

```env
BACKEND_PRIVATE_KEY=
JWT_SECRET=
PLATFORM_WALLET=
DAO_TREASURY_WALLET=
```

### 3.4 关于数据库

当前本地联调请注意：

- `FeedEngine` 当前 Prisma datasource 实际使用的是 `SQLite`
- 本地数据库文件是：`F:\Unstandardized_Products\FeedEngine\feed-engine-backend\prisma\dev.db`

所以明天本地联调时：

1. 不必临时切 PostgreSQL
2. 建议先备份一次 `dev.db`

备份命令：

```powershell
Copy-Item `
  'F:\Unstandardized_Products\FeedEngine\feed-engine-backend\prisma\dev.db' `
  'F:\Unstandardized_Products\FeedEngine\feed-engine-backend\prisma\dev.pre-2026-03-20.db'
```

---

## 4. 明天建议的执行顺序

建议按 5 个终端执行：

| 终端 | 用途 |
|---|---|
| 终端 A | FeedEngine 后端 |
| 终端 B | FeedEngine 前端 |
| 终端 C | NST 前端 |
| 终端 D | 可选脚本/接口验证 |
| 浏览器 | NST 页面 + FeedEngine 页面 |

---

## 5. 第 0 轮：启动前检查

### 5.1 钱包与网络

明天开始前先确认：

1. MetaMask 已切换到 `BSC Testnet`
2. 至少准备 2 类钱包
   - `NST 交易钱包`：用于创建 RFQ、报价、接受报价、发起喂价
   - `FeedEngine 喂价钱包`：用于登录 FeedEngine、抢单、提交价格
3. 相关钱包有足够：
   - `tBNB` 付 gas
   - `USDT` 付 NST 建仓费、保证金、FeedEngine 质押

### 5.2 依赖完整性

先各跑一次：

```powershell
cd F:\Unstandardized_Products\NST
npm test
```

```powershell
cd F:\Unstandardized_Products\FeedEngine\contracts
npm test
```

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run build
```

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine
npm run build
```

通过标准：

- `NST` 合约测试通过
- `FeedEngine` 合约测试通过
- `feed-engine-backend` build 通过
- `feed-engine` build 通过

---

## 6. 第 1 轮：启动服务

### 6.1 启动 FeedEngine 后端

终端 A：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run dev
```

如果 `nodemon` 在你机器上有问题，可退而使用：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run build
npm run start
```

期望日志至少看到：

- `Feed Engine Backend running on port 3001`
- `WebSocket server ready`
- `Blockchain services initialized`
- `Event listeners started` 或同等含义日志

然后验证健康检查：

```powershell
Invoke-WebRequest http://127.0.0.1:3001/health | Select-Object -ExpandProperty Content
```

通过标准：

- 返回 `status: ok`
- 能看到 `redis` 状态

说明：

- 如果 Redis 没连上，当前代码会降级到内存模式，不一定阻断联调
- 但建议你记录一下，因为实时性判断会受影响

### 6.2 启动 FeedEngine 前端

终端 B：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine
npm run dev
```

期望：

- 页面地址是 `http://localhost:3000`

### 6.3 启动 NST 前端

终端 C：

```powershell
cd F:\Unstandardized_Products\NST\frontend
npm run dev
```

期望：

- 页面地址是 `http://localhost:5173`

### 6.4 端口总检查

终端 D：

```powershell
netstat -aon | findstr "3000 3001 5173"
```

通过标准：

- `3000`、`3001`、`5173` 都在 `LISTENING`

---

## 7. 第 2 轮：先做 FeedEngine 自检

这一步不是 NST 联调本身，但建议明天先做，能快速排除 FeedEngine 自身问题。

### 7.1 后端主链路 smoke

终端 D：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run smoke:mainflow
```

通过标准：

- grab / commit / reveal / settlement 成功
- season / achievement 回写成功

### 7.2 浏览器主流程 smoke

终端 D：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine
$env:SMOKE_APP_URL='http://127.0.0.1:3000'
npm run smoke:browser-mainflow
```

通过标准：

- 浏览器里完成 `Quest Hall -> FeedModal -> commit -> reveal -> claim`

如果这两步不通过，不建议直接进入 NST 联调。

---

## 8. 第 3 轮：NST 侧创建并进入待喂价状态

### 8.1 打开 NST 前端并连接钱包

浏览器打开：

- `http://localhost:5173`

执行：

1. 连接 MetaMask
2. 确认网络是 `BSC Testnet`
3. 检查首页无明显合约初始化报错

### 8.2 创建 RFQ

建议用一单简单可识别的标的，便于后面在 FeedEngine 找：

- 标的：`600519.SH` 或 `AAPL`
- 名义本金：`100` 或 `1000 USDT`
- 到期：短周期即可
- 喂价类型：先走 `INITIAL`

执行路径：

1. 在 NST 创建订单
2. 卖方报价
3. 买方接受报价

通过标准：

- NST 订单状态进入 `MATCHED`

### 8.3 在 NST 发起喂价请求

执行路径：

1. 进入 `My Orders`
2. 找到刚才的订单
3. 点击发起喂价
4. 选择喂价档位并确认交易

通过标准：

- 链上交易成功
- NST 页面显示“已发起喂价”或进入等待喂价格局

---

## 9. 第 4 轮：验证 FeedEngine 是否收到 NST 任务

### 9.1 看 FeedEngine 后端日志

观察终端 A，期望看到类似日志：

- `FeedRequested`
- `reqId=...`
- `orderId=...`
- `symbol=...`

这一步的核心判断：

- `FeedEngine` 是否监听到了 `NST FeedProtocol` 的 `FeedRequested`
- 是否把链上请求创建成了本地 `order`

### 9.2 API 验证订单是否已入库

终端 D：

```powershell
Invoke-WebRequest http://127.0.0.1:3001/api/orders | Select-Object -ExpandProperty Content
```

在返回里确认：

1. 有新订单
2. `sourceProtocol` 是 `NST`
3. `externalOrderId` / `externalRequestId` 已写入
4. `symbol`、`market`、`feedType` 正确

如果你想更精确一点，也可以直接查 SQLite：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
sqlite3 prisma/dev.db "select id,symbol,sourceProtocol,externalOrderId,externalRequestId,status,createdAt from \"Order\" order by createdAt desc limit 10;"
```

如果机器没有 `sqlite3`，这一步可以跳过。

---

## 10. 第 5 轮：在 FeedEngine 完成喂价

### 10.1 打开 FeedEngine 前端并连接钱包

浏览器打开：

- `http://localhost:3000`

执行：

1. 连接喂价钱包
2. 成功登录
3. 确认 `Quest Hall` 能看到订单列表

### 10.2 找到 NST 生成的订单

用下面字段匹配：

1. `symbol`
2. `market`
3. `feedType`
4. `notionalAmount`
5. 创建时间

### 10.3 执行喂价主流程

执行：

1. 抢单
2. 进入 `FeedModal`
3. 输入价格并提交 commit
4. reveal
5. 等待共识

如果明天只有 1 个真实喂价钱包，建议同时准备：

- 额外喂价钱包 2 个
- 或使用已有 smoke 辅助钱包方案

因为默认共识通常要求至少 3 人。

通过标准：

- `FeedEngine` 订单进入 `SETTLED`
- Dashboard 的 `totalFeeds / xp / accuracy` 更新

---

## 11. 第 6 轮：验证 FeedEngine 回写 NST

这是明天最关键的一步。

### 11.1 看 FeedEngine 后端日志

观察终端 A，期望看到类似日志：

- `NST Writeback`
- `FeedProtocol.submitFeed success`
- 包含 `requestId`
- 包含交易 hash

如果没有这类日志，通常说明：

1. `NST_FEED_SUBMITTER_PRIVATE_KEY` 没配
2. `NST_FEED_PROTOCOL_CONTRACT` 配错
3. 写回钱包没有权限
4. `externalRequestId` 没落库

### 11.2 回到 NST 前端确认状态

回到 `http://localhost:5173` 的 `My Orders`：

通过标准：

1. 订单不再停留在“等待喂价”
2. `lastFeedPrice` 已更新
3. 初始喂价后订单状态应从等待态切到 `LIVE` 或对应的已进入持仓状态

---

## 12. 可选第 7 轮：验证最终喂价 / 结算喂价

如果明天时间够，建议继续跑第二段：

1. 在 NST 侧触发 `FINAL` / `SETTLEMENT` 喂价
2. 确认 NST 订单进入 `WAITING_FINAL_FEED`
3. FeedEngine 再次收到新的 NST 喂价任务
4. 再做一轮 `抢单 -> commit -> reveal -> settle`
5. NST 最终进入结算后的状态

这一步能确认：

- 不是只有 `INITIAL` 喂价通
- 最终价格链路也通

---

## 13. 失败时的快速排障顺序

### 13.1 NST 能发起喂价，但 FeedEngine 后端没反应

先检查：

1. `feed-engine-backend/.env` 中
   - `NST_FEED_PROTOCOL_CONTRACT`
   - `NST_OPTIONS_CORE_CONTRACT`
   - `BSC_TESTNET_RPC_URL`
2. 后端是否重启过
3. 后端日志里是否打印了事件监听启动
4. 订单发起的链上交易是否真的成功上链

### 13.2 FeedEngine 收到订单，但前端看不到

先检查：

1. `http://127.0.0.1:3001/api/orders` 是否能看到这笔单
2. `FeedEngine` 前端是否已登录
3. `VITE_API_URL` / `VITE_WS_URL` 是否正确
4. CORS 是否报错

### 13.3 FeedEngine 已共识，但 NST 没更新

优先检查：

1. 后端日志里有没有 `NST Writeback`
2. `.env` 里的 `NST_FEED_SUBMITTER_PRIVATE_KEY` 是否配置
3. 该钱包是否有 `submitFeed` 权限
4. `externalRequestId` 是否存在

### 13.4 浏览器打开后跳错页面

这通常是 `NST` 的 `VITE_FEED_ENGINE_URL` 还没改。

必须确认：

```env
VITE_FEED_ENGINE_URL=http://localhost:3000
```

---

## 14. 可选的后端 API 兜底测试

如果明天 `链上事件监听` 这条链有问题，但你想先确认 `FeedEngine` 的 NST 接口本身没问题，可以手工调一次：

```powershell
$headers = @{
  "x-api-key" = "nst-local-key"
  "Content-Type" = "application/json"
}

$body = @{
  symbol = "AAPL"
  market = "US_STOCK"
  country = "US"
  exchange = "NASDAQ"
  feedType = "INITIAL"
  notionalAmount = 1000
  callbackUrl = "http://localhost:9999/mock-callback"
  externalOrderId = "NST-LOCAL-001"
  externalRequestId = "10001"
} | ConvertTo-Json

Invoke-WebRequest `
  -Method POST `
  -Uri "http://127.0.0.1:3001/api/nst/request-feed" `
  -Headers $headers `
  -Body $body
```

通过标准：

1. 后端返回 `201`
2. 本地 `Order` 成功创建
3. `sourceProtocol` 为 `NST`
4. `externalOrderId / externalRequestId` 落库

说明：

- 这一步只是隔离问题，不替代真正的 `NST 链上事件联调`

---

## 15. 明天建议的最终验收标准

只要下面 8 条全部满足，就可以认为联调通过：

1. NST 前端连接钱包成功
2. NST 订单成功进入 `MATCHED`
3. NST 发起喂价交易成功
4. FeedEngine 后端收到 `FeedRequested`
5. FeedEngine 前端能看到 NST 任务
6. FeedEngine 完成 `grab -> commit -> reveal -> settle`
7. FeedEngine 后端成功执行 `NST Writeback`
8. NST 前端刷新后能看到价格/状态已更新

---

## 16. 明天执行时的注意事项

1. 明天优先统一用 `localhost` 打开前端页面
2. 后端 API 用 `127.0.0.1:3001` 没问题，因为当前 CORS 已兼容
3. 不要同时混用旧文档里的 `5174`
4. 不要在联调过程中临时切数据库类型
5. 如果 Redis 没连上，可以先继续联调，但要记在问题清单里
6. 如果写回 NST 失败，先不要重复点太多次按钮，先查后端日志里的 `requestId` 和报错原因

---

## 17. 建议你明天现场照着念的最短版流程

1. 启动 FeedEngine 后端
2. 启动 FeedEngine 前端
3. 启动 NST 前端
4. 检查 `3000/3001/5173` 三个端口
5. NST 创建订单并完成撮合，进入 `MATCHED`
6. NST 发起喂价
7. 看 FeedEngine 后端日志是否收到 `FeedRequested`
8. 在 FeedEngine 抢单并完成共识
9. 看 FeedEngine 后端日志是否 `NST Writeback success`
10. 回 NST 页面刷新，确认价格和状态更新

---

## 18. 明天如果你想让我继续协助

你可以直接把明天现场的任何一个结果贴给我，我按下面方式帮你快速判断：

- 贴后端日志
- 贴浏览器报错
- 贴交易 hash
- 贴某一步“卡住”的截图

我会直接按“下一步该查什么”给你排。  

