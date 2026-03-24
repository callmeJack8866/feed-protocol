# NST × FeedEngine 完整联调测试手册

版本：2026-03-24  
适用仓库：

- `F:\Unstandardized_Products\NST`
- `F:\Unstandardized_Products\FeedEngine`

适用目标：

1. 今天先完整跑一遍联调测试
2. 明天进入正式联调阶段
3. 这份手册既能用于内部测试，也能拆成客户演示流程

---

## 1. 手册定位

这份文档不是单纯的“演示流程”，而是完整的联调测试手册。

它包含两部分：

1. 工程侧准备与启动检查  
   用于你在正式联调前确认环境、服务、链上配置、数据库和回写条件都正常

2. 页面侧手工联调步骤  
   用于你在浏览器里一步一步操作，并在每一步做人工验收

建议使用方式：

1. 先完成第 2 到第 6 章
2. 再按第 7 到第 16 章逐条测试
3. 每条用例都勾验收结果

---

## 2. 当前代码与文档对齐后的关键事实

这一章非常重要，目的是避免你继续被旧文档坑。

### 2.1 当前真实端口

按当前代码，不按旧文档：

| 服务 | 当前真实地址 |
|---|---|
| NST 前端 | `http://localhost:5173` |
| FeedEngine 前端 | `http://localhost:3000` |
| FeedEngine 后端 | `http://127.0.0.1:3001` |

说明：

- `NST` 旧测试手册里还写过 `FeedEngine 前端 5174`
- 这已经不适用了
- 当前 `FeedEngine` Vite 配置固定端口是 `3000`

### 2.2 当前 NST -> FeedEngine 桥接方式

按当前代码，NST 不是调用 `FeedEngine /api/nst/request-feed` 来建单的主路径。  
当前主路径是：

1. `NST` 前端调用 `FeedProtocol.requestFeedPublic`
2. `NST FeedProtocol` 发出链上事件 `FeedRequested`
3. `FeedEngine 后端 event-listener` 监听该事件
4. `FeedEngine 后端` 自动在本地数据库创建一笔 `sourceProtocol = NST` 的订单

也就是说：

- 明天主联调要盯的是链上事件桥接
- 不是单纯 REST API

### 2.3 当前 NST 驱动的 FeedEngine 订单是 1/1

这是当前实现里最容易和设计文档混淆的一点。

按 `F:\Unstandardized_Products\FeedEngine\feed-engine-backend\src\services\event-listener.service.ts` 当前代码：

- `requiredFeeders = 1`
- `consensusThreshold = '1/1'`
- `rewardAmount = 2.7`

这意味着：

1. `FeedEngine` 一般大厅订单可以有 3/5/7 等多喂价员共识逻辑
2. 但当前由 `NST` 链上事件桥接过来的订单，实际按 `1/1` 处理

所以你明天联调时要按当前代码判断，不要按原始设计文档误判为“为什么没凑 3 人也结算了”。

### 2.4 当前写回 NST 的方式

`FeedEngine` 在订单共识完成后，会尝试：

1. 可选 HTTP callback
2. 关键路径：调用 `NST FeedProtocol.submitFeed(requestId, price)`

写回成功的前提：

1. `externalRequestId` 已正确落库
2. `NST_FEED_PROTOCOL_CONTRACT` 配置正确
3. `NST_FEED_SUBMITTER_PRIVATE_KEY` 已配置
4. 该私钥对应钱包在 `NST FeedProtocol` 中具备可提交喂价的权限

---

## 3. 明天联调的目标分层

建议把联调目标拆成 4 层：

### 第一层：环境与启动

验证：

1. 三个服务能启动
2. 钱包网络正确
3. 合约地址与环境变量一致

### 第二层：NST 业务前半段

验证：

1. 买方创建 RFQ
2. 卖方报价
3. 买方接受报价
4. 订单进入 `MATCHED`

### 第三层：NST -> FeedEngine 联通

验证：

1. NST 发起喂价
2. FeedProtocol 发事件
3. FeedEngine 后端接收到事件
4. FeedEngine 前端看到对应任务

### 第四层：FeedEngine -> NST 回写闭环

验证：

