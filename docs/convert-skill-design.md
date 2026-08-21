# Convert Skill Design

本文记录 `convert` Skill grilling 期间已经确认的工作流契约。下列条款已对齐；**在用户确认已经形成共享理解前，不开始实现。**

## Product shape

- 保留现有 `apps/convert` Web/API 服务。
- 新增一个独立的 Codex `convert` Skill，而不是 Web 服务的自然语言客户端。
- Skill 不调用或依赖 Web API、SQLite、任务队列或常驻进程。
- Skill 可研究和移植 `packages/convert-core` 及现有 `epub2md-cli` Skill 中已经验证的算法与防护，但安装后不要求 Open Pod 仓库存在，也不在运行时导入 workspace package 或调用另一个 Skill 的私有脚本。

## Skill source and installation

- 正式 Skill 名称为 `convert-documents-to-markdown`；不使用过于宽泛的 `convert`。
- 仓库内 Skill 目录是唯一真源：`/home/admin1/myspace/open-pod/skill/convert-documents-to-markdown/`。
- 本机通过 `/home/admin1/.agents/skills/convert-documents-to-markdown` 符号链接发现该 Skill。
- 不在全局 Skill 目录维护第二份复制版本。
- Skill 源码目录不存放运行时转换产物。
- 仓库目录、符号链接和 frontmatter `name` 保持一致。

## Trigger routing

- 普通的 PDF/EPUB 转 Markdown、批量转换、标准产物包、MinerU、失败恢复和结构验收使用 `convert-documents-to-markdown`。
- 未附加特殊要求的 EPUB 转 Markdown **一律**由 `convert-documents-to-markdown` 处理。
- `epub2md-cli` **仅在用户显式调用时**使用：用户点名 `epub2md` / `epub2md-cli`，或明确要求 raw `epub2md` CLI、metadata/structure/sections/unzip 等专项检查，且明确不要标准转换产物包。
- 仅提到「把 EPUB 转成 Markdown / 导出章节」但未点名 `epub2md` 时，**不得**路由到 `epub2md-cli`。
- 实现时同步收窄 `epub2md-cli` 的 frontmatter description（只保留显式调用与专项 inspect），不改变其脚本和专项能力。

## Script runtime

- 确定性脚本统一使用原生 Node.js ESM (`.mjs`)，要求 Node.js 20 或更高版本。
- Skill 自带独立 `package.json`，只声明必要依赖（如 `epub2md`、`jszip`、`pdf-lib`、`undici`）。
- 不引用仓库根 `node_modules`、pnpm workspace 或编译产物。
- 使用 `node --test` 编写脚本测试。
- 安装检查和依赖安装只作用于 Skill 目录，不修改用户项目依赖。

## Dependency installation

- 提供 `scripts/ensure-deps.mjs`：检查 Skill 目录下 `node_modules` 与关键模块是否可用。
- 首次实际转换前，Agent 自动在 Skill 目录执行 `npm install`；失败则停止并报告，不静默降级。
- `SKILL.md` 可说明用户也可先手动在 Skill 目录执行 `npm install`。
- 不把 Skill 依赖装进用户项目；不使用全局 `npm i -g` 安装 Skill 运行时依赖。
- `epub2md` 从 Skill 本地 `node_modules` 解析（与 convert-core 的解析策略一致）。
- v1 环境范围：Node.js ≥ 20 的本机开发环境（当前以 Linux 为主）；不承诺 Windows 路径/代理 quirks，也不提供离线 vendor 包。
- 不把 `node_modules` 提交进仓库；本机通过符号链接使用的 Skill 目录内安装依赖即可。

## Supported inputs

- v1 仅支持 PDF 与 EPUB。
- 一次调用可以接收一个或多个源文件；多文件输入逐文件展开为独立 Skill 转换任务。
- 每个文件拥有自己的状态、清单和归档；单个失败不影响同批次的其它任务。
- 批量转换不自动合并不同源文档的内容或产物包。
- EPUB 使用本地 `epub2md` 工具链。
- PDF 仅使用 MinerU 在线 API v4，不自动切换本地 MinerU、其它 OCR、文本提取或 LLM 视觉引擎。

