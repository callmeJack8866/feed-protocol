
import React, { useState } from 'react';
import { ArbitrationCase, MarketType, FeedType, OrderStatus } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';

const MOCK_CASES: ArbitrationCase[] = [
   {
      orderId: 'ARB-8821',
      symbol: '600519.SH',
      market: MarketType.CN_STOCK,
      country: 'CN',
      exchange: 'SSE',
      feedType: FeedType.ARBITRATION,
      notionalAmount: 5000000,
      requiredFeeders: 10,
      consensusThreshold: '7/10',
      specialConditions: [],
      rewardAmount: 500,
      status: OrderStatus.DISPUTED,
      timeRemaining: 3600,
      disputeReason: 'Reported price deviates >5% from secondary market benchmarks during limit-up lock.',
      submittedPrices: [
         { feeder: '0x123...456', price: 1820.5, timestamp: Date.now() - 50000 },
         { feeder: '0xABC...DEF', price: 1821.0, timestamp: Date.now() - 40000 },
      ],
      evidenceUrl: '/assets/images/arbitration-evidence-v2.png',
      votes: { up: 12, down: 2 }
   }
];

const ArbitrationView: React.FC = () => {
   const [selectedCase, setSelectedCase] = useState<ArbitrationCase | null>(null);
   const { t } = useTranslation();

   return (
      <div className="space-y-12">
         <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
               <h2 className="text-4xl font-black font-orbitron tracking-tighter italic uppercase text-rose-500">{t.arbitration.judicialChamber}</h2>
               <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{t.arbitration.asClassOnly}</p>
            </div>
            <div className="flex bg-rose-500/10 border border-rose-500/20 px-6 py-3 rounded-2xl items-center gap-4">
               <span className="text-rose-500 animate-pulse">●</span>
               <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">1 {t.arbitration.activeConflict}</span>
            </div>
         </header>

         <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {MOCK_CASES.map((item) => (
               <motion.div
                  key={item.orderId}
                  layoutId={item.orderId}
                  onClick={() => setSelectedCase(item)}
                  className="p-8 rounded-[2.5rem] glass-panel border border-rose-500/20 hover:border-rose-500/40 cursor-pointer transition-all space-y-6 group bg-gradient-to-br from-rose-500/[0.02] to-transparent"
               >
                  <div className="flex justify-between items-start">
                     <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center text-3xl">⚖️</div>
                        <div>
                           <h3 className="text-xl font-black font-orbitron group-hover:text-rose-400 transition-colors uppercase italic">{item.symbol}</h3>
                           <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Case ID: {item.orderId}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{t.arbitration.stakedBounty}</p>
                        <p className="text-2xl font-black font-orbitron text-rose-500">{item.rewardAmount} FEED</p>
                     </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-black/40 border border-rose-500/10 space-y-2">
                     <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest">{t.arbitration.conflictRoot}</p>
                     <p className="text-sm text-slate-300 font-medium leading-relaxed italic">"{item.disputeReason}"</p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                     <div className="flex items-center gap-4">
                        <span>{t.arbitration.currentVotes}:</span>
                        <span className="text-emerald-400">✅ {item.votes.up}</span>
                        <span className="text-rose-400">❌ {item.votes.down}</span>
                     </div>
                     <span className="text-rose-500/60 font-orbitron">01:42:55 {t.arbitration.untilLock}</span>
                  </div>
               </motion.div>
            ))}
         </div>

         <AnimatePresence>
            {selectedCase && (
               <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4">
                  <motion.div
                     layoutId={selectedCase.orderId}
                     className="max-w-5xl w-full glass-panel rounded-[3.5rem] overflow-hidden border border-rose-500/30 flex flex-col h-[85vh]"
                  >
                     <div className="p-10 border-b border-rose-500/10 flex justify-between items-center bg-rose-500/[0.03]">
                        <div className="space-y-1">
                           <h2 className="text-3xl font-black font-orbitron text-rose-500 italic uppercase">{t.arbitration.arbitrationProtocol}</h2>
                           <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">{t.arbitration.evidenceVsSignatures}</p>
                        </div>
                        <button onClick={() => setSelectedCase(null)} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all">✕</button>
                     </div>

                     <div className="flex-1 overflow-y-auto p-12 custom-scrollbar grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Left: Evidence & Details */}
                        <div className="space-y-8">
                           <section className="space-y-4">
                              <h3 className="text-xs font-black text-rose-500 uppercase tracking-widest px-2">{t.arbitration.primaryEvidence}</h3>
                              <div className="aspect-video rounded-3xl overflow-hidden border border-rose-500/20 shadow-2xl relative group">
                                 <img src={selectedCase.evidenceUrl} alt="evidence" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" />
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                 <div className="absolute bottom-6 left-6 flex items-center gap-3">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                    <span className="text-[10px] font-mono text-white/80 uppercase">Timestamped Mkt_Capture_02.png</span>
                                 </div>
                              </div>
                           </section>

                           <section className="space-y-4">
                              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">{t.arbitration.disputeSummary}</h3>
                              <div className="p-6 rounded-3xl bg-rose-500/5 border border-rose-500/10 italic text-slate-400 text-sm leading-relaxed">
                                 {selectedCase.disputeReason}
                              </div>
                           </section>
                        </div>

                        {/* Right: Submission Audit */}
                        <div className="space-y-8">
                           <section className="space-y-4">
                              <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest px-2">{t.arbitration.aggregatedSubmissions}</h3>
                              <div className="space-y-3">
                                 {selectedCase.submittedPrices.map((sub, i) => (
                                    <div key={i} className="p-5 rounded-2xl border border-white/5 bg-white/5 flex justify-between items-center group hover:border-cyan-500/30 transition-all">
                                       <div>
                                          <p className="text-[9px] text-slate-500 font-mono uppercase">{t.arbitration.feederId}</p>
                                          <p className="text-sm font-bold text-slate-300 font-mono">{sub.feeder}</p>
                                       </div>
                                       <div className="text-right">
                                          <p className="text-[9px] text-slate-500 font-black uppercase mb-0.5">{t.arbitration.reportedPrice}</p>
                                          <p className="text-xl font-black font-orbitron text-cyan-400">{sub.price}</p>
                                       </div>
                                    </div>
                                 ))}
                                 <div className="p-6 rounded-2xl border-2 border-dashed border-white/5 text-center flex flex-col items-center justify-center space-y-2 opacity-50">
                                    <span className="text-xs font-black uppercase tracking-widest">8 {t.arbitration.additionalNodesHalted}</span>
                                    <span className="text-[8px] font-mono uppercase">{t.arbitration.waitingConsensus}</span>
                                 </div>
                              </div>
                           </section>

                           <div className="pt-8 border-t border-white/5 flex gap-4">
                              <button className="flex-1 py-6 rounded-3xl bg-rose-500 text-black font-black font-orbitron text-sm shadow-2xl shadow-rose-500/20 hover:bg-rose-400 transition-all uppercase italic">
                                 {t.arbitration.rejectValue}
                              </button>
                              <button className="flex-1 py-6 rounded-3xl border border-white/10 text-white font-black font-orbitron text-sm hover:bg-white/5 transition-all uppercase italic">
                                 {t.arbitration.affirmValue}
                              </button>
                           </div>
                        </div>
                     </div>

                     <div className="p-8 border-t border-rose-500/10 flex items-center justify-between bg-black/40">
                        <div className="flex items-center gap-6">
                           <div className="flex -space-x-3">
                              {[1, 2, 3, 4].map(i => (
                                 <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 overflow-hidden">
                                    <img src="/assets/images/owl-mascot-v3.png" alt="judges" />
                                 </div>
                              ))}
                              <div className="w-10 h-10 rounded-full bg-rose-500/20 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black text-rose-500">+8</div>
                           </div>
                           <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">12 {t.arbitration.activeArbitrators}</p>
                        </div>
                        <p className="text-[10px] text-rose-500/60 font-black uppercase tracking-widest">{t.arbitration.criticalityTier}</p>
                     </div>
                  </motion.div>
               </div>
            )}
         </AnimatePresence>
      </div>
   );
};

export default ArbitrationView;
