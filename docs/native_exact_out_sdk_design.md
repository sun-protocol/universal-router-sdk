# 协议原生 Exact-Out SDK 设计方案

日期：2026-09-09  
状态：待实施；本文描述目标设计，不代表临时草稿已完成或验证通过。

## 1. 目标与边界

在不修改 Router 合约、不改变现有 Exact-In 调用及编码行为的前提下，为 SDK 增加协议原生 Exact-Out。复用当前解析、执行计划、协议编码和支付工具，以交易类型区分金额约束与命令，避免维护两套完整 Planner。

主要参考 PancakeSwap Universal Router SDK 与 Infinity SDK。实现依据优先级为：本地合约能力与现有 Exact-In 兼容要求 → PancakeSwap 对应实现 → Uniswap 补充对照。存在差异时明确记录本地适配，不为了接近上游而重写原有 Exact-In。

成功交易须满足：用户总输入不超过报价最大输入；按下述兼容语义检查净输出下限；本次未使用的预付款显式退回；分佣按报价费率及下述余额语义执行。原生币手续费不计入兑换输入。涉及同币循环时，输出、退款和钱包净变化必须分别核对，不能把退款算作兑换输出。

历史余额指交易开始前 Router 已持有的余额，包括外部直接转入的资产。本次沿用 Exact-In 的余额语义：SWEEP 按 Router 当前余额检查并分发，PAY_REFERRAL 按当前余额计算分佣，不隔离历史余额。因此，历史余额可能补足本次兑换的输出缺口，也可能进入分佣基数；不保证分发及分佣仅来自本次兑换。这是已知兼容限制，不作为本次 Exact-Out 的独立准入阻塞项，也不新增历史资产清扫流程。本次产生的滑点预留和退款不能补足兑换输出检查或进入输出分佣基数。输入分佣按币种区分：ERC20 排除滑点预留，原生 TRX 按最大预算计算，见第 7.2 节。

本次新增 SDK 能力，并同步 QS 的 Exact-Out 原生 TRX 输入分佣与金额语义；不改 Exact-In 行为或 Router 合约。单条完整原生路径为首要范围，不将多个报价候选拼成拆单，也不通过多段 Exact-In 模拟 Exact-Out。

### 代码基线

| 项目 | 基线 |
| --- | --- |
| 实际 SDK 仓库 | `sun-protocol/universal-router-sdk`，`feature/native-exact-out` |
| SDK commit | `ed48e13d793d19374a358101f162e53b6cec391a` |
| quote_service commit | `2a2d6b106a1cec5816deec847596725f4b283298` |
| 本地 Router commit | `fbd1a93964d159b8c39450652c2285b4dbffc1c1` |
| 主要参考：Pancake Router SDK | 官方 npm 发布包 `@pancakeswap/universal-router-sdk@1.5.3` |
| 主要参考：Pancake Infinity SDK | 官方 npm 发布包 `@pancakeswap/infinity-sdk@1.0.9` |
| 补充参考：Uniswap | 2026-09-09 查阅的 `Uniswap/sdks` main；链接可能随后更新 |

实际 SDK 当前未应用临时目录中的实现。后续按本文重新整理，不能直接复制草稿作为完成结果。

## 2. PancakeSwap 参考与本地适配

### 2.1 当前 SDK 的参考来源

当前 SDK 的 package.json 直接依赖 `@pancakeswap/swap-sdk-core`；`src/packages/v4/types.ts` 保留 Infinity 类型及 Pancake PoolKey 源码链接。与上述发布包对照，RoutePlanner 的命令追加、回滚标记、size 方法，以及 ActionsPlanner 的编解码、finalizeSwap 等实现基本一致。这是参考 Pancake 的直接代码证据。

本地 TradePlanner 也采用继承 RoutePlanner、分段执行和协议方法编排，但增加了报价 API、TRON 地址、V1、PSM、分佣等适配。Git 历史首批引入这些文件的提交为 `9d23de6`，没有足够证据确认整库直接 fork 自 Pancake 的哪个提交；本次锁定发布包作设计参考，不宣称它就是最初复制版本。

### 2.2 共享 Planner 与 Exact-Out

