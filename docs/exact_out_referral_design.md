# Exact-Out 返佣设计：不修改合约的方案与边界

日期：2026-09-11  
范围：前端 → QS → SDK → 已有 Router / Permit2 / ReferralVault；V2、V3、V4；ERC20 与 TRX。  
状态：已选定仅支持 Exact-Out 输出端收费；输入端方案保留为历史讨论，不再实施。

## 最终决策（2026-09-11）

- Exact-Out 仅支持无返佣或输出端返佣；ERC20、TRX 及纯包装都遵守此规则。
- QS 报价中的输入佣金必须为零、输入费率必须为零或省略；SDK 拒绝非零输入佣金/费率，拒绝 `mode: 'input'` 配置（包括 0 bps）。不会将输入端报价自动改写为输出端报价。
- SDK 已移除 Exact-Out 输入预扣与输入返佣的预算扣减。ERC20 交换由用户按实际需求付款；TRX 通过 callValue 提供最大预算，并在交换后退款。纯解包仍需先转入目标所需 WTRX。
- 输出端按本次毛输出收费，再以用户净目标做 SWEEP 检查；收款人同时接收适用的退款。保留原生预付款碰撞及 V4 同币净额的拒绝规则。
- Exact-In 输入返佣保持原行为；本次不修改 QS、Router 或 ReferralVault。

以下第 1 节的条件性建议、第 6—7 节输入端方案，以及其他章节涉及输入返佣的对比均为决策前讨论，不代表当前 SDK 支持范围。第 5 节输出端流程继续适用；第 12 节的 TRX 输入收费实施步骤已取消。

## 1. 结论与前提

建议将**输出端返佣作为 Exact-Out 默认模式**：对实际毛输出收佣，扣佣后检查用户净目标。必须用输入币收佣时，采用明确披露的**报价计费**，统一 ERC20 与 TRX 的计费基数，不宣传为按实际成交输入收费。

本方案遵守以下前提：

- 不修改 Router、Permit2、池子或 ReferralVault 合约代码，不引入替代结算合约。
- 不考虑 Router 的历史余额、外部转入或捐赠；涉及币种在本笔执行开始前的余额为零，原生输入本次随 `callValue` 到账。
- 仍需处理**本笔交易自身**产生的滑点余款、包装币余额和同币循环；这些不属于外部多余资金。
- 采用普通转账语义的代币及已验证的池子。转账税、重基及需要特殊 hookData 的池子不自动获得支持。
- 一笔 Exact-Out 只选一条路线、一个交换协议域，不拆单；输入和输出返佣互斥。
- 本文金额均为最小单位整数；小数示例仅用于阅读。网络手续费另计。

在这些前提下，输出端可以按本次实际输出收费；现有 `PAY_REFERRAL` 没有读取实际交换输入的参数或机制，不能仅靠改变它的调用顺序，普遍实现严格的“实际输入 × 费率”。

## 2. 用户手续费与项目分佣的区别

需要区分两个比例：

1. SDK 的 `referralOptions.bps` 决定从用户输入或输出中收取多少费用。
2. ReferralVault 的默认或项目专属分配比例，决定上述费用中多少记给项目、多少属于协议。

因此“收取 1 A 佣金”不等于“项目可领取 1 A”。`projectAddress` 是项目分佣记账地址，`recipient` 是兑换输出及退款的收款地址，两者独立。

## 3. 当前合约可用接口

### 3.1 前端发起的链上调用

| 合约 | 接口 | 用途 |
| --- | --- | --- |
| ERC20 | `approve(address spender, uint256 amount)` | 授权 Permit2 使用用户输入币 |
| Permit2 | `approve(address token, address spender, uint160 amount, uint48 expiration)` | 授权 Router 经 Permit2 使用指定币种 |
| Router | `execute(bytes commands, bytes[] inputs, uint256 deadline)`，payable | 一次执行 SDK 编排的命令 |
| ReferralVault | `claimReferral(address token, address rebateRecipient)` | 项目后续领取累计返佣，普通领取要求调用者为该项目地址 |

