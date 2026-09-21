# 延迟颜色历史

## 首页卡片旧六档规则

`v1.0.54` 之前，首页卡片与节点详情共用 `src/lib/probeHistory.ts` 中的
`getLatencyColor`：

| 延迟范围 | CSS 变量 | 色值 |
|---|---|---|
| `0–50 ms` | `--probe-green` | `#35c96f` |
| `51–100 ms` | `--probe-lime` | `#8ecf45` |
| `101–200 ms` | `--probe-yellow` | `#d7d93f` |
| `201–300 ms` | `--probe-amber` | `#f2b63d` |
| `301–500 ms` | `--probe-orange` | `#f28c28` |
| `>500 ms` | `--probe-red` | `#ef5350` |
| 超时 | `--probe-timeout` | `#d83a2e` |
| 无数据 | `--probe-empty` | 随主题变化的中性色 |

如需恢复首页旧配色，让 `NodeProbeSummary` 的最新延迟和延迟历史色块重新使用
`getLatencyColor`，并恢复 `src/lib/probeHistory.test.ts` 中对应的六档边界测试即可。
节点详情仍在使用这套旧六档规则。

## 首页卡片 v1.0.54 四档规则

| 延迟范围 | CSS 变量 | 色值 |
|---|---|---|
| `<50 ms` | `--probe-green` | `#35c96f` |
| `50–<100 ms` | `--probe-yellow` | `#d7d93f` |
| `100–200 ms` | `--probe-amber` | `#f2b63d` |
| `>200 ms` | `--probe-red` | `#ef5350` |
| 超时 | `--probe-timeout` | `#d83a2e` |

这套规则只在 `v1.0.54` 的首页卡片使用。对于同时分布在香港、日本、美国和欧洲的
节点，`>200 ms` 直接标红过于激进，因此从 `v1.0.55` 起不再使用。

## 首页卡片 v1.0.55 六档规则

| 延迟范围 | CSS 变量 | 色值 | 含义 |
|---|---|---|---|
| `<50 ms` | `--probe-green` | `#35c96f` | 非常好 |
| `50–<100 ms` | `--probe-lime` | `#8ecf45` | 良好 |
| `100–<150 ms` | `--probe-yellow` | `#d7d93f` | 正常 |
| `150–<220 ms` | `--probe-amber` | `#f2b63d` | 偏高但可接受 |
| `220–<300 ms` | `--probe-orange` | `#f28c28` | 较高 |
| `≥300 ms` | `--probe-red` | `#ef5350` | 明显异常 |
| 超时 | `--probe-timeout` | `#d83a2e` | 不可达 |

当前首页规则由 `getCardLatencyColor` 提供；节点详情仍使用 `getLatencyColor`。