Pancake 的 `TradePlanner.addSwapCommand` 在同一流程中按 tradeType 选择 V2、V3、StableSwap 命令；Infinity 单跳、多跳同样在共用方法中选择 Exact-In 或 Exact-Out action。V3 的路径编码携带 exactOutput 标记。其 `parseSwapTradeContext` 负责路径分段和付款来源，`returnChanges` 负责剩余包装币转换。[Router SDK 1.5.3 官方发布包](https://www.npmjs.com/package/@pancakeswap/universal-router-sdk/v/1.5.3)

本地沿用相同职责划分，在现有协议编码方法内增加分支；不导入整套 SmartRouterTrade，不新增另一套完整 TradePlanner。Pancake 支持的 StableSwap、Infinity Bin 不自动成为本地支持范围；本地 V1、PSM 仍以实际合约为准。

### 2.3 Infinity 的付款与退款

对于独立 Infinity 路径，所查版本的 initializeInfinitySwap / finalizeInfinitySwap 按付款来源编排：

| 付款来源 | 顺序 |
| --- | --- |
| Router 付款 | SETTLE 最大输入预算 → Exact-Out 交换 → TAKE 输出 → TAKE 剩余输入 |
| 用户付款 | Exact-Out 交换 → SETTLE 最大输入预算 → TAKE 输出 → TAKE 剩余输入 |

这里 SETTLE 传入预算金额，不是统一按实际欠款结算；TAKE 使用 OPEN_DELTA。金额差额通过剩余输入提取回收。上游还有相邻 Infinity 段合并逻辑，表格仅描述本地当前单一原生交换域对应的情况。[发布包 TradePlanner 实现](https://unpkg.com/@pancakeswap/universal-router-sdk@1.5.3/dist/index.js)

以上仅记录 Pancake 参考实现。本地 V4 Exact-In 已有先 SETTLE、再交换、最后 TAKE 的方式，保持不变；Exact-Out 改用第 5.3 节的交换后实际欠款结算。本地已支持 SETTLE_ALL 和 SETTLE(OPEN_DELTA)，无需把最大预算先结算到 Vault 再退差额。

### 2.4 本地合约差异

ActionsPlanner 是动作编码器，不意味着它定义的所有动作均能由本地 Router 执行。[Infinity SDK 1.0.9 官方发布包](https://www.npmjs.com/package/@pancakeswap/infinity-sdk/v/1.0.9)

以下差异以本地代码为准：

| 本地事实 | 设计影响 |
| --- | --- |
| SDK 定义 TRANSFER，但 Dispatcher 没有对应执行分支 | 新增流程不发送 TRANSFER |
| V4 TAKE 的 recipient 仅接受 MSG_SENDER、ADDRESS_THIS | 需要任意收款地址时先 TAKE 到 Router，再由外层 SWEEP 分发 |
| 本地 V4 TAKE_ALL 参数是 currency、recipient、minAmount | 不照搬 Pancake ActionsPlanner.finalizeSwap 中的双参数 TAKE_ALL；本次直接编排 TAKE，不顺带修改 Exact-In ABI |
| 本地 V4_SWAP 的单条命令 input 为 abi.encode(bytes actions, bytes[] params)，与 Pancake 对应布局一致 | 复用现有 createCommand 的双参数编码，不额外包一层 abi.encode(bytes)；动作编号和内部结构仍以本地合约为准 |
| PAY_REFERRAL 按 Router 当前整笔代币余额计算，并记账到 ReferralVault | 不能替换成普通转账；ERC20 输入分佣隔离滑点预留，TRX 输入分佣按最大预算计算，输出分佣隔离退款 |
| Router 执行结束将收集到的剩余代币转入 safeVault | 本次用户退款必须在结束清扫前完成，不依赖 safeVault 退款 |
| V1/V2 Exact-Out 内部反算后正向交换，可能有输出余量 | 成功条件是净输出至少达到目标，余量归 recipient |

本地证据：Router 的 `contracts/base/Dispatcher.sol`、`contracts/modules/Payments.sol`、`contracts/UniversalRouter.sol`、`contracts/modules/sunswap/`，以及其 `lib/sunswap-v4-periphery/contracts/V4Router.sol`。

V4 编码链路已按源码核对：SDK 的 `src/core/createCommand.ts` 定义 `bytes actions, bytes[] params`；Dispatcher 将该命令的 input 直接传给 `_executeActions`；`BaseActionsRouter._lockAcquired` 按 `(bytes, bytes[])` 解码。外层 execute 的 inputs 本身是 bytes[]，不代表每条 V4 input 内部还要编码成单一 bytes 参数。

### 2.5 Uniswap 的补充用途

Uniswap 用于对照原生币预算、退款和不足额输出保护。其 V4 常规编码采用交换后 SETTLE 实际 delta、再 TAKE 指定输出量，不能与 Pancake 的预算结算流程混为一谈；如需采用其中的检查方法，必须说明本地原因并通过合约测试。[UniswapTrade](https://github.com/Uniswap/sdks/blob/main/sdks/universal-router-sdk/src/entities/actions/uniswap.ts)、[V4Planner](https://github.com/Uniswap/sdks/blob/main/sdks/v4-sdk/src/utils/v4Planner.ts)、[SwapRouter](https://github.com/Uniswap/sdks/blob/main/sdks/universal-router-sdk/src/swapRouter.ts)

## 3. API 与金额模型

### 3.1 向后兼容

- 缺省 tradeType 等价于 EXACT_IN；已有 parseRouteAPIResponse、TradePlanner 构造和 encode 调用保持有效。
- 只有显式 EXACT_OUT 才进入新增校验与编码。未知交易类型报错，不回退到 Exact-In。
- Exact-In 的参数、滑点覆盖、拆单、分佣和命令序列保持原样。
- Exact-Out 使用服务端已计算的最大输入；若调用方同时传入现有滑点覆盖选项，明确报错，防止重复应用滑点。
- 不新增独立 payer、refundRecipient、必填 safeVault 配置。输出和退款统一使用现有 recipient，缺省 MSG_SENDER。指定第三方 recipient 即表示它同时接收退款，须在使用说明中明确。

### 3.2 报价字段

| JSON 字段 | Exact-Out 含义 |
| --- | --- |
| tradeType | EXACT_OUT |
| amountInRaw | 预计总输入 T = 预计路由输入 R + 本次输入分佣 F；两种输入币种统一此含义 |
| amountInMaximumRaw | 最大总输入 Tmax |
| amountOutRaw | 用户净输出目标 N |
| amountInRawReferral | QS 计算的本次输入分佣 F；ERC20 基于预计总输入，TRX 基于最大总输入；字段顺序是 RawReferral |
| amountOutRawReferral | 报价毛输出对应的输出分佣 |
| amountInReferralBips / amountOutReferralBips | 对应费率，当前不同时启用 |
| stepAmountsInRaw / stepAmountsOutRaw | 按 tokens 正向顺序排列的逐跳预计输入及输出目标 |
| stepExecutionModes | 各跳执行方式，用于验证支持范围 |
| poolVersions / poolKeys / poolFees | 协议与池信息；V4 编码以 poolKey 为准 |

外部字段以 `quote_service/graph/quote.go` 当前结构为准，不沿用临时草稿中可能拼错的字段名。格式化金额只用于展示，运算和编码一律使用 raw 字符串转 bigint。

内部为 SwapTradeRoute 和 SwapExecutionPlan 增加可选交易类型及 Exact-Out 金额详情；详情集中保存 maximumAmountIn、目标输出、毛输出、分佣及逐跳数据。旧的 amountIn、minimumAmountOut 保持原语义；Exact-Out 编码明确读取目标输出与最大输入，不能把 amountIn 当作固定扣款。

推荐保持原接口形状，通过运行时校验保证 EXACT_OUT 必须携带完整详情；不要为了类型重构破坏已有调用者的 interface 扩展或对象构造。

### 3.3 数值关系

设预计路由输入 R，输入分佣 F，总预计输入 T，总预算 Tmax，末跳毛目标 G，净目标 N。QS 先计算完整滑点预算 B，再按输入币种计算总额：

```text
B = R + floor(R × slippageBips / 10000)
grossForNet(n, f) = floor((n - 1) × 10000 / (10000 - f)) + 1
ERC20：T = grossForNet(R, f)，F = floor(T × f / 10000)，Tmax = B + F
TRX：  Tmax = grossForNet(B, f)，F = floor(Tmax × f / 10000)，T = R + F
两者统一：amountInRaw = T，amountInRawReferral = F，amountInMaximumRaw = Tmax
可用路由预算 Rmax = Tmax - F = B
G - floor(G × outputBips / 10000) >= N
```

amountInRaw 统一表示预计路由输入加本次输入分佣，不包含未使用的滑点预留。原生 TRX 分佣按最大预付款确定，所以分佣和预计总输入可能随请求滑点变化；ERC20（包括 WTRX）保持现有计算。

SDK 直接使用 QS 返回的 Tmax、F、T 和 G，仅做字段与预算一致性校验，不维护 TRX 的另一套报价修正逻辑，不重算执行分佣或缩减承诺的滑点预算。无历史余额时执行分佣就是 F，不再另设与 QS 不同的 F。QS 输出组装必须同时使用已计算的 F 填充 raw 和展示字段，避免共用 Exact-In 格式化逻辑按 T 再算一次。输出分佣若基于实际产出计算，可能随协议余量增大；最终仍须保证净输出下限。

校验非负整数、正目标、数组长度、相邻币种、金额连续性、预算关系及实际 ABI 边界：Permit2 和本地 SWEEP 的 uint160、V4 的 uint128/有符号转换、V3 的有符号金额等。所有检查发生在公开命令状态被修改之前。

## 4. 路径与协议编码

沿用 buildExecutionFromRoute 的分段能力，在 Exact-Out 分支验证整个路径只有一个可执行原生交换域；入口 WRAP、出口 UNWRAP 为边界转换，不算协议混合。

| 路径 | 编码方案 |
| --- | --- |
| V1 多跳 | 一个 V1_SWAP_EXACT_OUT，保留完整路径中的 TRX 中间节点 |
| V2 多跳 | 一个 V2_SWAP_EXACT_OUT，完整正向地址数组 |
| V3 多跳 | 一个 V3_SWAP_EXACT_OUT，代币和费率整体反向编码 |
| V4 单跳/多跳 | 一个 V4_SWAP，内部选择原生 Exact-Out action，按本地合约定义编码路径 |
| PSM | 当前服务端允许的单池、币对、方向、flag 及粒度，通过 PSM 原生命令执行 |
| 不同协议混合、拆单、未支持协议 | 编码前报错，不能改成顺序 Exact-In |

V4 沿用 Exact-In 的固定 Manager 部署约定：SDK 不传入或独立校验 Manager，所有 V4 跳由目标 Router 部署时设置的 clPoolManager 执行。调用方使用与报价服务匹配的 Router 部署，不新增 Manager 字段或校验流程。

多跳金额由协议合约反算，不能把报价逐跳输入当成链上固定支付数额。V4 poolKey 的 parameters、hooks、fee 使用完整原始值，不用展示 poolFees 覆盖动态费配置。当前报价没有任意 hookData 时仅编码约定的空 bytes，不虚构 Hook 参数支持。

池标识、地址比较须规范化大小写与 TRON 地址表示。拒绝重复池等服务端不支持的结构；不能仅因首尾同币就整体拒绝所有循环。

## 5. 普通路径的资金流程

本节的普通路径指交换域输入、输出为不同币种，且退款转换不会与输出余额混合；循环和币种别名碰撞见第 6 节。

### 5.1 ERC20 输入、无输入分佣

V1/V2/V3/PSM 尽量沿用用户付款模式，由合约按实际所需输入扣款，命令中传入最大路由输入 Rmax。没有预扣的滑点预留，就没有这部分 Router 退款。

输出沿用现有 SDK 先到 Router、最后分发的方式。需要出口 UNWRAP 时先完成转换；需要输出分佣时按第 7 节处理；最后 SWEEP(output, recipient, N)。V1/V2 的多余输出一并交付。

### 5.2 原生 TRX 输入

交易 callValue 为 Tmax。有输入分佣时先按第 7.2 节对 TRX 最大预算收取分佣，再处理入口包装。入口需要 WTRX 时包装路由预算 Rmax；协议从 Router 支付实际所需输入。普通路径完成输出后，将剩余 WTRX 解包并退给 recipient；无需包装的原生输入用 SWEEP(TRX, recipient, 0) 退款。

退款以原始输入币种交付。若包装币同时也是输出币，不能直接先 sweep 全余额，该组合转入第 6 节处理。

### 5.3 V4 普通路径

交换后按实际欠款结算。设实际路由消耗为 A，最大路由输入为 Rmax。此处仅适用于不同输入、输出币种，且余额来源可区分的普通路径。

Router 付款，例如 TRX 输入、入口包装或输入分佣后已在 Router 持有预算：

```text
SWAP_EXACT_OUT(amountOut = G, amountInMaximum = Rmax)
SETTLE(inputCurrency, OPEN_DELTA, false)
TAKE(outputCurrency, ADDRESS_THIS, OPEN_DELTA)
```

用户通过 Permit2 付款：

```text
SWAP_EXACT_OUT(amountOut = G, amountInMaximum = Rmax)
SETTLE_ALL(inputCurrency, Rmax)
TAKE(outputCurrency, ADDRESS_THIS, OPEN_DELTA)
```

两者均以本地单一 V4_SWAP 命令封装，再由外层完成输出转换、PAY_REFERRAL（如有）和 SWEEP(output, recipient, N)。SETTLE_ALL 读取实际欠款、检查不超过 Rmax，再从用户拉取；Router 付款的 SETTLE(OPEN_DELTA, false) 读取实际欠款，从 Router 余额支付，输入上限由交换 action 检查。本地 TAKE 到 ADDRESS_THIS，由外层处理任意 recipient。

普通用户付款分支只拉取实际欠款 A，没有预扣的输入差额，也不需要第二次 TAKE。授权和余额覆盖 Rmax 可允许整个预算范围内的执行，但实际扣款为 A。Router 付款分支的未使用预算 Rmax - A 留在 Router，由外层转换回原始输入币种并 SWEEP(input, recipient, 0)，不能遗漏退款。实际欠款结算不改变 TRX 随 callValue 预付预算或 ERC20 输入分佣预拉款的方式。Exact-In 的原有 SETTLE 顺序不变。

本地 `CLRouterBase._swapExactOutputSingle` 和 `_swapExactOutput` 检查实际输入不超过 amountInMaximum，但没有在这两个方法中独立校验实际输出已达到目标。OPEN_DELTA 只表示提取可用余额，也不提供足额输出保证。

因此，普通路径必须在输出转换和分佣后，以外层 SWEEP(output, recipient, N) 检查净输出下限；不能认为 Exact-Out action 成功就等于足额成交。在没有历史余额且检查余额仅来自本次兑换输出时，这能使不足额交易整体回滚。历史余额可能掩盖缺口，按第 1 节作为沿用 Exact-In 的已知限制记录，不为此强制增加 Vault credit 下限检查或拒绝普通路径。本次同币退款掩盖输出缺口则不属于兼容例外，须按第 6 节验证，未解决的组合不能开放。若需增加指定金额 TAKE 等保护，仅对本次退款隔离等有证据的 Exact-Out 场景做局部适配，不预先统一改换结算架构。Hook 额外 delta、费用及输出余量也须通过本地执行测试确认。

### 5.4 callValue 与授权

给 TradePlanner 增加可读取的 bigint callValue，保留 encode(): void 和现有 commands/inputs 访问方式。Exact-Out 原生输入为 Tmax，ERC20 输入为 0；Exact-In 的原有调用无需接入新属性。

沿用现有调用方式：每笔交易新建 TradePlanner，并只调用一次 encode()；修改报价或重新编码时新建实例。现有 encode() 会追加命令，本次不改成幂等调用，也不新增重复调用保护。本文的单笔最大输入和 callValue 约定适用于上述一次编码的结果，不覆盖重复追加或调用方自行拼接的多笔命令。

提供 Exact-Out 示例：解析一条报价、指定 recipient、准备覆盖预算的 Permit2 授权、编码并把 callValue 传给交易调用。不把 bigint 无检查地转换成 JavaScript Number；按交易库实际可接受类型处理，必要时对安全整数范围显式校验。

## 6. 同币循环与余额碰撞

这是本地服务已支持的路径类型，需要验证后覆盖，不能把 Pancake 的普通路径编排当作同币循环已获支持的证据。

以 A → B → A 为例，预付 110 A、实际消耗 100 A、兑换产出 105 A。Router 最后可能有 115 A，其中输出为 105 A、退款为 10 A。若目标是 108 A，直接 SWEEP(min=108) 会掩盖输出不足。测试必须能识别这个反例。

处理顺序：

1. 用户实际扣款、没有 Router 输入预付款的 V1/V2/V3/PSM 路径，优先验证 Router 只收到兑换产出的普通收尾是否成立。
2. 有预付款但协议支持直接交付输出的路径，评估仅对 Exact-Out 将交换 recipient 设为最终收款人，再独立退回输入余额；必须同时证明协议自身足额输出约束，不靠包含退款的 SWEEP 检查。
3. V4 同币循环只有一个币种的净 delta，不能直接套用第 5.3 节：净 delta 可能是 credit，SETTLE_ALL / SETTLE(OPEN_DELTA) 读取 debt 会回滚；即使是 debt，也只代表输入与输出抵消后的净额。须单独证明输入、兑换输出及退款的语义，不能把净额结算当作已支持完整 Exact-Out，也不能靠指定 TAKE 金额证明输出足额。未验证的组合明确拒绝。
4. TRX/WTRX 边界转换产生的余额碰撞按同样规则处理，不能只比较用户首尾地址。

在候选流程经过合约级测试前，对无法证明的具体组合返回明确“不支持该 Exact-Out 结算组合”。这是开发验证门槛，不是已经证明合约无法支持，也不是永久删去全部同币路径。最终文档需列出实际通过的组合及剩余限制。

## 7. 分佣

### 7.1 输出分佣

普通不同币种路径先获得毛输出，再 PAY_REFERRAL，最后 SWEEP 净目标 N。保留现有项目地址、费率参数与 ReferralVault 记账语义，校验请求费率与报价一致。

历史输出余额可能进入 PAY_REFERRAL 的分佣基数，沿用第 1 节的兼容限制；不因此单独禁止输出分佣。没有历史余额时，分佣基数应仅为本次毛输出。

同币路径的未使用输入不能进入输出分佣基数。需要把输出、退款先分离；无法分离的组合不允许按整个混合余额扣费后声称正确。V1/V2 有余量时验证实际分佣和最终净输出，而不是要求分佣总与报价值完全相同。

### 7.2 输入分佣

ERC20 输入沿用固定报价分佣 F，滑点预留不参与分佣。不同币种且分佣前无其他余额时，流程为：

```text
拉入预计总输入 T
PAY_REFERRAL(input, project, inputBips)  // 此时基数应为 T
拉入剩余预算 Tmax - T
执行 Exact-Out，最大路由输入为 Tmax - F
退回未使用输入
```

原生 TRX 输入按最大预算计算输入分佣，不再临时包装滑点预留来隔离基数。无历史余额时流程为：

```text
callValue = Tmax
PAY_REFERRAL(TRX, project, inputBips)  // 基数为 Tmax，分佣为 F
按路径需要包装剩余路由预算 Rmax = Tmax - F
执行 Exact-Out，amountInMaximum = Rmax
退回未使用输入，退款币种为 TRX
```

QS 按第 3.3 节返回足以覆盖完整路由滑点预算与分佣的 Tmax。SDK 直接使用该预算及 F，示例与展示金额均来自 QS，不再临时修正 TRX 报价。

PAY_REFERRAL 使用整个 Router 余额，历史输入余额也会影响分佣基数。因此，执行分佣 F 的精确匹配以没有历史输入余额为前提；存在历史余额时沿用第 1 节的兼容限制，不以历史余额隔离作为准入阻塞项。用户总输入上限仍须遵守。本文不新增必填 safeVault 或自动清扫历史资产。ERC20 输入分佣的滑点预留隔离及所有预付款的退款仍须验证；Exact-In 原有分佣逻辑保持不动。

## 8. 文件改动计划

| 文件 | 改动职责 |
| --- | --- |
| src/types/routeAPI.ts | 增加真实响应字段与交易类型；兼容 Exact-In 旧字段要求 |
| src/types/route.ts | 增加 Exact-Out 金额详情，并传递到执行计划 |
| src/core/parseRouteAPIResponse.ts | 按交易类型解析，Exact-Out 校验字段、金额、路径和滑点选项 |
| src/core/buildExecutionFromRoute.ts | 复用分段；Exact-Out 原生域、拆单限制检查 |
| src/core/TradePlanner.ts | 复用现有方法职责，补齐 Exact-Out、V4 交换后实际欠款结算、Router 预付款退款和 TRX 最大预算分佣；保持 Exact-In 行为 |
| src/core/encodePath.ts | V3 增加 exactOutput 参数，默认保持旧行为；V1 仅在 Exact-Out 分支使用完整原生路径，保留 Exact-In 当前首尾地址编码 |
| src/core/createCommand.ts | 核实已存在的 Exact-Out ABI；只修正本次所需定义 |
| 对应测试文件 | 解析、命令解码、兼容性及金额边界测试 |
| examples / README.md | Exact-Out 调用、预算、recipient 退款语义和支持矩阵 |

金额与准入校验过长时可抽出单一内部辅助模块，但不保留临时草稿中独立的完整 compileExactOut Planner。避免无关格式化、重命名和 Exact-In 支付策略优化。

## 9. 验证与验收

### SDK 层

- 缺省类型及显式 EXACT_IN 的既有命令字节保持一致，覆盖各协议、包装、分佣和原有拆单。
- Exact-Out 响应字段使用真实服务返回样本，测试缺失/错误 raw 字段、数组错位、金额溢出、未知协议、重复池、非法分佣和滑点覆盖。
- 解码实际 commands/inputs 检查 amountOut、amountInMaximum、V1/V2 完整路径、V3 反向路径、V4 action 顺序和本地 ABI。
- 普通 V4 路径验证交换后结算：用户付款用 SETTLE_ALL(input, Rmax)，Router 付款用 SETTLE(input, OPEN_DELTA, false)，然后 TAKE 输出；不预结算预算或添加常规输入退款 TAKE。V4 命令 input 验证为直接编码的 (bytes actions, bytes[] params)，不得多包一层 bytes；地址、动作及池参数按本地部署校验，记录与 Pancake 预算结算的差异。
- Exact-Out 编码失败不留下可误用的半成品；示例按每笔交易新建实例、只调用一次 encode() 编写，不要求修改现有追加行为。

### 合约执行层

使用本地实际 Router 及其锁定依赖执行 SDK 产生的 calldata；可控池用于边界与失败注入，固定区块/固定池状态样本用于真实路径交叉验证。不能仅凭 mock 命令或重新解码就宣布执行正确。

| 维度 | 必测场景 |
| --- | --- |
| 协议 | V1/V2/V3/V4 单跳、多跳；PSM 双向与粒度 |
| 预算 | 实际输入低于、等于、超过最大值；超过时整体回滚 |
| 输出 | 恰好满足、整数余量、不足额、耗尽流动性、Hook 部分成交 |
| 付款 | ERC20、原生 TRX、入口 WRAP、出口 UNWRAP、授权不足；V4 用户付款仅拉实际欠款，覆盖余额/授权低于 Rmax 但足以支付实际欠款；Router 付款仅结算实际欠款并退回 Router 中的预算余款 |
| 收款 | 默认发送者、第三方 recipient；输出及退款归属一致 |
| 分佣 | 无分佣、输入、输出、费率不一致、滑点余量、历史余额 |
| 循环 | 同币与 TRX/WTRX 碰撞，输出不足不能用退款补齐检查 |
| 清算 | Router 和 PoolManager 无本次用户资金遗留；退款不进入 safeVault |

不足额输出回滚及执行输入分佣 F 的精确匹配，须在无历史余额的基线下验证：ERC20 按 T 计算，TRX 按 Tmax 计算。TRX 还须覆盖 F 大于 QS 报价 F、路由上限缩小、预算不足拒绝及总输入不超过 Tmax。另行注入历史余额，确认并记录 SWEEP 和 PAY_REFERRAL 沿用现有余额语义；历史余额补足输出或进入分佣基数本身不判为本次实现失败。用户输入上限、本次退款归属和 ERC20 输入分佣的滑点预留隔离仍须满足；同币退款补足不足额输出的反例必须回滚或在编码前拒绝，不能套用历史余额例外。

以成熟 Exact-In 为报价参照时，必须固定同一组池状态。分别从相同初始快照执行，不先改变池状态再做比较。Exact-In 回算只能辅助确认报价数学；SDK 是否正确还要核对交易扣款、交付、分佣、退款和回滚。

同币场景不得用单一钱包余额差当作输出：记录实际支付、PoolManager delta/池侧变化、代币转移与退款，建立资金账本；原生币还须剔除 gas。

完成标准：构建及相关测试通过；每个声明支持的组合都有执行证据；尚未解决的组合明确报错并写入支持矩阵；实际 SDK 仓库应用最终实现后重新验证。只编译通过不算完成。

## 10. 实施顺序与待解决项

1. 固化 Exact-In 兼容样本，修正字段模型，完成普通无分佣路径。
2. 实现 V1/V2/V3/PSM 编码；V4 交换后按付款来源选择 SETTLE_ALL 或 SETTLE(OPEN_DELTA, false)，再 TAKE 输出，验证实际扣款、输入上限、Router 预付款退款和输出不足回滚。
3. 实现边界转换、recipient 和显式退款，接入 callValue 示例。
4. 验证循环及余额碰撞，再完善分佣；不把尚未证明的资金拆分流程默认开放。
5. 完成合约级与兼容性回归、更新支持矩阵，再整理到实际仓库提交。

当前必须解决的开发问题：V4 同币 delta 的正确结算顺序；含包装的输出/退款隔离；ERC20 输入分佣与本次滑点预留的隔离；TRX 最大预算分佣及调整后的路由预算；同币输出分佣；无历史余额基线下的 Hook 不足额输出验证。历史余额隔离不在本次范围内。以上是实现阶段的具体任务，不需要新增任意 payer 或必填 safeVault 接口来替代验证。

当前合约匹配结论：普通路径所需命令、V4 SETTLE_ALL、SETTLE(OPEN_DELTA) 和 TAKE 在本地合约中有对应实现，V4 外层 ABI 已核对一致。这是源码层面的匹配，不代表端到端执行已通过；同币循环和分佣组合仍须完成上述测试后才能声明支持，历史余额按兼容限制验证并记录。

## 11. 本地参考文件

### Pancake 发布包证据

本次直接读取官方 npm tarball 的 dist/index.js 和声明文件。发布包中保留 src 文件路径注释，可按下列名称定位。原 GitHub 的 pancake-frontend 源码链接在查阅时返回 404，故以固定版本发布包为复核依据，不假定 main 分支内容。

- [universal-router-sdk 1.5.3 tarball](https://registry.npmjs.org/@pancakeswap/universal-router-sdk/-/universal-router-sdk-1.5.3.tgz)：`src/entities/protocols/TradePlanner.ts`、`src/entities/protocols/parseSwapTradeContext.ts`、`src/utils/RoutePlanner.ts`。
- [infinity-sdk 1.0.9 tarball](https://registry.npmjs.org/@pancakeswap/infinity-sdk/-/infinity-sdk-1.0.9.tgz)：`src/entities/ActionsPlanner.ts`、动作 ABI、PoolKey 与参数工具。

### 本地文件

- SDK：`src/core/TradePlanner.ts`、`src/core/parseRouteAPIResponse.ts`、`src/core/buildExecutionFromRoute.ts`、`src/core/encodePath.ts`、`src/core/createCommand.ts`。
- 报价服务：`quote_service/graph/quote.go`、`quote_service/graph/exact_out_quote.go`、`quote_service/graph/exact_out_route.go`。
- 背景设计：报价服务仓库 `docs/exact_to_support_design.md`。其中涉及历史顺序执行方案的内容不能覆盖当前代码的原生执行约束。
- 合约：见第 2 节基线与文件；上线前需要确认部署合约与测试使用的源码/ABI 一致。
