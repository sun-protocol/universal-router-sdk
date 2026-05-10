# universal-router-sdk Examples

本目录包含 SDK 的运行示例与 nile / mainnet 集成测试脚本。

## 目录结构

```
examples/
├── .env.example              示例 env，复制为 .env 并填入 PRIVATE_KEY
├── package.json
├── tsconfig.json             编译输出到 ./dist
└── v4-swap/
    ├── address.ts            nile 上常用代币地址（注意：均为测试网地址）
    ├── helper.ts             tronWebNile / tronWebMainnet 实例 + 网络常量 + ABI 解码工具
    ├── errorSelector.ts      根据 txid 反查 revert 错误
    ├── quote.ts              单笔报价（直连 PoolManager / Quoter）
    ├── swap.ts               单笔 swap，走 router API + Permit2 + UniversalRouter
    ├── swapWithoutApi.ts     单笔 swap，跳过 router API，手动构造路由
    ├── integrateTest.ts      批量集成测试入口，跑完落 testCases.json
    ├── txBatchCheck.ts       读 testCases.json 查询链上交易结果
    └── integrateTestRefactorPlan.md  返佣 / mainnet 改造方案（设计稿）
```

## 准备

### 1. Node 与依赖
- Node ≥ 20（见仓库根 `package.json` engines）
- 在仓库根先 build SDK，再装 examples 依赖：

```bash
# 仓库根
npm install
npm run build          # 生成 dist/，examples 通过 file:.. 依赖它

# 进入 examples
cd examples
npm install
```

### 2. 环境变量
```bash
cp .env.example .env
```
编辑 `.env` 填入测试账户私钥：
```
PRIVATE_KEY=<your-tron-private-key-hex>
```
该私钥同时被 `tronWebNile` 和 `tronWebMainnet` 复用（见 `v4-swap/helper.ts:14/21`）。如需主网/测试网密钥隔离，参考 `integrateTestRefactorPlan.md` P2 项。

### 3. 编译
本目录无 ts-node / tsx，统一编译后运行：
```bash
npx tsc                # 输出到 ./dist
```
后续修改源码后需要重新执行 `npx tsc`。

## 典型测试流程

```
┌────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 编辑用例    │───▶│ integrateTest    │───▶│ testCases.json   │
└────────────┘    │ 发交易+落 txid   │    └──────────────────┘
                  └──────────────────┘             │
                                                   ▼
                                          ┌──────────────────┐
                                          │ txBatchCheck     │
                                          │ 链上结果可视化   │
                                          └──────────────────┘
```

1. **编辑 `v4-swap/integrateTest.ts`** 中的 `testCases`，按需开关 `groupWhiteList` 或对单条用例打 `picked: true`
2. **跑批量测试**：
   ```bash
   node dist/v4-swap/integrateTest.js
   ```
   每条用例会打印形如：
   ```
   ✅ Running TRX->USDT input 0.5% (group: input referral, referral: input/50bps)
   ```
   完成后写出 `dist/v4-swap/testCases.json`（含 `txId` / `error` / `appliedReferral`）
3. **查看链上结果**：
   ```bash
   node dist/v4-swap/txBatchCheck.js
   ```
   按 group + 返佣模式 + 交易状态彩色打印每笔记录。

## 命令清单

| 用途 | 命令 |
|---|---|
| 装依赖 | `npm install`（先在根目录跑过 `npm install && npm run build`） |
| 编译 | `npx tsc` |
| 类型检查（不输出） | `npx tsc --noEmit` |
| 单笔报价（nile，直连合约） | `node dist/v4-swap/quote.js` |
| 单笔 swap（nile，走 router API） | `node dist/v4-swap/swap.js` |
| 单笔 swap（nile，手动构造路由） | `node dist/v4-swap/swapWithoutApi.js` |
| 批量集成测试 | `node dist/v4-swap/integrateTest.js` |
| 批量结果查看 | `node dist/v4-swap/txBatchCheck.js` |