1. FeedEngine 完成喂价
2. FeedEngine 订单结算
3. 共识价格回写 NST
4. NST 订单状态和价格更新

---

## 4. 明天建议的角色和钱包准备

### 4.1 建议准备的钱包角色

建议至少准备 4 类钱包：

| 钱包 | 用途 |
|---|---|
| 买方钱包 | NST 创建 RFQ、接受报价、行权、结算 |
| 卖方钱包 | NST 提交报价、补保证金、提取保证金 |
| FeedEngine 喂价钱包 | 登录 FeedEngine、抢单、提交价格 |
| 备用喂价/运维钱包 | 用于异常场景排障或补权限 |

### 4.2 钱包资产建议

每个需要发交易的钱包至少准备：

1. `tBNB`
2. `USDT`

建议值：

- `tBNB`：足够覆盖多次交易
- `USDT`：至少覆盖 RFQ、报价保证金、发起喂价费、补保证金等操作

### 4.3 网络要求

统一使用：

- `BSC Testnet`
- Chain ID `97`

---

## 5. 工程侧准备清单

这一章是你测试前自己做的，不是客户演示流程。

### 5.1 先核对 NST 合约地址

文件：

- `F:\Unstandardized_Products\NST\deployed-addresses.json`
- `F:\Unstandardized_Products\NST\frontend\src\contracts\config.ts`
- `F:\Unstandardized_Products\FeedEngine\feed-engine-backend\.env`

必须对齐的核心地址：

1. `OptionsCore`
2. `OptionsSettlement`
3. `FeedProtocol`
4. `USDT`

### 5.2 核对 NST 前端环境

文件：

- `F:\Unstandardized_Products\NST\frontend\.env`

重点确认：

```env
VITE_TARGET_CHAIN_ID=97
VITE_FEED_ENGINE_URL=http://localhost:3000
```

如果 `VITE_FEED_ENGINE_URL` 还是 `5173`，NST 跳转到的不是 FeedEngine，而是 NST 自己。

### 5.3 核对 FeedEngine 前端环境

文件：

- `F:\Unstandardized_Products\FeedEngine\feed-engine\.env.local`

建议值：

```env
VITE_API_URL=http://127.0.0.1:3001
VITE_WS_URL=http://127.0.0.1:3001
```

### 5.4 核对 FeedEngine 后端环境

文件：

- `F:\Unstandardized_Products\FeedEngine\feed-engine-backend\.env`

至少确认：

```env
PORT=3001
FRONTEND_URL=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
CHAIN_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
NST_OPTIONS_CORE_CONTRACT=0x98505CE913E9Dc70142Ca6C9ca0c9a1af3EfA19a
NST_FEED_PROTOCOL_CONTRACT=0x98BA4261835533FEBf2335a4edA04d1a69D45311
USDT_TOKEN_CONTRACT=0x6ae0833E637D1d99F3FCB6204860386f6a6713C0
```

如需测试写回，必须额外确认：

```env
NST_FEED_SUBMITTER_PRIVATE_KEY=
```

### 5.5 本地数据库准备

按当前代码，FeedEngine 本地是 SQLite，不是 PostgreSQL。

数据库文件：

- `F:\Unstandardized_Products\FeedEngine\feed-engine-backend\prisma\dev.db`

建议在测试前先备份：

```powershell
Copy-Item `
  'F:\Unstandardized_Products\FeedEngine\feed-engine-backend\prisma\dev.db' `
  'F:\Unstandardized_Products\FeedEngine\feed-engine-backend\prisma\dev.pre-2026-03-24.db'
```

### 5.6 依赖与构建检查

建议先跑：

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

1. `NST` 测试通过
2. `FeedEngine contracts` 测试通过
3. `feed-engine-backend` 构建通过
4. `feed-engine` 构建通过

---

## 6. 服务启动与基础自检

### 6.1 启动 FeedEngine 后端

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run dev
```

如果本机 `nodemon` 异常，就改用：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run build
npm run start
```

期望日志：

1. `Feed Engine Backend running on port 3001`
2. `WebSocket server ready`
3. `Blockchain services initialized`
4. 事件监听启动完成

### 6.2 启动 FeedEngine 前端

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine
npm run dev
```

期望页面：

- `http://localhost:3000`