授权充足时无需重复授权。Permit2 第二层授权也可以使用签名，在 Router 交易开头执行 `PERMIT2_PERMIT`。原生 TRX 由 `callValue` 支付，无需代币授权。

### 3.2 SDK 命令，不是独立的外部函数

以下参数装入 `inputs`，由同一笔 `Router.execute` 解码执行。`THIS` 表示 Router 自身的 `ADDRESS_THIS` 标记，`P` 表示项目地址，`b` 表示手续费率 bps（100 bps = 1%）。

| 命令 | 参数 | 效果 |
| --- | --- | --- |
| `PERMIT2_TRANSFER_FROM` | `[token, recipient, amount]` | Router 调用 Permit2 从交易发送者转入指定金额 |
| `PAY_REFERRAL` | `[token, P, b]` | 按 Router 此时该币种余额的比例收佣并记账 |
| `V2_SWAP_EXACT_OUT` | `[recipient, amountOut, amountInMaximum, path, payerIsUser]` | V2 正向路径 Exact-Out |
| `V3_SWAP_EXACT_OUT` | `[recipient, amountOut, amountInMaximum, encodedPath, payerIsUser]` | V3 反向编码路径 Exact-Out |
| `V4_SWAP` | `[actions, params]` | 在一次 V4 执行中交换、结算及提取输出 |
| `WRAP_ETH` | `[recipient, amount]` | 将指定数量 TRX 包装为 WTRX |
| `UNWRAP_WETH` | `[recipient, amountMinimum]` | 检查最低余额后解包 Router 持有的全部 WTRX |
| `SWEEP` | `[token, recipient, amountMinimum]` | 检查最低余额后转出该币种全部余额 |

零地址表示 TRX。`SWEEP` 的最低值不是固定转账数量。以输出币 B、收款地址 U、净输出目标 N 为例，`[B, U, N]` 表示不足 N 则回滚，否则把全部 B 转给 U。

### 3.3 PAY_REFERRAL 与 Vault

下面 `fee` 是本次收取的费用，`b` 是手续费率 bps，`D=10000` 是费率分母；Exact-Out 要求 `0≤b<D`。`floor` 表示向下取整。链上收费公式为：

```text
fee = floor(Router 当前 token 余额 × b / D)
```

Router 检查 Vault 允许的最高费率，然后按下列顺序执行。这里 `token` 是收费币种，`fee` 是刚计算出的费用，`P` 是项目分佣地址：

```text
ReferralVault.updateLastTokenBalance(token)
    → 向 Vault 转入 fee
    → ReferralVault.allocateReferral(token, P)
```

ERC20 使用代币转账；TRX 使用原生币转账。项目领取是后续独立交易，不属于本笔交换。

当前命令没有 `actualAmountIn` 或固定 `feeAmount` 参数。QS 返回的返佣金额用于 SDK 一致性校验和预算计算，实际扣费仍由上述余额公式决定。

## 4. V2、V3、V4 的交换与付款差异

下表中 `input` / `output` 是交换的输入/输出币种，`R` 是不含输入佣金的交换输入上限，`THIS` 表示 Router 自身。

| 协议 | 实际输入如何确定 | 用户付款 | Router 预付款 | 输出到 Router 的方式 |
| --- | --- | --- | --- | --- |
| V2 | Router 读储备反算，检查输入上限 | Permit2 将实际输入直接转给首池 | Router 将实际输入转给首池 | 池子转账；多跳中间输出直接到下一池 |
| V3 | 反向 Exact-Out 交换通过 callback 确定付款 | callback 经 Permit2 支付，递归完成多跳 | callback 从 Router 余额付款 | 池子转账 |
| V4 | PoolManager 交换产生按币种记账的 debt/credit | 交换后 `SETTLE_ALL(input, R)` 支付实际债务 | 交换后 `SETTLE(input, OPEN_DELTA, false)` 从 Router 支付实际债务 | `TAKE(output, THIS, OPEN_DELTA)` 提取输出信用 |

V4 的 Exact-Out swap action 本身携带 `amountInMaximum = R`；Router 付款时也依赖这项交换上限约束。不能把 `SETTLE(..., OPEN_DELTA, false)` 理解为预先支付整个预算。

