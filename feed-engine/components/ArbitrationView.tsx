import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';
import * as api from '../services/api';
import { initWebSocket, off, on } from '../services/websocket';

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
      setError(err.message || 'Failed to load arbitration data');
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

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const evidenceUrls = useMemo(
    () => form.evidenceUrls.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
    [form.evidenceUrls],
  );

  const handleCreateCase = async () => {
    if (!form.orderId || !form.disputeReason.trim()) {
      setError('Order and dispute reason are required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');

      const res = await api.createArbitrationCase({
        orderId: form.orderId,
        disputeReason: form.disputeReason.trim(),
        description: form.description.trim(),
        evidenceUrls,
      });

      if (res.success) {
        setMessage('Arbitration case created. Pay the deposit to move it into voting.');
        setForm((prev) => ({ ...prev, disputeReason: '', description: '', evidenceUrls: '' }));
        await loadData(false);
        if (res.case?.id) {
          setSelectedCaseId(res.case.id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create case');
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
      setError(err.message || 'Failed to load case detail');
    }
  };

  const handlePayDeposit = async () => {
    if (!selectedCase) return;

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.payArbitrationDeposit(selectedCase.id);
      if (res.success) {
        setMessage('Deposit recorded. The case is now ready for arbitrator voting.');
        await handleSelectCase(selectedCase.id);
        await loadCases(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to pay deposit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (vote: api.ArbitrationVoteOption) => {
    if (!selectedCase) return;

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.voteArbitration(selectedCase.id, vote, selectedCase.description || selectedCase.disputeReason);
      if (res.success) {
        setMessage('Arbitration vote submitted.');
        await handleSelectCase(selectedCase.id);
        await loadCases(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit arbitration vote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppeal = async () => {
    if (!selectedCase || !form.appealReason.trim()) {
      setError('Appeal reason is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.submitDAOAppeal(selectedCase.id, form.appealReason.trim());
      if (res.success) {
        setMessage('DAO appeal submitted.');
        updateForm('appealReason', '');
        await handleSelectCase(selectedCase.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit appeal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDaoVote = async (appealId: string, vote: api.DAOVoteOption) => {
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.voteDAOAppeal(appealId, vote, Number(form.daoFeedAmount) || 0);
      if (res.success) {
        setMessage('DAO vote submitted.');
        if (selectedCase) {
          await handleSelectCase(selectedCase.id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit DAO vote');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter italic uppercase text-rose-500">{t.arbitration.judicialChamber}</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{t.arbitration.asClassOnly}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="px-5 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Voting</p>
            <p className="text-2xl font-black font-orbitron text-white mt-1">{votingCases.length}</p>
          </div>
          <div className="px-5 py-4 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resolved</p>
            <p className="text-2xl font-black font-orbitron text-white mt-1">{resolvedCases.length}</p>
          </div>
        </div>
      </header>

      {(message || error) && (
        <div className={`rounded-2xl border px-6 py-4 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.25fr] gap-8">
        <div className="space-y-8">
          <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10 space-y-5">
            <div>
              <h3 className="text-lg font-black uppercase tracking-widest text-white">Create Arbitration Case</h3>
              <p className="text-sm text-slate-500 mt-2">Use a real order, attach evidence URLs if available, and open a dispute for manual review.</p>
            </div>

            <div className="space-y-4">
              <select
                value={form.orderId}
                onChange={(event) => updateForm('orderId', event.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-rose-500"
              >
                <option value="">Select order</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.symbol}  |  {order.market}  |  {order.status}
                  </option>
                ))}
              </select>

              <input
                value={form.disputeReason}
                onChange={(event) => updateForm('disputeReason', event.target.value)}
                placeholder="Short dispute reason"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-rose-500"
              />

              <textarea
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                placeholder="Detailed description for arbitrators"
                rows={4}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-rose-500 resize-none"
              />

              <textarea
                value={form.evidenceUrls}
                onChange={(event) => updateForm('evidenceUrls', event.target.value)}
                placeholder="Evidence URLs, one per line"
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-rose-500 resize-none"
              />

              <button
                onClick={handleCreateCase}
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-rose-500 text-black font-black font-orbitron hover:bg-rose-400 transition-colors disabled:opacity-50"
              >
                {submitting ? t.common.loading : 'Open Case'}
              </button>
            </div>
          </div>

          <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-widest text-white">Case Queue</h3>
              <span className="text-sm text-slate-500">{cases.length} total</span>
            </div>

            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-2">
              {cases.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-slate-500">
                  No arbitration cases yet.
                </div>
              ) : (
                cases.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectCase(item.id)}
                    className={`w-full text-left rounded-2xl border px-5 py-4 transition-colors ${selectedCaseId === item.id ? 'border-rose-500/40 bg-rose-500/10' : 'border-white/10 bg-black/30 hover:border-white/20'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-rose-300">{item.caseType}</p>
                        <p className="text-base font-bold text-white mt-2">{item.disputeReason}</p>
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2">Order {item.orderId}</p>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${item.status === 'RESOLVED' ? 'bg-emerald-500/20 text-emerald-300' : item.status === 'VOTING' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                      <span>Votes {item.votesCount ?? item.votes?.length ?? 0}/{item.requiredVotes}</span>
                      <span>Support {item.supportCount ?? 0}</span>
                      <span>Reject {item.rejectCount ?? 0}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10 space-y-8 min-h-[680px]">
          {!selectedCase ? (
            <div className="h-full flex items-center justify-center text-slate-500">Select a case to inspect its workflow.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div className="space-y-2">
                  <h3 className="text-2xl font-black font-orbitron text-white">{selectedCase.disputeReason}</h3>
                  <p className="text-sm text-slate-500">Order {selectedCase.orderId}  |  Created {new Date(selectedCase.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-500">Deposit</div>
                  <div className="text-2xl font-black font-orbitron text-rose-400">{selectedCase.depositAmount} USDT</div>
                  <div className={`text-xs font-bold ${selectedCase.depositPaid ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {selectedCase.depositPaid ? 'Paid' : 'Pending'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-black">Status</div>
                  <div className="text-xl font-black font-orbitron text-white mt-2">{selectedCase.status}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-black">Required Votes</div>
                  <div className="text-xl font-black font-orbitron text-white mt-2">{selectedCase.requiredVotes}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-black">Deadline</div>
                  <div className="text-sm font-bold text-white mt-2">{selectedCase.votingDeadline ? new Date(selectedCase.votingDeadline).toLocaleString() : '--'}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 px-6 py-5 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-white">Description</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{selectedCase.description || 'No additional description provided.'}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 px-6 py-5 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-white">Evidence</h4>
                {selectedCase.evidenceUrls.length === 0 ? (
                  <p className="text-sm text-slate-500">No evidence links attached.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedCase.evidenceUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-4 break-all">
                        {url}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 px-6 py-5 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-white">Votes</h4>
                {selectedCase.votes && selectedCase.votes.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCase.votes.map((vote: any) => (
                      <div key={vote.id} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 px-4 py-3">
                        <div>
                          <div className="text-sm font-bold text-white">{vote.vote}</div>
                          <div className="text-xs text-slate-500 mt-1">{vote.reason || 'No reason supplied'}</div>
                        </div>
                        <div className="text-xs text-slate-500">{new Date(vote.createdAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No votes recorded yet.</p>
                )}
              </div>

              {!selectedCase.depositPaid && selectedCase.status === 'PENDING' && (
                <button
                  onClick={handlePayDeposit}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-amber-500 text-black font-black font-orbitron hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {submitting ? t.common.loading : 'Pay Deposit and Start Voting'}
                </button>
              )}

              {selectedCase.status === 'VOTING' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => handleVote('SUPPORT_INITIATOR')}
                    disabled={submitting}
                    className="py-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 font-bold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    Support Initiator
                  </button>
                  <button
                    onClick={() => handleVote('REJECT_INITIATOR')}
                    disabled={submitting}
                    className="py-4 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 font-bold hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                  >
                    Reject Initiator
                  </button>
                  <button
                    onClick={() => handleVote('ABSTAIN')}
                    disabled={submitting}
                    className="py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    Abstain
                  </button>
                </div>
              )}

              {selectedCase.status === 'RESOLVED' && (
                <div className="space-y-6 rounded-2xl border border-white/10 bg-black/30 px-6 py-5">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest text-white">Resolution</h4>
                    <p className="text-lg font-bold text-emerald-300 mt-3">{selectedCase.verdict || 'Resolved'}</p>
                    <p className="text-sm text-slate-400 mt-2">{selectedCase.verdictReason || 'No verdict reason recorded.'}</p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Appeal reason</label>
                    <textarea
                      value={form.appealReason}
                      onChange={(event) => updateForm('appealReason', event.target.value)}
                      rows={3}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-cyan-500 resize-none"
                      placeholder="Explain why the resolved verdict should be reviewed by DAO voting"
                    />
                    <button
                      onClick={handleAppeal}
                      disabled={submitting}
                      className="w-full py-4 rounded-2xl bg-cyan-500 text-black font-black font-orbitron hover:bg-cyan-400 transition-colors disabled:opacity-50"
                    >
                      {submitting ? t.common.loading : 'Submit DAO Appeal'}
                    </button>
                  </div>

                  {selectedCase.appeals && selectedCase.appeals.length > 0 && (
                    <div className="space-y-4 border-t border-white/10 pt-5">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <h4 className="text-sm font-black uppercase tracking-widest text-white">DAO Appeals</h4>
                        <input
                          type="number"
                          min="1"
                          value={form.daoFeedAmount}
                          onChange={(event) => updateForm('daoFeedAmount', event.target.value)}
                          className="w-40 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500"
                        />
                      </div>

                      {selectedCase.appeals.map((appeal: any) => (
                        <div key={appeal.id} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 space-y-4">
                          <div>
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <p className="font-bold text-white">{appeal.status}</p>
                              <p className="text-xs text-slate-500">{new Date(appeal.createdAt).toLocaleString()}</p>
                            </div>
                            <p className="text-sm text-slate-400 mt-2">{appeal.reason}</p>
                          </div>
                          <div className="text-xs text-slate-500">
                            Support {appeal.supportVotes}  |  Reject {appeal.rejectVotes}  |  Total voters {appeal.totalVoters}
                          </div>
                          {appeal.status === 'VOTING' && (
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => handleDaoVote(appeal.id, 'SUPPORT')}
                                disabled={submitting}
                                className="py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 font-bold hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                              >
                                Support Appeal
                              </button>
                              <button
                                onClick={() => handleDaoVote(appeal.id, 'REJECT')}
                                disabled={submitting}
                                className="py-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-200 font-bold hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                              >
                                Reject Appeal
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArbitrationView;
