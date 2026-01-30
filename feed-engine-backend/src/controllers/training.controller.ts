import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// ============================================
// 课程管理 API
// ============================================

/**
 * GET /api/training/courses
 * 获取课程列表
 */
router.get('/courses', async (req: Request, res: Response) => {
    try {
        const { category, market } = req.query;

        const where: any = { isActive: true };
        if (category) where.category = category;
        if (market) where.market = market;

        const courses = await prisma.trainingCourse.findMany({
            where,
            orderBy: [
                { isRequired: 'desc' },
                { orderIndex: 'asc' }
            ],
            select: {
                id: true,
                title: true,
                description: true,
                category: true,
                market: true,
                duration: true,
                xpReward: true,
                isRequired: true,
                _count: {
                    select: { exams: true }
                }
            }
        });

        res.json({ success: true, courses });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({ error: 'Failed to get courses' });
    }
});

/**
 * GET /api/training/courses/:id
 * 获取课程详情
 */
router.get('/courses/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const course = await prisma.trainingCourse.findUnique({
            where: { id },
            include: {
                exams: {
                    select: {
                        id: true,
                        title: true,
                        passingScore: true,
                        timeLimit: true
                    }
                }
            }
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json({ success: true, course });
    } catch (error) {
        console.error('Get course error:', error);
        res.status(500).json({ error: 'Failed to get course' });
    }
});

// ============================================
// 学习进度 API
// ============================================

/**
 * GET /api/training/progress
 * 获取当前用户的学习进度
 */
router.get('/progress', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 获取所有课程和用户进度
        const [courses, records] = await Promise.all([
            prisma.trainingCourse.findMany({
                where: { isActive: true },
                orderBy: [{ isRequired: 'desc' }, { orderIndex: 'asc' }]
            }),
            prisma.feederTrainingRecord.findMany({
                where: { feederId: feeder.id }
            })
        ]);

        // 合并数据
        const progress = courses.map(course => {
            const record = records.find(r => r.courseId === course.id);
            return {
                course: {
                    id: course.id,
                    title: course.title,
                    category: course.category,
                    duration: course.duration,
                    xpReward: course.xpReward,
                    isRequired: course.isRequired
                },
                status: record?.status || 'NOT_STARTED',
                progress: record?.progress || 0,
                examPassed: record?.examPassed || false,
                completedAt: record?.completedAt
            };
        });

        // 计算统计数据
        const stats = {
            total: courses.length,
            completed: records.filter(r => r.status === 'COMPLETED').length,
            inProgress: records.filter(r => r.status === 'IN_PROGRESS').length,
            examsPassed: records.filter(r => r.examPassed).length
        };

        res.json({ success: true, progress, stats });
    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json({ error: 'Failed to get progress' });
    }
});

/**
 * POST /api/training/progress/:courseId
 * 更新课程学习进度
 */
router.post('/progress/:courseId', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;
        const { courseId } = req.params;
        const { progress } = req.body;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 检查课程存在
        const course = await prisma.trainingCourse.findUnique({
            where: { id: courseId }
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // 更新或创建进度记录
        const record = await prisma.feederTrainingRecord.upsert({
            where: {
                feederId_courseId: { feederId: feeder.id, courseId }
            },
            create: {
                feederId: feeder.id,
                courseId,
                status: progress >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
                progress: Math.min(progress, 100),
                completedAt: progress >= 100 ? new Date() : null
            },
            update: {
                status: progress >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
                progress: Math.min(progress, 100),
                completedAt: progress >= 100 ? new Date() : undefined
            }
        });

        res.json({ success: true, record });
    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({ error: 'Failed to update progress' });
    }
});

// ============================================
// 考试 API
// ============================================

/**
 * GET /api/training/exams/:examId
 * 获取考试详情（包含题目）
 */
router.get('/exams/:examId', async (req: Request, res: Response) => {
    try {
        const { examId } = req.params;

        const exam = await prisma.trainingExam.findUnique({
            where: { id: examId },
            include: {
                course: {
                    select: {
                        id: true,
                        title: true
                    }
                }
            }
        });

        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        // 解析题目并隐藏正确答案
        let questions = [];
        try {
            const parsed = JSON.parse(exam.questions);
            questions = parsed.map((q: any, index: number) => ({
                id: index,
                question: q.question,
                options: q.options,
                // 不返回正确答案
            }));
        } catch (e) {
            console.error('Parse questions error:', e);
        }

        res.json({
            success: true,
            exam: {
                id: exam.id,
                title: exam.title,
                passingScore: exam.passingScore,
                timeLimit: exam.timeLimit,
                course: exam.course,
                questions
            }
        });
    } catch (error) {
        console.error('Get exam error:', error);
        res.status(500).json({ error: 'Failed to get exam' });
    }
});

/**
 * POST /api/training/exams/:examId/submit
 * 提交考试答案
 */
router.post('/exams/:examId/submit', async (req: Request, res: Response) => {
    try {
        const address = req.headers['x-wallet-address'] as string;
        const { examId } = req.params;
        const { answers, startedAt } = req.body;

        if (!address) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const feeder = await prisma.feeder.findUnique({
            where: { address: address.toLowerCase() }
        });

        if (!feeder) {
            return res.status(404).json({ error: 'Feeder not found' });
        }

        // 获取考试信息
        const exam = await prisma.trainingExam.findUnique({
            where: { id: examId },
            include: { course: true }
        });

        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        // 解析题目并计算分数
        let questions = [];
        try {
            questions = JSON.parse(exam.questions);
        } catch (e) {
            return res.status(500).json({ error: 'Invalid exam data' });
        }

        let correctCount = 0;
        const results = questions.map((q: any, index: number) => {
            const userAnswer = answers[index];
            const isCorrect = userAnswer === q.correctAnswer;
            if (isCorrect) correctCount++;
            return {
                questionIndex: index,
                userAnswer,
                correctAnswer: q.correctAnswer,
                isCorrect
            };
        });

        const score = Math.round((correctCount / questions.length) * 100);
        const passed = score >= exam.passingScore;

        // 记录考试尝试
        await prisma.examAttempt.create({
            data: {
                examId,
                feederId: feeder.id,
                answers: JSON.stringify(answers),
                score,
                passed,
                startedAt: new Date(startedAt)
            }
        });

        // 如果通过，更新培训记录并奖励 XP
        if (passed) {
            await prisma.feederTrainingRecord.upsert({
                where: {
                    feederId_courseId: { feederId: feeder.id, courseId: exam.courseId }
                },
                create: {
                    feederId: feeder.id,
                    courseId: exam.courseId,
                    status: 'COMPLETED',
                    progress: 100,
                    examPassed: true,
                    examScore: score,
                    completedAt: new Date()
                },
                update: {
                    examPassed: true,
                    examScore: score
                }
            });

            // 奖励 XP
            await prisma.feeder.update({
                where: { id: feeder.id },
                data: {
                    xp: { increment: exam.course.xpReward }
                }
            });
        }

        res.json({
            success: true,
            result: {
                score,
                passed,
                passingScore: exam.passingScore,
                correctCount,
                totalQuestions: questions.length,
                xpEarned: passed ? exam.course.xpReward : 0,
                details: results
            }
        });
    } catch (error) {
        console.error('Submit exam error:', error);
        res.status(500).json({ error: 'Failed to submit exam' });
    }
});

export default router;
