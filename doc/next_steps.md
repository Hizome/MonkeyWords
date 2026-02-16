# 下一步计划 (Next Steps)

## 当前进度总结

| 模块 | 状态 | 说明 |
|------|------|------|
| 后端编译 | ✅ 完成 | Zig 0.15 API 变更已全部适配，`zig build` 通过 |
| 数据库 | ✅ 完成 | SQLite 初始化、种子数据、随机查询功能正常 |
| 前端编译 | ✅ 完成 | TailwindCSS v4 迁移完成，Vite 启动正常 |
| 前端页面 | ✅ 完成 | 深色主题、标题、布局已显示 |
| 后端 API 运行 | ❌ 待修复 | 启动成功但请求时崩溃 (`GetLastError(87)`) |
| 前后端联调 | ❌ 未开始 | 依赖后端 API 正常运行 |

---

## 第一阶段：修复后端运行时错误

### 1.1 修复 `GetLastError(87)` 崩溃

**问题**：后端在处理 HTTP 请求并通过 `std.net.Stream.write()` 发送响应时，在 Windows 上触发 `GetLastError(87)`（参数错误）导致进程崩溃。

**可能原因**：
- Zig 0.15 的 `std.net.Stream` 在 Windows 上使用 `WriteFile` API，可能在 socket 已被对端关闭后写入触发此错误
- HTTP 请求/响应的生命周期管理可能有问题（`Connection: close` 但对端先关闭了连接）

**修复方向**：
- [ ] 用 `catch` 捕获 `stream.write` 的错误而不是 `try`，允许写入失败的连接被静默忽略
- [ ] 确保在读取完整个请求后再发送响应
- [ ] 考虑增加 `Connection: keep-alive` 或延迟关闭逻辑
- [ ] 测试用 `stream.writeAll` vs `stream.write` 的行为差异

### 1.2 验证 API 端点

| 端点 | 方法 | 预期行为 |
|------|------|---------|
| `/api/words` | GET | 返回 10 个随机日语单词的 JSON 数组 |
| `/api/results` | POST | 接收打字结果 (wpm, accuracy, timestamp) |

- [ ] 用 `Invoke-WebRequest` 测试 GET `/api/words`，确认返回正确 JSON
- [ ] 用 `Invoke-WebRequest` 测试 POST `/api/results`，确认写入成功

---

## 第二阶段：前后端联调

### 2.1 确认前端能获取单词数据

- [ ] 启动后端 (`zig build run`)
- [ ] 启动前端 (`npm run dev`)
- [ ] 打开 `http://127.0.0.1:5173/`，确认单词列表显示
- [ ] 确认每个单词展示汉字(kanji)、假名(kana)、罗马字(romaji)

### 2.2 验证打字流程

- [ ] 输入罗马字，确认 WanaKana 自动转换为假名
- [ ] 输入正确假名后自动跳转到下一个单词
- [ ] 输入错误时字符显示红色
- [ ] 全部输入完毕后显示结果页 (WPM + Accuracy)

### 2.3 验证结果提交

- [ ] 打字完成后确认结果自动 POST 到后端
- [ ] 确认后端收到并正确处理结果数据

---

## 第三阶段：清理与完善

### 3.1 代码清理

- [ ] 删除 `tailwind.config.js`（已被 CSS `@theme` 替代，不再需要）
- [ ] 确认 `start.ps1` / `start.bat` 启动脚本正常工作
- [ ] 删除 `backend/stderr.txt` 和 `backend/stdout.txt` 调试文件
- [ ] 添加 `.gitignore` 条目（如有遗漏）

### 3.2 用户体验优化

- [ ] 加载单词时显示 loading 状态
- [ ] API 请求失败时显示友好错误信息（而非空白页）
- [ ] 添加 Escape 键重新开始的提示
- [ ] 考虑添加闪烁光标动画

### 3.3 功能增强（可选）

- [ ] 按 JLPT 等级筛选单词 (N5 ~ N1)
- [ ] 历史成绩记录与展示
- [ ] 更多单词数据（当前种子数据量待确认）
- [ ] 响应式布局适配移动端

---

## 快速启动命令

```powershell
# 一键启动（在项目根目录）
.\start.ps1

# 或分别启动
# 终端 1：后端
cd backend && zig build run

# 终端 2：前端
cd frontend && npm run dev
```

浏览器访问：**http://127.0.0.1:5173/**
