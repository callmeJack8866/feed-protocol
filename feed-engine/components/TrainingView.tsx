import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useTranslation } from '../i18n';

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: number;
  xpReward: number;
  isRequired: boolean;
  status?: string;
  progress?: number;
  examPassed?: boolean;
}

interface Exam {
  id: string;
  title: string;
  passingScore: number;
  timeLimit: number;
  questions: { id: number; question: string; options: string[] }[];
}



const getOutlineItems = (course: Course): string[] => {
  const shared = [
    'Review the data sources and validation checks required before every submission.',
    'Practice the Commit-Reveal flow from initial quote to final settlement.',
    'Work through edge cases that commonly trigger arbitration or delayed consensus.',
    'Complete the final assessment to unlock the associated XP reward.',
  ];

  if (course.category === 'ONBOARDING') {
    return [
      'Learn the core oracle mission, feeder responsibilities, and reward structure.',
      ...shared.slice(1),
    ];
  }

  if (course.category === 'MARKET_SPECIFIC') {
    return [
      'Study trading halts, dividend adjustments, and exchange-specific quote behavior.',
      ...shared.slice(1),
    ];
  }

  if (course.category === 'ADVANCED') {
    return [
      'Train for volatile sessions, thin liquidity, and fast-moving market dislocations.',
      ...shared.slice(1),
    ];
  }

  return shared;
};