V2/V3 池内使用 WTRX，不直接使用 TRX。TRX 输入需入口包装，TRX 输出需出口解包。V4 可以原生 TRX 作为池币种，也可以经 WTRX 边界转换，具体由路线决定。

V4 的 `OPEN_DELTA` 表示按当前债务或信用结清，不表示固定支付零。多跳 Exact-Out 的路径排列及动作 ABI 沿用当前 Router 定义。

## 5. 输出端返佣：推荐方案

### 5.1 报价与净目标

本组公式使用：`N` 为用户要求的净输出目标，`G` 为 QS 计算的毛输出目标，`b` 为输出手续费率 bps，`D=10000`，`floor` 表示向下取整。QS 选择满足以下条件的 G，并据此反算交换输入：

```text
G − floor(G × b / D) ≥ N
```

金额必须满足币种和协议的粒度约束；使用整数运算，不能用浮点结果直接编码。SDK 将 G 编入交换命令，将 N 编入最终 SWEEP。

实际执行时，`H` 表示本次真正收到的毛输出，`N` 仍是用户净目标，`b` 是输出手续费率 bps，`D=10000`。按实际产出收费并检查净输出：

```text
输出佣金 = floor(H × b / D)
用户净输出 = H − 输出佣金
最终要求：用户净输出 ≥ N
```

V2 舍入可能产生比报价目标更多的输出；V3/V4 也不应绕过最终净输出检查。V4 流动性不足或 Hook 行为可能导致不足额输出，必须回滚或在准入时拒绝。

### 5.2 按协议和输入币种编排

下表中 `M` 是用户允许的最大总输入，`input` 是交换输入币种。输出端不收输入佣金，所以 M 可以全部用作交换预算。

| 协议 | ERC20 输入 | TRX 输入 |
| --- | --- | --- |
| V2 | 用户经 Permit2 按实际需要付给池子；不预拉 M | `callValue=M`，先包装 M；池子从 Router 获得实际输入；末尾将剩余 WTRX 解包为 TRX，再退给 recipient |
| V3 | callback 从用户支付实际输入；不预拉 M | `callValue=M`，先包装 M；callback 从 Router 支付；末尾将剩余 WTRX 解包为 TRX，再退给 recipient |
| V4 | Exact-Out → `SETTLE_ALL(input,M)` → `TAKE` | 原生路径：Exact-Out → `SETTLE(TRX,OPEN_DELTA,false)` → `TAKE`；剩余 TRX 退款。入口包装路径先包装，再从 Router 结算 WTRX |

上述六类均在输出已经到 Router、必要的出口解包完成之后执行。下面 `output` 是最终输出币种，`P` 是项目地址，`b` 是输出手续费率 bps，`U` 是收款地址，`N` 是用户净输出目标：

```text
PAY_REFERRAL(output, P, b)
SWEEP(output, U, N)
退款命令（仅在本次确有输入预付款时需要）
```

输出币为 ERC20 时收取该 ERC20；输出币为 TRX 时收取 TRX。下面 `THIS` 表示 Router，`U` 表示收款地址，`N` 表示净输出目标：

- V2/V3：交换产出 WTRX → `UNWRAP_WETH(THIS,0)` → 对 TRX 收佣 → `SWEEP(TRX,U,N)`。
- V4 原生输出：`TAKE(TRX,THIS,OPEN_DELTA)` → 对 TRX 收佣 → `SWEEP(TRX,U,N)`。
- WTRX 作为最终输出且不解包时，佣金币种就是 WTRX，不是 TRX。

计算退款时，`M` 为最大总输入，`S` 为实际交换消耗。输出端不另收输入佣金：ERC20 用户付款模式只扣 S；TRX 预付款模式退回 `M−S`。

### 5.3 仍需限制的问题

即使没有外部余款，以下问题仍然存在：

1. 本笔输入退款不能与输出币余额混合，具体见第 8 节。
2. 若实际毛输出有余量，佣金也可能比 QS 预估增加；不能把 QS 返佣字段标成最终成交费用。
3. 用户收到的数量至少达到净目标，不强制等于净目标；SWEEP 会交付全部净输出。
4. 不能承诺输出端收费仍以输入币结算。转换佣金币种会引入额外交换，不在本方案内。

