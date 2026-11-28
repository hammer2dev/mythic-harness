# Provider 配置字段

数据校验层定义模板、个人配置和模型规则的字段。解析器负责合并配置，Personal repository 负责持久化。

- 模型设置创建的模板实例使用 `inheritTemplateModels: false`。模板提供连接配置和模型能力建议，实例成员取自用户保存的 `personalModelIds`。
- 省略 `inheritTemplateModels` 的模板实例沿用模板成员。固定账号的成员由内置和账号事实解析。
- 连接保存沿用现有成员配置。添加、移除和排序通过已有的模型操作提交。
