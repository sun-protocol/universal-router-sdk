# integrateTest.ts 改动方案

针对 `examples/v4-swap/integrateTest.ts` 及其依赖（`swap.ts`、`helper.ts`、`address.ts`）的两项改造：

1. **补全返佣（referral）维度的测试覆盖**
2. **支持 mainnet 网络运行**

---

## 一、返佣测试覆盖

### 现状
- `testCases` 中所有用例均无返佣维度配置。
- `integrateTest.ts:702-704 / 732-734` 在调用 `executeSwap` 时硬编码 `amountInReferralBps: 100, amountOutReferralBps: 0, referralProjectAddress: 'TUJ1C4ybd...'`。
- 结合 `swap.ts:171-180` 的分支，**所有用例实际只跑 input 模式 1% 返佣这一种路径**。
- 缺失：无返佣 / output 模式 / 边界值 / native TRX 返佣 / 不同 projectAddress / 与 permit2 组合。

### 改动清单

#### 1. 扩展 `TestCase.SwapParams` 接口（`integrateTest.ts:30-37`）
新增三个可选字段：

```ts
interface SwapParams {
  fromToken: string
  toToken: string
  amountIn: string
  targetPoolVersion?: PoolVersion
  typeList?: string
  maxCost?: number
  // 新增
  amountInReferralBps?: number
  amountOutReferralBps?: number
  referralProjectAddress?: string
}
```

#### 2. 改造执行循环（`integrateTest.ts:695-714 / 725-744`）
把硬编码改成从 `testCase.swapParams` 透传，未配置则不传：

```ts
const sp = testCase.swapParams
const result = await executeSwap({
  tokenIn: sp.fromToken,
  tokenOut: sp.toToken,
  amountIn: sp.amountIn,
  network,                              // 见下文 mainnet 改造
  slippageBips: 50,
  amountInReferralBps: sp.amountInReferralBps,
  amountOutReferralBps: sp.amountOutReferralBps,
  referralProjectAddress: sp.referralProjectAddress,
  typeList: sp.typeList,
  maxCost: sp.maxCost,
} as ExecuteSwapParams)
```

两处循环合并为一个函数 `runOne(testCase)` 复用，减少重复。

#### 3. 新增 group 与白名单条目
```ts
const NO_REFERRAL_GROUP = 'no referral'
const INPUT_REFERRAL_GROUP = 'input referral'
const OUTPUT_REFERRAL_GROUP = 'output referral'
const REFERRAL_EDGE_GROUP = 'referral edge case'
```
全部加入 `groupWhiteList`，默认 true。

#### 4. 新增测试用例（建议 6–10 条，挑主流对子即可）

| group | 描述 | 输入 token | 输出 token | referral 配置 |
|---|---|---|---|---|
| no referral | ERC20→ERC20 不带返佣 | USDT | TRX | 不传任何 referral |
| no referral | TRX→ERC20 不带返佣 | TRX | USDT | 不传任何 referral |
| input referral | input 模式标准 1% | USDT | TRX | inBps=100, project=主项目 |
| input referral | input 模式 native 输入 | TRX | USDT | inBps=100, project=主项目 |
| output referral | output 模式 1% | USDT | TRX | outBps=100, project=主项目 |
| output referral | output 模式 native 输出 | USDT | TRX | outBps=100, project=主项目 |
| referral edge | bps=0（应当被忽略，等价无返佣） | USDT | TRX | inBps=0, project=主项目 |
| referral edge | 仅传 bps 不传 project（应忽略 referral） | USDT | TRX | inBps=100, project=undefined |
| referral edge | in 与 out 都传（验证 SDK 优先级） | USDT | TRX | inBps=50, outBps=50, project=主项目 |

#### 5. 落盘结果增加 referral 字段
`testCase` 在执行后追加：
```ts
testCase.appliedReferral = {
  mode: 'input' | 'output' | 'none',
  bps: number,
  projectAddress?: string,
}
```
便于 `testCases.json` 事后核对实际生效的 referral 模式（避免"传了但被 SDK 忽略"被静默吞掉）。

#### 6.（可选）链上断言
在 `swap.ts` 返回 `SwapResult` 时附带 `projectAddress` 在 in/out token 的 pre/post 余额；`integrateTest.ts` 校验差额 ≈ `amountIn * inBps / 10000` 或 `amountOut * outBps / 10000`。
此项工作量较大，建议放在二期。

---

## 二、Mainnet 支持

### 现状
`executeSwap` 表面接受 `network: 'mainnet'`（`swap.ts:109`），但有多处硬编码 nile，直接传会把交易广播到错误的链。

### 改动清单（按优先级）

#### P0 — 阻塞项（不改无法运行）

##### 1. `swap.ts:13` 全局 tronWeb 硬编码
```ts
const tronWeb = tronWebNile  // ← 问题
```
**改造**：删除模块级常量，在 `executeSwap` 内部根据 `network` 选择：
```ts
const tronWeb = network === 'mainnet' ? tronWebMainnet : tronWebNile
```
**注意**：`approveToPermit2`（`swap.ts:246-277`）也使用了模块级 `tronWeb`，需把它改成接收 `tronWeb` 参数，或同样在内部按 network 选择。调用点（`swap.ts:147`）相应传入。

##### 2. `integrateTest.ts:700 / 730` `network: 'nile'` 硬编码
**改造**：
```ts
const network = (process.env.NETWORK as 'mainnet' | 'nile') || 'nile'
// 主网启动前加一次显式确认
if (network === 'mainnet' && process.env.MAINNET_CONFIRM !== 'yes') {
  throw new Error('Refusing to run on mainnet without MAINNET_CONFIRM=yes')
}
```
默认仍为 nile，避免误操作。

