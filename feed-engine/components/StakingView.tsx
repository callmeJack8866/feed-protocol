import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FeederProfile } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import * as api from '../services/api';

type StakeType = 'FEED' | 'USDT' | 'NFT';

interface StakeRecord {
  id: string;
  stakeType: StakeType;
  amount: number;
  nftTokenId?: string | null;
  status: 'ACTIVE' | 'UNLOCKING' | 'WITHDRAWN' | 'SLASHED';
  createdAt: string;
  unlockAvailableAt?: string | null;
  unlockRequestedAt?: string | null;
}

interface LicenseInfo {
  id: string;
  tokenId: string;
  name: string;
  tier: string;
  maxRank: string;
  isStaked: boolean;
}

interface StakingSnapshot {
  currentStake: number;
  stakeType: StakeType;
  nftLicenseId?: string | null;
  rank: string;
  requirement?: { minStake: number; dailyLimit: number };
  nextRankRequirement?: { rank: string; minStake: number; additionalNeeded: number } | null;
  records: StakeRecord[];
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString();
};

const StakingView: React.FC<{ profile: FeederProfile }> = ({ profile }) => {
  const { t } = useTranslation();
  const [stakeMode, setStakeMode] = useState<'stake' | 'withdraw'>('stake');
  const [stakeType, setStakeType] = useState<StakeType>('USDT');
  const [amount, setAmount] = useState('');
  const [selectedLicenseId, setSelectedLicenseId] = useState('');
  const [staking, setStaking] = useState<StakingSnapshot | null>(null);
  const [licenses, setLicenses] = useState<LicenseInfo[]>([]);
  const [requirements, setRequirements] = useState<Record<string, { minStake: number; dailyLimit: number }>>({});
  const [unlockCooldownDays, setUnlockCooldownDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [stakingRes, licenseRes, requirementRes] = await Promise.all([
        api.getStakingInfo(),
        api.getLicenseInfo(),
        api.getStakingRequirements(),
      ]);

      if (stakingRes.success) {
        setStaking(stakingRes.staking ?? null);
      }

      if (licenseRes.success) {
        setLicenses((licenseRes.licenses ?? []) as LicenseInfo[]);
      }

      if (requirementRes.success) {
        setRequirements(requirementRes.requirements ?? {});
        setUnlockCooldownDays(requirementRes.unlockCooldownDays ?? 30);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load staking data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeRecords = useMemo(
    () => (staking?.records ?? []).filter((record) => record.status === 'ACTIVE'),
    [staking],
  );

  const unlockingRecords = useMemo(
    () => (staking?.records ?? []).filter((record) => record.status === 'UNLOCKING'),
    [staking],
  );

  const availableLicenseOptions = useMemo(
    () => licenses.filter((license) => !license.isStaked),
    [licenses],
  );

  const currentRequirement = staking?.requirement ?? requirements[staking?.rank ?? ''];
  const canSubmitStake = stakeType === 'NFT' ? Boolean(selectedLicenseId) : Number(amount) > 0;

  const handleStake = async () => {
    if (!canSubmitStake) {
      setError('Please enter a valid amount or choose an NFT license.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');

      const selectedLicense = availableLicenseOptions.find((license) => license.id === selectedLicenseId);
      const res = await api.stakeTokens(
        stakeType === 'NFT' ? 0 : Number(amount),
        stakeType,
        undefined,
        selectedLicense?.tokenId,
      );

      if (res.success) {
        setMessage(stakeType === 'NFT' ? 'NFT license staked successfully.' : 'Stake recorded successfully.');
        setAmount('');
        setSelectedLicenseId('');
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to stake');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestUnlock = async (recordId: string) => {
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.requestUnlockStake(recordId);
      if (res.success) {
        setMessage(res.message || 'Unlock request submitted.');
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request unlock');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (recordId: string) => {
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await api.withdrawStake(recordId);
      if (res.success) {
        setMessage('Withdrawal recorded successfully.');
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw stake');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-4xl font-black font-orbitron tracking-tighter uppercase italic">{t.staking.title}</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{t.staking.subtitle}</p>
        </div>
        <div className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.staking.currentStake}</p>
          <p className="text-2xl font-black font-orbitron text-cyan-400">{(staking?.currentStake ?? 0).toLocaleString()}</p>
        </div>
      </header>

      {(message || error) && (
        <div className={`rounded-2xl border px-6 py-4 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-8">
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{t.staking.currentStake}</p>
              <p className="text-4xl font-black font-orbitron text-white">{(staking?.currentStake ?? 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-2">{staking?.stakeType || profile.stakeType}</p>
            </div>
            <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{t.staking.minRequired}</p>
              <p className="text-4xl font-black font-orbitron text-cyan-400">{currentRequirement?.minStake?.toLocaleString?.() ?? 0}</p>
              <p className="text-xs text-slate-500 mt-2">Rank {staking?.rank || profile.rank}</p>
            </div>
            <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">{t.staking.withdrawalCooldown}</p>
              <p className="text-4xl font-black font-orbitron text-rose-400">{unlockCooldownDays}</p>
              <p className="text-xs text-slate-500 mt-2">{t.staking.days}</p>
            </div>
          </div>

          <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-lg font-black uppercase tracking-widest text-white">Active Stakes</h3>
                <p className="text-sm text-slate-500">Records currently counted toward feeder eligibility.</p>
              </div>
              {staking?.nextRankRequirement && (
                <div className="px-4 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-sm text-cyan-300">
                  Next rank {staking.nextRankRequirement.rank}: {staking.nextRankRequirement.additionalNeeded.toLocaleString()} more required
                </div>
              )}
            </div>

            <div className="space-y-4">
              {activeRecords.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-slate-500">
                  No active stake records yet.
                </div>
              ) : (
                activeRecords.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-white/10 bg-black/30 px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-white">{record.stakeType}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {record.stakeType === 'NFT' ? `License Token #${record.nftTokenId}` : `${record.amount.toLocaleString()} locked`}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">Created {formatDateTime(record.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => handleRequestUnlock(record.id)}
                      disabled={submitting}
                      className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      {t.staking.initiateUnstake}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-8 rounded-[2.5rem] glass-panel border border-rose-500/20 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-lg font-black uppercase tracking-widest text-rose-400">Unlock Queue</h3>
                <p className="text-sm text-slate-500">These records are cooling down and can be withdrawn after the unlock window.</p>
              </div>
              <div className="text-sm text-slate-400">{unlockingRecords.length} record(s)</div>
            </div>
            {unlockingRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-slate-500">
                No records are currently unlocking.
              </div>
            ) : (
              unlockingRecords.map((record) => {
                const unlockAt = record.unlockAvailableAt ? new Date(record.unlockAvailableAt) : null;
                const canWithdraw = unlockAt ? unlockAt.getTime() <= Date.now() : false;

                return (
                  <div key={record.id} className="rounded-2xl border border-white/10 bg-black/30 px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-white">{record.stakeType}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {record.stakeType === 'NFT' ? `License Token #${record.nftTokenId}` : `${record.amount.toLocaleString()} waiting for withdrawal`}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">Available at {formatDateTime(record.unlockAvailableAt)}</p>
                    </div>
                    <button
                      onClick={() => handleWithdraw(record.id)}
                      disabled={submitting || !canWithdraw}
                      className="px-5 py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/20 text-sm font-bold text-rose-200 transition-colors disabled:opacity-40"
                    >
                      {canWithdraw ? t.staking.withdraw : `Available ${formatDateTime(record.unlockAvailableAt)}`}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-8 rounded-[2.5rem] glass-panel border border-white/10 space-y-8 h-fit">
          <div className="flex bg-slate-900/80 p-1.5 rounded-[1.8rem] border border-white/5">
            <button
              onClick={() => setStakeMode('stake')}
              className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${stakeMode === 'stake' ? 'bg-cyan-500 text-black shadow-xl shadow-cyan-500/20' : 'text-slate-500 hover:text-white'}`}
            >
              {t.staking.deposit}
            </button>
            <button
              onClick={() => setStakeMode('withdraw')}
              className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${stakeMode === 'withdraw' ? 'bg-cyan-500 text-black shadow-xl shadow-cyan-500/20' : 'text-slate-500 hover:text-white'}`}
            >
              {t.staking.withdraw}
            </button>
          </div>

          {stakeMode === 'stake' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.staking.stakeType}</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['USDT', 'FEED', 'NFT'] as StakeType[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => setStakeType(option)}
                      className={`rounded-2xl border px-4 py-4 text-sm font-bold transition-colors ${stakeType === option ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {stakeType === 'NFT' ? (
                <div className="space-y-3">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Available NFT License</label>
                  <select
                    value={selectedLicenseId}
                    onChange={(event) => setSelectedLicenseId(event.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-cyan-500"
                  >
                    <option value="">Select a license</option>
                    {availableLicenseOptions.map((license) => (
                      <option key={license.id} value={license.id}>
                        {license.name} ({license.tier})
                      </option>
                    ))}
                  </select>
                  {availableLicenseOptions.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No unstaked NFT licenses are available for this wallet right now.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.staking.amountToStake}</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/40 border border-white/10 rounded-3xl px-6 py-5 text-2xl font-orbitron outline-none focus:border-cyan-500 text-white"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-black">{stakeType}</span>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-white/5 border border-white/10 px-5 py-4 text-sm text-slate-400 space-y-2">
                <p>Wallet snapshot: {profile.balanceUSDT.toLocaleString()} USDT / {profile.balanceFEED.toLocaleString()} FEED</p>
                <p>Minimum required for current rank: {(currentRequirement?.minStake ?? 0).toLocaleString()}</p>
              </div>

              <button
                onClick={handleStake}
                disabled={submitting || !canSubmitStake}
                className="w-full py-5 rounded-[2rem] font-black font-orbitron text-lg bg-cyan-500 text-black shadow-cyan-500/30 hover:bg-cyan-400 transition-all disabled:opacity-50"
              >
                {submitting ? t.common.loading : t.staking.initializeStake}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Choose an unlocking record from the list on the left. Once its cooldown ends, you can withdraw it here or from the queue card.
              </p>
              <div className="rounded-2xl bg-rose-500/5 border border-rose-500/10 px-5 py-4 text-sm text-rose-200">
                {unlockingRecords.length === 0
                  ? 'No stake records are waiting for withdrawal.'
                  : `${unlockingRecords.length} unlocking record(s) currently tracked.`}
              </div>
            </div>
          )}

          <div className="space-y-4 pt-2 border-t border-white/10">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">NFT Licenses</h3>
            {licenses.length === 0 ? (
              <p className="text-sm text-slate-500">No feeder licenses have been synced for the current wallet yet.</p>
            ) : (
              licenses.map((license) => (
                <motion.div key={license.id} layout className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{license.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Tier {license.tier}  |  Max rank {license.maxRank}</p>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${license.isStaked ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {license.isStaked ? 'Staked' : 'Available'}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StakingView;

