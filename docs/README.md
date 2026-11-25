# 项目文档目录

所有说明文档都统一放在 `docs/` 目录里管理，方便查找和更新。

## 文档列表

- [架构规范与开发指南](./architecture-spec.md)：说明技术选型、常用写法、如何用共享组件和组合函数快速写出新脚本
- [代码审计汇总](./audit/README.md)：记录之前排查出的工程打包、命名、性能和边界问题，以及对应的处理状态

## 常用命令

```bash
# 安装依赖
bun install

# 启动本地实时编译服务（端口 3000）
bun run dev

# 打包所有脚本到 dist/ 目录
bun run build

# 格式检查、代码检查和类型检查
bun run check
bunx tsc --noEmit
```