## 6. 输入端返佣：当前实现

### 6.1 ERC20：按报价预计总输入收费

本组公式使用以下金额，单位均为输入 ERC20 的最小单位：

| 符号 | 本节含义 |
| --- | --- |
| `T` | QS 预计总输入，含输入佣金，对应 `amountInRaw` |
| `M` | 最大总输入，对应 `amountInMaximumRaw` |
| `b` / `D` | 输入手续费率 bps / 固定分母 10000；`floor` 表示向下取整 |
| `F` | 本笔输入佣金 |
| `Q` | QS 预计用于交换的输入，不含佣金 |
| `R` | 允许用于交换的最大输入，不含佣金 |

现有 SDK 以预计总输入 T 为收费基数：

```text
F = floor(T × b / D)
Q = T − F
R = M − F
```

这里费率作用于**含佣金的预计总输入 T**，不是预计交换输入 Q，更不是链上实际消耗。

下面命令中，`A` 是输入 ERC20，`THIS` 是 Router，`P` 是项目地址，`U` 是输出及退款收款地址，`N` 是净输出目标。金额 `T` 为预计总输入、`M` 为最大总输入、`R` 为扣佣后的交换上限、`S` 为实际交换消耗，`b` 为输入手续费率 bps：

```text
PERMIT2_TRANSFER_FROM(A, THIS, T)
PAY_REFERRAL(A, P, b)                 // 此时余额恰为 T
PERMIT2_TRANSFER_FROM(A, THIS, M−T)   // 滑点预留不参与收费
Exact-Out 交换，输入上限 R，目标 N
SWEEP(output, U, N)
SWEEP(A, U, 0)                       // 退回 R−S
```

| 协议 | 交换阶段 |
| --- | --- |
| V2 | `payerIsUser=false`，从 Router 支付实际输入 S 给首池 |
| V3 | `payerIsUser=false`，callback 从 Router 支付 S |
| V4 | Exact-Out → `SETTLE(A,OPEN_DELTA,false)` → `TAKE(output,THIS,OPEN_DELTA)` |

对含真实交换的路径，用户需要余额及 Permit2 授权覆盖 M；不是只覆盖最终消耗 `S+F`。退款与输出都归 U，U 可以不同于付款人。

以预计总输入 T=101、最大总输入 M=111、费率 b=100 bps（1%）为例，佣金 F=1.01，交换上限 R=109.99。下表 S 表示链上实际交换消耗：

| 实际交换消耗 S | 佣金 | 退款 | 含佣金实际消耗 |
| --- | --- | --- | --- |
| 99.99 | 1.01 | 10 | 101 |
| 105 | 1.01 | 4.99 | 106.01 |
| 大于 109.99 | 整笔回滚 | 不执行成功退款 | 本笔转账与佣金记账撤销 |

它是报价计费：S 变化不重新计费。若保留这种模式，前端应显示“按报价确定的输入手续费”，不能显示为“实际成交输入的 1%”。

### 6.2 TRX：当前按最大总输入收费

本组公式中，`M` 是最大总输入（本次随 callValue 到账的 TRX），`b` 是输入手续费率 bps，`D=10000`，`floor` 表示向下取整；`F` 是输入佣金，`Q` 是 QS 预计交换消耗，`T` 是含佣金的预计总输入，`R` 是扣佣后的交换上限。当前 QS/SDK 使用：

```text
callValue = M
F = floor(M × b / D)
T = Q + F
R = M − F
```

原生币随交易一次性到账，因此 PAY_REFERRAL 前 Router 中有 M TRX，收费基数自然是 M。

| 协议 | 当前顺序 |
| --- | --- |
| V2/V3 | 收 TRX 佣金 → 包装 `M−F` → 从 Router 付款交换 → 交付输出 → 解包余款 → 退 TRX |
| V4 原生输入 | 收 TRX 佣金 → Exact-Out → 从 Router 结算实际 TRX 债务 → TAKE 输出 → 交付输出 → 退 TRX |
| V4 入口包装 | 收 TRX 佣金 → 包装 `M−F` → 交换并结算 WTRX → 交付输出 → 解包余款 → 退 TRX |

