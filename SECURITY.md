# Security Policy (安全策略)

## 支持的版本 (Supported Versions)

| 版本 | 支持状态 |
|---|---|
| `1.0.x` (`main`) | ✅ 支持 |

## 报告安全漏洞 (Reporting a Vulnerability)

如果您在本项目中发现了潜在的安全漏洞（例如 DOM XSS、依赖链高危漏洞或构建工作流权限问题），请通过以下方式联系维护者：

1. **报告通道**：请在 GitHub 仓库的 [**Security → Report a vulnerability**](https://github.com/ChingYung717/moonsun/security/advisories/new) 页面提交私密安全报告（Private Vulnerability Reporting 已启用）。
2. 请附上复现步骤、受影响的文件/URL 参数及最小复现载荷（PoC）。
3. 维护者将在收到报告后尽快确认并发布修复提交。

## 静态托管与 CSP 说明 (Static Hosting & CSP Notes)

- `index.html` 通过 `<meta http-equiv="Content-Security-Policy">` 启用了针对脚本、样式、图片与连接源的精细化 CSP 限制（`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`）。
- 根据 W3C CSP 规范，`frame-ancestors` 指令在 `<meta>` 标签中无效，且 GitHub Pages 不支持自定义 HTTP 响应头；本项目作为无登录态、无跨站写操作凭据的纯前端科普可视化应用，不在 `<meta>` 中写入无效的 `frame-ancestors`，也不使用客户端跳出 `iframe` 脚本代替响应头策略。若在自有反向代理或 CDN（如 Nginx / Cloudflare）下部署且明确需要限制嵌套，请在服务端响应头中配置 `Content-Security-Policy: frame-ancestors 'self'`。

