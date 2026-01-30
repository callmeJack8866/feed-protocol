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

// 导入服务
import { setupWebSocket } from './websocket';
import { initBlockchain } from './services/blockchain.service';
import { initEventListener } from './services/event-listener.service';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST']
    }
});

// 中间件
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
});

export { io };
