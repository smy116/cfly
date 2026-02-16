import { Hono } from 'hono'

const app = new Hono()

// ─── 工具函数 ───

/** 从请求中提取 slug（子域名模式或路径模式） */
function getSlug(c) {
  const domain = c.env.DOMAIN
  const url = new URL(c.req.url)
  const hostname = url.hostname

  // 子域名模式: abc.domain.com → slug = "abc"
  if (hostname !== domain && hostname.endsWith('.' + domain)) {
    return hostname.slice(0, -(domain.length + 1))
  }

  // 路径模式: domain.com/abc → slug = "abc"
  const path = url.pathname.slice(1) // 去掉开头的 /
  return path
}

/** 校验 slug 格式：仅允许字母/数字/下划线/连字符，最长 64 字符 */
function isValidSlug(slug) {
  return slug.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(slug)
}

/** 校验字符串是否为合法 URL */
function isValidUrl(str) {
  try { new URL(str); return true } catch { return false }
}

/**
 * 解析 KV value，返回统一结构：
 *   { url?, internal?, external?, pwd?, exp? }
 *
 * 支持格式：
 *   纯 URL       → "https://..."
 *   内外网 JSON  → {"i":"...","e":"..."}
 *   带过期       → {"url":"...","exp":1700000000}
 *   带密码       → {"url":"...","pwd":"abc123"}
 *   综合         → {"i":"...","e":"...","pwd":"x","exp":...}
 */
function parseValue(raw) {
  if (!raw) return null

  // 尝试 JSON 解析
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw)
      const result = {}

      // 内外网模式
      if (obj.i && obj.e) {
        result.internal = obj.i
        result.external = obj.e
      }
      // 纯 URL 字段
      if (obj.url) {
        result.url = obj.url
      }
      // 可选：密码
      if (obj.pwd) {
        result.pwd = obj.pwd
      }
      // 可选：过期时间（秒级时间戳）
      if (obj.exp) {
        result.exp = obj.exp
      }

      // 至少要有一个跳转目标
      if (result.url || result.internal) {
        return result
      }
    } catch { }
  }

  // 纯 URL
  return { url: raw }
}

// ─── 页面生成 ───

const BASE_STYLE = `
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f}
.card{text-align:center;padding:2.5rem 3rem;border-radius:1rem;
  background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.08);animation:fadeIn .4s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
`

