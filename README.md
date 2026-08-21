# Open Pod

本地多人有声书 / 广播剧工作室（Fish MVP）。

## 文档

- 领域术语：[`CONTEXT.md`](./CONTEXT.md)
- 架构决策：[`docs/adr/`](./docs/adr/)
- 文档转 Markdown（独立服务）：[`apps/convert/CONTEXT.md`](./apps/convert/CONTEXT.md)

## 结构

```
packages/shared        # 指纹、参数合并、导入解析、Fish schema
packages/convert-core  # PDF/EPUB → MD 管线（MinerU / epub2md）
apps/server            # Hono + SQLite + worker + Fish 适配器
apps/web               # React 作品列表 / 工作台 / 设置
apps/convert           # 文档转 Markdown 独立服务 + 最小 UI
```

## 开发

```bash
pnpm install
pnpm --filter @open-pod/shared build
pnpm --filter @open-pod/convert-core build
pnpm dev:server   # http://127.0.0.1:8787
pnpm dev:web      # http://127.0.0.1:5173  (代理 /api)
pnpm dev:convert      # 转换服务 API http://127.0.0.1:8790
pnpm dev:convert:web  # 转换 UI http://127.0.0.1:5174 （代理 /api → 8790）
```

可选环境变量：
- `OPEN_POD_DATA_DIR` 默认 `~/.open-pod`
- `OPEN_POD_PORT` 默认 `8787`
- `OPEN_POD_HOST` 默认 `127.0.0.1`
- `OPEN_POD_CONVERT_DATA_DIR` 默认 `~/.open-pod-convert`
- `OPEN_POD_CONVERT_PORT` 默认 `8790`
- `OPEN_POD_CONVERT_HOST` 默认 `127.0.0.1`
- `OPEN_POD_CONVERT_MINERU_TOKEN` 覆盖磁盘中的 MinerU Token

## MVP 路径

1. 设置 → 填写 Fish API Key  
2. 拉取官方音色库并导入  
3. 新建作品 → 工作台写台词、角色绑音色  
4. 生成当前/选中行 → 预听 → 合成本章 WAV → 下载  

在线 TTS 需要有效 Fish Key；无 Key 时生成任务会失败，但作品编辑与合成就绪检查仍可用。

## 可选：文档转 Markdown

独立前置工具，**不**写入作品库。上传 PDF（MinerU 在线 API）或 EPUB（本地 epub2md），产出分片 Markdown zip。

1. `pnpm --filter @open-pod/convert-core build`
2. `pnpm dev:convert` + `pnpm dev:convert:web`
3. 设置页填写 MinerU Token（仅 PDF 需要）
4. 上传文件 → 等待任务 → 下载 zip（含 `markdown/parts/`、`full.md`、`manifest.json`）
