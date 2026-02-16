# 后端问题修复记录 (Backend Issues & Fixes)

本文档总结了从 Zig 0.15 迁移过程中遇到的编译错误到 Windows 平台特定的运行时崩溃问题，以及它们具体的解决方案。

## 1. 编译错误 (Compilation Errors) - Zig 0.15 适配

由于 Zig 语言正处于快速迭代中，0.15 版本引入了多项破坏性变更 (Breaking Changes)，导致原有代码无法编译。

### 1.1 `std.ArrayList` API 变更
*   **问题**：`std.ArrayList` 默认不再包含 `writer()` 方法。
*   **修复**：改用 `std.ArrayList(u8).init(allocator)` 并配合 `writer()` 使用，或直接使用更现代的 `std.io.Writer` 模式。

### 1.2 JSON 序列化变更 (`std.json.stringify`)
*   **问题**：`std.json.stringify` 函数被移除/重构。
*   **错误信息**：`use of undeclared identifier 'stringify'`
*   **修复**：
    *   旧代码：`std.json.stringify(value, options, writer)`
    *   新代码：`std.json.Stringify.value(value, options, writer)`

### 1.3 字符串格式化内存管理 (`std.fmt.format`)
*   **问题**：直接使用 `std.fmt.format` 输出到 buffer 在某些场景下类型不匹配。
*   **修复**：使用 `std.fmt.allocPrint(allocator, fmt, args)`，它会自动分配内存并返回 slice，更安全且符合新版 API 习惯。

### 1.4 IO Writer 类型不匹配
*   **问题**：`std.json.Stringify` 需要具体的 `*std.io.Writer` 类型，而不仅仅是 `GenericWriter`。
*   **修复**：使用了 `std.io.Writer.Allocating` 模式：
    ```zig
    var out: std.io.Writer.Allocating = .init(allocator);
    defer out.deinit();
    try std.json.Stringify.value(words, .{}, &out.writer);
    ```

### 1.5 可选值处理 (`orelse`)
*   **问题**：Zig 0.15 编译器变得更加严格，要求 `orelse` 块中如有未使用的返回值必须显式处理。
*   **错误信息**：`error: value of type 'usize' ignored`
*   **修复**：
    *   旧代码：`std.mem.indexOf(...) orelse return error.NoBody`
    *   新代码：使用 `blk` 标签明确返回值
    ```zig
    break :blk (std.mem.indexOf(u8, request, "\n\n") orelse return error.NoBody);
    ```

---

## 2. 运行时崩溃 (Runtime Crashes)

后端虽然编译通过，但在 Windows 环境下运行时出现了严重的稳定性问题。

### 2.1 `GetLastError(87)` - 无效参数错误
这是最棘手的问题，导致 API 请求时后端直接退出。

*   **现象**：
    *   前端或 `Invoke-WebRequest` 请求 `/api/words`。
    *   后端控制台打印 `error.Unexpected: GetLastError(87): 参数错误`。
    *   后端进程随即终止。

*   **原因分析**：
    *   Zig 标准库中的 `std.net.Stream.read` 在 Windows 上底层调用了 `ReadFile`。
    *   在特定 Socket 配置下（可能是非阻塞或重叠 I/O 模式），直接对 Socket 句柄使用 `ReadFile` 可能导致参数错误。
    *   标准库并未完全覆盖所有 Windows Socket 的各种边缘情况。

*   **修复方案**：
    *   放弃使用 `conn.stream.read`。
    *   改用更底层且专门针对 Socket 的 `std.posix.recv` (对应 Winsock 的 `recv`)。
    *   **代码变更**：
    ```zig
    // 替换前
    // const bytes_read = conn.stream.read(&buffer) catch 0;

    // 替换后 (src/main.zig)
    const bytes_read = std.posix.recv(conn.stream.handle, &buffer, 0) catch 0;
    ```

### 2.2 写入时崩溃
*   **风险**：如果客户端（浏览器）在服务器响应前断开连接，`stream.write` 会返回错误。如果使用 `try` 解包，错误会向上传播导致 `main` 函数退出，服务停止。
*   **修复**：
    *   将所有 `stream.write` 调用包裹在 `catch` 块中，忽略写入错误（因为客户端已经不在了，没必要崩掉服务器）。
    *   **代码变更**：
    ```zig
    // 替换前
    // try stream.write(response);

    // 替换后
    _ = stream.write(response) catch {};
    ```

---

## 3. 逻辑修复 (Logic Fixes)

### 3.1 语法结构丢失
*   **问题**：在修复过程中，曾意外删除了 `main.zig` 中处理 `POST` 和 `OPTIONS` 请求的 `else if` 块及闭合括号，导致 `expected expression` 编译错误。
*   **修复**：完整恢复了路由分发逻辑，确保 GET、POST、OPTIONS 和 404 均能正确处理。

---

## 总结
目前的后端版本 (`0.15.2` 适配版) 已经稳定。我们通过**升级 API 调用**解决了编译问题，通过**使用底层 Socket API** 解决了 Windows 特有的运行时崩溃，并通过**健壮的错误处理**防止了服务意外退出。