/** 404 页面（预生成，避免每次请求重复构建） */
const PAGE_404 = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404</title>
<style>
${BASE_STYLE}
.code{font-size:6rem;font-weight:200;letter-spacing:.3rem;line-height:1;color:#d1d1d6}
.msg{margin-top:.8rem;font-size:.9rem;color:#86868b;font-weight:400}
.line{width:32px;height:2px;margin:1.2rem auto 0;background:#d1d1d6;border-radius:1px}
</style>
</head>
<body>
<div class="card">
  <div class="code">404</div>
  <div class="msg">链接不存在</div>
  <div class="line"></div>
</div>
</body>
</html>`

/** 密码输入页面 */
function generatePasswordPage(slug, error) {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>需要密码</title>
<style>
${BASE_STYLE}
.icon{font-size:2.5rem;margin-bottom:.8rem}
.msg{font-size:.9rem;color:#86868b;margin-bottom:1.2rem}
.err{font-size:.8rem;color:#ff3b30;margin-bottom:.8rem}
form{display:flex;gap:.5rem;justify-content:center}
input{padding:.5rem .8rem;border:1px solid #e5e5ea;border-radius:8px;font-size:.85rem;
  outline:none;transition:border-color .2s;width:140px;text-align:center}
input:focus{border-color:#007aff}
button{padding:.5rem 1rem;border:none;border-radius:8px;font-size:.85rem;
  background:#007aff;color:#fff;cursor:pointer;transition:background .2s}
button:hover{background:#0056d6}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🔒</div>
  <div class="msg">此链接需要密码访问</div>
  ${error ? '<div class="err">密码错误，请重试</div>' : ''}
  <form method="POST">
    <input type="password" name="p" placeholder="输入密码" autofocus required>
    <button type="submit">确认</button>
  </form>
</div>
</body>
</html>`
}

/** <img> 标签内网探测页面 */
function generateDetectPage(internalUrl, externalUrl, intranetUrl) {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>跳转中...</title>
<style>
${BASE_STYLE}
.spinner{width:28px;height:28px;border:2.5px solid #e5e5ea;border-top-color:#007aff;
  border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 1.2rem}
@keyframes spin{to{transform:rotate(360deg)}}
.msg{font-size:.9rem;color:#86868b}
.links{margin-top:1.5rem;display:flex;gap:.6rem;justify-content:center}
.links a{padding:.4rem 1rem;border-radius:6px;font-size:.8rem;
  text-decoration:none;color:#007aff;border:1px solid #e5e5ea;
  transition:background .2s}
.links a:hover{background:#f0f0f5}
</style>
</head>
<body>
<div class="card">
  <div class="spinner"></div>
  <div class="msg">正在检测网络环境</div>
  <div class="links">
    <a href="${internalUrl}">内网访问</a>
    <a href="${externalUrl}">外网访问</a>
  </div>
</div>
<script>
(function(){
  var done = false;
  var internalUrl = ${JSON.stringify(internalUrl)};
  var externalUrl = ${JSON.stringify(externalUrl)};

  function go(url) {
    if (done) return;
    done = true;
    location.replace(url);
  }

  var start = Date.now();
  var img = new Image();
  img.onload = function() { go(internalUrl); };
  img.onerror = function() {
    // 200ms 内触发 = 浏览器策略拦截，忽略；有延迟 = 真实网络响应（证书错误等）→ 内网
    if (Date.now() - start >= 200) go(internalUrl);
  };
  img.src = ${JSON.stringify(intranetUrl + '/favicon.ico')} + '?_t=' + Date.now();

  // 3 秒超时 → 跳外网
  setTimeout(function() { go(externalUrl); }, 3000);
})();
</script>
</body>
</html>`
}

// ─── 中间件 ───

/** 安全响应头 */
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
})

// ─── 公共逻辑 ───

/** 查询并校验 slug 对应的链接，返回 { slug, parsed } 或直接返回错误 Response */
async function resolveSlug(c) {
  const slug = getSlug(c)

  if (slug === 'favicon.ico') return { response: new Response(null, { status: 204 }) }
  if (!slug) return { response: c.html(PAGE_404, 404) }
  if (!isValidSlug(slug)) return { response: c.html(PAGE_404, 404) }

  const raw = await c.env.LINKS.get(slug, { cacheTtl: 3600 })
  if (!raw) return { response: c.html(PAGE_404, 404) }

  const parsed = parseValue(raw)
  if (!parsed) return { response: c.html(PAGE_404, 404) }

  if (parsed.exp && Date.now() / 1000 > parsed.exp) return { response: c.html(PAGE_404, 404) }

  return { slug, parsed }
}

/** 根据 parsed 结果执行跳转 */
function handleRedirect(c, parsed) {
  // 纯 URL → 302 跳转
  if (parsed.url) {
    if (!isValidUrl(parsed.url)) return c.html(PAGE_404, 404)
    return c.redirect(parsed.url, 302)
  }

  // 内外网模式 → 验证 URL 合法性
  if (!isValidUrl(parsed.internal) || !isValidUrl(parsed.external)) {
    return c.html(PAGE_404, 404)
  }

  // 检查是否配置了 INTRANET_URL
  const intranetUrl = c.env.INTRANET_URL
  if (!intranetUrl) {
    return c.redirect(parsed.external, 302)
  }

  return c.html(generateDetectPage(parsed.internal, parsed.external, intranetUrl))
}

// ─── 路由 ───

/** GET：展示页面 / 无密码直接跳转 */
app.get('*', async (c) => {
  const result = await resolveSlug(c)
  if (result.response) return result.response
  const { slug, parsed } = result

  // 有密码 → 显示密码输入页
  if (parsed.pwd) {
    return c.html(generatePasswordPage(slug, false))
  }

  return handleRedirect(c, parsed)
})

/** POST：密码验证 */
app.post('*', async (c) => {
  const result = await resolveSlug(c)
  if (result.response) return result.response
  const { slug, parsed } = result

  if (!parsed.pwd) {
    return handleRedirect(c, parsed)
  }

  // 从 POST body 读取密码
  const body = await c.req.parseBody()
  const inputPwd = body['p']
  if (inputPwd !== parsed.pwd) {
    return c.html(generatePasswordPage(slug, true), 403)
  }

  return handleRedirect(c, parsed)
})

export default app
