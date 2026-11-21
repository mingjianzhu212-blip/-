/* 联机结算幂等账（第 123 轮 · 修第 117 轮独立审查 H1/H2）
 *
 * 旧实现的两个真实缺陷（ChatGPT 第 117 轮审查指出，复查确认）：
 *   H1 原子性：已入账 runId 存在**独立** localStorage 键里，灵石加在**主存档**里，是两次写入。
 *      若两步之间失败（save 抛异常 / 浏览器崩溃）→ 标记在、奖励没了 → 该局永久丢奖。
 *   H2 只记最近一局：第 N-1 局的 run_settle 若延迟到达（SSE 重连补投），会被当新局重复入账。
 *
 * 本模块的方案：幂等表就是主存档 S 里的一个数组 multiCreditedRuns。
 *   入账时只改内存（S.stone + 表），由调用方一次 save() 整体落盘。
 *   localStorage.setItem 对**单个键**是原子的 → 奖励与标记要么一起在，要么一起不在。
 *   副作用方向是安全的：若 save 失败，磁盘上两者都没有，事件重投会正常补上（至多补一次），
 *   不会出现"标记在、奖励没了"的单边状态。
 *
 * 纯逻辑：不碰 DOM、不碰 localStorage、不依赖任何游戏状态。可被 node --test 直接 require。
 */