## Runtime storage

- 转换服务与 Skill 共用 `OPEN_POD_CONVERT_DATA_DIR`，默认 `~/.open-pod-convert`。
- Web 服务独占并管理 `jobs/`。
- Skill 独占并管理 `skill-jobs/`；双方不得清理、接管或恢复对方的任务。
- 每个 Skill 任务写入 `skill-jobs/<jobId>/`：

```text
skill-jobs/<jobId>/
├── input/                 # 原始 PDF/EPUB
├── work/                  # 中间文件与日志
├── output/
│   ├── markdown/
│   │   ├── full.md
│   │   └── parts/*.md
│   ├── images/
│   └── manifest.json
└── result.zip
```

- Skill 定义文件不进入运行时数据根。

## Job identity and overwrite behavior

- 每次用户主动发起转换都生成新的 `jobId`，即使源路径或文件内容与历史任务相同。
- 原始源文件复制到任务的 `input/` 中，作为该任务的输入快照。
- 新任务不得静默覆盖已有任务或原始转换产物。
- 自动恢复或失败步骤重试保留原 `jobId`。
- 用户主动重新转换创建新任务。
- 继续或恢复历史任务时必须显式指定旧 `jobId`。

## Output behavior

- 用户没有指定输出形态时，PDF 与 EPUB 都默认采用 split。
- `markdown/parts/*.md` 是 split 的权威正文结果。
- `markdown/full.md` 由分片按顺序拼接生成，是便利产物，不等同于 EPUB 原生 merge。
- 只有用户明确要求 merge 或 both 时，才执行对应的 EPUB 原生输出模式。
- 默认成功边界止于原始转换产物包。
- 不默认删除目录、版权页、空章节或疑似噪声，不默认合并章节，也不使用 LLM 改写正文。
- 用户明确要求清理或重组时，将其作为独立后处理，并写入新的目录；不得覆盖原始 `output/`。

## PDF behavior

- 本地读取 PDF 页数。
- 用户显式指定 OCR 时服从；未指定时用本地解析器抽样检测文本层。
- 稳定文本层使用 `isOcr=false`，图片型或近乎无文本层使用 `isOcr=true`；灰区在提交 MinerU 前询问用户。
- OCR 检测依据、最终选择和用户覆盖情况写入 manifest。
- 超过 MinerU 单请求范围时分段提交；当前参考实现以 200 页为上限。
- 分别轮询和保存每个解析页段。
- 失败页段可重试。
- 部分成功时保留成功内容，并为缺失范围插入显式占位。
- 收集图片并受资产体积上限保护。

## Retry boundary

- 查询状态和下载结果等只读操作遇到临时网络错误时，使用退避策略自动重试，默认最多 3 次。
- MinerU 明确返回解析失败时，不自动重新提交页段。
- 提交请求结果不确定时，不切换线路或盲目重放，以避免重复创建远端任务和重复计费。
- 需要重新提交的失败页段保留在原 `jobId` 中；Skill 报告原因，并在用户明确同意后重试。

## Proxy selection

在任何 MinerU 提交前按以下顺序确定网络线路：

1. `OPEN_POD_CONVERT_SKILL_PROXY_URL`
2. `HTTPS_PROXY` / `HTTP_PROXY`
3. 无代理配置时执行无副作用的直连预检
4. 直连预检失败时探测并尝试 `http://127.0.0.1:7897`

一旦开始提交某个任务，该任务固定使用已经选定的线路；不得因中途错误切换代理并盲目重新提交。

## Cancellation

- 收到取消后停止提交新的页段，并中止当前本地上传、轮询或下载请求。
- 已提交到 MinerU 的任务可能继续运行；Skill 不得承诺远端已经取消或费用已经撤销。
- 保留已完成页段、中间文件和日志。
- 任务标记为 `cancelled`，不包装为成功产物。
- 后续必须显式指定该 `jobId` 恢复，或创建新的转换任务。

## Timeout