### 6.3 启动 NST 前端

```powershell
cd F:\Unstandardized_Products\NST\frontend
npm run dev
```

期望页面：

- `http://localhost:5173`

### 6.4 健康检查

```powershell
Invoke-WebRequest http://127.0.0.1:3001/health | Select-Object -ExpandProperty Content
```

通过标准：

1. 返回 `status: ok`
2. 能看到 Redis 状态

说明：

- 如果 Redis 未连接，当前代码允许降级运行
- 这不一定阻断联调，但要记录

### 6.5 FeedEngine 自检

建议正式联调前先做一次：

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run smoke:mainflow
```

```powershell
cd F:\Unstandardized_Products\FeedEngine\feed-engine
$env:SMOKE_APP_URL='http://127.0.0.1:3000'
npm run smoke:browser-mainflow
```

说明：

- 这一步不是客户演示内容
- 只是为了确保 FeedEngine 自身没坏

---

## 7. 联调总流程图

当前推荐按下面顺序完整测试：

1. TC-00 环境启动与钱包网络检查
2. TC-01 NST 连接钱包
3. TC-02 FeedEngine 连接钱包
4. TC-03 NST 买方创建 RFQ
5. TC-04 NST 卖方报价
6. TC-05 NST 买方接受报价
7. TC-06 NST 发起初始喂价
8. TC-07 FeedEngine 后端接收链上事件并建单
9. TC-08 FeedEngine 前端看到 NST 订单
10. TC-09 FeedEngine 抢单
11. TC-10 FeedEngine commit + reveal + settle
12. TC-11 NST 收到初始喂价回写，订单进入 LIVE
13. TC-12 NST 卖方追加保证金
14. TC-13 NST 卖方提取超额保证金
15. TC-14 NST 买方提前行权并触发最终喂价
16. TC-15 FeedEngine 完成最终喂价回写
17. TC-16 NST 结算
18. TC-17 NST 发起仲裁

你不一定明天全跑完，但建议至少跑到 TC-11，最好跑到 TC-16。

---

## 8. TC-00 环境与钱包检查

### 前置条件

1. 三个服务已启动
2. MetaMask 已切到 `BSC Testnet`
3. 买方、卖方、喂价钱包都有 gas

### 操作

1. 打开 `NST` 前端
2. 打开 `FeedEngine` 前端
3. 确认两个页面都能正常加载

### 页面验收

1. `NST` 页面正常显示
2. `FeedEngine` 页面正常显示
3. 无明显白屏

### 技术验收

1. `http://127.0.0.1:3001/health` 正常
2. 控制台无持续报错洪泛

---

## 9. TC-01 NST 前端连接钱包

### 页面

- `http://localhost:5173`

### 操作

1. 点击连接钱包
2. MetaMask 确认连接

### 页面验收

1. 页面显示钱包地址缩写
2. 网络正确

### 技术验收

1. 控制台能看到 `OptionsCore` 初始化
2. 控制台能看到 `OptionsSettlement` 初始化
3. 没有链 ID 错误

### 失败时先查

1. `config.ts` 地址是否正确
2. MetaMask 是否在 97

---

## 10. TC-02 FeedEngine 前端连接钱包

### 页面

- `http://localhost:3000`

### 操作

1. 点击 `ENGAGE NODE`
2. 允许钱包连接
3. 完成签名登录

### 页面验收

1. 成功进入已登录状态
2. 能看到导航和大厅

### 技术验收

1. 后端无 CORS 报错
2. `/api/auth/connect` 成功
3. 页面不再卡在 loading

### 失败时先查

1. `FRONTEND_URL` 是否包含 `localhost:3000`
2. 后端是否已启动

---

## 11. TC-03 NST 买方创建 RFQ

### 页面

- `NST`

### 操作建议

建议创建一笔简单订单，方便后续识别：

1. 标的：`AAPL` 或 `600519.SH`
2. 方向：`Call`
3. 名义本金：`100` 或 `1000 USDT`
4. 到期日：短周期
5. 最大费率：如 `5%`
6. 最低保证金率：如 `10%`

### 页面验收

1. 首次可能触发 `USDT approve`
2. 订单创建成功
3. 订单出现在买方订单列表
4. 状态为 `RFQ_CREATED`

