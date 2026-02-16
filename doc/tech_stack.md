# 技术栈文档 (Tech Stack)

该项目是一个类似 Monkeytype 的日语单词记忆应用，前端不仅负责交互，还需要处理日语输入法逻辑。

## 后端 (Backend)

*   **语言**: [Zig](https://ziglang.org/)
    *   选用理由：高性能、内存安全、无GC延迟，适合构建高效的后端服务。
*   **Web 框架**: [Zap](https://github.com/zigzap/zap)
    *   选用理由：基于 microhttpd 的高性能 Zig Web 框架，轻量且快速。
*   **数据库**: [SQLite](https://www.sqlite.org/)
    *   选用理由：轻量级、无需服务器配置，适合单机部署和嵌入式场景，通过 Zig 的 SQLite 绑定进行操作。
    *   数据文件路径：`backend/data/db.sqlite`

## 前端 (Frontend)

*   **框架**: [React](https://react.dev/)
    *   生态丰富，组件化开发，适合构建复杂的交互界面。
*   **构建工具**: [Vite](https://vitejs.dev/)
    *   极速的开发服务器和构建工具，支持模块热替换 (HMR)。
*   **语言**: [TypeScript](https://www.typescriptlang.org/)
    *   提供静态类型检查，提高代码健壮性和可维护性。
*   **样式**: [TailwindCSS](https://tailwindcss.com/)
    *   原子化 CSS 框架，快速构建现代、响应式的用户界面，易于定制主题。
*   **日语输入处理**: [WanaKana](https://wanakana.com/) (预计使用)
    *   用于检测和转换罗马字 (Romaji) 到假名 (Kana)，处理日语输入逻辑。

## 部署与环境

*   **操作系统**: Windows (当前开发环境)
*   **包管理**: 
    *   前端: `npm` / `pnpm` / `yarn`
    *   后端: Zig Build System