- 不设置整批任务的固定总超时。
- 每个 MinerU 解析页段默认最多等待 30 分钟；用户可覆盖该值。
- 页段超时记录远端标识、页段范围和进度，并按失败页段处理。
- 页段超时不自动重新提交；后续遵循显式重试规则。
- EPUB 本地转换不使用 MinerU 页段超时，只受进程取消控制。

## MinerU credential lookup

按以下顺序读取，命中后停止：

1. `OPEN_POD_CONVERT_SKILL_MINERU_TOKEN`
2. `OPEN_POD_CONVERT_MINERU_TOKEN`
3. `$OPEN_POD_CONVERT_DATA_DIR/secrets.json` 中的 `mineruApiToken`

Token 不得写入任务日志、`manifest.json`、任务目录或 `result.zip`。v1 不新增 `skill-config.json`。

## Manifest contract

- Skill 清单是现有转换服务清单的兼容超集。
- 保留已有字段及语义，并增加 `schemaVersion` 与 `producer: "convert-skill"`。
- 可增加源文件摘要、尝试次数等 Skill 流程字段。
- 不写绝对本地路径、Token 或代理凭据。
- 只做向后兼容的字段增加；破坏性变更提升 `schemaVersion`。

## Completion validation

- 每次转换默认执行结构验收，验收通过后才报告成功。
- 检查 `manifest.json`、`markdown/full.md`、`markdown/parts/` 和 `result.zip` 是否存在且可读。
- 检查分片顺序、文件名安全性、图片引用，以及 manifest 与实际分片的一致性。
- PDF 检查失败页段、缺失占位和 `partial` 状态的一致性；EPUB 至少要有一个有效 Markdown 产物。
- 验收失败时标记失败或部分成功并保留现场。
- 结构验收不判断章节语义质量，也不自动改写正文。

## Completion reporting

### 成功 (`succeeded`)

向用户报告：

- `jobId`
- 源文件名与类型
- 状态：`succeeded`
- 输出根路径：`$OPEN_POD_CONVERT_DATA_DIR/skill-jobs/<jobId>/`
- 关键产物路径：`output/markdown/parts/`、`output/markdown/full.md`、`result.zip`
- 分片数量；PDF 可附页数
- 若有 warnings（资产截断、单分片回退等）：逐条列出，不伪装成错误

### 部分成功 (`partial`)

- 明确标为**部分成功**，不当作完全成功
- 列出缺失页段 / 失败页段
- 说明已保留成功内容与占位
- 给出是否「在同 `jobId` 上重试失败页段」的选项；**不自动重试**

### 验收失败或任务失败

- 状态：`failed`（或验收失败）
- 失败原因（简短、可行动）
- 现场路径（`skill-jobs/<jobId>/`），说明未删除
- **不**把残缺包当成功交付；**不**静默改写正文去「修」验收
- 需要重做：用户明确同意后，在原 `jobId` 重试可恢复步骤，或新建任务重新转换

### 批量

- 每个源文件独立一段摘要（状态 + 路径 + 错误）
- 先汇总「成功 N / 部分 M / 失败 K」，再逐文件展开

### 默认报告不包含

- Token、代理 URL、密钥
- 完整 manifest JSON dump（除非用户要排查）

## Frontmatter descriptions

### `convert-documents-to-markdown`

```yaml
name: convert-documents-to-markdown
description: >
  Convert local PDF and EPUB files into a standard Markdown package
  (parts, full.md, images, manifest, result.zip) under the shared
  Open Pod convert data directory (`OPEN_POD_CONVERT_DATA_DIR`, default
  `~/.open-pod-convert/skill-jobs/`). Use this skill whenever the user
  wants PDF/EPUB → Markdown, 文档转 Markdown, 批量转换 PDF/EPUB,
  MinerU 解析 PDF, 转换失败恢复/重试, 结构验收, 或交付标准转换产物包 —
  even if they do not say the skill name, and even for plain EPUB
  chapter export. Prefer this over ad-hoc parsing, calling the convert
  web service, or the epub2md-cli skill. Do NOT use epub2md-cli for
  ordinary EPUB→Markdown unless the user explicitly names epub2md /
  epub2md-cli or asks for raw CLI / metadata / TOC / sections / unzip
  inspection without a standard conversion package.
```

