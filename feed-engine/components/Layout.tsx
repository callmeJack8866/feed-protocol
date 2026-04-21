import React, { useCallback, useMemo, useState } from 'react';
import { FeederProfile, ViewType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslation } from '../i18n';
import { useAuthStore } from '../store';
import { useWallet } from '../hooks/useWallet';
import { getNonce, verifySIWE, buildSIWEMessage, setAuthToken, setWalletAddress } from '../services/api';
import { 
  Target, Activity, Trophy, Archive, Medal, Cpu, Layers, Scale, 
  Terminal, ShieldCheck, Zap, Server, ActivitySquare, AlertTriangle, Hexagon, LogOut, Shield, HardDrive,
  MoreHorizontal, X
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  profile: FeederProfile | null;
  activeView: ViewType;
  onNavigate: (view: ViewType) => void;
}

const SystemMarquee = () => {
  const messages = [
    "SYNCING_BLOCK_942,121...", "LATENCY_STABLE_12ms", "NEW_SIGNAL_DETECTED_0x42A",
    "QUORUM_ESTABLISHED_600519.SH", "PROTOCOL_UPGRADE_READY", "ORACLE_NODE_ACTIVE",
    "INTEGRITY_CHECK_PASSED", "GLOBAL_CONSENSUS_MAINTAINED"
  ];

  return (
    <div className="flex gap-16 whitespace-nowrap animate-marquee py-1">
      {[...messages, ...messages].map((msg, i) => (
        <span key={i} className="text-[9px] font-mono font-black text-cyan-500/50 uppercase tracking-[0.4em]">
          {msg}
        </span>
      ))}
    </div>
  );
};