##### 3. `address.ts` 全是 nile 地址
**改造**：
- 拆成 `address.nile.ts` + `address.mainnet.ts`
- 导出统一函数：
  ```ts
  // address.ts
  export function getAddresses(network: 'mainnet' | 'nile') {
    return network === 'mainnet' ? mainnetAddresses : nileAddresses
  }
  ```
- `integrateTest.ts` 顶部改为按 network 解构：
  ```ts
  const { TRX_ADDRESS, USDT_ADDRESS, ... } = getAddresses(network)
  ```
  → 注意：因为 `testCases` 数组在闭包中引用这些常量，需要把 `testCases` 的构造也移到 `integrateTest()` 函数体内（已经在内部，OK）。

#### P1 — 数据 / 业务校验

##### 4. 主网代币与 pool 可用性
以下符号在主网可能不存在或合约不同，需逐一核实，**主网用例需精简**：
- `USDDOLD_ADDRESS` —— 旧 USDD，主网有但合约不同
- `USDTNEW_ADDRESS` —— 看名字是 nile 专用
- `USDD2_ADDRESS` —— 同上
- `THTX_ADDRESS` / `TSUN_ADDRESS` —— 前缀疑似测试代币
- pool 版本 `CURVE_OLDUSDCPOOL` / `CURVE_USDC2POOLTUSDUSDT` / `CURVE_USDD2POOLTUSDUSDT` / `CURVE_USDJ2POOLTUSDUSDT` —— 主网是否部署需确认

**改造**：在 `TestCase` 上加 `networks?: ('mainnet'|'nile')[]` 字段，默认两网都跑；不在主网部署的用例标 `networks: ['nile']` 过滤掉。

##### 5. `referralProjectAddress` 替换
当前硬编码 `'TUJ1C4ybdcueXbi8Wmrqscteux5eGvrCh6'` 是测试地址。
**改造**：在 `getAddresses(network)` 中追加 `referralProject` 字段，主网用正式地址。或直接通过环境变量 `REFERRAL_PROJECT_ADDRESS_${NETWORK}` 注入。

#### P2 — 安全 / 操作

##### 6. 金额下调
当前 `amountSampleDecimals18 = 1e18`、`amountSampleDecimals6 = 1e6`。主网意味着每条用例 1 USDT 或 1 USDD 真金白银，50+ 用例 = 数十 USDT + 多次手续费。
**改造**：`integrateTest()` 顶部按 network 区分：
```ts
const isMainnet = network === 'mainnet'
const amountSampleDecimals6 = (isMainnet ? 1e3 : 1e6).toString()
const amountSampleDecimals18 = (isMainnet ? 1e15 : 1e18).toString()
// ...
```
并提供 `--dry-run` 模式（只调 `quote.ts`，不调 `executeSwap`）做更便宜的 smoke。

##### 7. 私钥隔离
`helper.ts:14/21` 两个 tronWeb 共用 `process.env.PRIVATE_KEY`，存在测试网/主网密钥混用风险。
**改造**：
```ts
export const tronWebNile = new TronWeb(..., process.env.PRIVATE_KEY_NILE ?? process.env.PRIVATE_KEY ?? '')
export const tronWebMainnet = new TronWeb(..., process.env.PRIVATE_KEY_MAINNET ?? '')
```
主网必须显式提供 `PRIVATE_KEY_MAINNET`，不回退到通用变量。

##### 8. 输出文件按网络命名
`integrateTest.ts:750`：
```ts
const testCasesFilePath = path.join(__dirname, `testCases.${network}.json`)
```

#### P3 — 兜底参数

##### 9. `slippageBips: 50`（0.5%）
主网部分低流动性对可能撞不进去 → 在 `TestCase.SwapParams` 加 `slippageBips?: number` 允许 per-case 覆盖。

##### 10. `maxCost`
现有 stable 用例多设 `maxCost: 1`，主网某些路由需要 ≥3 才能成交。验证后 per-case 调整。

##### 11. `groupWhiteList` 主网首跑建议
首跑只开 `V2 / V3 / V4`，验证通过后逐步开 stable / PSM / HTX_SUN。
**改造**：让白名单可被环境变量覆盖：
```ts
const groupOverride = process.env.GROUPS?.split(',')
if (groupOverride) {
  Object.keys(groupWhiteList).forEach(k => groupWhiteList[k] = groupOverride.includes(k))
}
```

---

## 三、改动文件汇总

| 文件 | 改动内容 |
|---|---|
| `examples/v4-swap/integrateTest.ts` | SwapParams 加 referral/networks/slippageBips；执行循环重构为 runOne；新增返佣用例与 group；网络参数化；金额按网络缩放；输出按网络命名 |
| `examples/v4-swap/swap.ts` | 删除模块级 tronWeb；executeSwap 与 approveToPermit2 内部按 network 选择 tronWeb |
| `examples/v4-swap/helper.ts` | 私钥环境变量拆分（PRIVATE_KEY_MAINNET / PRIVATE_KEY_NILE） |
| `examples/v4-swap/address.ts` | 拆分为 address.nile.ts + address.mainnet.ts，导出 getAddresses(network) |

---

## 四、建议的实施顺序

1. **第一步（独立 PR）**：mainnet P0 改造 —— 仅修通运行通路，不加新用例。
   - swap.ts tronWeb 选择
   - integrateTest.ts network 参数化与 MAINNET_CONFIRM 闸门
   - address.ts 拆分
   - 验证：在 nile 上跑现有用例不应出现回归

2. **第二步**：返佣测试覆盖 —— 在 nile 上扩展用例并验证通过。

3. **第三步**：mainnet P1/P2 —— 主网用例过滤、金额缩放、私钥隔离、输出隔离。

4. **第四步（可选）**：链上 referral 余额断言、dry-run 模式。
