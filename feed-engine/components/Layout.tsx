
import React, { useCallback, useState } from 'react';
import { FeederProfile, ViewType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslation } from '../i18n';
import { useAuthStore } from '../store';
import { useWallet } from '../hooks/useWallet';
import { getNonce, verifySIWE, buildSIWEMessage, setAuthToken, setWalletAddress } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
  profile: FeederProfile;
  activeView: ViewType;
  onNavigate: (view: ViewType) => void;
}

const SystemMarquee = () => {
  const messages = [
    "SYNCING_BLOCK_942,121...", "LATENCY_STABLE_12ms", "NEW_SIGNAL_DETECTED_0x42A",
    "QUORUM_ESTABLISHED_600519.SH", "PROTOCOL_UPGRADE_READY", "ORACLE_NODE_ACTIVE"
  ];

  return (
    <div className="flex gap-10 whitespace-nowrap animate-marquee py-1">
      {[...messages, ...messages].map((msg, i) => (
        <span key={i} className="text-[8px] font-mono font-black text-cyan-500/40 uppercase tracking-[0.3em]">
          {msg}
        </span>
      ))}
    </div>
  );
};

const Layout: React.FC<LayoutProps> = ({ children, profile, activeView, onNavigate }) => {
  const { t } = useTranslation();
  const auth = useAuthStore();
  const wallet = useWallet();
  const [loginStatus, setLoginStatus] = useState<string>('');

  /**
   * ENGAGE NODE 完整登录流程:
   * 1. 连接 MetaMask（EIP-1193）
   * 2. 获取 SIWE nonce
   * 3. 构造 EIP-4361 消息
   * 4. 钱包签名
   * 5. 后端验证签名 → 返回 JWT
   * 6. 存入 Zustand AuthStore
   */
  const handleEngageNode = useCallback(async () => {
    if (auth.isConnected) return; // 已连接则跳过
    auth.setConnecting(true);
    auth.setError(null);
    setLoginStatus('正在连接钱包...');

    try {
      // Step 0: 检查 MetaMask 是否安装
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('请先安装 MetaMask 钱包扩展');
      }

      // Step 1: 连接 MetaMask
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      const chainHex: string = await ethereum.request({ method: 'eth_chainId' });
      const address = accounts[0]?.toLowerCase();
      const chainId = parseInt(chainHex, 16);

      if (!address) {
        throw new Error('未能获取钱包地址');
      }

      // Step 2: 获取 SIWE nonce + 后端预构造消息
      setLoginStatus('获取认证凭证...');
      setWalletAddress(address); // 向后兼容 x-wallet-address header
      const nonceRes = await getNonce(address);
      if (!nonceRes.success || !nonceRes.nonce) {
        throw new Error('获取 nonce 失败');
      }

      // Step 3: 使用后端预构造的 SIWE 消息（或本地构造作为 fallback）
      const message = nonceRes.message || buildSIWEMessage(address, nonceRes.nonce, chainId);

      // Step 4: 钱包签名
      setLoginStatus('请在钱包中签名...');
      const signature: string = await ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });
      if (!signature) {
        throw new Error('用户取消签名');
      }

      // Step 5: 后端验证签名 → JWT
      setLoginStatus('验证签名...');
      const authRes = await verifySIWE(message, signature);
      if (!authRes.success || !authRes.token) {
        throw new Error(authRes.message || '签名验证失败');
      }

      // Step 6: 存入全局状态
      auth.setToken(authRes.token);
      auth.setWallet(address, chainId);
      setAuthToken(authRes.token);
      setLoginStatus('');

      console.log('✅ SIWE 登录成功:', address.slice(0, 10) + '...');
    } catch (err: any) {
      console.error('❌ 登录失败:', err);
      auth.setError(err.message || '登录失败');
      auth.setConnecting(false);
      setLoginStatus('');
    }
  }, [auth, wallet]);

  /** 断开钱包 */
  const handleDisconnect = useCallback(() => {
    wallet.disconnectWallet();
    auth.disconnect();
    setAuthToken(null);
    setWalletAddress(null);
    setLoginStatus('');
  }, [wallet, auth]);

  /** 导航项：name 用于路由，label 用于国际化显示 */
  const menuItems: { name: ViewType; icon: string; label: string }[] = [
    { name: 'Quest Hall', icon: '🏠', label: t.nav.questHall },
    { name: 'Dashboard', icon: '📈', label: t.nav.dashboard },
    { name: 'Leaderboard', icon: '🎯', label: t.nav.leaderboard },
    { name: 'Inventory', icon: '💼', label: t.nav.inventory },
    { name: 'Training Center', icon: '🎓', label: t.nav.trainingCenter },
    { name: 'Staking', icon: '🛡️', label: t.nav.staking },
    { name: 'Arbitration', icon: '⚖️', label: t.nav.arbitration }
  ];

  return (
    <div className="flex h-screen text-[#E2E8F0] overflow-hidden relative bg-[#030406]">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
      `}</style>

      {/* Background stardust */}
      <div className="fixed inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 z-0"></div>

      {/* Sidebar */}
      <aside className="w-[100px] lg:w-[280px] border-r border-white/5 flex flex-col bg-black/80 backdrop-blur-3xl z-30 transition-all duration-700 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none"></div>

        <div className="p-10 relative z-10">
          <div
            className="flex items-center gap-5 mb-20 cursor-pointer group"
            onClick={() => onNavigate('Quest Hall')}
          >
            <div className="w-12 h-12 bg-cyan-500 rounded-[1.2rem] flex items-center justify-center font-black text-black shadow-[0_0_30px_rgba(34,211,238,0.5)] shrink-0 group-hover:rotate-12 transition-all">
              F
            </div>
            <div className="hidden lg:block overflow-hidden">
              <h1 className="text-xl font-black tracking-tighter uppercase italic text-white leading-tight">
                FEED<span className="text-cyan-400">VERSE</span>
              </h1>
              <p className="text-[7px] font-black text-cyan-500/60 tracking-[0.4em] uppercase">V.4.0.0_ALPHA</p>
            </div>
          </div>

          <nav className="space-y-4 relative">
            {/* Connection Wire Visualization */}
            <div className="absolute left-[34px] top-10 bottom-10 w-px bg-gradient-to-b from-cyan-500/5 via-cyan-500/20 to-cyan-500/5 hidden lg:block" />

            {menuItems.map((item) => (
              <button
                key={item.name}
                onClick={() => onNavigate(item.name)}
                className={`w-full text-left px-5 py-5 rounded-[1.8rem] transition-all flex items-center gap-5 font-bold text-sm relative group overflow-hidden ${activeView === item.name
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
                  }`}
              >
                {activeView === item.name && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-cyan-400/5 z-0"
                  />
                )}
                <div className="relative z-10 flex items-center justify-center">
                  <span className={`text-3xl shrink-0 transition-all ${activeView === item.name ? 'scale-110 grayscale-0' : 'grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100'}`}>
                    {item.icon}
                  </span>
                  {activeView === item.name && (
                    <div className="absolute -left-1 w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,1)]" />
                  )}
                </div>
                <span className="hidden lg:block truncate uppercase tracking-[0.25em] text-[10px] font-black z-10">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-10 relative z-10">
          <div className="hidden lg:block p-8 rounded-[2.5rem] bg-black/40 border border-white/5 space-y-4 shadow-inner">
            <div className="flex items-center justify-between">
              <p className="text-[8px] text-cyan-500/60 font-black uppercase tracking-[0.5em]">Terminal Link</p>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse" />
            </div>
            <div className="space-y-1 font-mono text-[9px] text-slate-600">
              <p className="truncate">» ENCRYPT_SYNC: OK</p>
              <p className="truncate">» LATENCY_12ms</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
        <div className="h-6 w-full bg-cyan-500/5 border-b border-white/5 overflow-hidden flex items-center">
          <SystemMarquee />
        </div>

        <header className="h-24 border-b border-white/5 px-12 flex items-center justify-between backdrop-blur-2xl z-20">
          <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">
            <div className="w-2 h-2 rounded-full bg-cyan-500/20" />
            <span className="hover:text-cyan-400 cursor-pointer transition-colors">DECENTRALIZED_ORACLE</span>
            <span className="opacity-20">/</span>
            <span className="text-white glow-text tracking-[0.8em]">{activeView.replace(' ', '_').toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-10">
            <div className="hidden md:flex flex-col items-end">
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">BLOCK_HEIGHT</p>
              <p className="text-[11px] font-mono font-black text-cyan-400">921,432.21</p>
            </div>
            <div className="h-10 w-px bg-white/5" />
            <LanguageSwitcher />
            <div className="h-10 w-px bg-white/5" />
            {auth.isConnected && auth.address ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 px-5 py-3 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[10px] font-mono font-black text-cyan-400 tracking-wider">
                    {auth.address.slice(0, 6)}...{auth.address.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-black px-4 py-3 rounded-full hover:bg-red-500/20 transition-all uppercase tracking-wider"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={handleEngageNode}
                disabled={auth.isConnecting}
                className={`text-[11px] font-black px-12 py-4 rounded-full shadow-[0_20px_50px_rgba(255,255,255,0.15)] transition-all uppercase italic tracking-tighter font-orbitron hover:scale-105 active:scale-95 ${auth.isConnecting
                  ? 'bg-cyan-500/50 text-black cursor-wait animate-pulse'
                  : 'bg-white text-black hover:bg-cyan-500 hover:text-black'
                  }`}
              >
                {auth.isConnecting ? (loginStatus || '连接中...') : 'Engage Node'}
              </button>
            )}
            {auth.error && (
              <span className="text-[9px] text-red-400 font-mono">{auth.error}</span>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-16 custom-scrollbar relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Right Interface Console */}
          <aside className="w-[400px] border-l border-white/5 bg-black/40 hidden 2xl:flex flex-col overflow-y-auto custom-scrollbar backdrop-blur-3xl relative">
            <div className="p-12 space-y-16 relative z-10">
              <div className="flex justify-between items-center px-4">
                <h2 className="text-[11px] font-black tracking-[0.8em] uppercase text-slate-500">SYSTEM_LOGS</h2>
                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center cursor-pointer hover:bg-cyan-500/10 hover:text-cyan-400 transition-all text-sm border border-white/5">»</div>
              </div>

              <div className="space-y-10">
                {/* Profile Widget */}
                <div className="p-10 rounded-[3.5rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 relative overflow-hidden group shadow-2xl">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 blur-[80px] pointer-events-none"></div>

                  <div className="flex items-center gap-8 mb-10 relative z-10">
                    <div className="relative group/avatar">
                      <div className="absolute inset-[-4px] rounded-[2.2rem] bg-gradient-to-tr from-cyan-500 to-amber-500 opacity-40 group-hover/avatar:opacity-100 transition-opacity blur-[2px]" />
                      <img src="/assets/images/owl-mascot-v2.png" className="w-24 h-24 rounded-[2rem] border-2 border-black relative z-10" alt="avatar" />
                      <div className="absolute -bottom-3 -right-3 bg-white text-black border border-white/10 px-4 py-1.5 rounded-xl text-[10px] font-black font-orbitron italic z-20 shadow-xl">
                        LVL 42
                      </div>
                    </div>
                    <div>
                      <p className="font-black font-orbitron text-2xl text-white italic tracking-tighter uppercase leading-none mb-2">{profile.nickname}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">{profile.address.slice(0, 15)}...</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 relative z-10">
                    <div className="flex justify-between items-end px-2">
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Fuel Reserves</span>
                      <span className="text-3xl font-black font-orbitron text-white italic glow-text">{profile.balanceFEED.toLocaleString()} <span className="text-xs text-cyan-500/60">XTTA</span></span>
                    </div>
                    <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "75%" }}
                        className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-white shadow-[0_0_20px_rgba(34,211,238,0.4)] rounded-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="space-y-8">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.6em] text-slate-600 px-6">Hardware Status</h3>
                  <div className="grid grid-cols-1 gap-5">
                    {[
                      { label: 'Integrity Rating', val: profile.rank + ' CLASS', color: 'text-rose-500', bg: 'bg-rose-500/5' },
                      { label: 'Sync Efficiency', val: profile.accuracyRate + '%', color: 'text-cyan-400', bg: 'bg-cyan-500/5' },
                      { label: 'Risk Collateral', val: '$' + (profile.stakedAmount / 1000) + 'K', color: 'text-white', bg: 'bg-white/5' }
                    ].map(stat => (
                      <div key={stat.label} className={`p-8 rounded-[2.5rem] ${stat.bg} border border-white/5 flex justify-between items-center group hover:scale-[1.02] transition-all cursor-crosshair`}>
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">{stat.label}</span>
                        <span className={`text-lg font-black font-orbitron italic ${stat.color} group-hover:glow-text transition-all`}>{stat.val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-12">
                  <button className="w-full py-6 rounded-[2.5rem] bg-white text-black text-[11px] font-black uppercase tracking-[0.5em] shadow-2xl hover:bg-cyan-400 hover:text-black transition-all italic font-orbitron active:scale-95">
                    Override Security
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Layout;