### `epub2md-cli`（实现时收窄，仅显式调用）

```yaml
name: epub2md-cli
description: >
  Use the local `epub2md` CLI only when the user explicitly names
  `epub2md` / `epub2md-cli`, or explicitly asks for raw epub2md CLI
  operations such as --info, --structure, --sections, --unzip, or
  other inspect-only workflows. Do NOT use this skill for ordinary
  EPUB → Markdown conversion, chapter export, merge, or batch document
  conversion — those go to convert-documents-to-markdown.
```

## Testing and evals (v1)

### 脚本单元测试（`node --test`，必做）

覆盖确定性逻辑，不依赖 MinerU / 真书：

| 区域 | 用例要点 |
|------|----------|
| 路径 / job | 新任务生成新 `jobId`；布局为 `skill-jobs/<id>/{input,work,output}`；不碰 `jobs/` |
| ensure-deps | 缺依赖时失败信息可读；不改用户项目 `package.json` |
| 代理选择 | 环境变量优先级；选定后任务内固定 |
| Token 查找 | 三级优先级；manifest/日志不出现 token |
| EPUB 安全名 | 含 `[]?*` 的源文件仍能 stage 为安全 basename |
| 分片 / stitch | 缺失页段有占位；`full.md` 由 parts 顺序拼接 |
| 结构验收 | 缺 `manifest` / `parts` / `result.zip` → 不报告 succeeded |
| 报告字段 | 成功/partial/failed 摘要字段齐全 |

可用夹具：微型假 EPUB、合成 markdown parts；MinerU 用 mock fetch。

### Skill eval prompts（少量，实现后可跑）

| # | Prompt 意图 | 期望行为 |
|---|-------------|----------|
| 1 | 「把这个 PDF 转成 Markdown」 | 走本 Skill；落盘 `skill-jobs/`；报告 jobId + 路径 |
| 2 | 「把这个 EPUB 导出章节 Markdown」（**不**提 epub2md） | 走本 Skill，**不**走 epub2md-cli |
| 3 | 「用 epub2md 看一下这本书的目录」 | 才走 epub2md-cli |
| 4 | 两个文件批量转换 | 两个独立 job；一个失败不影响另一个 |
| 5 | 「重试刚才失败的页段」 | 同 jobId 恢复，不新建覆盖 |

### v1 明确不做

- 不接真实 MinerU 计费 E2E 作为默认 CI
- 不把语义「章节好不好」当自动验收
- 不强制先跑完 description 优化循环再合并（可后补）

### 实现顺序

先脚本测试 + 夹具 → 再写 `evals/evals.json` 五条 → 可选手工跑 1～2 条真文件。


## Books archive (my-books)

- 成功或部分成功的转换默认晋升到书籍归档库，把 **input 与 output 放在同一书目录** 便于维护与 Git 存档。
- 默认归档根：`OPEN_POD_CONVERT_BOOKS_DIR` / `MY_BOOKS_DIR`，否则 `~/myspace/my-books`（https://github.com/liujuntao123/my-books）。
- 布局：`books/<slug>/{input,output,result.zip,book.json,README.md}`。
- `skill-jobs/<jobId>/` 仍保留作为运行时任务现场（重试/调试）；归档是副本，不删除任务。
- 同名书再次转换使用 `slug__<shortJobId>`，避免静默覆盖。
- `--sync` / `scripts/sync-books.mjs`：在归档库内 `git add/commit/push`。

## Design status

- 工作流契约、路由、存储、依赖、报告、测试范围均已确认。
- 已实现：仓库真源 `skill/convert-documents-to-markdown/`，本机符号链接 `~/.agents/skills/convert-documents-to-markdown`，`epub2md-cli` description 已收窄为显式调用。
- 已实现：一书一目录归档到 `my-books`（input+output），并支持 `sync-books` 推送到 GitHub。
