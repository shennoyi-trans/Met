// input_inject.rs
// 远程输入注入模块 —— Phase 3+ 实现
//
// 届时通过 WebRTC DataChannel 接收对方的输入事件
// 并用 enigo crate 将其注入本地系统
//
// 接口设计：
//   pub fn inject(event: RemoteInputEvent) -> Result<(), InjectionError>
//
// 支持的事件类型（预留）：
//   - MouseMove { x, y }
//   - MouseClick { button, pressed }
//   - KeyEvent { key, pressed }
//   - Scroll { delta_x, delta_y }

// Phase 1 留空，接口已在 lib.rs 通过 Tauri command 占位暴露