问题是：同一成交需求、相同实际消耗，仅提高滑点预算也可能增加佣金。这与 ERC20 的报价计费规则不同，不能用同一句“按输入金额收费”掩盖差异。

## 7. 输入端建议：不改合约，统一报价计费

### 7.1 QS 统一预算规则

保留 ERC20 的报价收费口径，TRX 也采用它。本组公式使用：

| 符号 | 本组含义 |
| --- | --- |
| `Q` | QS 预计交换输入，不含佣金 |
| `T` | 含佣金的预计总输入 |
| `F` | 按报价确定的输入佣金 |
| `b` / `D` | 输入手续费率 bps / 固定分母 10000；`floor` 表示向下取整 |
| `Δ` | 在预计交换输入之上增加的滑点预留 |
| `R` | 含滑点预留的交换输入上限，不含佣金 |
| `M` | 含佣金和滑点预留的最大总输入 |

```text
已知预计交换输入 Q：
选择最小整数 T，使 T − floor(T × b / D) ≥ Q
F = floor(T × b / D)

在 Q 上计算交换滑点预留 Δ
R = Q + Δ
M = R + F
```

金额舍入后的端点关系必须与逐跳报价一致；QS 与 SDK 应共享相同的整数取整约定。改变滑点只改变 Δ 和 M，不改变 Q、T、F。

这里仍按含佣金的预计总输入收费，没有改成按预计交换消耗或实际交换消耗收费。若产品希望更换计费分母，需另行定义并实现，不能只改字段说明。

### 7.2 TRX 通过包装隔离滑点预算

这里 `M` 为最大总输入、`T` 为含佣金的预计总输入；两者之差 `M−T` 就是滑点预留。利用现有 WRAP/UNWRAP 命令，在收佣前把这部分暂时移出 TRX 余额。

**V4 直接使用原生 TRX 的通用流程：**

以下 `M` 是最大总输入，`T` 是预计总输入，`F` 是报价佣金，`R=M−F` 是交换上限；`b` 是费率 bps，`N` 是净输出目标。`THIS` 表示 Router，`P` 是项目地址，`U` 是收款地址，`output` 是输出币种。

```text
callValue = M
WRAP_ETH(THIS, M−T)               // TRX 剩余 T，WTRX 暂存预留
PAY_REFERRAL(TRX, P, b)           // 扣 F，TRX 剩余 T−F
UNWRAP_WETH(THIS, 0)              // 收回暂存预留，TRX 共 M−F
V4 Exact-Out，交换上限 R
SETTLE(TRX, OPEN_DELTA, false)
TAKE(output, THIS, OPEN_DELTA)
SWEEP(output, U, N)
SWEEP(TRX, U, 0)
```

**V2/V3，以及入口包装的 V4，可复用已经包装的预留：**

以下 `M` 是最大总输入，`T` 是预计总输入，`F` 是报价佣金，`R=M−F` 是交换上限；`b` 是费率 bps。`THIS` 表示 Router，`P` 是项目地址，`U` 是退款收款地址。先包装预留，再包装预计输入扣佣后的部分，两者合计为交换预算。

```text
callValue = M
WRAP_ETH(THIS, M−T)               // 暂存预留
PAY_REFERRAL(TRX, P, b)           // 基数仍为 T
WRAP_ETH(THIS, T−F)               // 两次包装合计 M−F，不必先解包再包装
Exact-Out，Router 用 WTRX 付款，交换上限 R
交付输出
UNWRAP_WETH(THIS, 0)
SWEEP(TRX, U, 0)
```

零预留时可以省略无效包装步骤。包装前后金额与池内 WTRX/TRX 必须对应同一部署，不得混用网络地址。

### 7.3 调整成本与准入

