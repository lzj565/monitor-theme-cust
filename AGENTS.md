# Release workflow

- 每次需求完成并通过验证后，递增 `theme.json` 的 patch 版本号。
- 使用新的版本号创建带注释的 Git tag，格式为 `v<version>`。
- 将完成需求的提交推送到 `origin/main`，并将对应 tag 推送到 `origin`。
- 除非用户明确要求不发布，否则上述版本更新、打 tag 和 push 视为完成需求的一部分。

# Commit message

- Git commit message 使用 `<type>：<中文说明>` 格式，类型保留英文并使用全角冒号。
- 示例：`fix：修复了首页卡片延迟颜色分档`。
