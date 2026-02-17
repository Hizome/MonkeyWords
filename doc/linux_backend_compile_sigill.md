# Linux 后端编译崩溃记录（Zig 0.15.2）

## 问题概述

在 Linux 环境下执行后端默认构建命令：

```bash
cd backend
zig build
```

构建失败，`zig build` 仅显示：

- `compile exe backend Debug native failure`
- `the following command terminated unexpectedly`

进一步直接执行底层 `zig build-exe` 命令后，得到明确错误：

- `Illegal instruction (core dumped)`
- 进程退出码 `132`（`SIGILL`）

说明这是编译器在编译阶段异常退出，而不是业务代码运行时错误。

## 关键信号

- 同一台机器下：
  - `zig build`（默认 `Debug`）失败
  - `zig build -Doptimize=ReleaseSafe` 成功
  - `zig build -Doptimize=ReleaseFast` 成功
  - `zig build -Doptimize=ReleaseSmall` 成功
- 问题集中在 `Debug` 编译路径。

## 最小化定位过程

逐步缩小后发现，触发点与 `zig-sqlite` 的编译期 SQL 分析路径有关：

- 使用 `db.exec(comptime query, ...)` 和 `db.prepare(comptime query)` 的代码路径会触发该问题。
- 改为动态语句路径后可规避：
  - `db.execDynamic(query, ...)`
  - `db.prepareDynamic(query)`

## 已落地修复

文件：`backend/src/db.zig`

变更策略：

- 将数据库初始化、seed、查询与插入逻辑中所有 `db.exec(...)` 改为 `db.execDynamic(...)`
- 将 `db.prepare(...)` 改为 `db.prepareDynamic(...)`

## 验证结果

修复后在 Linux 上验证通过：

```bash
cd backend
zig build
zig build test
```

两条命令均成功。

## 结论

该问题符合“代码触发编译器缺陷”的特征，非编译环境配置错误。  
当前采用动态 SQL API 作为稳定规避方案，保证 Linux 下 `Debug` 编译可用。

