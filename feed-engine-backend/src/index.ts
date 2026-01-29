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

// 导入 WebSocket 处理
import { setupWebSocket } from './websocket';

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

// WebSocket 设置
setupWebSocket(io);

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
});

export { io };
