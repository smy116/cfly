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

/** 解析 KV value，返回 { internal, external } 或 { url } */
function parseValue(raw) {
  if (!raw) return null

  // 尝试 JSON 解析
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw)
      if (obj.i && obj.e) {
        return { internal: obj.i, external: obj.e }
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

/** 404 页面 */
function generate404Page() {
  return `<!DOCTYPE html>
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
.msg{font-size:.9rem;color:#86868b;transition:all .3s}
.links{margin-top:1.5rem;display:flex;gap:.6rem;justify-content:center}
.links a{padding:.4rem 1rem;border-radius:6px;font-size:.8rem;
  text-decoration:none;color:#007aff;border:1px solid #e5e5ea;
  transition:all .2s}
.links a:hover{background:#f0f0f5}
.links.highlight a{padding:.55rem 1.3rem;font-size:.9rem;font-weight:500}
.links.highlight a.int{background:#007aff;color:#fff;border-color:#007aff}
.links.highlight a.int:hover{background:#0060cc}
.hint{margin-top:.8rem;font-size:.75rem;color:#aeaeb2;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="spinner" id="sp"></div>
  <div class="msg" id="msg">正在检测网络环境</div>
  <div class="links" id="links">
    <a class="int" href="${internalUrl}">内网访问</a>
    <a class="ext" href="${externalUrl}">外网访问</a>
  </div>
  <div class="hint" id="hint">如浏览器弹出权限提示，请点击"允许"后等待自动跳转</div>
</div>
<script>
(function(){
  var done = false;
  var TIMEOUT = 3000;
  var MIN_RESPONSE = 200; // onerror 在此时间内触发视为浏览器拦截，非真实网络响应
  var internalUrl = ${JSON.stringify(internalUrl)};
  var externalUrl = ${JSON.stringify(externalUrl)};

  function go(url) {
    if (done) return;
    done = true;
    location.replace(url);
  }

  function showManual() {
    if (done) return;
    document.getElementById('sp').style.display = 'none';
    document.getElementById('msg').textContent = '请选择网络环境';
    document.getElementById('links').classList.add('highlight');
    document.getElementById('hint').style.display = 'block';
  }

  var start = Date.now();
  var img = new Image();
  img.onload = function() { go(internalUrl); };
  img.onerror = function() {
    var elapsed = Date.now() - start;
    if (elapsed >= MIN_RESPONSE) {
      // onerror 有明显延迟 → TCP 可达但返回非图片/证书错误 → 内网
      go(internalUrl);
    }
    // 瞬间触发 → 浏览器策略拦截，不跳转，等超时后显示手动选择
  };
  img.src = ${JSON.stringify(intranetUrl + '/favicon.ico')} + '?_t=' + Date.now();

  // 超时后显示手动选择（探测仍继续，允许弹窗后自动跳转）
  setTimeout(showManual, TIMEOUT);
})();
</script>
</body>
</html>`
}

// ─── 路由 ───

app.get('*', async (c) => {
  const slug = getSlug(c)

  // 忽略空路径和 favicon
  if (!slug || slug === 'favicon.ico') {
    return c.html(generate404Page(), 404)
  }

  // 查询 KV
  const raw = await c.env.LINKS.get(slug)
  if (!raw) {
    return c.html(generate404Page(), 404)
  }

  const parsed = parseValue(raw)

  // 纯 URL → 302 跳转
  if (parsed.url) {
    return c.redirect(parsed.url, 302)
  }

  // JSON（内外网） → 检查是否配置了 INTRANET_URL
  const intranetUrl = c.env.INTRANET_URL
  if (!intranetUrl) {
    // 没有配置内网探测地址，直接跳外网
    return c.redirect(parsed.external, 302)
  }

  // 返回探测页面
  return c.html(generateDetectPage(parsed.internal, parsed.external, intranetUrl))
})

export default app
