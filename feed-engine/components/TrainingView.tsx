
import React, { useState } from 'react';
import { TrainingCourse } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_COURSES: TrainingCourse[] = [
  { id: '1', title: 'Oracle Fundamentals', category: 'General', xpReward: 100, status: 'completed', description: 'Basics of manual feeding and commit-reveal mechanisms.' },
  { id: '2', title: 'Advanced Stock Arbitrage', category: 'Stocks', xpReward: 250, status: 'available', description: 'Handling limit up/down situations in CN/US markets.' },
  { id: '3', title: 'Crypto Volatility Mastery', category: 'Crypto', xpReward: 300, status: 'locked', description: 'Navigating flash crashes and DEX liquidity gaps.' },
  { id: '4', title: 'High-Value Settlement Ethics', category: 'Compliance', xpReward: 500, status: 'locked', description: 'Required for Master Zone access. Professional conduct guidelines.' },
];

const TrainingView: React.FC = () => {
  const [selectedCourse, setSelectedCourse] = useState<TrainingCourse | null>(null);

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase">TRAINING ACADEMY</h2>
        <p className="text-slate-500">Sharpen your oracle intuition and unlock elite quest zones</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {MOCK_COURSES.map((course, idx) => (
          <motion.div
            key={course.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`p-8 rounded-[2.5rem] glass-panel border flex flex-col justify-between group transition-all duration-300 ${
              course.status === 'locked' ? 'opacity-50 grayscale border-white/5' : 
              course.status === 'completed' ? 'border-emerald-500/30' : 'border-white/10 hover:border-cyan-500/30'
            }`}
          >
            <div className="space-y-4">
               <div className="flex justify-between items-start">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/5 ${
                    course.status === 'completed' ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {course.category}
                  </span>
                  {course.status === 'locked' && <span className="text-xl">🔒</span>}
                  {course.status === 'completed' && <span className="text-xl text-emerald-500">✅</span>}
               </div>
               <h3 className="text-2xl font-bold font-orbitron">{course.title}</h3>
               <p className="text-sm text-slate-500 leading-relaxed">{course.description}</p>
            </div>

            <div className="mt-8 flex items-center justify-between">
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Potential Reward</span>
                  <span className="text-lg font-black font-orbitron text-amber-400">+{course.xpReward} XP</span>
               </div>
               <button 
                 disabled={course.status === 'locked'}
                 onClick={() => course.status !== 'locked' && setSelectedCourse(course)}
                 className={`px-8 py-3 rounded-2xl font-black font-orbitron text-xs uppercase transition-all ${
                   course.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                   course.status === 'locked' ? 'bg-slate-800 text-slate-600' : 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95'
                 }`}
               >
                 {course.status === 'completed' ? 'Review Lesson' : course.status === 'locked' ? 'Prerequisites Required' : 'Enroll Now'}
               </button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-3xl w-full glass-panel rounded-[3rem] p-12 space-y-8 relative"
            >
              <button onClick={() => setSelectedCourse(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white">✕</button>
              
              <div className="space-y-4">
                <h2 className="text-3xl font-black font-orbitron text-cyan-400 tracking-tighter uppercase">{selectedCourse.title}</h2>
                <div className="prose prose-invert text-slate-400 max-w-none">
                   <p className="text-lg leading-relaxed">
                     In this module, you will learn the critical aspects of <strong>{selectedCourse.category}</strong> market feeding.
                     Oracle networks rely on human intuition to bridge the gap between volatile off-chain data and deterministic on-chain execution.
                   </p>
                   <ul className="space-y-2 mt-4 text-sm">
                      <li>• Understanding the 30-day stake cooling period</li>
                      <li>• Detecting market wash trades before submission</li>
                      <li>• Proper use of the "Cannot Feed" anomaly report tool</li>
                   </ul>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
                 <p className="text-xs font-black uppercase tracking-widest text-slate-500">Practice Exam (Mock Test)</p>
                 <div className="space-y-4">
                    <p className="font-medium">Question: A ticker shows a 50% price gap between exchanges due to a localized liquidity drain. What is the correct procedure?</p>
                    <div className="grid grid-cols-1 gap-3">
                       {['Submit the average price', 'Submit the price from the primary exchange', 'Use the "Cannot Feed" tool with "No Liquidity" reason', 'Wait for 5 minutes'].map((opt, i) => (
                         <button key={i} className="text-left px-6 py-4 rounded-2xl bg-slate-900 border border-white/5 hover:border-cyan-500/50 transition-colors text-sm">
                           {String.fromCharCode(65+i)}. {opt}
                         </button>
                       ))}
                    </div>
                 </div>
              </div>

              <button className="w-full py-5 rounded-2xl bg-cyan-500 text-black font-black font-orbitron text-lg shadow-xl shadow-cyan-500/30">
                COMPLETE FINAL ASSESSMENT
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TrainingView;
