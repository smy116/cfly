# cfly

基于 Cloudflare Workers + Hono + KV 的极简短链接系统。

## 功能

- **双模式访问**：`your-domain.com/abc` 和 `abc.your-domain.com`
- **内外网分流**：通过 `<img>` 标签自动探测内网环境
- **极简 404**：不存在的短链接返回友好 404 页面

## KV 数据格式

| Key | Value | 效果 |
|-----|-------|------|
| `abc` | `https://example.com` | 直接 302 跳转 |
| `abc` | `{"i":"http://192.168.1.1:8080","e":"https://example.com"}` | 内外网分流 |

- `i` = 内网地址，`e` = 外网地址

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