- 只改 QS 和 SDK；合约使用既有命令。
- QS 必须将 TRX 佣金改为基于预计总输入，SDK 必须同步修改当前基于最大总输入的校验与命令顺序。旧报价不能按新规则悄悄重解释，应通过接口版本或明确的部署版本配对区分。
- 需要完整验证临时包装前后的资金余额；`UNWRAP_WETH` 解包的是全部 WTRX，因此暂存与恢复必须在真实交换开始前完成，或明确复用为交换预算。
- 保留第 8 节的输出/退款碰撞拒绝规则，不能因为有包装就自动放开同币循环。
- 相比当前 TRX 路径，增加包装操作与资源消耗。它解决“滑点影响收费”，并没有解决“报价与实际消耗不同”。
- 如不愿承担这项改动，建议暂不开放 TRX 输入端返佣，采用输出端返佣；不应继续将最大预算收费包装成成交计费。

这里 `R` 是预存的交换预算，`S` 是实际交换消耗，剩余输入为 `R−S`。不能将 PAY_REFERRAL 简单移到交换后，否则算出的将是退款的比例。现有命令也没有把实际交换消耗作为下条命令动态参数的接口。

## 8. 同币循环、退款混入与 V4 净额

### 8.1 本笔退款与输出混合

例如预存 120 A，路线为 `A → B → A`，实际支付 105 A，收到 100 A：

```text
Router 最后有 A：100 输出 + 15 退款 = 115
```

若输出返佣为 1%，PAY_REFERRAL 会扣 1.15 A，而不是输出对应的 1 A；SWEEP 也可能用这 15 A 补足不足的输出。

即使没有输出返佣，先 SWEEP 再退款也不能证明净输出足额，因为输出检查已经看到了混合余额。因此输入端返佣预付款路线同样需要拒绝此类组合。

### 8.2 三种协议的准入区别

| 组合 | 当前判断 | 原因 |
| --- | --- | --- |
| V2/V3，ERC20 用户付款，无输入佣金，首尾同币 | 可支持通过不同池的路线 | 输入直接支付给池子，Router 没有预存输入余款；输出端可对产出收费 |
| V2/V3，原生输入或输入佣金预付款，输出与退款同币 | 拒绝 | 本笔余款与输出混合，不能分别计费和检查 |
| V4 交换域首尾同币 | 拒绝 | Manager 按币种净额记账，没有常规流程要求的独立输入债务和输出信用 |

V4 例如消耗 105 A、产出 100 A，结算看到净欠款 5 A。不能一边支付 5 A 净债务，一边用普通 TAKE 提取“100 A 输出”。这与 Router 余额是否含外部资金无关。

### 8.3 包装边界也要检查

不能只比较用户输入与输出地址，还要检查交换域输入、交换域输出、入口/出口包装后的退款币种。例如 `TRX → WTRX → … → WTRX → TRX`，出口解包会把 WTRX 退款和 WTRX 产出一并变成 TRX。

当前 `validateExactOutRoute` 对上述已识别的预付款碰撞和 V4 同币净额组合提前拒绝。本文建议保留这条边界；向最终收款人提前支付输出或设计其他特殊结算，不作为已验证能力。

## 9. 纯 TRX/WTRX 转换

纯包装没有价格变化，转换输入与毛输出为 1:1，不属于 V2/V3/V4 的真实交换。其付款准备仍需单独处理。

下表 `G` 是包装/解包的毛输出目标，`M` 是最大总输入，`T` 是含输入佣金的预计总输入，`M−T` 是未使用的滑点预留。

| 方向 | 输出端返佣 | 输入端返佣 |
| --- | --- | --- |
| TRX → WTRX | 仅包装毛目标 G，对 WTRX 收佣，交付净输出，退剩余 TRX | 当前按 M 收 TRX 佣金，再包装目标；建议调整后按 T 收佣，暂存预留不得作为 WTRX 输出直接清扫 |
| WTRX → TRX | 只拉取所需 WTRX，解包，对 TRX 收佣，交付净输出 | 只拉取 T WTRX，收输入佣金，解包剩余 WTRX；不拉取 M−T |

TRX → WTRX 若采用第 7 节暂存办法，需在真正包装目标 G 前将暂存 WTRX 恢复为 TRX，再只包装 G；否则暂存预留可能被当作输出交付。纯解包完成后无需追加余额已为零的 WTRX 退款 SWEEP。

