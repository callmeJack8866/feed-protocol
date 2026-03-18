import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../i18n/I18nContext';
import * as api from '../services/api';

interface LicenseAsset {
  id: string;
  tokenId: string;
  name: string;
  tier: string;
  maxRank: string;
  dailyLimit: number;
  feeDiscount: number;
  isStaked: boolean;
  ownerAddress?: string | null;
}

interface BadgeAsset {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  unlockedAt?: string;
}

const rarityClasses: Record<string, string> = {
  COMMON: 'border-slate-500/20 from-slate-500/10 to-transparent text-slate-200',
  RARE: 'border-cyan-500/20 from-cyan-500/10 to-transparent text-cyan-200',
  EPIC: 'border-amber-500/20 from-amber-500/10 to-transparent text-amber-200',
  LEGENDARY: 'border-rose-500/25 from-rose-500/10 to-transparent text-rose-200',
};

const tierClasses: Record<string, string> = {
  BRONZE: 'border-amber-700/30 from-amber-700/10 to-transparent text-amber-200',
  SILVER: 'border-slate-400/30 from-slate-400/10 to-transparent text-slate-100',
  GOLD: 'border-yellow-400/30 from-yellow-400/10 to-transparent text-yellow-100',
  PLATINUM: 'border-cyan-400/30 from-cyan-400/10 to-transparent text-cyan-100',
  DIAMOND: 'border-sky-300/30 from-sky-300/10 to-transparent text-sky-100',
};

const formatDate = (value?: string) => {
  if (!value) return '--';
  return new Date(value).toLocaleDateString();
};

const InventoryView: React.FC = () => {
  const { t } = useTranslation();
  const [licenses, setLicenses] = useState<LicenseAsset[]>([]);
  const [badges, setBadges] = useState<BadgeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadInventory = async (runSync = false) => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      if (runSync) {
        try {
          await api.syncNFTs();
          setMessage('On-chain NFT licenses synced.');
        } catch (syncError: any) {
          setError(syncError.message || 'Failed to sync NFTs');
        }
      }

      const [licenseRes, achievementsRes] = await Promise.all([
        api.getLicenseInfo(),
        api.getMyAchievements(),
      ]);

      if (licenseRes.success) {
        setLicenses((licenseRes.licenses ?? []) as LicenseAsset[]);
      }

      if (achievementsRes.success) {
        setBadges(
          (achievementsRes.achievements ?? [])
            .filter((achievement: any) => achievement.unlocked)
            .map((achievement: any) => ({
              id: achievement.id,
              code: achievement.code,
              name: achievement.name,
              description: achievement.description,
              icon: achievement.icon,
              category: achievement.category,
              rarity: achievement.rarity,
              unlockedAt: achievement.unlockedAt,
            })),
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory(false);
  }, []);

  const totalAssets = licenses.length + badges.length;
  const activeLicenses = useMemo(() => licenses.filter((license) => !license.isStaked), [licenses]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await loadInventory(true);
    } finally {
      setSyncing(false);
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
          <h2 className="text-4xl font-black font-orbitron tracking-tighter italic uppercase">{t.inventory.protocolVault}</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{t.inventory.vaultSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-center min-w-[120px]">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t.inventory.assets}</p>
            <p className="text-sm font-black font-orbitron">{totalAssets}</p>
          </div>
          <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-center min-w-[120px]">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Licenses</p>
            <p className="text-sm font-black font-orbitron">{activeLicenses.length}/{licenses.length}</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-3 rounded-2xl bg-cyan-500 text-black font-black uppercase tracking-widest text-[10px] hover:bg-cyan-400 transition-colors disabled:opacity-50"
          >
            {syncing ? t.common.loading : 'Sync NFTs'}
          </button>
        </div>
      </header>

      {(message || error) && (
        <div className={`rounded-2xl border px-6 py-4 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
          {error || message}
        </div>
      )}

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-black uppercase tracking-widest text-white">{t.inventory.licenses}</h3>
            <p className="text-sm text-slate-500 mt-1">Real feeder licenses synced from backend ownership records.</p>
          </div>
          <div className="text-sm text-slate-500">{licenses.length} item(s)</div>
        </div>

        {licenses.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-white/10 px-6 py-12 text-center text-slate-500">
            {t.inventory.empty}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {licenses.map((license, index) => {
              const tone = tierClasses[license.tier] || tierClasses.SILVER;
              return (
                <motion.div
                  key={license.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`rounded-[2rem] border bg-gradient-to-br ${tone} p-6 space-y-5 shadow-2xl`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">NFT License</p>
                      <h4 className="text-xl font-black font-orbitron text-white mt-2">{license.name}</h4>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${license.isStaked ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'}`}>
                      {license.isStaked ? 'Staked' : 'Available'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Tier</p>
                      <p className="text-white font-bold mt-1">{license.tier}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Max Rank</p>
                      <p className="text-white font-bold mt-1">{license.maxRank}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Daily Limit</p>
                      <p className="text-white font-bold mt-1">{license.dailyLimit}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Fee Discount</p>
                      <p className="text-white font-bold mt-1">{license.feeDiscount}%</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/30 border border-white/5 px-4 py-3 text-xs text-slate-400 font-mono break-all">
                    Token #{license.tokenId}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-black uppercase tracking-widest text-white">{t.inventory.badges}</h3>
            <p className="text-sm text-slate-500 mt-1">Unlocked achievements currently stored for the connected feeder.</p>
          </div>
          <div className="text-sm text-slate-500">{badges.length} item(s)</div>
        </div>

        {badges.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-white/10 px-6 py-12 text-center text-slate-500">
            No unlocked badges yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {badges.map((badge, index) => {
              const tone = rarityClasses[badge.rarity] || rarityClasses.COMMON;
              return (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`rounded-[2rem] border bg-gradient-to-br ${tone} p-6 space-y-5 shadow-2xl`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-5xl leading-none">{badge.icon || '??'}</div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-black/20 text-white/80">
                      {badge.rarity}
                    </span>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{badge.category}</p>
                    <h4 className="text-xl font-black text-white mt-2">{badge.name}</h4>
                    <p className="text-sm text-slate-300 mt-3 leading-relaxed">{badge.description}</p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-4">
                    <span>{t.inventory.unlockedAt}</span>
                    <span>{formatDate(badge.unlockedAt)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default InventoryView;
