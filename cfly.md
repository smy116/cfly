# 基于 Cloudflare Workers 的极简短链接系统设计方案

基于 Cloudflare Workers 的极简短链接系统设计方案，名称为cfly。
对于同一短链接，可以配置外网、内网（可选）跳转url，根据浏览器对INTRANET_URL的响应自动探测是否处于内网环境。
对于不存在的短链接，展示友好的404页面

## 1 技术栈选型

| 组件     | 技术选型            | 说明                               |
| -------- | ------------------- | ---------------------------------- |
| 运行环境 | Cloudflare Workers  | 无服务器边缘计算，全球分发，低延迟 |
| 数据存储 | Cloudflare KV       | 键值存储，适合高频读场景           |
| 部署     | Cloudflare Git 集成 | 自动化部署工作流                   |
| 路由     | Hono                | 轻量级 Workers 框架                |

## 2 访问方式

支持两种方式访问短链接：

1. **路径模式**：`https://your-domain.com/abc123`
2. **子域名模式**：`https://abc123.your-domain.com`

## 3 配置项

配置项支持编辑 cf worker环境变量和直接编辑wrangler.toml两种方式配置。
| 变量 | 说明 |
| -------------- | ------------------------ |
| `DOMAIN` | 服务域名 |
| `KV_ID` | KV服务ID |
| `INTRANET_URL` | 内网环境探测URL（可选） |

## 4 数据管理方式

**不提供 API 管理接口**，直接通过以下方式管理 KV：

**Cloudflare Dashboard**：Workers → Settings → Variables → KV 命名空间

## 5. 期待部署步骤

1. **创建 Cloudflare 账户和 KV 命名空间**
2. **配置环境变量**
3. **进入 Cloudflare Dashboard → Workers & Pages → Create application → Connect to Git**
4. **选择仓库和分支，点击部署**
5. **通过 Cloudflare Dashboard 或 wrangler CLI 直接管理 KV 中的短链接**
