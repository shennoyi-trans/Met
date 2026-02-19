# Met 🪶

> 一款轻量级 Windows 桌宠软件，支持双人互动与跨桌面宠物派遣。

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![Status](https://img.shields.io/badge/status-In%20Development-yellow)
![Tech](https://img.shields.io/badge/built%20with-Tauri%20%2B%20Vue%203%20%2B%20PixiJS-brightgreen)

---

## 功能概览

- **画圈触发** — 在屏幕任意位置按住左键画圈，召唤互动
- **海鸥组件** — 画圈生成薯条，海鸥飞过来抢，抢完弹出功能面板
- **宠物派遣** — 把自己的桌宠送到好友桌面上，或把对方的带回来
- **待机动画** — 长时间不操作时宠物自动进入待机状态
- **双宠同屏** — 两只宠物在同一屏幕时会互动
- **可扩展** — 插件化宠物组件，后续可接入更多宠物和功能

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面端 | [Tauri 2](https://tauri.app)（Rust + WebView2） |
| 动画渲染 | [PixiJS 8](https://pixijs.com) |
| UI 框架 | Vue 3 + Pinia |
| 后端 | Node.js + Fastify + Socket.io |
| 数据库 | MySQL + Redis |

## 开发进度

- [x] Phase 1 — 透明窗口、画圈手势识别、海鸥动画、功能面板骨架
- [ ] Phase 2 — 账号登录、好友绑定
- [ ] Phase 3 — 宠物跨桌面派遣
- [ ] Phase 4 — 天文奇观查询、生日提醒、缓存清理等实用功能
- [ ] Phase 4.5 — WebRTC 远程同屏（实验性）

## 快速开始

环境要求：Windows 10/11、Node.js 20+、Rust 1.77+

```bash
git clone https://github.com/your-username/met.git
cd met
npm install
npm run tauri dev
```

详细环境配置和服务端部署说明见 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)。

## License

MIT
