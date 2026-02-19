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

| 层     | 技术                                            |
| ----- | --------------------------------------------- |
| 桌面端   | [Tauri 2](https://tauri.app)（Rust + WebView2） |
| 动画渲染  | [PixiJS 8](https://pixijs.com)                |
| UI 框架 | Vue 3 + Pinia                                 |
| 后端    | Node.js + Fastify + Socket.io                 |
| 数据库   | MySQL + Redis                                 |

## 开发进度

- [x] Phase 1 — 透明窗口、画圈手势识别、海鸥动画、功能面板骨架
- [ ] Phase 2 — 账号登录、好友绑定
- [ ] Phase 3 — 宠物跨桌面派遣
- [ ] Phase 4 — 天文奇观查询、生日提醒、缓存清理等实用功能
- [ ] Phase 4.5 — WebRTC 远程同屏（实验性）

## 快速开始

环境要求：Windows 10/11、Node.js 20.19+、Rust 1.77+

```bash
git clone https://github.com/your-username/met.git
cd met
npm install
npm run tauri dev
```


Phase 1 & v0.1.1 特性简述：

一只简易的海鸥出现在屏幕左上角，进入待机状态，始终置顶。 待机状态下，海鸥可以按住左键拖动。

在屏幕任意位置按住左键画一个圈，松开后：

1. 屏幕上画圈的中心位置会出现一个薯条图形（红色盒子 + 黄色条 + 🍟 emoji）
2. 海鸥飞过去（easeInOut 插值，约 800ms，飞行时有翅膀扑动的旋转效果）
3. 到达后做啄食动画（上下啄约 1 秒）
4. 薯条消失，海鸥不消失，停留在原地，进入待机状态
5. 在海鸥身边渐入弹出功能面板（取决于海鸥的位置，默认从右侧弹出，如果在屏幕边缘则弹出在不受限的位置）：半透明毛玻璃卡片，完整列出天文奇观、生日提醒、清理缓存、派出宠物、设置五个按键，前四个显示为半透明禁用状态，只有"设置"可以点击（点击目前只打印 log，无实际功能）
6. 用户鼠标悬停在海鸥上时功能面板不关闭，鼠标移开海鸥三秒后渐出关闭功能面板，三秒内移回鼠标则重新开始计时。

## License

MIT
