# FeedEngine 进展记录

## 2026-03-19T15:00 — 修复链上事件监听 filter not found

**[Status]**: Done  
**[Changes]**:
1. `event-listener.service.ts` — 完全重写（~480行）
   - ❌ 旧方案: `contract.on()` → ethers 底层用 `eth_newFilter` + `eth_getFilterChanges`，公共 RPC 5 分钟后清除 filter → 报错 `filter not found` → 事件丢失
   - ✅ 新方案: 基于 `provider.getLogs()` 的定时轮询（5秒间隔）
   - 新增 `KeyValue` 表持久化 `lastProcessedBlock`，重启不丢事件
   - 分批查询（MAX_BLOCK_RANGE=2000），避免 RPC 拒绝
   - 指数退避重连（连续失败 5 次后重建 provider）
   - 所有原有事件处理逻辑完整保留（DB 写入 + WebSocket 广播）
2. 编译验证通过（`tsc --noEmit` 中无 event-listener 相关错误）

**[Next Step]**: 前端功能测试

## 2026-03-19T14:48 — 修复赛季排行榜聚合排名逻辑

**[Status]**: Done  
**[Changes]**:
1. `season.controller.ts` — 重写 leaderboard 和 my-rank，从全局字段改为 FeedHistory 按赛季时间范围聚合
2. 新增 `verify-season-ranking.ts` 验证脚本

**[Next Step]**: 事件监听稳定性修复

## 2026-03-18T22:35 — 修复 GPT-5.4 修改的代码质量问题

**[Status]**: Done  
**[Changes]**:
1. `i18n/types.ts` + 6 语言文件 — 新增 12 个登录流程翻译 key
2. `Layout.tsx` — 乱码注释还原 + 登录消息 i18n 化
3. `App.tsx` — 乱码注释还原
