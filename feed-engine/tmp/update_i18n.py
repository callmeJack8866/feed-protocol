import os
import re

zh_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\i18n\translations\zh.ts'
en_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\i18n\translations\en.ts'

# --- Update ZH ---
with open(zh_path, 'r', encoding='utf-8') as f:
    zh = f.read()

replacements_zh = {
    # Nav & Ecosystem
    "'任务大厅'": "'任务大厅'",
    "'仪表盘'": "'节点终端'",
    "'排行榜'": "'全网排行'",
    "'库存'": "'数据机房'",
    "'训练中心'": "'模拟舱'",
    "'质押'": "'质押核心'",
    "'仲裁'": "'仲裁协议'",
    
    # Core Actions & Status
    "'抢单'": "'接取任务'",
    "'已抢'": "'锁定任务'",
    "'喂价中'": "'任务执行中'",
    "'提交信号'": "'提交哈希'",
    "'生成证明'": "'揭示价格'",
    "'预言机已同步 // 赏金已解锁'": "'达成共识 // 奖励已解锁'",
    "'领取赏金'": "'领取奖励'",
    "'接受任务'": "'接取指令'",
    
    # Titles & Metaphors
    "'喂价员'": "'节点执行官'",
    "'仅限 A/S 级喂价员": "'仅限 A/S 级执行官",
    "'适合 F-D 级喂价员": "'适合 F-D 级执行官",
    "'适合 C-B 级喂价员": "'适合 C-B 级执行官",
    "'赛季排行榜'": "'纪元排行榜'",
    "'我的赛季排名'": "'我的纪元排名'",
    "'赛季奖励'": "'纪元奖励'",
    "'成就徽章'": "'协议遗物'",
    "'喂价执照'": "'准入密钥'",
    "'数字执照与信誉签名'": "'网络密钥与数据权限'",
    
    # Wallet / Connection
    "'连接钱包'": "'初始化节点连接'",
    "'断开连接'": "'断开节点连接'",
    "'正在连接钱包...'": "'正在初始化节点连接...'",
}

for old, new in replacements_zh.items():
    zh = zh.replace(old, new)

with open(zh_path, 'w', encoding='utf-8') as f:
    f.write(zh)


# --- Update EN ---
with open(en_path, 'r', encoding='utf-8') as f:
    en = f.read()

replacements_en = {
    # Nav & Ecosystem
    "'Quest Hall'": "'Quest Hall'",
    "'Dashboard'": "'Node Terminal'",
    "'Leaderboard'": "'Epoch Rankings'",
    "'Inventory'": "'Data Vault'",
    "'Training Center'": "'Simulation Deck'",
    "'Staking'": "'Stake Core'",
    "'Arbitration'": "'Judicial Protocol'",
    
    # Core Actions & Status
    "'Grab'": "'Accept Mission'",
    "'Grabbed'": "'Mission Locked'",
    "'Feeding'": "'Executing'",
    "'Commit Signal'": "'Commit Hash'",
    "'Generating Proof'": "'Reveal Price'",
    "'Oracle Synchronized // Bounty Unlocked'": "'Consensus Reached // Reward Unlocked'",
    "'Claim Bounty'": "'Claim Reward'",
    "'ENGAGE DIRECTIVE'": "'ACCEPT DIRECTIVE'",
    
    # Titles & Metaphors
    "'Feeder'": "'Node Operator'",
    "'A/S Class Feeders Only": "'A/S Class Operators Only",
    "'F-D rank feeders": "'F-D rank operators",
    "'C-B rank feeders": "'C-B rank operators",
    "'Season Leaderboard'": "'Epoch Rankings'",
    "'My Season Rank'": "'My Epoch Rank'",
    "'Season Reward'": "'Epoch Reward'",
    "'Achievement Badges'": "'Protocol Relics'",
    "'Feeder Licenses'": "'Access Keys'",
    "'Digital Licenses & Reputation Signatures'": "'Network Keys & Data Clearances'",
    
    # Wallet / Connection
    "'Connect Wallet'": "'Initialize Node Link'",
    "'Disconnect'": "'Sever Node Link'",
    "'Connecting wallet...'": "'Initializing Node Link...'",
}

for old, new in replacements_en.items():
    en = en.replace(old, new)

with open(en_path, 'w', encoding='utf-8') as f:
    f.write(en)

print("Updated translation files.")
