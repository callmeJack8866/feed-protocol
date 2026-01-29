# Feed Engine Backend

去中心化人工预言机网络后端服务

## 技术栈

- Node.js 20 LTS + TypeScript
- Express.js
- PostgreSQL + Prisma ORM
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

### 认证
- `POST /api/auth/connect` - 钱包签名登录
- `POST /api/auth/register` - 喂价员注册
- `GET /api/auth/profile` - 获取用户信息

### 订单
- `GET /api/orders` - 获取订单列表
- `GET /api/orders/:id` - 获取订单详情
- `POST /api/orders/:id/grab` - 抢单
- `POST /api/orders/:id/submit` - 提交价格哈希 (Commit)
- `POST /api/orders/:id/reveal` - 揭示价格 (Reveal)

### 喂价员
- `GET /api/feeders/me` - 获取当前喂价员信息
- `PUT /api/feeders/preferences` - 更新偏好设置
- `GET /api/feeders/history` - 获取喂价历史
- `GET /api/feeders/leaderboard` - 获取排行榜

### WebSocket 事件
- `order:new` - 新订单推送
- `order:grabbed` - 订单被抢通知
- `order:consensus` - 共识达成通知
- `order:countdown` - 倒计时更新

## 项目结构

```
src/
├── config/         # 配置
├── controllers/    # 路由控制器
├── services/       # 业务逻辑
├── websocket/      # WebSocket 处理
└── index.ts        # 入口
```
