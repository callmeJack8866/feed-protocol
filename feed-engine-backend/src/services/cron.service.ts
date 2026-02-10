/**
 * Cron 定时任务调度器
 * 处理周期性任务：赛季结算、成就检查等
 */

import seasonSettlement from './season-settlement.service';
import prisma from '../config/database';

// 简单的定时任务调度器（生产环境可使用 node-cron 或 bull）
interface ScheduledTask {
    name: string;
    cronExpression: string;
    handler: () => Promise<void>;
    lastRun?: Date;
    nextRun?: Date;
    enabled: boolean;
}

const tasks: ScheduledTask[] = [];
let intervalId: NodeJS.Timeout | null = null;

/**
 * 匹配单个 cron 字段（支持 * / 逗号分隔 / 范围语法）
 * 示例: "*" → 全匹配, "5" → 匹配5, "28-31" → 匹配28,29,30,31, "1,15" → 匹配1和15
 */
function matchesCronField(field: string, value: number): boolean {
    if (field === '*') return true;

    // 逗号分隔: "1,15"
    const parts = field.split(',');
    for (const part of parts) {
        const trimmed = part.trim();
        // 范围语法: "28-31"
        if (trimmed.includes('-')) {
            const [minStr, maxStr] = trimmed.split('-');
            const min = parseInt(minStr);
            const max = parseInt(maxStr);
            if (!isNaN(min) && !isNaN(max) && value >= min && value <= max) {
                return true;
            }
        } else {
            if (parseInt(trimmed) === value) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 解析简单的 cron 表达式
 * 支持: "0 0 1 * *" (每月1日0点), "55 23 28-31 * *" (28-31日23:55)
 */
function shouldRunNow(cronExpr: string): boolean {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();

    if (!matchesCronField(minute, now.getMinutes())) return false;
    if (!matchesCronField(hour, now.getHours())) return false;
    if (!matchesCronField(dayOfMonth, now.getDate())) return false;
    // cron 月份是 1-12
    if (!matchesCronField(month, now.getMonth() + 1)) return false;
    // 星期 0-6, 0=周日
    if (!matchesCronField(dayOfWeek, now.getDay())) return false;

    return true;
}

/**
 * 注册定时任务
 */
export function registerTask(
    name: string,
    cronExpression: string,
    handler: () => Promise<void>,
    enabled = true
): void {
    tasks.push({
        name,
        cronExpression,
        handler,
        enabled
    });
    console.log(`📅 Registered cron task: ${name} (${cronExpression})`);
}

/**
 * 检查并执行到期任务
 */
async function checkAndRunTasks(): Promise<void> {
    for (const task of tasks) {
        if (!task.enabled) continue;

        if (shouldRunNow(task.cronExpression)) {
            // 防止同一分钟内重复执行
            const now = new Date();
            if (task.lastRun &&
                now.getTime() - task.lastRun.getTime() < 60000) {
                continue;
            }

            console.log(`⏰ Running scheduled task: ${task.name}`);
            task.lastRun = now;

            try {
                await task.handler();
                console.log(`✅ Task completed: ${task.name}`);
            } catch (error) {
                console.error(`❌ Task failed: ${task.name}`, error);
            }
        }
    }
}

/**
 * 启动调度器
 */
export function startScheduler(): void {
    console.log('🚀 Starting cron scheduler...');

    // 注册默认任务

    // 月末赛季结算 - 每月最后一天 23:55
    registerTask(
        'season-monthly-settlement',
        '55 23 28-31 * *', // 每月28-31日的23:55检查
        async () => {
            const now = new Date();
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

            // 只在月末最后一天执行
            if (now.getDate() === lastDayOfMonth) {
                await seasonSettlement.runMonthEndSettlement();
            }
        }
    );

    // 月初创建新赛季 - 每月1日 00:05
    registerTask(
        'season-create-new',
        '5 0 1 * *',
        async () => {
            await seasonSettlement.createNewSeason();
        }
    );

    // 订单过期扫描 - 每分钟 (方案 §6.5: 超时订单自动释放)
    registerTask(
        'order-expiry-scan',
        '* * * * *',
        async () => {
            const now = new Date();
            const expiredOrders = await prisma.order.findMany({
                where: {
                    status: { in: ['OPEN', 'GRABBED'] },
                    expiresAt: { lte: now }
                }
            });

            if (expiredOrders.length > 0) {
                for (const order of expiredOrders) {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { status: 'EXPIRED' }
                    });
                    console.log(`⏰ 订单过期: ${order.id} (${order.symbol}) status → EXPIRED`);
                }
                console.log(`📋 共处理 ${expiredOrders.length} 笔过期订单`);
            }
        }
    );

    // 每小时检查（保活 & 日志）
    registerTask(
        'hourly-heartbeat',
        '0 * * * *',
        async () => {
            console.log(`💓 Scheduler heartbeat at ${new Date().toISOString()}`);
        }
    );

    // 每分钟检查任务
    intervalId = setInterval(() => {
        checkAndRunTasks().catch(console.error);
    }, 60000);

    // 立即执行一次检查
    checkAndRunTasks().catch(console.error);

    console.log('✅ Cron scheduler started');
}

/**
 * 停止调度器
 */
export function stopScheduler(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('🛑 Cron scheduler stopped');
    }
}

/**
 * 获取所有任务状态
 */
export function getTasksStatus(): ScheduledTask[] {
    return tasks.map(t => ({
        ...t,
        handler: undefined as any // 不序列化函数
    }));
}

/**
 * 手动触发任务
 */
export async function triggerTask(taskName: string): Promise<boolean> {
    const task = tasks.find(t => t.name === taskName);
    if (!task) {
        console.log(`Task not found: ${taskName}`);
        return false;
    }

    console.log(`🔧 Manually triggering task: ${taskName}`);
    try {
        await task.handler();
        task.lastRun = new Date();
        return true;
    } catch (error) {
        console.error(`Task execution failed: ${taskName}`, error);
        return false;
    }
}

export default {
    registerTask,
    startScheduler,
    stopScheduler,
    getTasksStatus,
    triggerTask
};
