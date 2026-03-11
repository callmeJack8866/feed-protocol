import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 导入路由
import authRoutes from './controllers/auth.controller';
import orderRoutes from './controllers/order.controller';
import feederRoutes from './controllers/feeder.controller';
import arbitrationRoutes from './controllers/arbitration.controller';
import stakingRoutes from './controllers/staking.controller';
import adminRoutes from './controllers/admin.controller';
import chainRoutes from './controllers/chain.controller';
import trainingRoutes from './controllers/training.controller';
import seasonRoutes from './controllers/season.controller';
import achievementRoutes from './controllers/achievement.controller';
import nstRoutes from './controllers/nst.controller';

// 导入服务
import { setupWebSocket } from './websocket';
import { initBlockchain } from './services/blockchain.service';
import { initEventListener } from './services/event-listener.service';
import { startScheduler } from './services/cron.service';
import { initNFTService } from './services/nft-badge.service';
import { seedTrainingData } from './seeds/training.seed';
import { globalRateLimit } from './config/rate-limiter';
import { isRedisAvailable, closeRedis, redisHealthCheck } from './config/redis';
import { optionalAuth } from './middlewares/auth.middleware';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL.split(',')
            : ['http://localhost:5173', 'http://localhost:5174'],
        methods: ['GET', 'POST']
    }
});

// 中间件 - CORS 必须在 helmet 之前，否则 preflight 请求会被阻止
app.use(cors({
    origin: process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',')
        : ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
}));
app.use(express.json());

// 全局速率限制 (方案 §16.2: 防机器人)
app.use('/api/', globalRateLimit);

// 全局 JWT 解析（可选认证：有 token 自动解析，无 token 也通过）
// 解析后自动设置 req.user + req.headers['x-wallet-address']，向后兼容所有控制器
app.use('/api/', optionalAuth);

// 健康检查（含 Redis 状态）
app.get('/health', async (req, res) => {
    const redisCheck = await redisHealthCheck();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            redis: redisCheck,
        },
    });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/feeders', feederRoutes);
app.use('/api/arbitration', arbitrationRoutes);
app.use('/api/staking', stakingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chain', chainRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/seasons', seasonRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/nst', nstRoutes);

// WebSocket 设置
setupWebSocket(io);

// 初始化区块链服务
initBlockchain();
initEventListener();

// 错误处理中间件
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// 启动服务器
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 Feed Engine Backend running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`⛓️ Blockchain services initialized`);
    console.log(`📦 Redis: ${isRedisAvailable() ? '✅ 已连接' : '⚠️ 未连接（使用内存降级）'}`);

    // 启动定时任务调度器
    startScheduler();

    // 初始化 NFT 服务
    initNFTService();

    // 初始化培训数据（仅首次启动时创建）
    seedTrainingData().catch(err => {
        console.error('培训数据初始化失败:', err);
    });
});

// ============ 优雅关闭 ============

const shutdown = async (signal: string) => {
    console.log(`\n🛑 收到 ${signal}，正在关闭...`);
    try {
        await closeRedis();
        httpServer.close(() => {
            console.log('✅ HTTP 服务器已关闭');
            process.exit(0);
        });
    } catch (err) {
        console.error('关闭失败:', err);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