const TrainingView: React.FC = () => {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [examStartTime, setExamStartTime] = useState<Date | null>(null);
  const [examResult, setExamResult] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, inProgress: 0, examsPassed: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      setLoading(true);
      const res = await api.getTrainingProgress();
      if (res.success && res.progress) {
        const mappedCourses = res.progress.map((p: any) => ({
          ...p.course,
          status: p.status,
          progress: p.progress,
          examPassed: p.examPassed,
        }));
        setLoadError(null);
        setCourses(mappedCourses);
        if (res.stats) setStats(res.stats);
      }
    } catch (error) {
      console.error('Load progress error:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load training courses');
      setCourses([]);
      setStats({ total: 0, completed: 0, inProgress: 0, examsPassed: 0 });
    } finally {
      setLoading(false);
    }
  };

  const startExam = async (courseId: string) => {
    try {
      const courseRes = await api.getCourseDetail(courseId);
      if (courseRes.success && courseRes.course?.exams?.length > 0) {
        const examRes = await api.getExam(courseRes.course.exams[0].id);
        if (examRes.success && examRes.exam) {
          setExam(examRes.exam);
          setAnswers(new Array(examRes.exam.questions.length).fill(-1));
          setExamStartTime(new Date());
          setExamResult(null);
        }
      }
    } catch (error) {
      console.error('Start exam error:', error);
    }
  };

  const submitExamAnswers = async () => {
    if (!exam || !examStartTime) return;

    try {
      const res = await api.submitExam(exam.id, answers, examStartTime);
      if (res.success) {
        setExamResult(res.result);
        loadProgress();
      }
    } catch (error) {
      console.error('Submit exam error:', error);
    }
  };

  const getStatusDisplay = (status?: string, examPassed?: boolean) => {
    if (examPassed) return { text: t.training.passed, color: 'text-emerald-400', icon: 'PASS' };
    if (status === 'COMPLETED') return { text: t.training.completed, color: 'text-emerald-400', icon: 'DONE' };
    if (status === 'IN_PROGRESS') return { text: t.training.studying, color: 'text-amber-400', icon: 'LIVE' };
    return { text: t.training.notStarted, color: 'text-slate-400', icon: 'NEW' };
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      ONBOARDING: t.training.categoryOnboarding,
      MONTHLY: t.training.categoryMonthly,
      MARKET_SPECIFIC: t.training.categoryMarketSpecific,
      ADVANCED: t.training.categoryAdvanced,
    };
    return labels[category] || category;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase">{t.training.title}</h2>
        <p className="text-slate-500">{t.training.subtitle}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { label: t.training.totalCourses, value: stats.total, icon: 'CRS' },
          { label: t.training.completed, value: stats.completed, icon: 'DONE' },
          { label: t.training.inProgress, value: stats.inProgress, icon: 'LIVE' },
          { label: t.training.examsPassed, value: stats.examsPassed, icon: 'PASS' },
        ].map((stat, i) => (
          <div key={i} className="glass-panel rounded-2xl p-6 text-center">
            <span className="text-xs font-black uppercase tracking-widest text-cyan-300">{stat.icon}</span>
            <p className="text-3xl font-black font-orbitron text-cyan-400 mt-3">{stat.value}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {loadError && (
          <div className="col-span-full mb-4 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-center">
            <p className="text-rose-400 font-semibold mb-2">⚠️ {loadError}</p>
            <button
              onClick={() => { setLoadError(null); loadProgress(); }}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all text-sm font-semibold"
            >
              ↻ Retry
            </button>
          </div>
        )}
        {courses.map((course, idx) => {
          const statusInfo = getStatusDisplay(course.status, course.examPassed);
          return (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-8 rounded-[2.5rem] glass-panel border flex flex-col justify-between group transition-all duration-300 ${
                course.examPassed ? 'border-emerald-500/30' : 'border-white/10 hover:border-cyan-500/30'
              }`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/5 ${statusInfo.color}`}>
                    {getCategoryLabel(course.category)}
                  </span>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${statusInfo.color}`}>{statusInfo.icon}</span>
                </div>
                <h3 className="text-2xl font-bold font-orbitron">{course.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{course.description}</p>

                {course.progress !== undefined && course.progress > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{t.training.learningProgress}</span>
                      <span>{course.progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t.training.completionReward}</span>
                  <span className="text-lg font-black font-orbitron text-amber-400">+{course.xpReward} XP</span>
                </div>
                <button
                  onClick={() => setSelectedCourse(course)}
                  className={`px-8 py-3 rounded-2xl font-black font-orbitron text-xs uppercase transition-all ${
                    course.examPassed
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95'
                  }`}
                >
                  {course.examPassed ? t.training.reviewCourse : course.status === 'IN_PROGRESS' ? t.training.continueStudy : t.training.startStudy}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedCourse && !exam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-3xl w-full glass-panel rounded-[3rem] p-12 space-y-8 relative"
            >
              <button
                onClick={() => setSelectedCourse(null)}
                className="absolute top-8 right-8 text-slate-500 hover:text-white text-2xl"
              >
                X
              </button>

              <div className="space-y-4">
                <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-cyan-500/10 text-cyan-400">
                  {getCategoryLabel(selectedCourse.category)}
                </span>
                <h2 className="text-3xl font-black font-orbitron text-cyan-400 tracking-tighter uppercase">{selectedCourse.title}</h2>
                <div className="flex flex-wrap gap-6 text-sm text-slate-400">
                  <span>TIME {selectedCourse.duration} {t.training.minutes}</span>
                  <span>XP +{selectedCourse.xpReward}</span>
                  {selectedCourse.isRequired && <span className="text-amber-400">REQ {t.training.requiredCourse}</span>}
                </div>
                <p className="text-lg text-slate-300 leading-relaxed mt-4">{selectedCourse.description}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
                <h3 className="text-lg font-bold">{t.training.courseOutline}</h3>
                <ul className="space-y-3 text-slate-400">
                  {getOutlineItems(selectedCourse).map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="text-cyan-400 font-black">-</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => startExam(selectedCourse.id)}
                className="w-full py-5 rounded-2xl bg-cyan-500 text-black font-black font-orbitron text-lg shadow-xl shadow-cyan-500/30 hover:scale-[1.02] transition-transform"
              >
                {selectedCourse.examPassed ? t.training.retakeExam : t.training.startExam}
              </button>
            </motion.div>
          </div>
        )}

        {exam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-6 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-4xl w-full glass-panel rounded-[3rem] p-12 space-y-8 relative my-8"
            >
              <button
                onClick={() => {
                  setExam(null);
                  setExamResult(null);
                }}
                className="absolute top-8 right-8 text-slate-500 hover:text-white text-2xl"
              >
                X
              </button>

              {!examResult ? (
                <>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black font-orbitron text-cyan-400">{exam.title}</h2>
                    <div className="flex gap-6 text-sm text-slate-400">
                      <span>{t.training.passingScore}: {exam.passingScore}%</span>
                      <span>{t.training.timeLimit}: {exam.timeLimit} {t.training.minutes}</span>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {exam.questions.map((q, qIdx) => (
                      <div key={q.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                        <p className="font-medium text-lg">
                          <span className="text-cyan-400 mr-2">{qIdx + 1}.</span>
                          {q.question}
                        </p>
                        <div className="grid grid-cols-1 gap-3">
                          {q.options.map((opt, optIdx) => (
                            <button
                              key={optIdx}
                              onClick={() => {
                                const newAnswers = [...answers];
                                newAnswers[qIdx] = optIdx;
                                setAnswers(newAnswers);
                              }}
                              className={`text-left px-6 py-4 rounded-xl border transition-all ${
                                answers[qIdx] === optIdx
                                  ? 'bg-cyan-500/20 border-cyan-500 text-white'
                                  : 'bg-slate-900 border-white/5 hover:border-cyan-500/50 text-slate-300'
                              }`}
                            >
                              {String.fromCharCode(65 + optIdx)}. {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={submitExamAnswers}
                    disabled={answers.includes(-1)}
                    className="w-full py-5 rounded-2xl bg-cyan-500 text-black font-black font-orbitron text-lg shadow-xl shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t.training.submitAnswers}
                  </button>
                </>
              ) : (
                <div className="text-center space-y-8">
                  <div className={`text-4xl font-black font-orbitron ${examResult.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {examResult.passed ? 'PASS' : 'FAIL'}
                  </div>
                  <h2 className={`text-4xl font-black font-orbitron ${examResult.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                    {examResult.passed ? t.training.congrats : t.training.notPassed}
                  </h2>
                  <div className="space-y-4">
                    <p className="text-6xl font-black font-orbitron text-white">{examResult.score}</p>
                    <p className="text-slate-400">
                      {t.training.correct} {examResult.correctCount}/{examResult.totalQuestions} | {t.training.passLine} {examResult.passingScore}
                    </p>
                    {examResult.passed && (
                      <p className="text-2xl font-bold text-amber-400">+{examResult.xpEarned} XP</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setExam(null);
                      setExamResult(null);
                      setSelectedCourse(null);
                    }}
                    className="px-12 py-4 rounded-2xl bg-cyan-500 text-black font-black font-orbitron"
                  >
                    {t.training.backToCourses}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TrainingView;