这些描述只说明 SDK 编排能力。QS 是否提供纯包装候选路线需单独确认，不能用手工构造 SDK 路线证明 QS 已支持。

## 10. 前端、QS、SDK 的接口约定

### 10.1 前端

```ts
const route = parseRouteAPIResponse(qsResponse.data[selectedIndex], isTestnet)
route.recipient = new Address(recipientAddress)

const planner = new TradePlanner([route], false, {
  referralOptions: { mode, bps, projectAddress },
})
planner.encode()
// 随后通过钱包调用 Router.execute，使用 planner.callValue。
```

- QS 请求与 SDK 配置的 mode/bps 必须一致。当前 SDK 不允许对有佣金报价省略配置，也不允许任意改变费率。
- 净输出展示读取 `route.exactOut.amountOut`；当前 Exact-Out 的旧字段 `minimumAmountOut` 为 0n，不用于该模式。
- ERC20 输入佣金模式提示需要覆盖最大预算的余额及授权；输出佣金模式按实际需要付款，但授权通常可覆盖最大预算。
- 明确展示佣金币种、基数、预计费用、净输出目标、最大总输入及退款收款地址。
- 成交后读取实际转账及 Vault 分账事件核对费用，不直接把 QS 预估金额当成交金额。`ReferralAllocated` 的项目份额与协议份额应合并理解为本次分账总额。

### 10.2 QS 与 SDK

下表 `N` 是用户净输出目标、`G` 是毛输出目标、`b` 是手续费率 bps；`Q` 是预计交换输入、`T` 是含佣金的预计总输入、`F` 是输入佣金、`R` 是交换输入上限、`M` 是最大总输入。

| 返佣模式 | QS | SDK |
| --- | --- | --- |
| 输出端 | 根据 N 和 b 计算 G，再报价 G；返回预计输出佣金 | 交换目标用 G；产出后收佣；最终 SWEEP 下限用 N |
| 当前 ERC20 输入端 | 计算 T、F、M | 分两次拉款，隔离预留；交换上限用 M−F |
| 当前 TRX 输入端 | 按 M 计算 F，预计总输入为 Q+F | callValue=M，收佣后交换上限用 M−F |
| 建议 TRX 输入端 | 改为基于 T 的 F，M=R+F | 临时包装隔离预留后收佣；不再按 M 校验 F |

不要由前端手工修改 QS 返佣字段“适配”SDK；报价预算及逐跳金额需要整体一致。

## 11. 验证要求与现有证据边界

建议调整上线前至少覆盖以下矩阵，每项均检查用户/recipient、Router、各池及 Vault 的资金变化：

| 维度 | 必测情况 |
| --- | --- |
| 协议与币种 | V2/V3/V4 × ERC20/TRX 输入 × 输入/输出佣金；ERC20 与 TRX 输出；多跳与包装边界 |
| 输入预算 | 实际交换消耗低于、等于、超过交换上限；成功时“实际交换消耗＋输入佣金”不超过最大总输入，超限原子回滚 |
| 输出计费 | 实际毛输出恰好达标、有舍入余量、不足额；扣佣后净输出至少达到用户目标 |
| TRX 新方案 | 固定预计交换输入和费率，改变滑点，输入佣金不变；原生 V4 与入口包装路径；零预留；整数舍入 |
| 退款隔离 | 首尾同币、交换域同币、WTRX 解包碰撞均按准入拒绝；普通用户付款 V2/V3 循环正确 |
| 付款人/收款人 | 相同、不同；退款确实归配置的 recipient |
| 授权与分账 | 授权不足、过期、Vault 费率上限、项目准入；失败后佣金与转账一起回滚 |
| 纯包装 | 双方向及两种佣金；只转换目标所需数量，不把暂存预留当输出 |
| QS 原始响应 | 保留真实响应 fixture，不改字段直接传 SDK；与对应池状态执行相结合 |

已有本地测试证明的范围：