const Layout: React.FC<LayoutProps> = ({ children, profile, activeView, onNavigate }) => {
  const { t } = useTranslation();

  const level = useMemo(() => Math.max(1, Math.floor((profile?.xp ?? 0) / 1000) + 1), [profile?.xp]);
  const xpProgress = useMemo(() => (((profile?.xp ?? 0) % 1000) / 1000) * 100, [profile?.xp]);
  const auth = useAuthStore();
  const wallet = useWallet();
  const [loginStatus, setLoginStatus] = useState<string>('');
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const handleEngageNode = useCallback(async () => {
    if (auth.isConnected) return;
    auth.setConnecting(true);
    auth.setError(null);
    setLoginStatus(t.layout.connectingWallet);

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error(t.layout.installMetamask);

      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      const chainHex: string = await ethereum.request({ method: 'eth_chainId' });
      const address = accounts[0]?.toLowerCase();
      const chainId = parseInt(chainHex, 16);

      if (!address) throw new Error(t.layout.noWalletAddress);

      setLoginStatus(t.layout.requestingNonce);
      setWalletAddress(address);
      const nonceRes = await getNonce(address);
      if (!nonceRes.success || !nonceRes.nonce) {
        throw new Error(t.layout.nonceFailed);
      }

      const message = nonceRes.message || buildSIWEMessage(address, nonceRes.nonce, chainId);

      setLoginStatus(t.layout.signMessage);
      const signature: string = await ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });
      if (!signature) throw new Error(t.layout.signatureCancelled);

      setLoginStatus(t.layout.verifyingSignature);
      const authRes = await verifySIWE(message, signature);
      if (!authRes.success || !authRes.token) {
        throw new Error(authRes.message || t.layout.verificationFailed);
      }

      auth.setToken(authRes.token);
      auth.setWallet(address, chainId);
      setAuthToken(authRes.token);
      setLoginStatus('');
    } catch (err: any) {
      auth.setError(err.message || t.layout.loginFailed);
      auth.setConnecting(false);
      setLoginStatus('');
    }
  }, [auth, wallet, t.layout]);

  const handleDisconnect = useCallback(() => {
    wallet.disconnectWallet();
    auth.disconnect();
    setAuthToken(null);
    setWalletAddress(null);
    setLoginStatus('');
  }, [wallet, auth]);

  const menuItems: { name: ViewType; icon: React.ReactNode; label: string }[] = useMemo(() => [
    { name: 'Quest Hall', icon: <Target size={18} strokeWidth={2.5}/>, label: t.nav.questHall },
    { name: 'Dashboard', icon: <Activity size={18} strokeWidth={2.5}/>, label: t.nav.dashboard },
    { name: 'Leaderboard', icon: <Trophy size={18} strokeWidth={2.5}/>, label: t.nav.leaderboard },
    { name: 'Inventory', icon: <Archive size={18} strokeWidth={2.5}/>, label: t.nav.inventory },
    { name: 'Achievements', icon: <Medal size={18} strokeWidth={2.5}/>, label: t.achievements.title },
    { name: 'Training Center', icon: <Cpu size={18} strokeWidth={2.5}/>, label: t.nav.trainingCenter },
    { name: 'Staking', icon: <Layers size={18} strokeWidth={2.5}/>, label: t.nav.staking },
    { name: 'Arbitration', icon: <Scale size={18} strokeWidth={2.5}/>, label: t.nav.arbitration }
  ], [t]);

  const mobilePrimaryItems = menuItems.slice(0, 4);
  const mobileMoreItems = menuItems.slice(4);

  const handleMobileNavigate = useCallback((view: ViewType) => {
    onNavigate(view);
    setIsMoreOpen(false);
  }, [onNavigate]);

  return (
    <div className="flex h-[100dvh] lg:h-screen min-h-[100dvh] text-[#E2E8F0] overflow-hidden relative bg-[#010102]">
      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 40s linear infinite; }
      `}</style>

      {/* Underlay Effects */}
      <div className="layout-grid-floor"></div>
      <div className="layout-hud-overlay"></div>

      {/* Left Navigation: Holographic Bridge Menu */}
      <aside className="hidden lg:flex w-[80px] lg:w-[220px] 2xl:w-[280px] m-2 xl:m-4 mr-0 rounded-[2rem] 2xl:rounded-[2.5rem] glass-panel z-30 transition-all duration-700 relative overflow-hidden flex-col shadow-[0_0_30px_rgba(34,211,238,0.05)] border border-cyan-500/20">
        <div className="scan-line-overlay"></div>
        
        <div className="p-4 lg:p-6 2xl:p-8 pb-2 relative z-10">
          <div className="flex items-center gap-3 2xl:gap-4 mb-6 2xl:mb-12 cursor-pointer group" onClick={() => onNavigate('Quest Hall')}>
            <div className="w-12 h-12 bg-cyan-500 rounded-2xl flex items-center justify-center font-black text-black shadow-[0_0_20px_rgba(34,211,238,0.5)] shrink-0 group-hover:scale-105 group-active:scale-95 transition-all">
              <Hexagon className="w-6 h-6 fill-black stroke-black stroke-1" />
            </div>
            <div className="hidden lg:block overflow-hidden">
              <h1 className="text-lg 2xl:text-xl font-black tracking-tighter uppercase italic text-white leading-tight">
                FEED<span className="text-cyan-400">VERSE</span>
              </h1>
              <p className="text-[6px] 2xl:text-[7px] font-black text-cyan-500/70 tracking-[0.4em] uppercase mt-0.5">SYS.V.4.0.0_ALPHA</p>
            </div>
          </div>

          <nav className="space-y-3 relative">
            <div className="absolute left-[24px] top-4 bottom-4 w-px bg-gradient-to-b from-cyan-500/20 via-cyan-500/40 to-cyan-500/0 hidden lg:block" />

            {menuItems.map((item) => {
              const isActive = activeView === item.name;
              return (
                <button
                  key={item.name}
                  onClick={() => onNavigate(item.name)}
                  className={`w-full text-left px-3 lg:px-4 py-2.5 2xl:py-3.5 rounded-2xl transition-all flex items-center gap-3 2xl:gap-4 text-sm relative group overflow-hidden ${
                    isActive 
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(34,211,238,0.15)] ml-2 w-[calc(100%-8px)]' 
                      : 'text-slate-500 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)]" />
                  )}
                  <div className="relative z-10 flex flex-shrink-0 items-center justify-center">
                    <span className={`transition-all ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'group-hover:scale-110'}`}>
                      {item.icon}
                    </span>
                  </div>
                  <div className="hidden lg:flex flex-1 items-center justify-between z-10">
                    <span className={`truncate uppercase tracking-widest text-[11px] font-black transition-all ${isActive ? 'glow-text-cyan' : ''}`}>
                      {item.label}
                    </span>
                    {isActive && <span className="text-[10px] font-mono font-black text-cyan-500/50 animate-pulse">[ ]</span>}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="mt-auto p-4 lg:p-6 2xl:p-8 relative z-10">
           <div className="hidden lg:block p-3 2xl:p-5 rounded-2xl bg-black/60 border border-cyan-500/20 shadow-inner">
             <div className="flex items-center justify-between mb-3">
               <p className="text-[8px] text-cyan-500 font-black uppercase tracking-[0.5em]">{t.layout.terminalLink}</p>
               <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse" />
             </div>
             <div className="space-y-1.5 font-mono text-[8px] text-slate-500 uppercase">
               <p className="flex justify-between"><span>LINK</span> <span className="text-cyan-400">ENCRYPTED</span></p>
               <p className="flex justify-between"><span>LATENCY</span> <span className="text-cyan-400">12MS</span></p>
             </div>
           </div>
        </div>
      </aside>

      {/* Main Stage & Topbar */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
        
        <header className="h-14 lg:h-16 2xl:h-20 mx-2 xl:mx-4 mt-2 xl:mt-4 rounded-[1.35rem] lg:rounded-[2rem] glass-panel px-3 sm:px-4 lg:px-6 2xl:px-8 flex items-center justify-between z-20 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-cyan-500/20">
          <div className="flex items-center gap-3 lg:gap-4 min-w-0 text-[10px] 2xl:text-[11px] font-black uppercase tracking-[0.25em] lg:tracking-[0.5em] text-slate-500">
            <div className="w-8 h-8 rounded-xl lg:rounded-full border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shrink-0">
               <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 lg:gap-4 min-w-0">
              <span className="hidden md:inline hover:text-cyan-400 cursor-pointer transition-colors">SYS_CORE</span>
              <span className="hidden md:inline opacity-20">/</span>
              <span className="text-white glow-text-cyan tracking-[0.22em] sm:tracking-[0.35em] lg:tracking-[0.6em] truncate max-w-[150px] sm:max-w-none">{activeView.replace(' ', '_')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:gap-8">
            <div className="hidden xl:flex flex-col items-end">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                 <Server size={10}/> CHAIN INTEGRITY
              </p>
              <div className="flex items-center gap-2">
                 <div className="flex gap-0.5 items-end h-3">
                   {[1,2,3,4,5].map(i => <div key={i} className="w-1 bg-cyan-500/50" style={{ height: `${i*20}%` }}/>)}
                 </div>
                 <p className="text-[11px] font-mono font-black text-cyan-400 ml-1">{auth.chainId ? `BSC_${auth.chainId}` : t.layout.chainUnknown}</p>
              </div>
            </div>
            
            <div className="h-8 w-px bg-white/10 hidden md:block" />
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <div className="h-8 w-px bg-white/10 hidden md:block" />
            
            {auth.isConnected && auth.address ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 sm:gap-3 bg-cyan-500/10 border border-cyan-500/30 px-3 sm:px-5 py-2.5 rounded-full shadow-[inset_0_0_15px_rgba(34,211,238,0.1)] min-h-[44px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,1)] animate-pulse" />
                  <span className="text-[11px] font-mono font-black text-cyan-400 tracking-wider">
                    {auth.address.slice(0, 6)}...{auth.address.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="hidden sm:flex w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 items-center justify-center hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all shadow-inner"
                  title="Disconnect"
                >
                  <LogOut size={14} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleEngageNode}
                disabled={auth.isConnecting}
                className="btn-cyber !min-h-[44px] !py-2.5 !px-4 sm:!px-8 !text-[10px] sm:!text-[11px] tracking-widest text-black flex items-center gap-2"
              >
                <Zap size={14} className="fill-black"/>
                {auth.isConnecting ? (loginStatus || t.layout.connecting) : t.layout.engageNode}
              </button>
            )}
            {auth.error && <span className="absolute -bottom-6 right-8 text-[9px] text-red-400 font-mono tracking-wider">{auth.error}</span>}
          </div>
        </header>

        <div className="absolute top-[4.4rem] lg:top-28 left-3 right-3 lg:left-4 lg:right-4 h-5 lg:h-6 bg-cyan-500/5 border border-cyan-500/10 rounded-xl overflow-hidden flex items-center shadow-inner pointer-events-none">
          <SystemMarquee />
        </div>

        <main className="flex-1 overflow-y-auto px-3 sm:px-4 pt-12 lg:pt-20 safe-main-padding lg:pb-4 custom-scrollbar relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(5px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.98, filter: 'blur(5px)' }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="lg:hidden fixed left-3 right-3 safe-bottom-nav z-[70] rounded-[1.5rem] border border-cyan-500/30 bg-black/85 backdrop-blur-2xl shadow-[0_0_35px_rgba(34,211,238,0.18)] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        <div className="grid grid-cols-5 gap-1 p-1.5">
          {mobilePrimaryItems.map((item) => {
            const isActive = activeView === item.name;
            return (
              <button
                key={item.name}
                onClick={() => handleMobileNavigate(item.name)}
                className={`min-h-[56px] rounded-[1.1rem] flex flex-col items-center justify-center gap-1 transition-all active:scale-95 relative overflow-hidden ${
                  isActive ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 border border-transparent'
                }`}
              >
                {isActive && <div className="absolute inset-x-3 top-0 h-0.5 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,1)]" />}
                <span className={isActive ? 'drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]' : ''}>{item.icon}</span>
                <span className="text-[8px] font-black uppercase tracking-wider leading-none">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
          <button
            onClick={() => setIsMoreOpen(true)}
            className={`min-h-[56px] rounded-[1.1rem] flex flex-col items-center justify-center gap-1 transition-all active:scale-95 border ${
              mobileMoreItems.some((item) => item.name === activeView) ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'text-slate-500 border-transparent'
            }`}
          >
            <MoreHorizontal size={18} strokeWidth={2.5} />
            <span className="text-[8px] font-black uppercase tracking-wider leading-none">More</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMoreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-[90] bg-black/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="absolute inset-x-0 bottom-0 max-h-[86dvh] rounded-t-[2rem] border-t border-cyan-500/30 bg-[#03070d] shadow-[0_-20px_80px_rgba(34,211,238,0.15)] overflow-hidden"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/40 px-5 py-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-cyan-500">Mobile Command</p>
                  <h3 className="font-orbitron text-lg font-black uppercase italic text-white">More Systems</h3>
                </div>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="min-h-[44px] min-w-[44px] rounded-2xl border border-white/10 bg-white/5 text-slate-300 flex items-center justify-center active:scale-95"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="custom-scrollbar max-h-[calc(86dvh-76px)] overflow-y-auto px-4 pt-4 pb-8 safe-bottom-bar space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {mobileMoreItems.map((item) => {
                    const isActive = activeView === item.name;
                    return (
                      <button
                        key={item.name}
                        onClick={() => handleMobileNavigate(item.name)}
                        className={`min-h-[88px] rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
                          isActive ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300' : 'border-white/10 bg-white/[0.03] text-slate-300'
                        }`}
                      >
                        <div className="mb-3">{item.icon}</div>
                        <p className="text-[10px] font-black uppercase tracking-widest leading-tight">{item.label}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-black/40 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">Language Core</p>
                      <p className="text-xs text-cyan-400 font-mono">Switch interface locale</p>
                    </div>
                    <LanguageSwitcher />
                  </div>
                  {auth.isConnected && (
                    <button
                      onClick={() => {
                        handleDisconnect();
                        setIsMoreOpen(false);
                      }}
                      className="min-h-[44px] w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <LogOut size={14} /> Disconnect Node
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right Telemetry Console */}
      <aside className="w-[320px] m-4 ml-0 rounded-[2.5rem] glass-panel hidden 2xl:flex flex-col relative overflow-hidden border border-cyan-500/20">
        
        <div className="flex justify-between items-center py-6 px-8 border-b border-white/5 bg-black/20">
          <h2 className="text-[10px] font-black tracking-[0.6em] uppercase text-slate-500 flex items-center gap-2">
             <Terminal size={12}/> TELEMETRY
          </h2>
          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center cursor-pointer hover:bg-cyan-500/20 hover:text-cyan-400 transition-all border border-white/10">
             <ActivitySquare size={14} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          
          {/* Executive Node Profile Badge */}
          <div className="rounded-3xl bg-[#080d1a]/80 border border-cyan-500/30 p-6 relative shadow-[0_0_30px_rgba(34,211,238,0.1)] overflow-hidden">
             <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full"></div>
             
             <div className="flex gap-4 items-center mb-6">
                <div className="relative">
                   <div className="absolute inset-0 bg-cyan-400 rounded-2xl blur-md opacity-20 pointer-events-none"></div>
                   <img src="/assets/images/owl-mascot-v3.png" className="w-16 h-16 rounded-2xl border-2 border-cyan-500/50 relative z-10" alt="avatar" />
                   <div className="absolute -bottom-2 -right-2 bg-amber-500 text-black px-2 py-0.5 rounded-lg text-[9px] font-black font-orbitron z-20 border border-black shadow-lg">
                     L.{level}
                   </div>
                </div>
                <div>
                   <p className="font-black font-orbitron text-lg text-white uppercase italic tracking-wider leading-none mb-1.5">{profile?.nickname}</p>
                   <p className="text-[9px] text-cyan-400 font-mono tracking-widest">{profile?.address.slice(0, 10)}...{profile?.address.slice(-4)}</p>
                </div>
             </div>

             <div className="space-y-4">
                <div>
                   <div className="flex justify-between text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1">
                      <span>{t.layout.fuelReserves}</span>
                      <span className="text-cyan-400 text-[10px]">{profile?.balanceFEED.toLocaleString()} <span className="opacity-50">FEED</span></span>
                   </div>
                   <div className="flex justify-between text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">
                      <span>XP PROG</span>
                      <span className="text-white text-[10px] font-mono">{Math.floor(xpProgress)}%</span>
                   </div>
                   <div className="h-1.5 w-full bg-black/80 rounded-full overflow-hidden border border-white/5">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${xpProgress}%` }} className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] rounded-full" />
                   </div>
                </div>
             </div>
          </div>

          {/* Grid Array Hardware Status */}
          <div>
            <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 mb-4 px-2 flex items-center gap-2">
               <ShieldCheck size={10} className="text-cyan-500"/> {t.layout.hardwareStatus}
            </h3>
            <div className="grid grid-cols-2 gap-3">
               
               <div className="bg-black/40 border border-white/10 rounded-2xl p-4 relative group hover:border-emerald-500/50 transition-colors">
                  <Shield className="w-4 h-4 text-emerald-500 mb-2 opacity-50 group-hover:opacity-100" />
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">{t.layout.integrityRating}</p>
                  <p className="text-sm font-black font-orbitron italic text-emerald-400">{profile?.rank} CLS</p>
               </div>

               <div className="bg-black/40 border border-white/10 rounded-2xl p-4 relative group hover:border-cyan-500/50 transition-colors">
                  <ActivitySquare className="w-4 h-4 text-cyan-500 mb-2 opacity-50 group-hover:opacity-100" />
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">{t.layout.syncEfficiency}</p>
                  <p className="text-sm font-black font-orbitron italic text-cyan-400">{profile?.accuracyRate.toFixed(1)}%</p>
               </div>

               <div className="col-span-2 bg-black/40 border border-white/10 rounded-2xl p-4 relative group hover:border-amber-500/50 transition-colors flex items-center justify-between">
                  <div>
                    <HardDrive className="w-4 h-4 text-amber-500 mb-2 opacity-50 group-hover:opacity-100" />
                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-0.5">{t.layout.riskCollateral}</p>
                    <p className="text-[10px] font-mono text-slate-400">POOL EXPOSURE</p>
                  </div>
                  <div className="text-right">
                     <p className="text-lg font-black font-orbitron italic text-amber-400">{profile?.stakedAmount.toLocaleString()}</p>
                     <p className="text-[8px] font-black text-amber-500/50 tracking-widest">{profile?.stakeType || 'USDT'}</p>
                  </div>
               </div>

               <div className="col-span-2 bg-black/40 border border-red-500/20 rounded-2xl p-4 relative group hover:border-red-500/50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                     <p className="text-[9px] text-red-400 font-black uppercase tracking-widest leading-tight">Emergency<br/>Bypass</p>
                  </div>
                  <button className="bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                     {t.layout.overrideSecurity}
                  </button>
               </div>

            </div>
          </div>
        </div>
      </aside>

    </div>
  );
};

export default Layout;