> 当前所有入口默认 `network: 'nile'`。mainnet 支持改造见 `v4-swap/integrateTestRefactorPlan.md`。

## 测试用例管理（integrateTest.ts）

### 用例分组（`groupWhiteList`）
默认全部开启。要只跑某几个 group，把不需要的设为 `false`：
```ts
const groupWhiteList: Record<string, boolean> = {
  [V1_GROUP]: false,
  [V2_GROUP]: false,
  [V3_GROUP]: true,        // 只跑 v3
  [V4_GROUP]: true,        // 和 v4
  // ...
}
```

### 单条用例聚焦（`picked: true`）
任意用例上加 `picked: true`，本次运行只跑被 picked 的（同时仍受 `groupWhiteList` 过滤）：
```ts
{ group: 'v3 swap', name: 'TRX->USDT', picked: true, swapParams: { ... } }
```

### 返佣字段（`SwapParams`）
| 字段 | 含义 |
|---|---|
| `amountInReferralBps` | 输入金额的返佣 bps（上限 85） |
| `amountOutReferralBps` | 输出金额的返佣 bps（上限 85） |
| `referralProjectAddress` | 接收返佣的项目方地址 |
| `noReferral: true` | 显式 opt-out，禁用 `DEFAULT_REFERRAL` 兜底 |

> Router API 约束：`amountInReferralBps` 与 `amountOutReferralBps` **不能同时设置**，否则会被 `/swap/routerUniversal` 直接拒掉（报错 `amountInReferralBips and amountOutReferralBips cannot both be set`）。本仓库 SDK 内部的 `computeAppliedReferral` 即便允许 in 优先于 out，也只是直接构造 `TradePlanner` 时的客户端兜底语义，不要依赖它过 router API。

### 负向用例（`expectError`）
对预期失败的用例（比如上面这条 router API 约束），在 `TestCase` 上加 `expectError`，runner 会把"匹配的 throw"识别为通过：

```ts
{
  group: 'referral edge case',
  name: 'router rejects both in & out bps (negative)',
  swapParams: { /* both bps set */ },
  expectError: 'amountInReferralBips and amountOutReferralBips cannot both be set',
}
```

匹配规则：抛出的 `Error.message` **包含** `expectError` 子串即视为通过。结果分三档：

| 实际行为 | runner 处理 | `txBatchCheck` 显示 |
|---|---|---|
| 匹配的 error 抛出 | `expectedErrorMet=true`，无 txId | 绿色 `✓ EXPECTED_ERROR` |
| 错的 error 抛出 | `error` 字段照常存 | 红色 `❌ <message>` |
| 没抛出（swap 成功了） | 合成一条 `error`（"expected error not raised"） | 红色 `❌ ...` |

### `DEFAULT_REFERRAL` 兜底
当一个用例**完全没有指定**任何返佣字段（也没有 `noReferral: true`），自动套用：
```ts
const DEFAULT_REFERRAL = {
  amountInReferralBps: 50,
  amountOutReferralBps: 0,
  referralProjectAddress: 'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6',
}
```
这让原有 V1 / V2 / V3 / V4 / stable / PSM / HTX_SUN / mixed 用例无需逐个改造，仍保留默认 input 返佣行为。

### 实际生效的返佣
跑完后 `testCases.json` 每条会带：
```json
{
  "appliedReferral": {
    "mode": "input" | "output" | "none",
    "bps": 50,
    "projectAddress": "..."
  }
}
```
`txBatchCheck` 会用 `[ref: input/50bps]` 这样的标签把它呈现出来，便于事后核对每笔交易实际的返佣模式。

## 常见问题

- **`Cannot find module '@sun-protocol/universal-router-sdk'`**：仓库根没 build。回到根目录跑 `npm run build`。
- **`testCases.json not found`（运行 `txBatchCheck`）**：先跑 `integrateTest`，结果会输出到 `dist/v4-swap/testCases.json`。
- **某条用例发交易失败**：用 `picked: true` 锁定它单独跑，再用 `errorSelector.ts` 反查 revert 原因（`txBatchCheck` 已自动调用）。