- V2 使用真实 Router/Permit2，受控池验证 Router 编排及转账资金守恒；池内恒定乘积和储备更新未使用生产实现验证。
- V3 使用受控池检查 callback 付款；V4 使用实际 PoolManager 和静态费 fixture。
- V4 动态费单测验证编码，不等同于动态费池或任意 Hook 执行验证。Exact-Out 的 hookData 为 `0x`，与 Exact-In 的 20 字节零不同。
- Exact-Out 测试报价主要为手工构造，不能代替真实 QS 原始响应到池执行的完整链路验证。
- 第 7 节 TRX 报价计费调整是待实现建议，已有测试通过不能作为该建议已经验证的证据。

本方案的回滚指同一笔 execute 内的转账、交换及分佣记账撤销；不撤销之前的独立授权交易，也不退回失败交易消耗的网络费用。

## 12. 实施顺序

1. 产品确认默认输出端收费，明确项目接受的佣金币种。
2. 保留输入端时，明确“按含佣金预计总输入收费”的文案和算法，避免与实际输入收费混淆。
3. 如需 TRX 输入收费，按第 7 节同步调整 QS 与 SDK；执行验证完成前不切换现有报价语义。
4. 保留现有不支持协议、拆单、同币净额和退款碰撞拒绝逻辑。
5. 补真实 QS 响应回归与上述链上资金断言，再发布 QS/SDK 匹配版本。全程不修改合约代码。

## 13. 代码依据

- [SDK 命令编排](../src/core/TradePlanner.ts)：`encodeExactOut`、`addPayReferral`、各协议交换与 V4 结算。
- [SDK 报价校验](../src/core/exactOut.ts)：金额、费率、包装边界及余额碰撞检查。
- [API 解析](../src/core/parseRouteAPIResponse.ts)：QS raw 字段到内部金额模型。
- [命令 ABI](../src/core/createCommand.ts)、[V4 actions](../src/packages/v4/constants/actionsAbiParameters.ts)。
- [本地执行测试说明](../tests/contracts/README.md)、[原生 Exact-Out 总体设计](native_exact_out_sdk_design.md)。
- Router 源码基线：`fbd1a93964d159b8c39450652c2285b4dbffc1c1`；主要实现为 `UniversalRouter.sol`、`Dispatcher.sol`、`Payments.sol`、`Permit2Payments.sol`、V2/V3 swap 模块、V4Router/CLRouterBase、`ReferralVault.sol`。

本文围绕 Exact-Out。Exact-In 输入通常固定，不能把 Exact-Out 的最大预算、实际债务结算和退款步骤直接套用到所有 Exact-In 拆单场景。

## V1 Exact-Out 补充

适用 Router 版本：`4fbc87557dcddbe3031409ab65561035eb292ac6` 或兼容实现。
支持 TRX→Token、Token→TRX、Token→Token（合约内经 TRX）。SDK 也接受显式 Token→TRX→Token，
编码时只传两个端点；其他中间币和更长路径拒绝。本地 QS 当前还未开放 V1 Exact-Out。

仅支持输出端返佣或不返佣。这里 N 是用户净目标，G 是交给 Router 的毛输出，b 是返佣基点数，
D=10000：费用为 floor(G×b/D)，要求 G−floor(G×b/D)≥N。
执行顺序为 V1_SWAP_EXACT_OUT → PAY_REFERRAL（如有）→ SWEEP(输出,recipient,N) → SWEEP(输入,recipient,0)。
若有 TRX/WTRX 边界，还会包含相应包装或解包命令。

TRX 输入：callValue 为最大输入预算，V1 直接消耗原生 TRX；剩余 TRX 退给 recipient，
不需要为直接 TRX→Token 路径包装 WTRX。ERC20 输入：Router 用 Permit2 拉取链上计算所需输入，
授权交易所并交换，随后清零授权；若实际消耗少于拉取量，输入 SWEEP 将差额退给 recipient。
这和 V2/V3 直接向池付款不同。输出是 ERC20 或 TRX 时，均先汇入 Router 再收输出费。
禁止退款与输出使用同一币种，以免把退款算入返佣基数。不考虑外部多余资金。

验证使用真实 Router/Permit2 与实际转移输入、输出的受控 V1 交易所；不代表已部署池验证。
