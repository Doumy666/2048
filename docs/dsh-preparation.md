# DSH-action 本地准备记录

日期：2026-10-29（Asia/Shanghai）

## 工作范围

独立克隆 Doumy666/2048，基线提交 478b6ec346e3787f589e4af751378d06ded4cbbc。
本地分支：chore/dsh-local-preparation。
只新增工作流、验证脚本、基础行为测试、package.json 和本记录。
未修改任何已有受 Git 跟踪文件；未实现 Undo；未提交、推送、发评论、创建 PR 或触发 Actions。
AIC 视频目录及其他项目未修改。

## 版本核验

已阅读当前官方文档：
- https://github.com/Lixiaoyiao/DSH-action/blob/main/docs/setup.md
- https://github.com/Lixiaoyiao/DSH-action/blob/main/examples/commands.yml

GitHub API 确认 v0.12.2 是正式发布（draft=false、prerelease=false）。
附注标签对象 88c18f2229ead1c96f9458057ede5dc30a6686c3 解引用至
23a998ccd209f5422f220f038234a89984f0471c；工作流使用此完整提交。
该标签无签名，核验依据为官方 API 标签对象、正式 Release 和安装文档交叉一致。
额外读取固定提交的 action.yml 和 docs/configuration.md，核对输入与验证规则。
DSH 运行时固定 0.2.1-rc.2；Docker 镜像采用该正式 Action 的默认摘要固定镜像。

## 工作流

仅监听新建 issue_comment，不监听 push、PR 或 workflow_dispatch。
仅允许 Doumy666/2048 的普通 Issue、Doumy666 用户、含 @dsh 的评论进入作业。
这只是路由过滤；保留 Action 自身的实时 actor 写权限、事件、来源、SHA、
保护路径和发布前验证检查。显式命令由 Action 解析；自然语言写入关闭。
allowed-actors=Doumy666；dsh-mode=controlled；isolation=docker；
permission-profile=standard；allow-write=true；run-tests=true；
validation-integrity=strict。
checkout 从可信默认分支读取，固定 Action 提交，persist-credentials=false。
GitHub token 使用 Action 的 Controller-only 默认值。
DEEPSEEK_API_KEY 仅通过 secrets 表达式交给 Action 输入，无实际密钥读取或写入。
验证和 worker 凭据隔离沿用固定版本 Controller 实现。
contents/issues/pull-requests 为 write；checks/actions 为 read。
按 Issue 串行运行；不取消已有任务；作业 45 分钟，Action 35 分钟。

实际 test-commands：
    [["node","scripts/check-syntax.cjs"],["node","--test"]]

没有安装步骤、网络或第三方测试依赖，没有占位成功/失败命令。
Node 内置测试自动发现 tests 下测试，便于后续任务增加 Undo 测试。
本地便利入口：npm run validate。环境要求 Node.js 24+，无需 npm install。

## 本地验证结果

本地 Node.js v24.20.0：
- YAML 解析成功；所有 Action 输入名称均存在于固定版本 action.yml。
- 检查触发器、可信 checkout、权限相关输入、版本、镜像摘要和超时关系通过。
- 从 YAML 中解析并逐项实际执行 test-commands：全部通过。
- 12 个 JavaScript 文件语法检查通过。
- 13 项行为测试通过，0 失败、0 跳过。
- 临时独立副本注入计分缺陷后，测试退出码 1。
- 临时独立副本注入 JavaScript 语法错误后，语法检查退出码 1。
- git diff HEAD 对所有已有跟踪文件为空。

测试加载真实 Tile、Grid、GameManager，替换浏览器输入、显示和持久化接口，
用确定性随机值保证可复现；没有复制或替换游戏移动/合并逻辑。
覆盖初始棋盘、四方向移动、每次有效移动生成一个方块、合并/防止重复合并、
计分/最高分、无效移动、胜利/继续游戏、终局判断、状态恢复和重新开始。

## 尚存限制及下一阶段

1. 本轮没有运行 DSH 模型或 GitHub Actions。Secret 的有效性、额度、在线权限、
   仓库允许 GitHub Actions 创建 PR 的设置和分支规则尚未验证。
2. 本机未找到 Docker CLI；没有实际拉取或运行所选镜像。
   本地 Node 24.20.0 与镜像 Node 24.18.0 的补丁版本不同。
3. 完成的是本地 YAML/输入及安全属性检查，不是官方 npm run check:config。
   官方源码克隆连接超时，已改用固定提交原始文档和 action.yml 核验。
4. 基础测试验证真实游戏逻辑，但浏览器 DOM、键盘/触摸和真实 localStorage
   尚未做端到端验证。Undo 的按钮、有效/无效移动记录、分数与棋盘恢复、
   单步限制和新游戏清理必须由后续真实任务实现并补测。
5. 严格完整性检查保留；如果后续任务弱化测试，会被拒绝，应修复而非关闭它。
6. 本地配置未提交。后续获得用户单独确认后再审查并推送至默认分支；
   工作流需要位于默认分支才能响应 Issue 评论。
   推送配置与发送实现指令是后续明确授权动作，本轮不执行。
