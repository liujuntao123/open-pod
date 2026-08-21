# 文档转 Markdown

把源文档转换为可供后续工具消费的 Markdown 产物，同时保持与 Open Pod 的作品、剧本和音频生产域解耦。

## Language

**转换服务 (Convert Service)**：
提供浏览器和 HTTP 入口的独立文档转换应用。
_Avoid_: Open Pod 作品导入器；转换 Skill

**转换 Skill (Convert Skill)**：
面向 Codex 的独立文档转换工作流，拥有自己的编排与执行体系，可借鉴转换服务中已经验证的转换知识。
_Avoid_: 转换服务 API 客户端；转换服务的另一套 UI；必须依附 Open Pod 仓库运行的脚本

**转换任务 (Conversion Job)**：
把一个源文档转换为一组可追踪产物的一次工作单元。
_Avoid_: Open Pod 生成任务；Open Pod 合成任务

**批量转换 (Batch Conversion)**：
一次请求展开为多个相互独立的转换任务；每个源文档保持自己的状态和产物。
_Avoid_: 把多个源文档合成一个转换任务；跨文档合并包

**服务转换任务 (Service Conversion Job)**：
由转换服务拥有和管理的转换任务。
_Avoid_: Skill 转换任务

**Skill 转换任务 (Skill Conversion Job)**：
由转换 Skill 独立拥有和管理的转换任务。
_Avoid_: 服务转换任务；转换服务队列任务

**任务重试 (Job Retry)**：
在原 Skill 转换任务中恢复可安全重做的失败步骤，并保留同一个任务身份。
_Avoid_: 重新转换；创建新任务后冒充原任务

**重新转换 (Reconversion)**：
用户再次发起完整转换并创建新任务，即使源文件与先前任务相同。
_Avoid_: 任务重试；覆盖旧任务

**转换数据根 (Conversion Data Root)**：
转换服务与转换 Skill 存放各自任务和产物的共同存储边界；双方只管理自己拥有的任务。
_Avoid_: Skill 安装目录；Open Pod 工作室数据目录

**转换产物包 (Conversion Package)**：
一次成功或部分成功的转换任务交付给下游的 Markdown、图片、清单与归档集合。
_Avoid_: Open Pod 作品；清理产物

**原始转换产物 (Raw Conversion Output)**：
未经语义清理、章节重组或正文改写的可复现转换结果，是后续处理必须保留的基线。
_Avoid_: 清理产物；人工修订稿

**清理产物 (Cleaned Output)**：
用户明确要求后，从原始转换产物派生出的章节整理或内容清理结果。
_Avoid_: 覆盖原始转换产物；默认转换结果

**解析页段 (Extraction Segment)**：
长文档转换时可独立处理、失败和重试的连续页面范围。
_Avoid_: 交付分片；章节

**交付分片 (Delivery Part)**：
split 交付中按阅读顺序排列的 Markdown 文件，是 split 模式的权威正文结果。
_Avoid_: 解析页段；派生全文

**派生全文 (Derived Full Markdown)**：
按交付分片顺序拼接得到的全文便利产物，不代表执行了源格式的原生 merge 流程。
_Avoid_: 原生 merge 结果；权威分片

**缺失页段占位 (Missing Segment Placeholder)**：
部分成功时在正文中保留解析缺口位置和范围的显式标记。
_Avoid_: 静默删除失败页段；伪造正文

实现与工作流契约见 [`docs/convert-skill-design.md`](../../docs/convert-skill-design.md)，独立 Skill 的架构决策见 ADR-0068。