### 技术验收

1. 调用的是 `OptionsCore.createBuyerRFQ`
2. 创建费已扣除

---

## 12. TC-04 NST 卖方提交报价

### 页面

- `NST`

### 操作

1. 切换到卖方视角
2. 找到刚才那笔 RFQ
3. 提交报价

建议参数：

1. 费率：如 `4%`
2. 保证金率：如 `15%`
3. 平仓规则：任选一条可识别规则

### 页面验收

1. 如需保证金，触发 `approve`
2. 报价成功
3. 订单状态进入 `QUOTING`

### 技术验收

1. 调用的是 `OptionsCore.submitQuote`

---

## 13. TC-05 NST 买方接受报价

### 页面

- `NST`

### 操作

1. 回到买方视角
2. 查看报价
3. 接受报价

### 页面验收

1. 如需支付 premium + fee，触发 `approve`
2. 交易成功
3. 订单状态变成 `MATCHED`

### 技术验收

1. 调用的是 `OptionsCore.acceptQuote`

---

## 14. TC-06 NST 发起初始喂价

### 页面

- `NST -> My Orders`

### 操作

1. 找到状态为 `MATCHED` 的订单
2. 点击发起喂价
3. 如果是正常喂价规则，选择一个档位
4. 确认交易

### 页面验收

1. 喂价请求发出成功
2. UI 显示“等待喂价”或“喂价请求已发起”

### 技术验收

1. 调用的是 `FeedProtocol.requestFeedPublic`
2. 链上应发出 `FeedRequested` 事件

### 关键说明

如果订单是 `feedRule = 1` 的“跟量成交”模式，页面会走建议价格输入弹窗，不是普通档位流程。

---

## 15. TC-07 FeedEngine 后端接收 NST 链上事件并建单

### 页面侧

这一步主要看日志和数据，不看 UI。

### 观察点

观察 `FeedEngine 后端` 日志。

期望看到：

1. 收到 `FeedRequested`
2. 打印出 `requestId`
3. 打印出 `orderId`
4. 打印出 `symbol`
5. 创建 FeedEngine 订单成功

### 数据验收

请求：

```powershell
Invoke-WebRequest http://127.0.0.1:3001/api/orders | Select-Object -ExpandProperty Content
```

确认：

1. 出现新订单
2. `sourceProtocol = NST`
3. `externalOrderId` 已有值
4. `externalRequestId` 已有值

### 当前代码的真实预期

当前由 NST 事件桥接来的订单，预期是：

1. `requiredFeeders = 1`
2. `consensusThreshold = 1/1`
3. `feedType 2` 会映射成 `SETTLEMENT`

---

## 16. TC-08 FeedEngine 前端看到 NST 订单

### 页面

- `http://localhost:3000`

### 操作

1. 登录喂价员钱包
2. 进入 `Quest Hall`
3. 查找刚才的 NST 任务

### 页面验收

1. 能在大厅中找到该订单
2. 标的和市场信息大致对应 NST 订单
3. 订单可点击查看详情

### 技术验收

1. 页面数据来源为 `/api/orders`
2. 新订单能通过实时更新或刷新看到

---

## 17. TC-09 FeedEngine 抢单

### 页面

- `FeedEngine -> Quest Hall`

### 操作

1. 点击 NST 订单卡片
2. 打开订单详情
3. 点击抢单

### 页面验收

1. 成功进入喂价流程
2. 没有“质押不足”“权限不足”等错误

### 技术验收

1. 调用的是 `/api/orders/:id/grab`
2. 后端订单状态至少进入 `GRABBED` 或 `FEEDING`

### 失败时先查

1. 喂价员是否已在 FeedEngine 完成质押/注册
2. 钱包地址是否在 FeedEngine 有 feeder 记录

---

## 18. TC-10 FeedEngine 完成初始喂价

### 页面

- `FeedModal`

### 操作

1. 输入价格
2. 提交 commit
3. 再 reveal
4. 等待订单 settle

### 页面验收

1. commit 成功
2. reveal 成功
3. 成功页显示完成状态

### 技术验收

