# GitHub + Vercel + Turso 部署

## 环境隔离

建议创建两个独立的 Turso 数据库：生产保存个人数据，测试只放虚构数据。开发默认使用本地 SQLite。不要克隆含真实数据的生产库用作公开演示或外部 PR 预览。

生产和测试分别使用数据库级访问令牌、登录口令哈希和 Cookie 签名密钥。不要将 Turso 组织管理令牌放进应用。

## 1. 建立公开源码仓库

仅上传此项目的源码与文档，不复用旧项目的 Git 历史。先运行 `npm run check` 和 `git ls-files` 检查文件；确认没有真实数据、`.env.local`、`private/`、`.vercel/`、数据库、备份或日志。检查截图和文字中的个人信息。

Git 提交作者及邮箱也会公开；在首次提交前设置为你希望公开的名字和 GitHub 提供的 noreply 邮箱。README 中不要放个人站点地址、登录口令或私有控制台链接。

## 2. 创建 Turso 数据库

在 Turso 账户内创建独立生产与测试库，各自生成数据库令牌，妥善保存。令牌设置有效期，并在到期前轮换、重新部署及验证读写；撤销旧令牌前先验证新令牌。

数据库创建不会自动初始化表。本项目仅支持显式迁移，不在构建或普通请求中创建、清空数据库。

将当前目标库的 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN` 放在本地忽略的环境文件，或通过安全的运行环境注入。远程迁移还需要设置 `MIGRATION_TARGET=preview` 或 `production` 后执行 `npm run db:migrate`。不要把凭据写入 shell 命令、提交文件或公开 CI 日志。迁移完成后移除本地生产凭据。

迁移按文件名依次执行，带事务和校验和。已执行的迁移不能修改，应新增文件；更新前做离线备份。应用构建不调用迁移。

## 3. 创建 Vercel 项目

可以导入 GitHub 仓库，也可以在本目录使用 Vercel CLI。框架选择 Other；项目已配置 Build Command 为 `npm run build`，Output Directory 为 `dist`，Node.js 为 24。API 函数在项目根目录的 `api/`，不要只上传 `dist/`。

`vercel.json` 中 `git.deploymentEnabled=false` 禁止按 Git 推送自动部署。第一次导入仍可能创建部署；未配置认证时会关闭数据接口。之后使用 Vercel CLI 显式部署经验证的版本，避免依赖 Git 自动发布。

生产环境需要以下变量，均不要添加 `NEXT_PUBLIC_`、`VITE_` 等前端公开前缀：

| 变量 | 内容 |
| --- | --- |
| `APP_ORIGIN` | 最终访问地址的完整 HTTPS origin，不带末尾 `/` |
| `PLANNER_ENV` | `production` |
| `TURSO_DATABASE_URL` | 私有生产库地址 |
| `TURSO_AUTH_TOKEN` | 此数据库的访问令牌 |
| `PLANNER_PASSWORD_HASH` | 初始化工具生成的 scrypt 哈希 |
| `SESSION_SECRET` | 初始化工具生成的随机签名密钥 |

Preview 环境只能填写测试库、独立认证值，`PLANNER_ENV=preview`。固定使用一个可信预览地址作为 `APP_ORIGIN`，或在首次预览后按实际 origin 更新配置再部署。其他临时域名的写请求会被拒绝，这是来源保护的预期结果。

不要将生产变量复制到 Preview；不要在团队级变量中同时分配生产令牌。`PLANNER_ENV` 与 Vercel 注入的 `VERCEL_ENV` 不一致时，应用会拒绝服务。此保护无法识别“误把生产数据库令牌填写到测试变量”的情况，仍需检查两个库实际不同。

敏感值使用 Vercel 的敏感变量设置。公开 GitHub CI 只跑检查，不存生产密钥。不要使用会让不可信 PR 代码读取密钥的工作流。

## 4. 验证与发布

1. `npm ci --ignore-scripts` 与 `npm run check`。
2. 部署 Preview，使用虚构数据验证登录、保存、重载、跨设备冲突、导出和完整恢复。
3. 确认生产数据库已迁移，Production 变量齐全，站点地址与 `APP_ORIGIN` 一致。
4. 从选定稳定提交执行 Vercel CLI 的正式部署；保存提交号和部署地址。
5. 未登录请求 `/api/state` 应为 401；认证缺失应为 503，不能返回空白计划冒充成功。
6. 登录后用测试记录验证保存，再清理测试数据或恢复真实备份并核对。

Preview 测试通过不能代表已验证 Turso 线上连通、Vercel 函数打包和正式站点登录，这些需要在真实账户内分别验收。

## 稳定更新与回退

开发分支 → CI 检查 → 测试库预览 → 稳定标签 → 显式正式部署。生产可继续使用旧稳定版本，不必跟随 main 的每一次变动。

数据库变更采用先新增、后迁移、最后移除的兼容步骤；必要时旧版应用仍能运行。回退应用不自动回退数据库。删除字段或记录前必须有独立备份。

同库 `planner_history` 自动保留最近 30 次成功保存（含当前版本）。恢复时先导出当前状态，从历史表私下取出指定版本的 `data`，保存为本地 JSON，再通过应用“完整恢复备份”；这样继续沿用当前 revision 检查。禁止直接改小 revision 或删除表重建。

离线备份放在加密存储或密码管理器附件中，避免公开仓库、Issue、Actions artifacts。更新前和定期导出，至少进行一次完整恢复演练。

官方参考：[Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js)、[环境变量](https://vercel.com/docs/environment-variables)、[Turso TypeScript](https://docs.turso.tech/sdk/ts/quickstart)、[数据库令牌](https://docs.turso.tech/cli/db/tokens/create)。
