import sys

filepath = r'f:\Unstandardized_Products\FeedEngine\feed-engine\App.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

app_start_idx = -1
for i, line in enumerate(lines):
    if line.startswith('const App: React.FC = () => {'):
        app_start_idx = i
        break

if app_start_idx == -1:
    print("Error: Could not find 'const App'")
    sys.exit(1)

# we need to replace lines from 22 to app_start_idx with our new code
new_code = """
import { Zap, ShieldCheck, Sword, Crown, Activity, Globe, Rocket, Terminal } from 'lucide-react';

const THEMES = {
  beginner: {
    color: 'cyan',
    bgColor: 'bg-cyan-500',
    textColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/20',
    ring1: 'rgba(34,211,238,0.6)',
    ring2: 'rgba(34,211,238,0.3)',
    glow: 'shadow-[0_0_80px_rgba(34,211,238,0.4),inset_0_0_40px_rgba(34,211,238,0.3)]',
    gradient: 'from-cyan-400/40 via-cyan-500/60 to-cyan-600/40',
    textGradient: 'from-transparent to-cyan-500'
  },
  competitive: {
    color: 'orange',
    bgColor: 'bg-orange-500',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-500/20',
    ring1: 'rgba(249,115,22,0.6)',
    ring2: 'rgba(249,115,22,0.3)',
    glow: 'shadow-[0_0_80px_rgba(249,115,22,0.4),inset_0_0_40px_rgba(249,115,22,0.3)]',
    gradient: 'from-orange-400/40 via-orange-500/60 to-orange-600/40',
    textGradient: 'from-transparent to-orange-500'
  },
  master: {
    color: 'rose',
    bgColor: 'bg-rose-500',
    textColor: 'text-rose-400',
    borderColor: 'border-rose-500/20',
    ring1: 'rgba(225,29,72,0.6)',
    ring2: 'rgba(225,29,72,0.3)',
    glow: 'shadow-[0_0_80px_rgba(225,29,72,0.4),inset_0_0_40px_rgba(225,29,72,0.3)]',
    gradient: 'from-rose-400/40 via-rose-500/60 to-rose-600/40',
    textGradient: 'from-transparent to-rose-500'
  }
};

const OrbitalRing: React.FC<{ index: number; springX: MotionValue<number>; springY: MotionValue<number>; themeColor: string }> = ({ index, springX, springY, themeColor }) => {
  const x = useTransform(springX, [-500, 500], [index * -15, index * 15]);
  const y = useTransform(springY, [-500, 500], [index * -15, index * 15]);
  const rotate = index % 2 === 0 ? 360 : -360;

  return (
    <motion.div
      animate={{ rotate }}
      transition={{ duration: 40 + index * 15, repeat: Infinity, ease: "linear" }}
      className={`absolute rounded-full border border-dashed shadow-inner`}
      style={{
        x, y,
        borderColor: themeColor === 'orange' ? 'rgba(249,115,22,0.1)' : themeColor === 'rose' ? 'rgba(225,29,72,0.1)' : 'rgba(34,211,238,0.1)',
        width: 450 + index * 250,
        height: 450 + index * 250
      }}
    />
  );
};

const DataNodeHUD: React.FC<{ label: string; value: string; icon: React.ReactNode; posClass: string; theme: any; delay?: number }> = ({ label, value, icon, posClass, theme, delay = 0 }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.8 }}
      className={`absolute ${posClass} glass-panel border ${theme.borderColor} p-4 rounded-3xl w-48 shadow-2xl backdrop-blur-md hidden md:flex flex-col gap-2 z-30 group`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-6 h-6 rounded-lg ${theme.bgColor}/10 flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <p className={`text-xl font-orbitron font-black italic shadow-black drop-shadow-md ${theme.textColor} group-hover:scale-105 transition-all origin-left`}>
        {value}
      </p>
    </motion.div>
  );
};

const CosmicHero: React.FC<{ springX: MotionValue<number>; springY: MotionValue<number>; activeTab: string }> = ({ springX, springY, activeTab }) => {
  const craftRotateX = useTransform(springY, [-500, 500], [10, -10]);
  const craftRotateY = useTransform(springX, [-500, 500], [-10, 10]);
  const coreX = useTransform(springX, [-500, 500], [-30, 30]);
  const coreY = useTransform(springY, [-500, 500], [-30, 30]);
  
  const theme = THEMES[activeTab as keyof typeof THEMES] || THEMES.beginner;

  return (
    <section className="relative h-[480px] flex flex-col items-center justify-center text-center overflow-visible">
      {/* HUD Nodes */}
      <DataNodeHUD label="GLOBAL HASH POWER" value="2,122,520 TH/s" icon={<Globe className={`w-3 h-3 ${theme.textColor}`}/>} posClass="left-10 top-20" theme={theme} delay={0.1}/>
      <DataNodeHUD label="NETWORK LATENCY" value="12ms" icon={<Activity className={`w-3 h-3 ${theme.textColor}`}/>} posClass="left-10 bottom-20" theme={theme} delay={0.3}/>
      <DataNodeHUD label="TOTAL REWARD POOL" value="2.5M XTTA" icon={<Crown className={`w-3 h-3 ${theme.textColor}`}/>} posClass="right-10 top-20" theme={theme} delay={0.2}/>
      <DataNodeHUD label="ACTIVE OPERATORS" value="8,402" icon={<ShieldCheck className={`w-3 h-3 ${theme.textColor}`}/>} posClass="right-10 bottom-20" theme={theme} delay={0.4}/>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {[1, 2, 3].map(i => (
          <OrbitalRing key={i} index={i} springX={springX} springY={springY} themeColor={theme.color} />
        ))}

        <motion.div
          style={{ x: coreX, y: coreY, rotateX: craftRotateX, rotateY: craftRotateY }}
          className="relative w-[400px] h-[400px] flex items-center justify-center transition-colors duration-1000"
        >
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 5, repeat: Infinity }}
            className={`absolute w-full h-full ${theme.bgColor}/10 blur-[120px] rounded-full`}
          />
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10 w-[240px] h-[240px]"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className={`absolute inset-[-20px] rounded-full border-2 ${theme.borderColor}`}
              style={{ borderTopColor: theme.ring1, borderRightColor: theme.ring2 }}
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className={`absolute inset-[10px] rounded-full border ${theme.borderColor}`}
              style={{ borderBottomColor: theme.ring2, borderLeftColor: theme.ring1 }}
            />
            <motion.div
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className={`absolute inset-[30px] rounded-full border ${theme.borderColor}`}
            />
            <div className={`absolute inset-[50px] rounded-full bg-gradient-to-br ${theme.gradient} blur-[20px]`} />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className={`absolute inset-[70px] rounded-full bg-gradient-to-br ${theme.gradient} ${theme.glow}`}
            />
            <motion.div
              animate={{ scale: [1.1, 0.9, 1.1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-[85px] rounded-full bg-gradient-to-br from-white/30 ${theme.gradient} ${theme.glow}`}
            />
            <div className="absolute inset-[90px] rounded-full flex items-center justify-center">
              <Zap className="w-10 h-10 text-white drop-shadow-[0_0_10px_rgba(255,255,255,1)]" />
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="relative z-20 mt-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <h2 className="text-[80px] md:text-[100px] font-black font-orbitron tracking-tighter italic uppercase text-white leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,1)]">
              FEED<span className={theme.textColor}>VERSE</span>
            </h2>
            <div className={`flex items-center gap-6 w-full max-w-2xl opacity-60 mt-2`}>
              <div className={`h-px flex-1 bg-gradient-to-r ${theme.textGradient}`} />
              <p className={`text-[10px] font-black tracking-[1em] ${theme.textColor}`}>COMMAND_CENTER_V4</p>
              <div className={`h-px flex-1 bg-gradient-to-l ${theme.textGradient}`} />
            </div>
          </motion.div>
      </div>
    </section>
  );
};

const QuestHallView: React.FC<{
  filteredOrders: FeedOrder[];
  activeTab: string;
  setActiveTab: (tab: any) => void;
  setShowPrefs: (val: boolean) => void;
  setViewingOrder: (order: FeedOrder) => void;
  springX: MotionValue<number>;
  springY: MotionValue<number>;
  onMouseMove: (e: React.MouseEvent) => void;
}> = ({ filteredOrders, activeTab, setActiveTab, setShowPrefs, setViewingOrder, springX, springY, onMouseMove }) => {
  const { t } = useTranslation();
  const theme = THEMES[activeTab as keyof typeof THEMES] || THEMES.beginner;

  return (
    <div onMouseMove={onMouseMove} className="space-y-12 max-w-7xl mx-auto pb-40 relative">
      <CosmicHero springX={springX} springY={springY} activeTab={activeTab} />

      {/* Difficulty Selectors */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 px-10">
        <div className="flex glass-panel p-2 rounded-[3.5rem] border border-white/5 relative group overflow-hidden w-full lg:w-auto shadow-2xl">
          {[
            { id: 'beginner', label: 'Primary Sync', icon: <ShieldCheck size={18}/>, colorClass: 'text-cyan-400', activeClass: 'bg-cyan-500 text-black shadow-[0_0_30px_rgba(34,211,238,0.4)]' },
            { id: 'competitive', label: 'Combat Feed', icon: <Sword size={18}/>, colorClass: 'text-orange-400', activeClass: 'bg-orange-500 text-black shadow-[0_0_30px_rgba(249,115,22,0.4)]' },
            { id: 'master', label: 'Zenith Oracle', icon: <Crown size={18}/>, colorClass: 'text-rose-400', activeClass: 'bg-rose-500 text-black shadow-[0_0_30px_rgba(225,29,72,0.4)]' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-8 py-4 rounded-[3rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center gap-3 relative z-10 flex-1 lg:flex-none justify-center ${
                activeTab === tab.id
                ? `${tab.activeClass} scale-105`
                : `${tab.colorClass} hover:bg-white/5`
              }`}
            >
              <span className="group-hover:scale-110 transition-transform">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-6 shrink-0">
          <button onClick={() => setShowPrefs(true)} className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all shadow-inner">
            <Terminal size={20} />
          </button>
          <button className={`btn-cyber !text-[11px] tracking-[0.3em] flex items-center gap-2 !px-8`}>
            <Rocket size={16} className="fill-black" />
            INITIATE SCAN
          </button>
        </div>
      </section>

      {/* Directive Banner */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="px-10"
      >
        <div className={`flex flex-col md:flex-row items-center justify-between px-10 py-6 rounded-[2.5rem] glass-panel border shadow-lg ${theme.borderColor}`}>
          <div className="flex items-center gap-6">
            <div className={`w-14 h-14 rounded-2xl ${theme.bgColor}/10 flex items-center justify-center`}>
               {activeTab === 'beginner' ? <ShieldCheck className={`w-7 h-7 ${theme.textColor}`}/> : activeTab === 'competitive' ? <Sword className={`w-7 h-7 ${theme.textColor}`}/> : <Crown className={`w-7 h-7 ${theme.textColor}`}/>}
            </div>
            <div>
              <p className={`text-lg font-black font-orbitron uppercase tracking-widest italic mb-1 ${theme.textColor}`}>
                » {activeTab === 'beginner' ? 'STANDARD ORACLE PROTOCOL' : activeTab === 'competitive' ? 'HOSTILE MARKET SECURED' : 'RESTRICTED A/S LEVEL'}
              </p>
              <p className="text-[10px] text-slate-400 font-bold tracking-wider">
                {activeTab === 'beginner' ? 'RECOMMENDED FOR F-D OPERATORS. SAFE YIELD SECURED.' :
                 activeTab === 'competitive' ? 'ENHANCED COLLATERAL REQUIRED. EXTREME VOLATILITY.' :
                 'LETHAL PENALTIES ACTIVE. ELITE CONSENSUS ONLY.'}
              </p>
            </div>
          </div>
          <div className="mt-4 md:mt-0 flex gap-4">
             <div className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest ${theme.bgColor}/10 ${theme.textColor} border ${theme.borderColor} shadow-inner`}>
               {filteredOrders.length} MISSIONS IDENTIFIED
             </div>
          </div>
        </div>
      </motion.div>

      {/* Orders Grid */}
      <div className="px-10">
        <AnimatePresence mode="popLayout">
          {filteredOrders.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredOrders.map(order => (
                <motion.div
                  key={order.orderId}
                  initial={{ opacity: 0, scale: 0.9, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", damping: 25, stiffness: 150 }}
                >
                  <OrderCard order={order} onGrab={() => setViewingOrder(order)} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="py-40 flex flex-col items-center text-center space-y-8 opacity-40">
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              >
                <Target size={80} className="text-slate-500 opacity-20" />
              </motion.div>
              <p className={`font-orbitron font-black text-2xl uppercase tracking-[0.5em] ${theme.textColor}`}>VOID_DETECTED</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

"""

final_lines = lines[:22] + [new_code] + lines[app_start_idx:]
with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)

print("Updated App.tsx successfully.")
