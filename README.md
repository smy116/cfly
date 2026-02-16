# cfly

基于 Cloudflare Workers + Hono + KV 的极简短链接系统。

## 功能

- **双模式访问**：`your-domain.com/abc` 和 `abc.your-domain.com`
- **内外网分流**：通过 `<img>` 标签自动探测内网环境
- **密码保护**：可为链接设置访问密码
- **过期时间**：支持设置链接过期时间戳
- **安全校验**：slug 格式校验 + URL 合法性验证
- **KV 缓存**：边缘缓存 1 小时，减少 KV 读取
- **友好 404**：不存在的短链接返回简洁 404 页面

## KV 数据格式

短链接以 Key-Value 形式存储，Key 为 slug（仅允许 `a-zA-Z0-9_-`，≤64 字符），Value 支持以下格式：

| Value | 效果 |
|-------|------|
| `https://example.com` | 直接 302 跳转 |
| `{"i":"http://192.168.1.1","e":"https://example.com"}` | 内外网分流 |
| `{"url":"https://example.com","pwd":"secret"}` | 密码保护 |
| `{"url":"https://example.com","exp":1772006400}` | 过期时间 |
| `{"i":"...","e":"...","pwd":"x","exp":1772006400}` | 综合 |

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `url` | string | 跳转目标（纯 URL 模式） |
| `i` | string | 内网地址 |
| `e` | string | 外网地址 |
| `pwd` | string | 访问密码（可选） |
| `exp` | number | 过期时间，Unix 时间戳/秒（可选） |

> **获取时间戳**: `date -d "2026-03-01 00:00:00 UTC" +%s` 或 `echo $(($(date +%s) + 7*86400))`（7 天后）

## 部署

### 1. 创建 KV Namespace

在 Cloudflare Dashboard → Workers & Pages → KV → Create a namespace，命名为 `LINKS`，记录 ID。

### 2. 配置 `wrangler.toml`

```toml
[vars]
DOMAIN = "your-domain.com"
# INTRANET_URL = "https://192.168.99.1"  # 可选

[[kv_namespaces]]
binding = "LINKS"
id = "你的KV_NAMESPACE_ID"
```

### 3. 连接 Git 自动部署

1. 将代码推送到 GitHub/GitLab 仓库
2. 进入 Cloudflare Dashboard → Workers & Pages → Create → Connect to Git
3. 选择仓库和 `main` 分支
4. 构建命令: `npm install`，输出目录留空
5. 点击部署

### 4. 配置 DNS

在 Cloudflare DNS 中添加：
- `@` A 记录 → `192.0.2.1`（代理模式）
- `*` A 记录 → `192.0.2.1`（代理模式，用于子域名模式）

### 5. 管理短链接

在 Cloudflare Dashboard → Workers & Pages → cfly → Settings → KV 中直接管理键值对。

## 本地开发

```bash
npm install
npm run dev
```
