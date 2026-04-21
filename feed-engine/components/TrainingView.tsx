import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useTranslation } from '../i18n';
import { Target, Server, Activity, ArrowRight, Zap, TriangleAlert, ShieldCheck, Crosshair, ScanEye, Database, CheckSquare, X } from 'lucide-react';
import SystemLoader from './feedback/SystemLoader';
import SystemEmpty from './feedback/SystemEmpty';
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
    'Execute target validation sequencing and checksum matching.',
    'Initiate Commit-Reveal loop protocol under simulated disruption.',
    'Isolate and bypass hostile arbitration interference arrays.',
    'Complete final clearance decryption to secure XP authorization.',
  ];

  if (course.category === 'ONBOARDING') {
    return [
      'Initialize core operative systems and ingest protocol architecture.',
      ...shared.slice(1),
    ];
  }

  if (course.category === 'MARKET_SPECIFIC') {
    return [
      'Analyze neural-trading halts and market dislocation vectors.',
      ...shared.slice(1),
    ];
  }

  if (course.category === 'ADVANCED') {
    return [
      'Deploy tactical countermeasures in catastrophic liquidity environments.',
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
  const [examWorking, setExamWorking] = useState(false);

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
      console.error('Core failure loading simulations:', error);
      setLoadError(error instanceof Error ? error.message : 'SYS_ERR: Simulation matrix offline.');
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
      console.error('Sim instantiation failure:', error);
    }
  };

  const submitExamAnswers = async () => {
    if (!exam || !examStartTime) return;
    try {
      setExamWorking(true);
      const res = await api.submitExam(exam.id, answers, examStartTime);
      if (res.success) {
        setExamResult(res.result);
        loadProgress();
      }
    } catch (error) {
      console.error('Telemetry submit error:', error);
    } finally {
      setExamWorking(false);
    }
  };

  const getStatusDisplay = (status?: string, examPassed?: boolean) => {
    if (examPassed) return { text: 'CLEARANCE GRANTED', color: 'text-emerald-400', border: 'border-emerald-500/30' };
    if (status === 'COMPLETED') return { text: 'MODULE COMPLETED', color: 'text-cyan-400', border: 'border-cyan-500/30' };
    if (status === 'IN_PROGRESS') return { text: 'SYNC IN PROGRESS', color: 'text-amber-400', border: 'border-amber-500/30' };
    return { text: 'AWAITING LINK', color: 'text-slate-500', border: 'border-white/10' };
  };

  if (loading) {
    return <SystemLoader theme="cyan" message="SYS_SYNC: INITIALIZING SIMULATOR ARRAY" subMessage="SECURING TACTICAL SIMULATION" />;
  }

  return (
    <div className="space-y-6 lg:space-y-12 max-w-[90rem] mx-auto pb-24">
      {/* 1. THE PROVING GROUNDS HEADER */}
      <header className="relative w-full rounded-[1.75rem] lg:rounded-[3rem] p-4 sm:p-5 lg:p-14 border border-white/10 overflow-hidden shadow-2xl flex flex-col xl:flex-row justify-between items-center gap-5 lg:gap-10 bg-[#0A0D12]">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-[0.05] pointer-events-none" />
        <div className="absolute -left-32 -bottom-32 w-96 h-96 bg-cyan-900/30 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex-1 w-full text-center xl:text-left space-y-3">
          <div className="inline-flex items-center gap-3 px-4 py-2 border border-cyan-500/20 bg-cyan-500/5 rounded-full mb-2">
            <ScanEye size={12} className="text-cyan-400" />
            <span className="text-[10px] uppercase font-black tracking-[0.4em] text-cyan-400">Restricted Sector</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-7xl font-black font-orbitron tracking-tighter uppercase italic text-white leading-none">
            Proving Grounds
          </h2>
          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.24em] lg:tracking-[0.5em] italic ml-2 mt-2">
            Operative Clearances & Simulations
          </p>
        </div>

        <div className="relative z-10 w-full xl:w-auto flex md:grid md:grid-cols-4 gap-3 lg:gap-4 overflow-x-auto md:overflow-visible no-scrollbar">
          {[
            { label: 'Network Modules', value: stats.total, color: 'text-slate-300', tag: 'NET' },
            { label: 'Active Link', value: stats.inProgress, color: 'text-amber-400', tag: 'SYNC' },
            { label: 'Cleared', value: stats.completed, color: 'text-cyan-400', tag: 'DONE' },
            { label: 'Certifications', value: stats.examsPassed, color: 'text-emerald-400', tag: 'PASS' },
          ].map((stat, i) => (
            <div key={i} className="min-w-[130px] bg-black/50 border border-white/5 p-4 lg:p-6 rounded-[1.5rem] lg:rounded-[2rem] text-center flex flex-col items-center justify-center">
              <span className="text-[9px] font-black tracking-[0.3em] uppercase text-slate-500 mb-1">{stat.tag}</span>
              <p className={`text-4xl font-black font-orbitron ${stat.color}`}>{stat.value}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>
      </header>

      {loadError && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 lg:p-8 rounded-[1.5rem] lg:rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4 lg:gap-6 overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-[0.03]" />
          <div className="flex items-center gap-6 relative z-10">
            <TriangleAlert className="text-rose-500 shrink-0 w-12 h-12" />
            <div>
              <p className="text-rose-500 font-black tracking-widest text-lg uppercase font-orbitron">Array Corruption Detected</p>
              <p className="text-rose-400/70 text-xs font-mono uppercase mt-1">{loadError}</p>
            </div>
          </div>
          <button
            onClick={() => { setLoadError(null); loadProgress(); }}
            className="min-h-[48px] shrink-0 relative z-10 px-5 lg:px-8 py-4 bg-rose-950 border border-rose-500/50 text-rose-300 font-black tracking-widest text-[10px] lg:text-xs uppercase hover:bg-rose-900 transition-colors flex items-center gap-3"
          >
            <Activity size={16} /> [ RUN DIAGNOSTICS & REBOOT ]
          </button>
        </div>
      )}

      {/* 2. THE SIMULATION NODES */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-8">
        {courses.map((course, idx) => {
          const status = getStatusDisplay(course.status, course.examPassed);
          return (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`rounded-[1.75rem] lg:rounded-[2.5rem] border bg-[#050608] flex flex-col group overflow-hidden ${status.border}`}
            >
              <div className="p-5 lg:p-8 pb-4 flex-1 flex flex-col relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-2 px-3 py-1 bg-black/60 border border-white/5 rounded-sm">
                    <Target size={12} className={status.color} />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Class: {course.category}</span>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 bg-black rounded border border-white/10 ${status.color}`}>
                    {status.text}
                  </span>
                </div>
                
                <h3 className={`text-2xl font-black font-orbitron leading-tight mb-3 ${course.examPassed ? 'text-white' : 'text-slate-300'}`}>{course.title}</h3>
                <p className="text-xs text-slate-500 flex-1 leading-relaxed">{course.description}</p>
                
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Neural Sync</p>
                    <p className={`text-xs font-black font-orbitron ${course.progress && course.progress > 0 ? 'text-cyan-400' : 'text-slate-600'}`}>
                      {course.progress || 0}%
                    </p>
                  </div>
                  <div className="flex gap-1 h-3 p-0.5 bg-black/50 border border-white/5 rounded">
                    {[...Array(10)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`flex-1 rounded-sm ${i < (course.progress || 0) / 10 ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-800'}`} 
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 bg-black/40 p-4 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-amber-500" />
                  <span className="text-amber-500 font-black text-sm">+{course.xpReward} XP</span>
                </div>
                <button
                  onClick={() => setSelectedCourse(course)}
                  className={`min-h-[48px] px-5 py-3 rounded-xl border relative overflow-hidden group flex items-center justify-center w-full sm:w-auto sm:min-w-[200px] transition-all duration-300 ${
                    course.examPassed
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-400 hover:bg-emerald-900 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                      : course.status === 'IN_PROGRESS' 
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-400 hover:bg-cyan-900 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]'
                        : 'bg-black border-white/20 text-slate-300 hover:bg-white/10 hover:border-white/40'
                  }`}
                >
                  <div className="absolute inset-x-0 h-1 bg-current top-0 shadow-[0_0_15px_currentColor] opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-white/10 -translate-x-[150%] skew-x-[-20deg] group-hover:animate-[scan_1s_ease-in-out_infinite]" />
                  <span className="relative z-10 flex items-center gap-2 text-[10px] uppercase font-black tracking-[0.2em] font-orbitron group-hover:scale-105 transition-transform">
                    {course.examPassed ? '[ RENEW CLEARANCE ]' : course.status === 'IN_PROGRESS' ? '[ ENTER SIMULATION ]' : '[ INITIALIZE LINK ]'}
                    <ArrowRight size={12} />
                  </span>
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 3. MISSION BRIEFING MODAL */}
      <AnimatePresence>
        {selectedCourse && !exam && (
          <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/95 backdrop-blur-xl p-0 lg:p-6">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-20 pointer-events-none" />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, filter: 'blur(10px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              exit={{ scale: 0.95, opacity: 0, filter: 'blur(10px)' }}
              className="max-w-4xl w-full h-[100dvh] lg:h-auto lg:max-h-[92vh] bg-[#050608] border-0 lg:border border-cyan-500/30 rounded-none lg:rounded-[3rem] overflow-hidden relative shadow-[0_0_100px_rgba(34,211,238,0.15)] flex flex-col"
            >
              {/* Header Bar */}
              <div className="bg-cyan-950/30 border-b border-cyan-500/30 p-4 lg:p-6 lg:px-10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4 text-cyan-500">
                  <Database size={20} className="animate-pulse" />
                  <span className="text-[10px] lg:text-sm font-black uppercase tracking-[0.2em] lg:tracking-[0.4em]">Encrypted Mission Briefing</span>
                </div>
                <button onClick={() => setSelectedCourse(null)} className="text-cyan-500/50 hover:text-cyan-400 transition-colors">
                  <X size={28} />
                </button>
              </div>

              <div className="p-4 lg:p-14 space-y-6 lg:space-y-10 overflow-y-auto custom-scrollbar">
                <div className="space-y-4 text-center">
                  <h2 className="text-3xl lg:text-4xl font-black font-orbitron text-white tracking-tighter uppercase leading-tight">
                    {selectedCourse.title}
                  </h2>
                  <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span className="border border-white/10 px-3 py-1 rounded bg-black">EST TIMER: {selectedCourse.duration} MIN</span>
                    <span className="border border-amber-500/30 px-3 py-1 rounded bg-amber-950/30 text-amber-500">YIELD: +{selectedCourse.xpReward} XP</span>
                    {selectedCourse.isRequired && <span className="border border-rose-500/30 px-3 py-1 rounded bg-rose-950/30 text-rose-500">MANDATORY PROTOCOL</span>}
                  </div>
                  <p className="text-sm lg:text-lg text-slate-400 max-w-2xl mx-auto pt-4">{selectedCourse.description}</p>
                </div>

                <div className="bg-black/60 border border-white/5 rounded-2xl p-4 lg:p-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
                  <h3 className="text-xs uppercase font-black tracking-[0.28em] lg:tracking-[0.5em] text-cyan-400 mb-6 flex items-center gap-3">
                    <Crosshair size={14} /> Tactical Objectives
                  </h3>
                  <ul className="space-y-4">
                    {getOutlineItems(selectedCourse).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-4 font-mono text-sm text-slate-300 bg-white/[0.02] p-4 rounded-lg border border-white/[0.02]">
                        <span className="text-cyan-500 opacity-50 mt-0.5">[{idx + 1}]</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 flex justify-center">
                  <button
                    onClick={() => startExam(selectedCourse.id)}
                    className="min-h-[56px] w-full sm:w-auto relative group overflow-hidden px-8 lg:px-16 py-4 lg:py-6 rounded-[1.5rem] lg:rounded-[2rem] bg-cyan-500 text-black font-black uppercase tracking-widest text-sm lg:text-lg hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(34,211,238,0.2)]"
                  >
                    <div className="absolute inset-0 bg-white/20 -translate-x-full skew-x-[-20deg] group-hover:animate-[scan_1s_ease-in-out_infinite]" />
                    <span className="relative z-10 flex items-center gap-3">
                       {selectedCourse.examPassed ? '[ INITIATE OVERRIDE AUTHORIZATION ]' : '[ DECRYPT SIMULATION ]'}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. THE DECRYPTION TERMINAL (EXAM) */}
      <AnimatePresence>
        {exam && (
          <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/90 backdrop-blur-md p-0 lg:p-6 overflow-y-auto">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.2] pointer-events-none" />
            
            {/* CRT Scanline Overlay */}
            <div className="absolute inset-0 z-50 pointer-events-none mix-blend-overlay opacity-30 shadow-[inset_0_0_100px_rgba(0,0,0,0.9)]" style={{ background: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 4px)' }}></div>
            <div className="absolute w-full h-[10px] bg-cyan-400/20 blur-[5px] z-50 pointer-events-none top-0 animate-[scan_4s_linear_infinite]" />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-4xl w-full h-[100dvh] lg:h-auto lg:max-h-[92vh] lg:my-8 bg-[#030405] border-0 lg:border border-cyan-500/30 rounded-none lg:rounded-[3rem] shadow-[0_0_150px_rgba(34,211,238,0.15)] relative z-40 overflow-hidden"
            >
              {examWorking && (
                 <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center rounded-[3rem]">
                    <div className="text-cyan-500 flex flex-col items-center">
                      <Server size={48} className="animate-pulse mb-6" />
                      <p className="font-orbitron font-black text-2xl uppercase tracking-widest">Validating Integrity...</p>
                    </div>
                 </div>
              )}

              {!examResult ? (
                <div className="p-4 safe-modal-padding lg:p-14 overflow-y-auto custom-scrollbar h-full">
                  {/* Exam Header */}
                  <div className="sticky top-0 z-20 -mx-4 lg:mx-0 px-4 lg:px-0 bg-[#030405]/95 backdrop-blur border-b border-cyan-500/20 pb-4 lg:pb-8 mb-6 lg:mb-8 flex items-center justify-between">
                     <div className="space-y-2">
                       <h2 className="text-xl lg:text-3xl font-black font-orbitron text-cyan-400 tracking-tighter uppercase">{exam.title}</h2>
                       <div className="flex gap-4">
                         <span className="px-3 py-1 bg-rose-950/30 text-rose-500 border border-rose-500/20 rounded text-[9px] font-black tracking-widest uppercase">
                           Clearance THRESHOLD: {exam.passingScore}%
                         </span>
                         <span className="px-3 py-1 bg-amber-950/30 text-amber-500 border border-amber-500/20 rounded text-[9px] font-black tracking-widest uppercase">
                           MAX LINK TIME: {exam.timeLimit} MIN
                         </span>
                       </div>
                     </div>
                     <button onClick={() => { setExam(null); setExamResult(null); }} className="text-slate-600 hover:text-white transition-colors">
                       <X size={32} />
                     </button>
                  </div>

                  <div className="space-y-8">
                    {exam.questions.map((q, qIdx) => (
                      <div key={q.id} className="bg-white/[0.02] border border-white/5 rounded-[1.5rem] lg:rounded-[2rem] p-4 lg:p-8 space-y-5 lg:space-y-6 group">
                        <div className="flex items-start gap-4">
                           <div className="mt-1 px-2 py-1 bg-cyan-950 rounded border border-cyan-500/30 text-[10px] font-mono text-cyan-400 font-bold uppercase shrink-0">
                             [ CHK-0{qIdx + 1} ]
                           </div>
                           <p className="font-medium text-lg leading-relaxed text-slate-200">
                             {q.question}
                           </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 pl-12 -ml-2">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = answers[qIdx] === optIdx;
                            return (
                              <button
                                key={optIdx}
                                onClick={() => {
                                  const newAnswers = [...answers];
                                  newAnswers[qIdx] = optIdx;
                                  setAnswers(newAnswers);
                                }}
                                className={`min-h-[48px] text-left px-4 lg:px-6 py-4 rounded-xl border flex items-center gap-4 transition-all ${
                                  isSelected
                                    ? 'bg-cyan-500/20 border-cyan-500 shadow-[inset_0_0_20px_rgba(34,211,238,0.2)]'
                                    : 'bg-[#0A0D12] border-white/5 hover:border-cyan-500/30'
                                }`}
                              >
                                <div className={`w-5 h-5 flex items-center justify-center shrink-0 border ${isSelected ? 'border-cyan-400 bg-cyan-500 text-black' : 'border-slate-600 bg-black text-transparent'} rounded-sm transition-colors`}>
                                   <CheckSquare size={12} className={isSelected ? 'block' : 'hidden'} />
                                </div>
                                <span className={isSelected ? 'text-white font-bold' : 'text-slate-400 font-medium'}>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="fixed lg:static inset-x-0 bottom-0 z-40 flex flex-col lg:flex-row justify-between items-center gap-3 mt-12 bg-black/90 lg:bg-black/50 backdrop-blur-xl lg:backdrop-blur-0 px-4 pt-4 safe-bottom-bar lg:p-6 rounded-none lg:rounded-[2rem] border-t lg:border border-cyan-500/20">
                     <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                       Completion: {answers.filter(a => a !== -1).length} / {exam.questions.length} blocks secured
                     </p>
                     <button
                       onClick={submitExamAnswers}
                       disabled={answers.includes(-1)}
                       className="min-h-[52px] w-full lg:w-auto px-8 lg:px-10 py-4 rounded-2xl bg-cyan-500 text-black font-black font-orbitron text-base lg:text-lg disabled:opacity-30 disabled:grayscale transition-all hover:scale-105 active:scale-95"
                     >
                       [ EXTRACT RESULTS ]
                     </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 lg:p-16 flex flex-col items-center justify-center text-center space-y-6 lg:space-y-10 min-h-full overflow-y-auto custom-scrollbar">
                  <div className={`relative flex items-center justify-center w-40 h-40 rounded-full border-4 ${examResult.passed ? 'border-emerald-500' : 'border-rose-500'}`}>
                     <div className={`absolute inset-0 blur-[40px] opacity-40 rounded-full ${examResult.passed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                     {examResult.passed ? <ShieldCheck size={64} className="text-emerald-400 relative z-10" /> : <TriangleAlert size={64} className="text-rose-400 relative z-10" />}
                  </div>
                  
                  <div className="space-y-4">
                     <h2 className={`text-4xl md:text-6xl font-black font-orbitron tracking-tighter uppercase ${examResult.passed ? 'text-white' : 'text-rose-400'}`}>
                        {examResult.passed ? '[ CLEARANCE GRANTED ]' : '[ SIMULATION FAILED ]'}
                     </h2>
                     <p className="text-slate-400 uppercase tracking-[0.3em] font-black">
                        {examResult.passed ? 'Operative authorized for deployment' : 'Operative compromised. Clearance denied.'}
                     </p>
                  </div>

                  <div className="flex gap-4 p-6 bg-black/40 border border-white/5 rounded-3xl w-full max-w-lg justify-around">
                     <div className="text-center">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Score Matrix</p>
                        <p className="text-3xl font-black font-orbitron text-white">{examResult.score}</p>
                     </div>
                     <div className="w-px bg-white/10" />
                     <div className="text-center">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Check-Sum</p>
                        <p className="text-3xl font-black font-orbitron text-white">{examResult.correctCount}/{examResult.totalQuestions}</p>
                     </div>
                  </div>

                  {examResult.passed && (
                    <div className="inline-flex items-center gap-4 px-8 py-4 bg-amber-500/20 border border-amber-500/40 rounded-[2rem] text-amber-400">
                       <Zap size={24} />
                       <span className="text-3xl font-black font-orbitron">+{examResult.xpEarned} XP ALLOCATED</span>
                    </div>
                  )}

                  <button
                    onClick={() => { setExam(null); setExamResult(null); setSelectedCourse(null); }}
                    className={`mt-8 px-16 py-6 rounded-[2rem] font-black uppercase text-lg tracking-widest transition-all ${
                       examResult.passed 
                         ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.3)]' 
                         : 'bg-rose-950 border border-rose-500 text-rose-400 hover:bg-rose-900 shadow-[0_0_50px_rgba(244,63,94,0.3)]'
                    }`}
                  >
                    {examResult.passed ? '[ DEPLOY TO HALL ]' : '[ RETURN TO CHAMBER ]'}
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
