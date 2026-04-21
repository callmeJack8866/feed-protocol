import os

# Refactor App.tsx
app_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    app_text = f.read()

# Refactor central "Connect Your Wallet" button
app_text = app_text.replace(
    'className="px-10 py-4 rounded-[2.5rem] bg-cyan-500 text-black font-black font-orbitron text-[11px] uppercase tracking-[0.3em] italic shadow-[0_30px_60px_rgba(34,211,238,0.4)] hover:bg-cyan-400 hover:scale-105 active:scale-95 transition-all relative overflow-hidden group"',
    'className="btn-cyber text-[11px] tracking-[0.3em] group"'
)

# Refactor "Retry Connection" button
app_text = app_text.replace(
    'className="px-6 py-3 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all font-semibold"',
    'className="btn-cyber-ghost"'
)

# Top Bar tabs logic 
# Replace bg-cyan-500/5 border-cyan-500/10 with standard
app_text = app_text.replace(
    "activeTab === 'beginner' ? 'bg-cyan-500/5 border-cyan-500/10' : 'bg-transparent border-transparent hover:bg-white/5'",
    "activeTab === 'beginner' ? 'glass-panel' : 'bg-transparent hover:bg-white/5 border border-transparent'"
)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(app_text)


# Refactor OrderDetailModal.tsx
modal_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\components\OrderDetailModal.tsx'
with open(modal_path, 'r', encoding='utf-8') as f:
    modal_text = f.read()

# The modal container
modal_text = modal_text.replace(
    'className="w-[85vw] max-w-[1400px] bg-[#0A0F1E] border border-cyan-500/20 shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-[4rem]"',
    'className="w-[85vw] max-w-[1400px] glass-panel relative overflow-hidden rounded-[4rem]"'
)

# The large Engage Button
modal_text = modal_text.replace(
    '''className={`w-full py-8 rounded-[2.5rem] font-black font-orbitron text-2xl transition-all uppercase italic shadow-2xl ${
                  [OrderStatus.OPEN, OrderStatus.GRABBED, OrderStatus.FEEDING].includes(order.status)
                    ? order.status === OrderStatus.OPEN
                      ? 'bg-cyan-500 text-black shadow-cyan-500/30'
                      : 'bg-emerald-500 text-black shadow-emerald-500/30'
                    : 'bg-slate-900 text-slate-700 cursor-not-allowed border border-white/5'
                }`}''',
    '''className={`w-full py-8 text-2xl uppercase italic ${
                  [OrderStatus.OPEN, OrderStatus.GRABBED, OrderStatus.FEEDING].includes(order.status)
                    ? order.status === OrderStatus.OPEN
                      ? 'btn-cyber'
                      : 'btn-cyber !bg-emerald-500 !shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'btn-cyber !bg-slate-900 !text-slate-700 !shadow-none !border !border-white/5 cursor-not-allowed hover:!scale-100 active:!scale-100'
                }`}'''
)

with open(modal_path, 'w', encoding='utf-8') as f:
    f.write(modal_text)


# Refactor FeedModal.tsx
feed_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\components\FeedModal.tsx'
with open(feed_path, 'r', encoding='utf-8') as f:
    feed_text = f.read()

feed_text = feed_text.replace(
    'className="flex-[2] py-8 rounded-[3rem] bg-cyan-500 text-black font-black font-orbitron text-3xl shadow-[0_25px_50px_rgba(34,211,238,0.3)] active:scale-95 transition-all uppercase italic"',
    'className="btn-cyber flex-[2] py-8 rounded-[3rem] text-3xl"'
)
with open(feed_path, 'w', encoding='utf-8') as f:
    f.write(feed_text)


print('Refactoring Python Script Completed')
