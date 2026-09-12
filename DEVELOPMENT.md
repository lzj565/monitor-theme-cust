# 开发环境

本项目是 `monitor` 的前端主题，不包含后端 `monitor-hub`。开发时需要同时运行一个 hub 实例和 Vite 开发服务器。

## 服务关系

| 服务 | 地址 | 作用 |
|---|---|---|
| `monitor-hub` | `127.0.0.1:9911` | 提供 API、数据库和 WebSocket |
| Vite | 通常是 `http://localhost:5173` | 提供当前主题的前端页面 |

Vite 已在 `vite.config.ts` 中配置代理，会把 `/api` 和 WebSocket 请求转发到 `127.0.0.1:9911`。

## macOS 开发

### 1. 准备 Rust

如果终端中找不到 `cargo`，先安装 Rust：

```bash
brew install rust
```

也可以从 [Rust 官网](https://www.rust-lang.org/tools/install) 安装。

### 2. 获取并编译 hub

在当前主题仓库的上一级目录获取 hub 源码：

```bash
cd ..
git clone https://github.com/monitor-probe/monitor.git
cd monitor
cargo build --release
```

如果已经克隆过 `monitor`，跳过 `git clone`，直接进入该目录并执行：

```bash
cd /path/to/monitor
cargo build --release
```

### 3. 启动 hub

保持第一个终端运行：

```bash
./target/release/monitor-hub \
  --listen 127.0.0.1:9911 \
  --db /tmp/monitor.db \
  --site http://127.0.0.1:9911
```

参数含义如下：

| 参数 | 含义 |
|---|---|
| `--listen 127.0.0.1:9911` | hub 监听的本机地址和端口 |
| `--db /tmp/monitor.db` | SQLite 数据库文件位置 |
| `--site http://127.0.0.1:9911` | hub 对外宣告的站点地址；本地开发保持这个值即可 |

### 4. 启动主题前端

打开第二个终端，执行：

```bash
cd /Users/lzj/code/monitor-theme-cust
npm ci
npm run dev
```

然后打开 Vite 输出的地址，通常是：

```text
http://localhost:5173
```

不要把 `http://127.0.0.1:9911` 当作 Vite 开发页面地址；它是 hub 后端地址。

## 常见问题

### `zsh: command not found: monitor-hub`

这是正常的：`monitor-hub` 不属于本仓库，也不会被 `npm ci` 安装。macOS 下使用编译产物的完整路径启动：

```bash
/path/to/monitor/target/release/monitor-hub \
  --listen 127.0.0.1:9911 \
  --db /tmp/monitor.db \
  --site http://127.0.0.1:9911
```

也可以把它安装到 Cargo 的可执行文件目录：

```bash
cd /path/to/monitor
cargo install --path .
monitor-hub --listen 127.0.0.1:9911 --db /tmp/monitor.db --site http://127.0.0.1:9911
```

如果安装后仍然找不到命令，检查 `~/.cargo/bin` 是否在 `PATH` 中：

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

### 页面能打开，但没有节点或实时数据

确认以下事项：

| 检查项 | 命令或现象 |
|---|---|
| hub 是否在运行 | `curl http://127.0.0.1:9911/api/me` |
| hub 端口是否正确 | Vite 代理目标必须是 `127.0.0.1:9911` |
| 是否启动了第二个终端的 Vite | 浏览器地址应为 `localhost:5173` |
| 是否有 agent 上报节点 | 需要另外配置并运行 `monitor` 的 agent |

### 只想开发页面，不需要真实数据

仍然可以只运行：

```bash
npm ci
npm run dev
```

但 `/api` 和 WebSocket 请求会失败，页面不会显示真实节点数据。完整联调必须启动 hub。

## 相关项目

| 项目 | 地址 | 说明 |
|---|---|---|
| monitor | https://github.com/monitor-probe/monitor | hub 后端 |
| 当前主题 | https://github.com/monitor-probe/monitor-theme-default | 默认主题参考实现 |
