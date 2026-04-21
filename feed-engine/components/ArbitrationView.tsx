import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';
import * as api from '../services/api';
import { initWebSocket, off, on } from '../services/websocket';
import { Scale, Gavel, FileText, FileWarning, Eye, AlertOctagon, CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import SystemLoader from './feedback/SystemLoader';
import SystemEmpty from './feedback/SystemEmpty';

interface ArbitrationCaseSummary {
  id: string;
  orderId: string;
  disputeReason: string;
  description: string;
  evidenceUrls: string[];
  caseType: 'NORMAL' | 'ADVANCED';
  depositAmount: number;
  depositPaid: boolean;
  requiredVotes: number;
  status: 'PENDING' | 'VOTING' | 'RESOLVED' | 'CANCELLED';
  supportCount?: number;
  rejectCount?: number;
  votesCount?: number;
  verdict?: string | null;
  verdictReason?: string | null;
  votingDeadline?: string | null;
  createdAt: string;
  appeals?: any[];
  votes?: any[];
}

interface OrderOption {
  id: string;
  symbol: string;
  market: string;
  status: string;
  rewardAmount: number;
}

const parseJsonArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
};

const normalizeCase = (caseItem: any): ArbitrationCaseSummary => ({
  ...caseItem,
  evidenceUrls: parseJsonArray(caseItem.evidenceUrls),
  appeals: caseItem.appeals ?? [],
  votes: caseItem.votes ?? [],
});

