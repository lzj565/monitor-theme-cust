# monitor-theme-cust

[monitor](https://github.com/monitor-probe/monitor) 的内置默认主题，同时作为第三方主题的参考实现。

React + Vite + shadcn/ui，黑白配色。

## 上游来源

本主题基于 [monitor-probe/monitor-theme-default](https://github.com/monitor-probe/monitor-theme-default) 定制。
Git 上游远程名为 `upstream`，默认分支为 `main`；本次同步至 `a6051a3`。
保留本仓库的玻璃/极简首页、访客信息、国家筛选与延迟历史等定制功能。

```bash
git remote add upstream https://github.com/monitor-probe/monitor-theme-default.git
git fetch upstream --prune
git merge upstream/main
```

## 开发

完整的 hub 获取、编译、启动和常见问题说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。

启动一个 hub 实例：

```bash
monitor-hub --listen 127.0.0.1:9911 --db /tmp/monitor.db --site http://127.0.0.1:9911
```

启动开发服务器，Vite 将 `/api` 与 WebSocket 代理至 hub：

```bash
npm ci
# Vite 将 /api 与 WebSocket 代理至这个 hub
MONITOR_HUB=https://hub.example.com npm run dev
```

不设 `MONITOR_HUB` 时代理至 `http://127.0.0.1:9911`。在本机起 hub、自己造节点的写法见文档站的
[主题开发](https://monitor-document.pages.dev/dev/theme)页。

构建产物位于 `dist/`。提交前运行 `npm run build && npm run lint && npm test`。

`npm test` 校验数字格式化、坐标轴与时间刻度，以及实时指标的输入边界。没有测试框架，Node 自己剥掉
类型，失败时退出码非零。

## 主题包

一个可安装主题是一个目录，名字必须与 `theme.json` 的 `short` 相同：

```text
<themes-dir>/<short>/
├── theme.json
├── preview.png        # 可选，面板上的预览图
└── dist/
    └── index.html
```

`theme.json` 除 `config` 外的六个字段都要写，均为字符串；可选的 `config` 数组由 Hub 用于生成后台「主题设置」表单。

| 字段 | 含义 |
|---|---|
| `name` | 显示名称 |
| `short` | 唯一短名，限字母、数字、`-`、`_`，取 `default` 则顶替 hub 内置的那份 |
| `description` | 简介 |
| `version` | 主题版本 |
| `author` | 作者 |
| `url` | 源码地址 |
| `config` | 主题设置字段数组；Hub 按它生成表单，设置值由主题通过配置 API 读取 |

每个 tag 的 release 里的 `theme.tar.gz` 解开就是这个目录——hub 构建时嵌入的是同一个包。

将目录复制到 hub 的 `--themes` 位置，在后台「主题」页切换，无需重启。

## 主题契约

主题是纯静态 SPA，只能依赖下列同源接口：

| 接口 | 用途 |
|---|---|
| `GET /api/me` | 站点名、登录状态、公开页开关、历史保留天数 |
| `GET /api/nodes` | 节点列表、实时指标和累计流量 |
| `GET /api/nodes/{id}/metrics` | 历史指标和延迟记录 |
| `GET /api/ws` | 每 2 秒推送一次节点快照的 WebSocket；带 `?gzip` 时每帧 gzip 后以二进制消息发出 |
| `GET /api/themes/{short}/config` | 站长改过的主题设置，只含与默认值不同的项 |

主题自带设置界面时，站长登录后可以 `PUT` 同一地址保存。`config` 的声明格式、两个接口的规则与约定见文档站的[主题开发](https://monitor-document.pages.dev/dev/theme#主题设置)。

首页极简风格由主题设置中的 `minimal_home` 开关控制，默认关闭。Hub 后台「主题」页的主题卡片会显示设置按钮；页面从 `GET /api/themes/glass-visitor/config` 读取保存值，缺少设置或读取失败时显示普通风格。

`metrics` 的三个查询参数都可省：

- `hours=N` 窗口宽度。**上限是 hub 的保留天数**（`/api/me` 的 `history_days`），登录与匿名相同，超出
  静默 clamp，所以档位要按它生成。7 天以内取分钟明细，更宽取每小时的汇总
- `points=W` 调用方画得下的点数，只会让 hub 抽得更稀，不会更密
- `series=metrics|ping` 只取要画的那一半，省掉的那半原本占响应的三分之一到三分之二

探测曲线的名字在响应的 `probes` 里随样本一起下发，匿名可读，所以画延迟图不需要第二个请求，也不
需要管理员身份。

整个窗口的丢包率在响应的 `loss` 里，按探测 id 给出百分比，没丢包的探测不出现。**不要拿样本行里
的 `loss` 自己平均**：那一个是所在桶的百分比，除数已经丢了，而各桶样本数天然不等——窗口首尾两桶
本来就是残缺的，探测启停、节点掉线、agent 跳过一轮都会再造几个。十三次里丢一次，平均桶百分比会
算出 50%。

匿名访问 `GET /api/nodes` 仅返回 `public=1` 的节点，响应中不含 `ip`、`hostname`、`remark`。字段定义以 hub 的 `src/api.rs` 为准。

未知路径回落到主题的 `dist/index.html`，客户端路由可用。`/admin/*` 由 hub 内置后台接管，不属于主题契约。

本主题用 `/node/{id}` 作为详情页。hub 的回落对它够用，但**hub 前面若有按路径做正向白名单的反代
或 WAF，得把这个前缀放行**：从列表点进去只是 pushState，边缘看不见，刷新详情页才会真的请求
`/node/{id}`，症状是「点进去正常，一刷新就被拦」。
图标 `/favicon.svg` 和 `/apple-touch-icon.png` 同样要放行，后者被拦时 iOS 收藏和添加到主屏幕都没有图标。

## 许可

MIT