1. `/api/orders/:id/submit` 成功
2. `/api/orders/:id/reveal` 成功
3. 订单状态变成 `SETTLED`
4. 因为当前 NST 桥接单是 `1/1`，一个喂价员完成即可 settle

### 附加验收

1. Dashboard 中 `totalFeeds / xp / accuracy` 更新

---

## 19. TC-11 NST 收到初始喂价回写

### 页面

- 回到 `NST -> My Orders`

### 操作

1. 刷新订单页
2. 打开该订单

### 页面验收

1. 不再停留在纯等待态
2. `lastFeedPrice` 已更新
3. 订单状态应进入 `LIVE`

### 技术验收

1. FeedEngine 后端日志里能看到 `NST Writeback`
2. 应有 `FeedProtocol.submitFeed success`

### 如果失败，先查

1. `NST_FEED_SUBMITTER_PRIVATE_KEY` 是否配置
2. 写回钱包是否有提交权限
3. `externalRequestId` 是否正确落库

---

## 20. TC-12 NST 卖方追加保证金

### 页面

- `NST -> My Orders`

### 前置条件

订单状态为 `LIVE`

### 操作

1. 切卖方视角
2. 点击追加保证金
3. 输入金额
4. 确认交易

### 页面验收

1. 追加成功
2. 订单中的当前保证金变大

### 技术验收

1. 调用的是 `OptionsSettlement.addMargin`

---

## 21. TC-13 NST 卖方提取超额保证金

### 页面

- `NST -> My Orders`

### 前置条件

1. 订单为 `LIVE`
2. 保证金有超额

### 操作

1. 点击提取保证金
2. 输入金额
3. 确认交易

### 页面验收

1. 提取成功
2. 保证金下降
3. 钱包 USDT 回升

### 技术验收

1. 调用的是 `OptionsSettlement.withdrawExcessMargin`

---

## 22. TC-14 NST 买方提前行权并触发最终喂价

### 页面

- `NST -> My Orders`

### 前置条件

1. 订单为 `LIVE`
2. `T+X` 条件满足

### 操作

1. 买方点击行权
2. 系统自动进入最终喂价请求流程

### 页面验收

1. 行权交易成功
2. 页面提示请求最终喂价
3. 订单应进入 `WAITING_FINAL_FEED`

### 技术验收

1. 调用的是 `OptionsSettlement.earlyExercise`
2. 然后调用 `requestFeed(orderId, FINAL/2, tier 或 0)`

### 特殊说明

如果订单是“跟量成交”模式，最终喂价会走建议价弹窗，而不是普通档位弹窗。

---

## 23. TC-15 FeedEngine 完成最终喂价回写

### 页面

- `FeedEngine`

### 操作

1. 刷新/等待 NST 发来的最终喂价任务
2. 找到对应订单
3. 抢单
4. commit
5. reveal
6. 等待 settle

### 页面验收

1. 订单在 FeedEngine 侧成功完成

### 技术验收

1. 后端再次出现 `NST Writeback success`
2. NST 订单状态从 `WAITING_FINAL_FEED` 进入下一阶段

---

## 24. TC-16 NST 结算

### 页面

- `NST -> My Orders`

### 前置条件

订单已具备最终喂价价格

### 操作

1. 点击结算
2. 或等待系统结算流程完成

### 页面验收

1. 状态进入 `SETTLED`
2. 收益显示更新
3. 买卖双方状态收口

### 技术验收

1. 调用的是 `settleOrder`
2. 买卖双方 payout 符合预期

---

## 25. TC-17 NST 发起仲裁

### 页面

- `NST -> My Orders`

### 前置条件

订单处于允许仲裁的状态

### 操作

1. 点击仲裁
2. 确认支付仲裁费用

### 页面验收

1. 仲裁请求发起成功
2. 页面进入仲裁态

### 技术验收

1. 调用的是 `OptionsSettlement.initiateArbitration`

---

## 26. 建议的最小联调通过标准

如果时间有限，今天至少要打通下面 8 项：

1. NST 连接钱包成功
2. FeedEngine 连接钱包成功
3. NST 创建 RFQ 成功
4. NST 报价并接受报价成功
5. NST 成功发起初始喂价
6. FeedEngine 成功收到并显示 NST 任务
7. FeedEngine 完成初始喂价
8. NST 页面确认状态和价格已更新

