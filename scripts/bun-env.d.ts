// Bun 运行时给 import.meta 挂的非标准字段 (scripts/ 只在 Bun 下跑)。
// 声明合并进 ImportMeta 让 Next 的 tsc 全量类型检查通过, 不引入 bun-types 整包依赖。
interface ImportMeta {
  /** 当前模块所在目录的绝对路径 (Bun 专有)。 */
  readonly dir: string;
}