(function (root) {
  'use strict';

  /* 保留最近多少局。取值权衡：
     - 太小：长时间断线的旧局重投仍可能被当新局（H2 复发）；
     - 太大：白占存档体积（每个 runId 36 字符）。
     64 局 ≈ 2.3KB，覆盖"一晚上断线重连几十次"的真实场景，远超服务器保留单局的时间窗。 */
  var KEEP = 64;

  /* runId 规范化（第 124 轮复核意见 B/E1）：
     服务器用 crypto.randomUUID()，格式固定为 8-4-4-4-12 小写十六进制。
     ① 统一小写：避免 "ABC" 与 "abc" 被当成两局（同一局去重失效）；
     ② 严格格式校验：不合格式的一律当作"没有 runId"，不进表——
        这同时挡住"导入存档塞超长字符串撑大存档"的路径（E1）。
     若服务器将来改 ID 格式，改这一处正则即可，别处不写死。 */
  var RID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  /* 阶段四 C3（制作人 D6 批甲）：本地陪练局复用同一张幂等表 S.multiCreditedRuns，
     runId 加 local- 前缀（js/multi-local.js 的 newRunId）。这里放行**且只放行**这一种前缀形状：
       · 前缀固定字面量 local-，后面仍必须是完整的 8-4-4-4-12 小写十六进制；
       · 长度封顶 42 字符、字符集不变 → E1「导入存档塞超长字符串撑大存档」的边界一字未放宽；
       · 前缀与服务器 crypto.randomUUID() 的输出永不碰撞，本地局与真人局天然分账，
         因此不需要新增存档字段（D8 只批了 S.enc.seen 一个新字段，本项零新增）。
     除这两种形状以外的一切（含 local- 后接任意串、双重前缀、大写以外的杂字符）仍旧一律拒绝。 */
  var LOCAL_RID_RE = /^local-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  function normRid(rid) {
    if (typeof rid !== 'string') return '';
    var v = rid.trim().toLowerCase();
    return (RID_RE.test(v) || LOCAL_RID_RE.test(v)) ? v : '';
  }

  /* 取幂等表：脏值一律清成空表（不信任存档里的任何形状）
     第 125 轮复核意见 H1：这里也必须封顶 KEEP——否则一份被塞进上万条合法 runId 的存档
     会在读档时整段进内存（claim 才修剪是来不及的，读档就已经把体积吃掉了）。 */
  /* 取幂等表（第 125/126 轮整改：ChatGPT #63 审查意见①）。
     旧实现从头部线性扫描 + indexOf 去重 → 超大数组呈 O(n²) 开销，且只在长度变化时写回，
     导致合法大写 UUID 的规范化结果没有回写（同一 runId 的大小写形式可能被重复认领）。
     新实现：从尾部向前扫描，用 Set 去重（O(n)），最多收集 KEEP 个唯一 ID；
     与原数组逐元素比较（原始串 vs 归一串），任何差异都写回归一后的数组。
     注：hist 只能收敛"清洗阶段"的额外开销，无法阻止 JSON 解析器先把巨大数组 parse 进内存——
     存档体积上限应在传输/解析层统一约束。 */
  function hist(S) {
    if (!S || typeof S !== 'object') return [];
    var a = S.multiCreditedRuns;
    if (!Array.isArray(a)) { S.multiCreditedRuns = []; return S.multiCreditedRuns; }
    // 从尾部向前扫描，最多收集 KEEP 个唯一规范化 ID（Set 去重，O(n)，避免 O(n²)）
    var seenSet = Object.create(null);
    var tail = [];
    for (var i = a.length - 1; i >= 0 && tail.length < KEEP; i--) {
      var v = normRid(a[i]);
      if (!v) continue;
      if (seenSet[v]) continue;
      seenSet[v] = 1;
      tail.push(v);
    }
    tail.reverse();   // 恢复"最近优先"的顺序（tail 末尾 = 最新在前）
    // 逐元素比较：原始串（raw）与归一结果不同（如大写 UUID），或原数组有被剔除的非法项 → 视为变化，写回
    var changed = (tail.length !== a.length);
    if (!changed) {
      var idx = 0;
      for (var j = 0; j < a.length; j++) {
        var raw = a[j];
        var nv = normRid(raw);
        if (!nv) { changed = true; break; }                 // 原数组有非法项被剔除
        if (raw !== tail[idx]) { changed = true; break; }   // 原始串与归一不同（大小写）→ 写回
        idx++;
      }
    }
    if (changed) S.multiCreditedRuns = tail;
    return tail;
  }

  function seen(S, rid) {
    var id = normRid(rid);
    if (!id) return false;
    return hist(S).indexOf(id) >= 0;
  }

  /* 认领一局：返回 { first, reason }
     first=true  → 这是第一次见到该 runId，调用方应当入账（然后 save）
     first=false → 已入账过，调用方必须跳过入账
     无 runId / 格式不合法时一律 first=true（没有可用标识就无法去重，交由服务器保证 runId 存在） */
  /* 认领一局：返回 { first, reason }
     first=true  → 第一次见到该 runId，调用方应当入账（然后 save）
     first=false → 已入账过，调用方必须跳过入账
     strict=true（正式结算）：缺失/非法 runId 一律拒绝入账（reason='REJECT_NO_RID'），
       不再把"无法识别是否重复"伪装成首次认领（ChatGPT #63 审查意见③）；
       非 strict（兼容旧协议/缺省）沿用旧语义 first:true/NO_RID。 */
  function claim(S, rid, strict) {
    if (!S || typeof S !== 'object') return { first: false, reason: 'NO_STATE' };
    var id = normRid(rid);
    if (!id) {
      if (strict) return { first: false, reason: 'REJECT_NO_RID' };
      return { first: true, reason: 'NO_RID' };
    }
    var a = hist(S);
    if (a.indexOf(id) >= 0) return { first: false, reason: 'DUP' };
    a.push(id);
    // 环形保留：超出 KEEP 丢最旧的（数组即落盘内容，必须就地改）
    if (a.length > KEEP) a.splice(0, a.length - KEEP);
    if (S.multiCreditedRuns !== a) S.multiCreditedRuns = a;
    return { first: true, reason: 'NEW' };
  }

  /* 结算认领决策（ChatGPT #63 收口① · fail-closed）：
     始终走 strict 认领；若 MultiLedger 模块本身未挂载（异常态），直接拒绝入账，
     不再退回会放行非法/缺失 runId 的旧逻辑。返回 claim 结果对象 { first, reason }。
     这样结算判定集中在一处、可被 node --test 直接验证（见 L11）。 */
  function claimSettlement(S, rid) {
    var M = (root && root.MultiLedger) ? root.MultiLedger : null;
    if (M && typeof M.claim === 'function') return M.claim(S, rid, true);
    return { first: false, reason: 'LEDGER_UNAVAILABLE' };
  }

  var api = { KEEP: KEEP, normRid: normRid, hist: hist, seen: seen, claim: claim, claimSettlement: claimSettlement };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MultiLedger = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
