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
