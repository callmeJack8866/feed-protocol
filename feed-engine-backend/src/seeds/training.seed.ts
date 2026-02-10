/**
 * 培训系统种子数据
 * 运行: npx ts-node src/seeds/training.seed.ts
 */

import prisma from '../config/database';

// 默认课程数据
const COURSES_DATA = [
    {
        title: '喂价员入门指南',
        description: '了解 Feed Engine 的基本概念，学习如何成为一名合格的喂价员。',
        category: 'ONBOARDING',
        content: JSON.stringify({
            modules: [
                {
                    title: '什么是 Feed Engine？',
                    content: 'Feed Engine 是全球首个去中心化人工预言机网络...',
                    duration: 5
                },
                {
                    title: '喂价员的职责',
                    content: '喂价员负责验证并提交结算级价格数据...',
                    duration: 5
                },
                {
                    title: '质押与担保机制',
                    content: '喂价员需要质押 FEED/USDT/NFT 作为担保...',
                    duration: 5
                },
                {
                    title: '奖励与惩罚',
                    content: '准确喂价获得奖励，偏差过大将受到处罚...',
                    duration: 5
                }
            ]
        }),
        duration: 20,
        xpReward: 100,
        isRequired: true,
        orderIndex: 1,
        isActive: true
    },
    {
        title: '市场类型与交易所',
        description: '了解不同市场类型（加密货币、美股、A股等）的特点和喂价规则。',
        category: 'ONBOARDING',
        content: JSON.stringify({
            modules: [
                {
                    title: '加密货币市场',
                    content: '24/7 交易，高波动性，需关注流动性...',
                    duration: 5
                },
                {
                    title: '美股市场',
                    content: '纽约时间 9:30-16:00 交易，注意盘前盘后...',
                    duration: 5
                },
                {
                    title: 'A股市场',
                    content: '涨跌停板制度，需特别注意停牌和除权...',
                    duration: 5
                },
                {
                    title: '港股市场',
                    content: '无涨跌停限制，午休时间需注意...',
                    duration: 5
                }
            ]
        }),
        duration: 20,
        xpReward: 100,
        isRequired: true,
        orderIndex: 2,
        isActive: true
    },
    {
        title: '特殊情况处理',
        description: '学习如何处理涨跌停、停牌、除权除息等特殊情况。',
        category: 'ADVANCED',
        content: JSON.stringify({
            modules: [
                {
                    title: '涨跌停处理',
                    content: '当股票涨停或跌停时，需确认是否封板...',
                    duration: 10
                },
                {
                    title: '停牌处理',
                    content: '发现停牌应选择"无法喂价"并上传证据...',
                    duration: 5
                },
                {
                    title: '除权除息',
                    content: '除权除息日需注意价格调整，使用复权价格...',
                    duration: 10
                },
                {
                    title: '高波动处理',
                    content: '遇到极端波动时需更加谨慎，确保数据来源可靠...',
                    duration: 5
                }
            ]
        }),
        duration: 30,
        xpReward: 150,
        isRequired: false,
        orderIndex: 3,
        isActive: true
    },
    {
        title: '仲裁员进阶培训',
        description: '成为仲裁员的必修课程，学习如何公正地处理争议。',
        category: 'ADVANCED',
        content: JSON.stringify({
            modules: [
                {
                    title: '仲裁员资格',
                    content: 'A级及以上喂价员可参与普通仲裁，S级可参与高级仲裁...',
                    duration: 5
                },
                {
                    title: '仲裁流程',
                    content: '争议提交 → 证据审核 → 投票 → 结果执行...',
                    duration: 10
                },
                {
                    title: '证据评估',
                    content: '如何评估截图、数据源等证据的有效性...',
                    duration: 10
                },
                {
                    title: '公正原则',
                    content: '仲裁员应遵循公正、客观、透明的原则...',
                    duration: 5
                }
            ]
        }),
        duration: 30,
        xpReward: 200,
        isRequired: false,
        orderIndex: 4,
        isActive: true
    }
];