const ArbitrationView: React.FC = () => {
  const { t } = useTranslation();
  const [cases, setCases] = useState<ArbitrationCaseSummary[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedCase, setSelectedCase] = useState<ArbitrationCaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [form, setForm] = useState({
    orderId: '',
    disputeReason: '',
    description: '',
    evidenceUrls: '',
    appealReason: '',
    daoFeedAmount: '100',
  });

  const loadCases = async (preserveSelection = true) => {
    const res = await api.getArbitrationCases();
    const nextCases = (res.cases ?? []).map(normalizeCase);
    setCases(nextCases);

    const nextSelectedId = preserveSelection ? selectedCaseId || nextCases[0]?.id || '' : nextCases[0]?.id || '';
    setSelectedCaseId(nextSelectedId);

    if (nextSelectedId) {
      const detailRes = await api.getArbitrationCase(nextSelectedId);
      setSelectedCase(normalizeCase(detailRes.case));
    } else {
      setSelectedCase(null);
    }
  };

  const loadOrders = async () => {
    const res = await api.getOrders();
    setOrders((res.orders ?? []).slice(0, 20));
  };

  const loadData = async (preserveSelection = true) => {
    try {
      setLoading(true);
      setError('');
      await Promise.all([loadCases(preserveSelection), loadOrders()]);
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Adjudication Engine Offline.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  useEffect(() => {
    initWebSocket();
    const refresh = () => loadData(true);
    on('arbitration:new', refresh);
    on('arbitration:vote', refresh);
    on('arbitration:resolved', refresh);
    on('arbitration:appeal', refresh);
    on('appeal:resolved', refresh);

    return () => {
      off('arbitration:new', refresh);
      off('arbitration:vote', refresh);
      off('arbitration:resolved', refresh);
      off('arbitration:appeal', refresh);
      off('appeal:resolved', refresh);
    };
  }, [selectedCaseId]);

  const votingCases = useMemo(() => cases.filter((item) => item.status === 'VOTING'), [cases]);
  const resolvedCases = useMemo(() => cases.filter((item) => item.status === 'RESOLVED'), [cases]);

  const updateForm = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const evidenceUrls = useMemo(() => form.evidenceUrls.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean), [form.evidenceUrls]);

  const handleCreateCase = async () => {
    if (!form.orderId || !form.disputeReason.trim()) {
      setError('SYS_ERR: Required indictment fields missing.');
      return;
    }
    try {
      setSubmitting(true); setError(''); setMessage('');
      const res = await api.createArbitrationCase({
        orderId: form.orderId,
        disputeReason: form.disputeReason.trim(),
        description: form.description.trim(),
        evidenceUrls,
      });
      if (res.success) {
        setMessage('SYS_LOG: Indictment Filed. Awaiting Tribunal Bond transfer.');
        setForm((prev) => ({ ...prev, disputeReason: '', description: '', evidenceUrls: '' }));
        await loadData(false);
        if (res.case?.id) setSelectedCaseId(res.case.id);
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Filing Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectCase = async (caseId: string) => {
    try {
      setSelectedCaseId(caseId);
      const res = await api.getArbitrationCase(caseId);
      setSelectedCase(normalizeCase(res.case));
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Dossier Encrypted or Missing');
    }
  };

  const handlePayDeposit = async () => {
    if (!selectedCase) return;
    try {
      setSubmitting(true); setError(''); setMessage('');
      const res = await api.payArbitrationDeposit(selectedCase.id);
      if (res.success) {
        setMessage('SYS_LOG: Tribunal Bond secured. Docket moved to active voting.');
        await handleSelectCase(selectedCase.id);
        await loadCases(true);
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Bond Transfer Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (vote: api.ArbitrationVoteOption) => {
    if (!selectedCase) return;
    try {
      setSubmitting(true); setError(''); setMessage('');
      const res = await api.voteArbitration(selectedCase.id, vote, selectedCase.description || selectedCase.disputeReason);
      if (res.success) {
        setMessage('SYS_LOG: Gavel Stroke Recorded. Verdict logged.');
        await handleSelectCase(selectedCase.id);
        await loadCases(true);
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Gavel Stroke Rejected.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppeal = async () => {
    if (!selectedCase || !form.appealReason.trim()) {
      setError('SYS_ERR: Override reasoning required.');
      return;
    }
    try {
      setSubmitting(true); setError(''); setMessage('');
      const res = await api.submitDAOAppeal(selectedCase.id, form.appealReason.trim());
      if (res.success) {
        setMessage('SYS_LOG: Supreme DAO Override escalated.');
        updateForm('appealReason', '');
        await handleSelectCase(selectedCase.id);
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: DAO Override Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDaoVote = async (appealId: string, vote: api.DAOVoteOption) => {
    try {
      setSubmitting(true); setError(''); setMessage('');
      const res = await api.voteDAOAppeal(appealId, vote, Number(form.daoFeedAmount) || 0);
      if (res.success) {
        setMessage('SYS_LOG: Supreme Vote logged.');
        if (selectedCase) await handleSelectCase(selectedCase.id);
      }
    } catch (err: any) {
      setError(err.message || 'SYS_ERR: Supreme Vote Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SystemLoader theme="rose" message="SYS_SYNC: ESTABLISHING COURT UPLINK" subMessage="SECURING ADJUDICATION TERMINAL" />;
  }

  return (
    <div className="space-y-6 lg:space-y-10 max-w-[95rem] mx-auto pb-24">
      
      {/* 1. THE HOLDING CHAMBER HEADER */}
      <header className="relative w-full rounded-[1.75rem] lg:rounded-[4rem] p-4 sm:p-5 lg:p-14 border border-rose-500/30 overflow-hidden shadow-2xl flex flex-col xl:flex-row justify-between items-center gap-5 lg:gap-10 bg-[#0F0505]">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')] opacity-20 pointer-events-none" />
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-rose-900/20 blur-[120px] rounded-[100%] pointer-events-none" />

        <div className="relative z-10 w-full flex flex-col items-center xl:items-start text-center xl:text-left space-y-4 max-w-xl">
           <div className="inline-flex items-center gap-3 px-4 py-2 border border-amber-500/30 bg-amber-500/10 rounded-full mb-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
             <Gavel size={12} className="text-amber-500" />
             <span className="text-[10px] uppercase font-black tracking-[0.4em] text-amber-500">Class-Action Authority</span>
           </div>
           <h2 className="text-3xl sm:text-4xl lg:text-7xl font-black font-orbitron tracking-tighter uppercase italic text-rose-500 leading-none">
             The High Tribunal
           </h2>
           <p className="text-rose-400/80 text-xs font-bold uppercase tracking-[0.3em] leading-relaxed">
             Execute decentralized justice. Resolve matrix disputes.
           </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-3 lg:gap-6 w-full xl:w-auto">
           <div className="bg-black/60 border-l-[4px] border-l-amber-500 border-y border-r border-rose-500/20 p-4 lg:p-6 rounded-r-3xl flex flex-col justify-center min-w-0 xl:min-w-[200px]">
              <p className="text-[9px] uppercase font-black tracking-widest text-amber-500 mb-1">Active Inquiries</p>
              <p className="text-4xl font-black font-orbitron text-white">{votingCases.length}</p>
           </div>
           <div className="bg-black/60 border-l-[4px] border-l-emerald-500 border-y border-r border-rose-500/20 p-4 lg:p-6 rounded-r-3xl flex flex-col justify-center min-w-0 xl:min-w-[200px]">
              <p className="text-[9px] uppercase font-black tracking-widest text-emerald-500 mb-1">Closed Adjudications</p>
              <p className="text-4xl font-black font-orbitron text-white">{resolvedCases.length}</p>
           </div>
        </div>
      </header>

      <AnimatePresence>
        {(message || error) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`rounded-2xl border px-4 lg:px-8 py-4 lg:py-5 text-xs font-black tracking-widest uppercase flex items-center gap-4 ${
              error ? 'border-rose-500/50 bg-rose-500/10 text-rose-400' : 'border-amber-500/50 bg-amber-500/10 text-amber-400'
            }`}
          >
            {error ? <AlertOctagon size={16} /> : <CheckCircle2 size={16} />} {error || message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6 lg:gap-8 items-start">
        
        {/* LEFT COLUMN: DOSSIERS & INDICTMENT */}
        <div className={`${selectedCase ? 'hidden xl:block' : 'block'} space-y-6 lg:space-y-8 xl:sticky xl:top-8`}>
           
           {/* Indictment Form */}
           <button
             type="button"
             onClick={() => setCreatePanelOpen((value) => !value)}
             className="xl:hidden w-full min-h-[52px] rounded-[1.5rem] border border-rose-500/30 bg-rose-950/30 px-4 text-[10px] font-black uppercase tracking-[0.28em] text-rose-300"
           >
             {createPanelOpen ? 'Hide Indictment Form' : 'Open Indictment Form'}
           </button>

           <div className={`${createPanelOpen ? 'block' : 'hidden'} xl:block p-4 lg:p-8 rounded-[1.75rem] lg:rounded-[2.5rem] bg-[#0A0202] border border-rose-500/20 shadow-xl relative overflow-hidden`}>
             <div className="absolute right-0 top-0 w-32 h-32 bg-rose-900/10 blur-[50px]" />
             
             <div className="flex items-center gap-3 mb-6 relative z-10">
               <FileWarning className="text-rose-500" size={20} />
               <h3 className="text-sm font-black uppercase tracking-widest text-rose-400">File Indictment</h3>
             </div>

             <div className="space-y-6 relative z-10">
                <div className="space-y-3">
                   <select
                     value={form.orderId}
                     onChange={(e) => updateForm('orderId', e.target.value)}
                     className="min-h-[48px] w-full bg-black border-b-2 border-transparent border-b-rose-500/30 px-4 py-4 text-white text-xs font-black uppercase tracking-widest outline-none focus:border-b-rose-500 transition-colors appearance-none"
                   >
                     <option value="" className="text-slate-600">Select Target Operation...</option>
                     {orders.map((o) => <option key={o.id} value={o.id}>[ {o.symbol} ] {o.status}</option>)}
                   </select>
                </div>

                <div className="space-y-3">
                   <input
                     value={form.disputeReason}
                     onChange={(e) => updateForm('disputeReason', e.target.value)}
                     placeholder="Brief Charge Title"
                     className="min-h-[48px] w-full bg-black border border-white/5 rounded-xl px-4 py-4 text-white placeholder-slate-600 text-sm outline-none focus:border-rose-500 focus:bg-rose-950/20 transition-all"
                   />
                </div>

                <div className="space-y-3">
                   <textarea
                     value={form.description}
                     onChange={(e) => updateForm('description', e.target.value)}
                     placeholder="Detailed Adjudication Request..."
                     rows={3}
                     className="w-full bg-black border border-white/5 rounded-xl px-4 py-4 text-white placeholder-slate-600 text-sm outline-none focus:border-rose-500 focus:bg-rose-950/20 transition-all resize-none"
                   />
                </div>

                <div className="space-y-3">
                   <textarea
                     value={form.evidenceUrls}
                     onChange={(e) => updateForm('evidenceUrls', e.target.value)}
                     placeholder="Exhibit URLs (Line separated)"
                     rows={2}
                     className="w-full bg-black border border-white/5 font-mono rounded-xl px-4 py-4 text-cyan-400 placeholder-slate-600 text-[10px] outline-none focus:border-cyan-500 focus:bg-cyan-950/20 transition-all resize-none"
                   />
                </div>

                <button
                  onClick={handleCreateCase}
                  disabled={submitting}
                  className="min-h-[48px] w-full py-4 mt-2 rounded-[1.5rem] bg-rose-950 text-rose-400 font-black uppercase tracking-widest text-xs border border-rose-500/50 hover:bg-rose-900 active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : '[ INITIATE INQUIRY ]'}
                </button>
             </div>
           </div>

           {/* DOSSIERS (Case List) */}
           <div className="p-4 lg:p-8 lg:pb-4 rounded-[1.75rem] lg:rounded-[2.5rem] bg-[#050505] border border-white/10 shadow-xl flex flex-col max-h-[560px] lg:h-[600px]">
             <div className="flex items-center justify-between mb-6 shrink-0">
               <div className="flex items-center gap-3">
                 <FileText className="text-slate-400" size={20} />
                 <h3 className="text-sm font-black uppercase tracking-widest text-white">Dossiers</h3>
               </div>
               <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{cases.length} Filed</span>
             </div>

             <div className="space-y-3 overflow-y-auto pr-2 pb-4 flex-1 custom-scrollbar">
               {cases.length === 0 ? (
                 <SystemEmpty title="ARCHIVE EMPTY" subtitle="No dossiers currently pending adjudication." icon="database" />
               ) : (
                 cases.map((item) => {
                   const isSelected = selectedCaseId === item.id;
                   return (
                     <button
                       key={item.id}
                       onClick={() => handleSelectCase(item.id)}
                       className={`min-h-[88px] w-full text-left rounded-2xl border px-4 lg:px-6 py-4 lg:py-5 transition-all relative overflow-hidden group ${
                         isSelected 
                           ? 'border-amber-500/50 bg-amber-950/20 shadow-[inset_0_0_20px_rgba(245,158,11,0.1)]' 
                           : 'border-white/5 bg-black hover:border-white/20'
                       }`}
                     >
                       {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />}
                       
                       <div className="flex items-start justify-between gap-4">
                         <div className="pr-2">
                           <div className="flex items-center gap-2 mb-2">
                              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500 bg-white/5 px-2 py-0.5 rounded">CLASS: {item.caseType}</span>
                           </div>
                           <p className={`text-sm font-bold leading-tight ${isSelected ? 'text-amber-400' : 'text-slate-300'}`}>{item.disputeReason}</p>
                           <p className="text-[10px] font-mono text-slate-600 mt-2 truncate">TARGET: {item.orderId.slice(0, 16)}...</p>
                         </div>
                         
                         {/* Stamp Status */}
                         <div className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 border-dashed ${
                            item.status === 'RESOLVED' ? 'border-emerald-500/30 text-emerald-500' : 
                            item.status === 'VOTING' ? 'border-amber-500/30 text-amber-500' : 
                            'border-slate-500/30 text-slate-500'
                         }`}>
                           <span className="text-[8px] font-black uppercase tracking-widest scale-75 origin-center">{item.status.slice(0,4)}</span>
                         </div>
                       </div>
                     </button>
                   );
                 })
               )}
             </div>
           </div>

        </div>

        {/* RIGHT COLUMN: THE ADJUDICATION CHAMBER */}
        <div className={`${selectedCase ? 'block' : 'hidden xl:flex'} xl:flex p-4 lg:p-12 rounded-[1.75rem] lg:rounded-[3rem] bg-[#0A0505] border border-rose-500/20 shadow-2xl min-h-0 lg:min-h-[850px] relative overflow-hidden flex-col`}>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
          
          {!selectedCase ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-700 relative z-10">
               <Scale size={64} className="opacity-20 mb-6" />
               <p className="font-orbitron font-black text-2xl uppercase tracking-widest opacity-40">Awaiting Subpoena</p>
               <p className="text-xs uppercase tracking-widest mt-2">No dossier selected for review.</p>
            </div>
          ) : (
            <div className="relative z-10 space-y-5 lg:space-y-10">
              <button
                onClick={() => setSelectedCase(null)}
                className="xl:hidden min-h-[44px] rounded-2xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-widest text-slate-300"
              >
                Back to cases
              </button>
              
              {/* Header Box */}
              <div className="pb-6 lg:pb-8 border-b border-rose-500/20 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 lg:gap-6">
                <div className="space-y-4 max-w-2xl">
                  <div className="flex gap-2">
                     <span className={`px-3 py-1 rounded border text-[10px] font-black uppercase tracking-widest ${
                        selectedCase.status === 'RESOLVED' ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400' :
                        selectedCase.status === 'VOTING' ? 'bg-amber-950/50 border-amber-500/50 text-amber-400' :
                        'bg-slate-900 border-slate-500/50 text-slate-400'
                     }`}>
                        CONDITION: {selectedCase.status}
                     </span>
                  </div>
                  <h3 className="text-2xl md:text-4xl font-black font-orbitron text-white leading-tight">{selectedCase.disputeReason}</h3>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-rose-500/60">
                    FILED: {new Date(selectedCase.createdAt).toLocaleString()} | TARGET: {selectedCase.orderId}
                  </p>
                </div>

                {/* Bond Block */}
                <div className="bg-black/50 border border-white/5 rounded-2xl p-4 lg:p-6 text-left md:text-right min-w-0 md:min-w-[200px] w-full md:w-auto">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Tribunal Bond</p>
                  <p className="text-3xl font-black font-orbitron text-white">{selectedCase.depositAmount} <span className="text-sm text-amber-500">USDT</span></p>
                  {selectedCase.depositPaid ? (
                     <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mt-2 flex items-center justify-end gap-1"><CheckCircle2 size={12}/> BOND SECURED</p>
                  ) : (
                     <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mt-2 flex items-center justify-end gap-1"><XCircle size={12}/> BOND REQUIRED</p>
                  )}
                </div>
              </div>

              {/* Data Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4 bg-black/40 p-2 rounded-2xl border border-white/5">
                 <div className="p-4">
                    <p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Consensus Needed</p>
                    <p className="text-xl font-black font-orbitron text-white mt-1">{selectedCase.requiredVotes}</p>
                 </div>
                 <div className="p-4 border-l border-white/5">
                    <p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Support Verdict</p>
                    <p className="text-xl font-black font-orbitron text-emerald-400 mt-1">{selectedCase.supportCount ?? 0}</p>
                 </div>
                 <div className="p-4 border-l border-white/5">
                    <p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Reject Verdict</p>
                    <p className="text-xl font-black font-orbitron text-rose-400 mt-1">{selectedCase.rejectCount ?? 0}</p>
                 </div>
                 <div className="p-4 border-l border-white/5">
                    <p className="text-[8px] uppercase tracking-widest text-amber-500 font-black">Deadline</p>
                    <p className="text-xs font-mono font-bold text-amber-400 mt-2">
                       {selectedCase.votingDeadline ? new Date(selectedCase.votingDeadline).toLocaleString() : 'N/A'}
                    </p>
                 </div>
              </div>

              {/* Narrative & Exhibits */}
              <details className="group rounded-[1.5rem] border border-rose-500/10 bg-black/20 p-4 lg:p-0 lg:border-0 lg:bg-transparent" open>
                 <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.3em] text-rose-500 lg:hidden">Summary</summary>
                 <div className="mt-4 lg:mt-0 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500 flex items-center gap-2">
                      <FileText size={14} /> Description
                    </h4>
                    <div className="bg-black/30 border border-rose-500/10 rounded-[1.5rem] p-6 text-sm text-slate-300 leading-relaxed min-h-[120px]">
                       {selectedCase.description || 'No descriptive payload provided.'}
                    </div>
                 </div>
              </details>

              <details className="group rounded-[1.5rem] border border-cyan-500/10 bg-black/20 p-4 lg:p-0 lg:border-0 lg:bg-transparent" open>
                 <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 lg:hidden">Evidence</summary>
                 <div className="mt-4 lg:mt-0 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 flex items-center gap-2">
                      <Eye size={14} /> Exhibits
                    </h4>
                    <div className="bg-black/30 border border-cyan-500/10 rounded-[1.5rem] p-6 min-h-[120px] space-y-3">
                       {selectedCase.evidenceUrls.length === 0 ? (
                         <p className="text-xs text-slate-600 uppercase font-bold tracking-widest">No exhibits attached.</p>
                       ) : (
                         selectedCase.evidenceUrls.map((url, idx) => (
                           <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-xs font-mono text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30 p-2 rounded transition-colors break-all">
                             <div className="px-1.5 py-0.5 bg-cyan-950 text-[8px] rounded border border-cyan-500/50 text-cyan-300 shrink-0">EXB-{idx + 1}</div>
                             {url}
                           </a>
                         ))
                       )}
                    </div>
                 </div>
              </details>

              {/* The Action Chamber */}
              <details className="group rounded-[1.5rem] border border-amber-500/10 bg-black/20 p-4 lg:p-0 lg:border-0 lg:bg-transparent" open>
              <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 lg:hidden">Vote / Appeal</summary>
              <div className="pt-4 lg:pt-8 lg:border-t lg:border-rose-500/20">
                 
                 {/* State 1: PENDING (Needs Bond) */}
                 {!selectedCase.depositPaid && selectedCase.status === 'PENDING' && (
                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-[2rem] p-5 lg:p-8 text-center space-y-6">
                       <Scale size={48} className="text-amber-500 mx-auto opacity-50" />
                       <div>
                          <h4 className="text-lg font-black font-orbitron uppercase text-amber-500">Bond Required</h4>
                          <p className="text-xs text-amber-500/70 uppercase tracking-widest mt-2">Dossier sealed. Transfer funds to initiate formal voting.</p>
                       </div>
                       <button
                         onClick={handlePayDeposit}
                         disabled={submitting}
                         className="min-h-[52px] w-full sm:w-auto px-6 lg:px-10 py-4 lg:py-5 rounded-[1.5rem] bg-amber-500 text-black font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-[0_0_30px_rgba(245,158,11,0.2)] disabled:opacity-50"
                       >
                         {submitting ? 'TRANSFERRING...' : '[ SECURE TRIBUNAL BOND ]'}
                       </button>
                    </div>
                 )}

                 {/* State 2: VOTING (Gavel Panel) */}
                 {selectedCase.status === 'VOTING' && (
                    <div className="space-y-6">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-2">
                         <Gavel size={14} className="text-amber-500"/> Adjudication Action
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <button
                           onClick={() => handleVote('SUPPORT_INITIATOR')}
                           disabled={submitting}
                           className="min-h-[64px] group relative overflow-hidden py-5 lg:py-8 rounded-[1.5rem] lg:rounded-[2rem] bg-[#0A1A12] border border-emerald-500/30 hover:border-emerald-400 transition-all disabled:opacity-50"
                         >
                           <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                           <span className="relative z-10 text-emerald-400 font-black uppercase tracking-widest flex flex-col items-center gap-2">
                              <CheckCircle2 size={24} /> [ SUPPORT PLAINTIFF ]
                           </span>
                         </button>
                         <button
                           onClick={() => handleVote('REJECT_INITIATOR')}
                           disabled={submitting}
                           className="min-h-[64px] group relative overflow-hidden py-5 lg:py-8 rounded-[1.5rem] lg:rounded-[2rem] bg-[#1A0A0A] border border-rose-500/30 hover:border-rose-400 transition-all disabled:opacity-50"
                         >
                           <div className="absolute inset-0 bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                           <span className="relative z-10 text-rose-400 font-black uppercase tracking-widest flex flex-col items-center gap-2">
                              <XCircle size={24} /> [ REJECT PLAINTIFF ]
                           </span>
                         </button>
                         <button
                           onClick={() => handleVote('ABSTAIN')}
                           disabled={submitting}
                           className="min-h-[64px] py-5 lg:py-8 rounded-[1.5rem] lg:rounded-[2rem] bg-slate-900 border border-slate-700 hover:bg-slate-800 transition-all disabled:opacity-50"
                         >
                           <span className="text-slate-400 font-black uppercase tracking-widest flex flex-col items-center gap-2">
                              <Minus size={24} /> [ ABSTAIN ]
                           </span>
                         </button>
                       </div>
                    </div>
                 )}

                 {/* State 3: RESOLVED (Appeals / Supreme DAO) */}
                 {selectedCase.status === 'RESOLVED' && (
                    <div className="space-y-6 lg:space-y-8 bg-black/40 border border-white/5 rounded-[1.75rem] lg:rounded-[2.5rem] p-4 lg:p-10">
                       <div className="text-center pb-8 border-b border-white/10">
                          <p className="text-[10px] font-black uppercase tracking-[0.28em] lg:tracking-[0.5em] text-slate-500 mb-2">Final Verdict</p>
                          <p className="text-3xl font-black font-orbitron text-emerald-400">{selectedCase.verdict || 'RESOLUTION REACHED'}</p>
                          <p className="text-xs text-slate-400 uppercase tracking-widest mt-4">{selectedCase.verdictReason || 'No descriptive ruling logged.'}</p>
                       </div>

                       <div className="space-y-6">
                         <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 flex items-center gap-2">
                           Supreme DAO Escalation
                         </h4>
                         
                         {/* Appeal Form */}
                         <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
                           <input
                             value={form.appealReason}
                             onChange={(e) => updateForm('appealReason', e.target.value)}
                             placeholder="Escalate to Global Consensus (Enter Reason)"
                             className="flex-1 bg-black border border-rose-500/20 rounded-2xl px-6 py-4 text-white text-sm outline-none focus:border-rose-500 focus:bg-rose-950/20 transition-all"
                           />
                           <button
                             onClick={handleAppeal}
                             disabled={submitting}
                             className="min-h-[48px] px-6 lg:px-8 bg-rose-950 text-rose-400 font-black uppercase tracking-widest text-xs rounded-2xl border border-rose-500/50 hover:bg-rose-900 disabled:opacity-50 flex items-center justify-center gap-2"
                           >
                             [ INITIATE OVERRIDE ] <ArrowRight size={14} />
                           </button>
                         </div>

                         {/* Appeals List */}
                         {selectedCase.appeals && selectedCase.appeals.length > 0 && (
                           <div className="space-y-4 pt-6">
                              <div className="flex items-center justify-between mb-4">
                                 <h5 className="text-[10px] uppercase font-black tracking-widest text-white">Active Overrides</h5>
                                 <div className="flex items-center gap-3">
                                   <span className="text-[9px] uppercase font-bold text-slate-500">DAO Feed Allocation:</span>
                                   <input
                                      type="number"
                                      inputMode="decimal"
                                      min="1"
                                      value={form.daoFeedAmount}
                                      onChange={(e) => updateForm('daoFeedAmount', e.target.value)}
                                      className="w-24 bg-black border border-white/20 rounded-lg px-3 py-1.5 text-center text-xs text-white outline-none focus:border-cyan-500"
                                   />
                                 </div>
                              </div>
                              
                              {selectedCase.appeals.map((appeal: any) => (
                                <div key={appeal.id} className="bg-black/80 border border-amber-500/20 rounded-2xl p-6">
                                   <div className="flex justify-between items-start mb-4">
                                      <div>
                                         <span className="text-[8px] font-black uppercase tracking-[0.3em] bg-amber-950/50 border border-amber-500/50 text-amber-500 px-2 py-1 rounded">
                                            {appeal.status}
                                         </span>
                                         <p className="text-sm font-bold text-slate-200 mt-3">{appeal.reason}</p>
                                      </div>
                                      <span className="text-[10px] font-mono text-slate-600">{new Date(appeal.createdAt).toLocaleString()}</span>
                                   </div>
                                   
                                   <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5 p-3 rounded-xl mb-4">
                                      <span className="text-emerald-500">Support: {appeal.supportVotes}</span>
                                      <span className="text-rose-500">Reject: {appeal.rejectVotes}</span>
                                      <span>Total Force: {appeal.totalVoters}</span>
                                   </div>

                                   {appeal.status === 'VOTING' && (
                                     <div className="flex gap-3 lg:gap-4">
                                       <button onClick={() => handleDaoVote(appeal.id, 'SUPPORT')} disabled={submitting} className="flex-1 py-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-900 transition-colors">
                                         [ SUSTAIN ]
                                       </button>
                                       <button onClick={() => handleDaoVote(appeal.id, 'REJECT')} disabled={submitting} className="flex-1 py-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-400 font-bold text-[10px] uppercase tracking-widest hover:bg-rose-900 transition-colors">
                                         [ QUASH ]
                                       </button>
                                     </div>
                                   )}
                                </div>
                              ))}
                           </div>
                         )}
                       </div>
                    </div>
                 )}
              </div>
              </details>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

// Quick mock for Minus icon if not imported from lucide
const Minus = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);

export default ArbitrationView;