如果这 8 项全过，明天基本可以进入正式联调。

---

## 27. 建议的完整联调通过标准

如果下面全部通过，可以认为 NST × FeedEngine 闭环已经比较完整：

1. 初始喂价闭环成功
2. 最终喂价闭环成功
3. LIVE 阶段补保证金成功
4. LIVE 阶段提取超额保证金成功
5. 结算成功
6. 仲裁入口可用

---

## 28. 最常见的 10 个问题与排查顺序

### 问题 1：NST 点“打开 FeedEngine”跳错页面

先查：

1. `NST\frontend\.env`
2. `VITE_FEED_ENGINE_URL` 是否为 `http://localhost:3000`

### 问题 2：FeedEngine 前端连不上后端

先查：

1. `feed-engine\.env.local`
2. `VITE_API_URL`
3. `VITE_WS_URL`
4. `FRONTEND_URL`

### 问题 3：FeedEngine 后端没收到 NST 任务

先查：

1. `NST_FEED_PROTOCOL_CONTRACT`
2. 事件监听是否已启动
3. `FeedRequested` 交易是否成功上链

### 问题 4：NST 发起喂价后，FeedEngine 有日志但前端没看到

先查：

1. `/api/orders`
2. 前端是否登录
3. 前端是否过滤掉了该订单

### 问题 5：FeedEngine 喂价时提示找不到 feeder

先查：

1. 该钱包是否在 FeedEngine 有注册记录
2. 是否已质押

### 问题 6：FeedEngine 喂价完成了，NST 没更新

先查：

1. 后端是否输出 `NST Writeback`
2. `NST_FEED_SUBMITTER_PRIVATE_KEY`
3. submitter 钱包权限

### 问题 7：页面显示状态不更新

先查：

1. 手动刷新页面
2. 看 WebSocket 是否连接
3. 看链上交易是否已经确认

### 问题 8：CORS 报错

先查：

1. `FRONTEND_URL`
2. 是否混用了 `localhost` 和 `127.0.0.1`

### 问题 9：NST 进入 WAITING_FINAL_FEED 后没有后续任务

先查：

1. `earlyExercise` 是否成功
2. 后续 `requestFeed` 是否真的发起

### 问题 10：测试数据过多，页面难识别目标订单

建议：

1. 用固定标的代码
2. 用可识别名义本金
3. 每轮前记录订单创建时间

---

## 29. 今日测试记录模板

你可以直接按下面格式记录：

```text
TC-00 环境检查：通过 / 失败
TC-01 NST 连接钱包：通过 / 失败
TC-02 FeedEngine 连接钱包：通过 / 失败
TC-03 买方创建 RFQ：通过 / 失败
TC-04 卖方报价：通过 / 失败
TC-05 买方接受报价：通过 / 失败
TC-06 发起初始喂价：通过 / 失败
TC-07 FeedEngine 接收链上任务：通过 / 失败
TC-08 FeedEngine 前端显示 NST 订单：通过 / 失败
TC-09 FeedEngine 抢单：通过 / 失败
TC-10 FeedEngine 完成初始喂价：通过 / 失败
TC-11 NST 收到初始喂价回写：通过 / 失败
TC-12 追加保证金：通过 / 失败
TC-13 提取超额保证金：通过 / 失败
TC-14 提前行权触发最终喂价：通过 / 失败
TC-15 FeedEngine 完成最终喂价回写：通过 / 失败
TC-16 NST 结算：通过 / 失败
TC-17 NST 仲裁：通过 / 失败
```

---

## 30. 这份手册与另外两份文档的关系

当前你手里一共有 3 份文档：

1. `F:\Unstandardized_Products\FeedEngine\doc\NST_FeedEngine_联调手册_2026-03-20.md`
   - 偏工程启动和基础联调

2. `F:\Unstandardized_Products\FeedEngine\doc\NST_FeedEngine_客户演示手册_纯界面版_2026-03-20.md`
   - 偏客户在场时的纯页面演示

3. `F:\Unstandardized_Products\FeedEngine\doc\NST_FeedEngine_完整联调测试手册_2026-03-24.md`
   - 这份是最完整的
   - 建议你今天按这份逐步测试