// 默认考试数据
const EXAMS_DATA = [
    {
        courseIndex: 0, // 关联到第一门课程
        title: '喂价员入门考试',
        questions: JSON.stringify([
            {
                question: 'Feed Engine 的主要目的是什么？',
                options: ['提供游戏服务', '提供结算级价格数据', '交易加密货币', '发行 NFT'],
                correctAnswer: 1
            },
            {
                question: '喂价员需要质押什么作为担保？',
                options: ['仅 FEED 代币', '仅 USDT', 'FEED/USDT/NFT 任选其一', '无需质押'],
                correctAnswer: 2
            },
            {
                question: '价格偏差小于多少被视为极度精准？',
                options: ['1%', '0.5%', '0.1%', '0.05%'],
                correctAnswer: 3
            },
            {
                question: '当发现标的停牌时应该怎么做？',
                options: ['随便填一个价格', '选择无法喂价并提供证据', '等待恢复交易', '直接放弃订单'],
                correctAnswer: 1
            },
            {
                question: '共识价格是如何计算的？',
                options: ['取最高价', '取最低价', '取平均值', '根据名义本金选择算法（中位数/去极值）'],
                correctAnswer: 3
            }
        ]),
        passingScore: 80,
        timeLimit: 10
    },
    {
        courseIndex: 1, // 关联到第二门课程
        title: '市场类型考试',
        questions: JSON.stringify([
            {
                question: 'A股市场的特点是什么？',
                options: ['无涨跌停限制', '有涨跌停板制度', '24/7 交易', '无午休时间'],
                correctAnswer: 1
            },
            {
                question: '加密货币市场的交易时间是？',
                options: ['工作日 9:00-17:00', '24/7 全天候', '仅周末', '每天 8 小时'],
                correctAnswer: 1
            },
            {
                question: '港股市场有涨跌停限制吗？',
                options: ['有', '无', '仅跌停', '仅涨停'],
                correctAnswer: 1
            },
            {
                question: '美股盘后交易需要注意什么？',
                options: ['流动性较低', '价格更稳定', '成交量更大', '不影响喂价'],
                correctAnswer: 0
            }
        ]),
        passingScore: 75,
        timeLimit: 8
    }
];

async function seedTrainingData() {
    console.log('🌱 开始初始化培训数据...');

    // 创建课程
    const createdCourses = [];
    for (const courseData of COURSES_DATA) {
        const existingCourse = await prisma.trainingCourse.findFirst({
            where: { title: courseData.title }
        });

        if (!existingCourse) {
            const course = await prisma.trainingCourse.create({
                data: courseData
            });
            createdCourses.push(course);
            console.log(`✅ 创建课程: ${course.title}`);
        } else {
            createdCourses.push(existingCourse);
            console.log(`⏭️ 课程已存在: ${existingCourse.title}`);
        }
    }

    // 创建考试
    for (const examData of EXAMS_DATA) {
        const course = createdCourses[examData.courseIndex];
        if (!course) continue;

        const existingExam = await prisma.trainingExam.findFirst({
            where: {
                courseId: course.id,
                title: examData.title
            }
        });

        if (!existingExam) {
            await prisma.trainingExam.create({
                data: {
                    courseId: course.id,
                    title: examData.title,
                    questions: examData.questions,
                    passingScore: examData.passingScore,
                    timeLimit: examData.timeLimit
                }
            });
            console.log(`✅ 创建考试: ${examData.title}`);
        } else {
            console.log(`⏭️ 考试已存在: ${examData.title}`);
        }
    }

    console.log('🎉 培训数据初始化完成！');
}

// 导出函数供外部调用
export { seedTrainingData, COURSES_DATA, EXAMS_DATA };

// 如果直接运行此脚本
if (require.main === module) {
    seedTrainingData()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ 初始化失败:', error);
            process.exit(1);
        });
}
