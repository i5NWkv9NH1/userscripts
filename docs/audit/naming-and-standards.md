# 命名规范与状态一致性检查

## 1. 结论

整体代码格式较规整，但在状态布尔值方向、存储键名前缀、入口命名和存储结构兼容性上存在 4 个不一致的地方：

1. **面板展开状态命名反了**：`aistudio` 和 `playground` 用 `collapsed`（真表示收起），`lens` 用 `panelOpen`（真表示打开）。
2. **存储键名和模块标识不统一**：`lens` 业务设置用 `lens.*`，位置和快捷键却传入 `sora-lens`。
3. **入口类名和自定义标签命名不统一**：`SoraLensController` (`s-lens-controller`) 与 `AIStudioApp` (`s-aistudio-app`)、`PlaygroundApp` (`s-playground-app`) 风格不一致。
4. **本地存储读取缺少默认值合并**：脚本升级新增配置字段后，读取用户旧版本保存的对象会导致新字段变成 `undefined`。

## 2. 改进方向

1. **统一使用正向状态名**：全部站点统一用共享壳管理展开与收起，或者统一采用 `expanded`（真表示展开，假表示收起成小胶囊）。
2. **统一模块标识与存储键名**：`peek`、`aistudio`、`playground` 各自保持固定模块 ID，位置、快捷键和业务设置前缀全部统一。
3. **统一入口命名**：站点主类统一为 `<Site>App`（如 `PeekApp`、`AIStudioApp`、`PlaygroundApp`），标签名统一为 `s-<site>-app`。
4. **存储对象合并默认值**：在 `useStorage` 读取普通对象时，和 `initialValue` 做字段合并，确保新增配置项总有默认初始值。
