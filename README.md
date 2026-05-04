# KOCopilot · 创作者智能副驾

> 让一个人，干出一个 MCN 团队的产出。
> 前端 + FastAPI 后端一体；4 个 AI 端点同进程服务静态前端。
> 默认 `LLM_PROVIDER=mock`，**不配 API Key 也能跑全流程**；填入 DeepSeek Key 后即用真模型。

---

## 1. 这是什么

KOCopilot 把"人设定位 → 内容生产 → 长尾分发 → 互动运营"四大 MCN 编导能力封装成端到端 AI 工作流。**爆款拆解作为「内容生产」的核心实现手段嵌入工作流**，不再单独作为对外卖点。

### 1.1 用户旅程

1. **首页（产品说明）** `index.html` — 介绍价值主张、痛点、四步工作流、三大对外能力，强 CTA 引导进入工作台。
2. **工作台** `workspace.html` — 推荐工作流卡片（人设 → 拆解 → 标题车间 → 评论分拣），加「我的人设」「我的拆解项目」两个本地历史看板（localStorage）。
3. **四个功能页**：
   - `feature-2.html` 人设生成（**第一步**，每次创作的起点）
   - `feature-1.html` 爆款拆解 + 脚本引擎
   - `feature-3.html` 标题车间（**仅抖音**，去除多平台切换）
   - `feature-4.html` 评论分拣

### 1.2 仓库结构

```
koc-copilot/
├── index.html                         # 首页（产品说明 / 落地页）
├── workspace.html                     # 工作台（含 localStorage 历史看板）
├── feature-1.html ~ feature-4.html    # 4 个功能页
├── styles.css / app-screens.css       # 全站样式（CSS 变量 = 单点换皮）
├── api.js                             # 前端 API 客户端（fetch / loading / toast）
├── interactions.js                    # 4 个表单的提交-渲染逻辑
├── koc-history.js                     # localStorage 历史 + 工作台看板渲染
├── asr-uploader.js                    # ffmpeg.wasm 抽轨 + 调用后端 ASR
├── run.ps1 / run.sh                   # 启动 uvicorn FastAPI（含 venv 自举 + pip 安装）
├── stop.ps1 / stop.sh                 # 优雅停止
├── server/                            # 后端代码
│   ├── app/
│   │   ├── main.py                    # FastAPI 入口（路由 + 中间件 + 静态挂载）
│   │   ├── config.py                  # Pydantic Settings（读取 .env）
│   │   ├── schemas.py                 # 所有请求/响应 Pydantic 模型
│   │   ├── routers/                   # 6 个业务端点 + ASR
│   │   │   ├── persona.py             # POST /api/persona/generate
│   │   │   ├── skeleton.py            # POST /api/skeleton/extract
│   │   │   ├── qa.py                  # POST /api/qa/next        (引导式问答 ≤3 轮)
│   │   │   ├── script.py              # POST /api/script/generate (基于骨架+答案出原创脚本)
│   │   │   ├── seo.py                 # POST /api/seo/titles  （platform 锁定 douyin）
│   │   │   ├── comments.py            # POST /api/comments/classify
│   │   │   └── asr.py                 # POST /api/asr/transcribe (火山豆包 Flash)
│   │   └── services/
│   │       ├── llm_client.py          # LLMClient 抽象 + Mock + DeepSeek 实现
│   │       ├── asr_client.py          # ASRClient 抽象 + Mock + 火山豆包 Flash 实现
│   │       └── prompts/               # 4 个模块的 system prompt 模板
│   ├── tests/                         # pytest 单元 + 集成测试（37 通过）
│   ├── requirements.txt               # 生产依赖
│   └── .env.example                   # 复制为 .env 后填入 DeepSeek + 豆包 Key
├── deploy/
│   ├── kocopilot-server.service       # systemd 单元（占位符 → sed 替换）
│   └── nginx.conf.example             # nginx 站点配置（占位符 → sed 替换）
├── scripts/
│   ├── deploy.sh                      # 备份 → git pull → 重启 → 健康检查 → 失败回滚
│   ├── install-on-medi-server.sh      # 一键在已有服务器上落地
│   └── push-to-github.ps1 / .cmd      # 安全推送（含 secret 扫描 + cwd 守卫）
├── docs/PRD.md                        # 产品需求文档（历史档，结构基本沿用）
└── README.md                          # 本文件
```

### 1.3 推荐工作流

```
①人设生成 (feature-2)        ② 爆款拆解 (feature-1)        ③标题车间 (feature-3)        ④评论分拣 (feature-4)
   ↓ 生成 3 个差异化方案       ↓ ASR 抽轨 + DeepSeek 拆骨架   ↓ 抖音算法标题/简介/标签       ↓ 高/中/低分拣 + 三种语气回复
   存入 localStorage          存入 localStorage              （结果不入库，按需复制）       （结果不入库，按需复制）
```

工作台首页的「我的人设」「我的拆解项目」两块看板会自动展示这两类历史，纯前端 localStorage，仅当前浏览器可见，最多保留 30 条；不需要后端表，也无需登录。

---

## 2. 本地运行（30 秒）

### 2.1 Windows（推荐）

环境：**Python 3.10+** 已在 PATH（`python` 或 `py`）。

```powershell
cd d:\nocode\koc-copilot
.\run.ps1
```

首次运行会自动：① 创建 `server/venv` ② `pip install -r server/requirements.txt`（约 1 分钟）③ 从 `.env.example` 拷一份 `server/.env`（默认 `LLM_PROVIDER=mock`）④ 启动 uvicorn。

- 访问：<http://127.0.0.1:8090/>
- API：<http://127.0.0.1:8090/api/health>
- 自动文档：<http://127.0.0.1:8090/docs>
- 切换端口：`$env:PORT=8091; .\run.ps1`
- 跳过 pip 安装（依赖未变更时更快）：`$env:SKIP_INSTALL=1; .\run.ps1`
- 停止：`.\stop.ps1`
- 日志：`./logs/uvicorn.log`、`./logs/uvicorn.err.log`
- 进程信息：`.server.pid`（脚本维护，请勿手改）

### 2.2 Linux / macOS / WSL

```bash
cd /path/to/koc-copilot
chmod +x run.sh stop.sh
./run.sh
# 切换端口：PORT=8091 ./run.sh
# 跳过 pip：  SKIP_INSTALL=1 ./run.sh
./stop.sh
```

### 2.3 切换到真 DeepSeek

```bash
# 编辑 server/.env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx
```

然后 `.\stop.ps1; $env:SKIP_INSTALL=1; .\run.ps1`（或 `./stop.sh; SKIP_INSTALL=1 ./run.sh`）即可。

> **注意**：DeepSeek API 是**真实付费**的。每次点击「生成 / 拆解 / 分拣」都会扣 token。
> v0.1 没做配额限制；如需自我保护可临时切回 `LLM_PROVIDER=mock`。

### 2.4 ASR：纯前端 ffmpeg.wasm + 火山豆包大模型录音文件识别**极速版**（v0.4 起）

**架构**

```
浏览器                                KOCopilot 后端                          火山引擎
─────                                ──────────────                          ────────
file input  ─→ ffmpeg.wasm ─→ mp3 ─→ POST /api/asr/transcribe (multipart)
                                  ─→ base64 编码 ─→ POST /recognize/flash ─→
                                                              ←─ 200 / X-Api-Status-Code 20000000
                                                              ←─ result.text  (1-5s)
                                     transcript ←──────────────
```

**对比标准版（已弃用）的关键差异**

| 维度 | 标准版（旧） | 极速版（现在） |
|---|---|---|
| 端点 | `/submit` + `/query` 轮询 | `/recognize/flash` 一次请求 |
| 资源 ID | `volc.bigasr.auc` | `volc.bigasr.auc_turbo` |
| 音频上传 | 必须公网 https URL | base64 inline 直传 |
| 本地真测 | 必须 ngrok | **直接能跑通** |
| 服务器写盘 | 必需（暴露给火山下载） | 不需要 |
| 延迟 P95 | 30-180s | **2-5s** |

**本地真实测试豆包**（极速版直接调通，不再需要任何隧道）：

```powershell
# 1) 编辑 server/.env：
#      ASR_PROVIDER=doubao
#      DOUBAO_API_KEY=<your-volc-uuid-key>
#      DOUBAO_RESOURCE_ID=volc.bigasr.auc_turbo
# 2) 启动：
.\stop.ps1; $env:SKIP_INSTALL=1; .\run.ps1
# 3) 浏览器打开 http://127.0.0.1:8090/feature-1.html，上传视频
#    或者直接 curl 烟测：
curl.exe -F "file=@your-audio.mp3;type=audio/mpeg" http://127.0.0.1:8090/api/asr/transcribe
# 期望返回 {"transcript":"...","provider":"doubao","elapsed_ms":2832}
```

**首次浏览器 ASR 流程**

1. 选一个视频（mp4/mov，≤ 5 分钟）
2. 浏览器自动下载 ffmpeg-core wasm（约 30 MB，只下一次）
3. ffmpeg.wasm 抽出 16kHz 单声道 mp3（5 分钟视频约 600 KB）
4. 上传到后端 → 后端 base64 编码 → 一次请求豆包极速版 → 2-5 秒返回文本
5. 文本自动填入下方 textarea，"用 AI 拆解骨架"按钮高亮闪烁

**为什么需要 COOP/COEP 头？**

ffmpeg.wasm 0.12 用 SharedArrayBuffer 跨线程传数据，浏览器要求页面处于 `crossOriginIsolated` 状态。后端 `app/main.py` 中间件给每个 HTML 页面响应自动加：

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

`credentialless` 模式允许加载第三方 CDN（jsdelivr / Google Fonts），唯一限制是这些请求不带 cookies——刚好我们也不需要。

**豆包 ASR 价格参考**（2026.05，极速版与标准版价格相近）

- 极速版：约 ¥0.0008 / 秒 = ¥0.05 / 分钟 = ¥3 / 小时
- 5 分钟视频 ≈ ¥0.25 / 次
- 100 用户 × 每天 5 次 × 5 分钟 ≈ ¥125 / 天，需要在前端做配额（v0.5 待办）

---

## 3. 验收 checklist

启动后请逐项确认：

- [ ] `http://127.0.0.1:8090/` 正常打开 `工作台`
- [ ] `http://127.0.0.1:8090/api/health` 返回 `{"status":"healthy",...}`
- [ ] **mock 模式**下 4 个端点全部返回 200：
  ```bash
  curl http://127.0.0.1:8090/api/health
  curl -X POST http://127.0.0.1:8090/api/persona/generate \
       -H "Content-Type: application/json" \
       -d '{"background":"PM 8 years","interests":"home","resources":"6h/week"}'
  ```
- [ ] `feature-2`：填表单 → 点「生成 3 个人设方案」→ 看到右下角 toast +  3 张人设卡刷新
- [ ] `feature-1`：在台词输入框粘贴文本 → 点「用 AI 拆解骨架」→ 骨架区刷新
- [ ] `feature-3`：切换平台 tab → 点「生成发布元数据」→ 标题/简介/标签整体刷新
- [ ] `feature-4`：粘贴评论 → 点「开始分拣」→ 高/中/低三栏重新渲染
- [ ] 拔网线后再点提交 → 应该看到红色 toast「网络异常：无法连接到后端…」
- [ ] 浏览器控制台无未捕获错误（字体 404 不算）

跑后端测试：

```bash
cd server
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt --quiet  # Win
# source venv/bin/activate; pip install -r requirements-dev.txt           # Unix
.\venv\Scripts\python.exe -m pytest -v                                    # Win
# python -m pytest -v                                                     # Unix
```

预期：**26 passed**。

---

## 4. 架构与设计原则

### 4.1 SOLID 实现位置

| 原则 | 体现 |
|---|---|
| **S**RP | 每个 router 只管一个端点；prompts/ 一文件一模块；schemas.py 只放 I/O 契约 |
| **O**CP | 加新 LLM 提供商只需在 `services/llm_client.py` 写新子类 + 注册到 `_PROVIDERS` 字典 |
| **L**SP | `MockLLMClient` 与 `DeepSeekLLMClient` 完全可替换；测试默认走 mock |
| **I**SP | `LLMClient` 接口仅 2 个方法（`complete` / `complete_json`），不强加用户用不到的能力 |
| **D**IP | 业务代码只 `from .services.llm_client import get_llm_client`；不直接 new 具体实现 |

### 4.2 防御性编程

- LLM 返回非 JSON 时自动重试一次，并在 system prompt 加严格约束
- 所有 `httpx` 调用包裹超时 + 网络错误捕获 + 状态码白名单
- 前端 `KOCApi` 把 422 / 502 / 500 映射成中文提示
- Pydantic Settings 在 `.env` 缺 key 时优雅回退到 mock，并打 warning 日志

### 4.3 可观测

- 每个 HTTP 请求生成 12 位 `trace_id`，回写 `X-Trace-Id` header
- 每次 LLM 调用打印 `provider / 耗时 / prompt token / completion token`
- 启停脚本统一通过 `.server.pid` + `logs/` 管理

### 4.4 命名约定

- CSS class 全部 `.koc-*` 前缀
- 主题色集中在 `styles.css` 顶部 `:root`，**单点换皮**
- 后端模块按业务名小写：`persona / skeleton / seo / comments`

---

## 5. 部署到生产

> **推荐路径** = 5.0 一键脚本 + 5.2 验收  
> **手动路径** = 5.1（兜底，跟慢病项目逐条对齐）

### 5.0 一键部署到「慢病用药小管家」服务器（推荐）

> 基础设施事实：详见 `docs/INFRA.md`（已实测确认 2026-05-04）  
> 主域名 `zlhu.asia` → 阿里云轻量香港 → IP `47.239.58.145` → Ubuntu + nginx 1.18

#### 前提（你需要先做完这 3 件事）

| # | 你需要做 | 怎么做 |
|---|---|---|
| ① | **加 DNS A 记录** | 登录 [https://dns.console.aliyun.com/](https://dns.console.aliyun.com/) → 找 `zlhu.asia` → 添加记录：<br>**类型** A &nbsp;&nbsp; **主机记录** `kocopilot` &nbsp;&nbsp; **记录值** `47.239.58.145` &nbsp;&nbsp; **TTL** `600`<br>5 分钟后验证：`Resolve-DnsName kocopilot.zlhu.asia` 应返回 `47.239.58.145` |
| ② | **火山豆包资源开通** | 登录 [火山引擎控制台](https://console.volcengine.com/speech/app) → 找「**录音文件识别 - 大模型极速版**」（资源 ID `volc.bigasr.auc_turbo`，**注意不是标准版！**）→ 点「开通服务」（按量付费，新用户有免费额度）。没开通就直接用 Key 调用会返回 `45000001` (参数无效)。 |
| ③ | **代码上服务器** | 把整个 `koc-copilot/` 目录推到一个 Git 仓库（私有也行），后面脚本会 `git clone`。也可以本地 `tar czf - . \| ssh server "cd /opt && tar xzf -"` 然后跳过 git。 |

#### 跑一键脚本

ssh 上你的服务器（你已经能 ssh 上去管慢病项目）：

```bash
# 推荐：先备份慢病的 nginx 配置（按规则 B）
DATE=$(date +%F)
sudo cp -r /etc/nginx /etc/nginx.${DATE}.bak

# 选项 A：从 Git 拉取（推荐）
sudo REPO_URL=git@github.com:you/kocopilot.git \
     DOMAIN=kocopilot.zlhu.asia \
     bash /tmp/install-on-medi-server.sh

# 选项 B：rsync 上来后直接跑
sudo DOMAIN=kocopilot.zlhu.asia \
     bash /opt/kocopilot/scripts/install-on-medi-server.sh
```

脚本会**交互式**问你（环境变量传过的就跳过）：

1. KOCopilot 域名（默认值已设为 `kocopilot.zlhu.asia`，回车即接受）
2. Git 仓库 URL（已在 `/opt/kocopilot` 可留空）
3. DeepSeek API Key（粘贴 sk- 开头的 Key）
4. 火山豆包 API Key（粘贴 UUID 形式的 Key）

跑完后状态：
- ✅ 后端 systemd `kocopilot-server` 已起，监听 `127.0.0.1:5001`
- ✅ nginx 站点已装（HTTP only）
- ✅ `/opt/kocopilot/server/.env` 已写，`chmod 600`，资源 ID 已设为 `volc.bigasr.auc_turbo`
- ⚠️ HTTPS 还没配（**ffmpeg.wasm 在浏览器需要 HTTPS** 才能拿到 SharedArrayBuffer；豆包极速版本身**不要求** HTTPS）
- ⚠️ 主域名 `zlhu.asia` 完全不受影响（`server_name` 隔离）

#### 剩下 1 步手动做（脚本结尾会再提示一遍）

```bash
# 申请 Let's Encrypt 证书（与主域名独立证书）
sudo certbot --nginx -d kocopilot.zlhu.asia
# 选 2「Redirect HTTP→HTTPS」
```

> 极速版不再需要 PUBLIC_BASE_URL，certbot 跑完就直接能用。

#### 出问题怎么回滚（不影响慢病主项目）

```bash
sudo systemctl stop kocopilot-server && sudo systemctl disable kocopilot-server
sudo rm -f /etc/systemd/system/kocopilot-server.service
sudo rm -f /etc/nginx/sites-enabled/kocopilot.conf
sudo nginx -t && sudo systemctl reload nginx
curl -I https://zlhu.asia    # 主项目应立即恢复
```

### 5.2 端到端验收

```bash
# 4 LLM 端点 + ASR 可达性
bash /opt/kocopilot/scripts/health-check.sh https://kocopilot.zlhu.asia

# 真测一次豆包 ASR（需要本地有一段 30 秒以内的 mp3/m4a 文件）
bash /opt/kocopilot/scripts/health-check.sh https://kocopilot.zlhu.asia /tmp/sample.mp3
```

预期输出：

```text
[ OK ] health
[ OK ] persona (http=200, ...B)
[ OK ] skeleton (http=200, ...B)
[ OK ] seo (http=200, ...B)
[ OK ] comments (http=200, ...B)
[ OK ] asr full round-trip (doubao, "elapsed_ms":58320)
       transcript preview: "大家好，今天给大家分享一个..."
========== ALL CHECKS PASSED ==========
```

浏览器打开 `https://kocopilot.zlhu.asia/feature-1.html` → 选一段视频 → 应看到：
1. 「正在加载 ffmpeg…」→「抽轨中…」→「上传中…」→「识别中…」  
2. 文本框被自动填上识别结果  
3. 「用 AI 拆解骨架」按钮闪一下吸引注意（脉冲动画）

### 5.1 部署到生产（手动版，兜底）

> 完整步骤见上层 `../DEPLOYMENT.md` 第 2-5 章；本节只列 KOCopilot 特化点。

```bash
# 1. 在生产服务器上准备目录与用户
sudo useradd -m -s /bin/bash kocopilot
sudo mkdir -p /opt/kocopilot && sudo chown kocopilot:kocopilot /opt/kocopilot
su - kocopilot
cd /opt
git clone <你的仓库> kocopilot
cd kocopilot

# 2. 后端 venv + 依赖
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

# 3. 配 .env
cp server/.env.example server/.env
chmod 600 server/.env
# 编辑：LLM_PROVIDER=deepseek + DEEPSEEK_API_KEY + PORT=5001

# 4. 装 systemd 单元（注意占位符替换）
sudo cp deploy/kocopilot-server.service /etc/systemd/system/kocopilot-server.service
sudo sed -i 's|__PROJECT_DIR__|/opt/kocopilot|g; s|__RUN_USER__|kocopilot|g' \
    /etc/systemd/system/kocopilot-server.service
sudo mkdir -p /opt/kocopilot/var/logs && sudo chown -R kocopilot:kocopilot /opt/kocopilot/var
sudo systemctl daemon-reload
sudo systemctl enable --now kocopilot-server
curl http://127.0.0.1:5001/api/health  # 应返回 healthy

# 5. 装 nginx 站点（注意占位符替换）
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/kocopilot.conf
sudo sed -i \
    -e 's|__DOMAIN__|kocopilot.zlhu.asia|g' \
    -e 's|__FRONTEND_DIR__|/opt/kocopilot|g' \
    -e 's|__BACKEND_PORT__|5001|g' \
    /etc/nginx/sites-available/kocopilot.conf
sudo ln -s /etc/nginx/sites-available/kocopilot.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. HTTPS
sudo certbot --nginx -d kocopilot.zlhu.asia

# 7. 后续升级（备份 + git pull + 重启 + 健康检查 + 失败回滚）
bash scripts/deploy.sh
```

### 5.1 与慢病项目共存

| 项 | 慢病用药小管家 | KOCopilot |
|---|---|---|
| 内部端口 | 5000 | **5001** |
| systemd 单元 | `medi-server` | `kocopilot-server` |
| 域名 | `zlhu.asia` | `kocopilot.zlhu.asia` |
| 项目路径 | `/opt/medi` | `/opt/kocopilot` |
| 运行用户 | `medi` | `kocopilot` |

两者可在同一台 2C4G 香港服务器上同时跑，互不干扰。

---

## 6. 换皮（5 分钟切色系）

只需改 `styles.css` 顶部 `:root` 几个变量即可全站换皮。预设：

- **暖橙活力风**：`--primary: #FF6B35; --accent: #FFD23F; --bg-deep: #FFF6E5`
- **科技蓝**：`--primary: #2563eb; --accent: #06b6d4; --bg-deep: #eef4ff`
- **暗黑模式**：把 `--bg-soft / --bg-deep / --surface / --ink / --ink-muted` 一起反转

---

## 7. 常见问题

| 现象 | 排查 |
|---|---|
| `run.ps1` 报错"未找到 python" | 装 Python 3.10+，把 `python` 或 `py` 加进 PATH |
| `pip install` 卡在装 numpy/torch | KOCopilot 后端**不依赖 ML 库**，应该秒装；卡住请检查网络/换源 |
| 端口被占用 | `.\stop.ps1` 后 `$env:PORT=8091` 重启；或 `netstat -ano | findstr :8090` 找占用 |
| 点「生成」无反应 | 看浏览器 Network 面板：是否调到 `/api/...`？后端日志 `logs/uvicorn.err.log` 有报错？ |
| 502 / "AI 服务暂时不可用" | DeepSeek Key 无效、余额耗尽、或 `LLM_PROVIDER=deepseek` 但 Key 没填 |
| 复制按钮不工作 | 用 `file://` 直接打开 HTML 时 clipboard API 受限。请通过 `run.ps1` 的本地 HTTP 启动 |
| pytest 找不到 app 模块 | `cd server` 后再跑，或检查 `tests/conftest.py` 已自动加 sys.path |

---

## 8. 后续路线

| 阶段 | 状态 | 目标 |
|---|---|---|
| v0.1 | ✅ 已交付 | 4 模块端到端 + DeepSeek + mock 双模式 + 单台部署对齐慢病项目 |
| v0.2-v0.4 | ✅ 已并入 | ASR 真接入：纯前端 ffmpeg.wasm + 火山豆包 |
| v0.5 | ✅ 已交付 | 迁移到豆包极速版，删除磁盘临时文件 + 公网 URL 依赖 |
| **v0.6（当前）** | ✅ 已交付 | 首页改产品说明 / 工作台拆出 / localStorage 历史看板 / 标题车间锁定抖音 / 全站去 Demo 表述 |
| v0.7 | ⏳ 待办 | 流式 SSE typewriter 效果 + slowapi IP 限频 |
| v0.8 | ⏳ 待办 | 模块二案例向量库（Qdrant 或 pgvector）+ RAG |
| v0.9 | ⏳ 待办 | 用户系统、每日配额、付费节点 |

---

## 9. 关联文档

- `docs/PRD.md` — v1 产品需求文档（v0.1 上线后建议出 v1.1，把"无后端"改成"FastAPI 后端"）
- `../DEPLOYMENT.md` — 慢病项目部署手册，KOCopilot 流程与之 95% 一致

---

## 10. 改进点（每次迭代后回填）

> 按工作流规则 F：任务完成后回顾"过程暴露的问题/改进点"，将其更新到此处。

### 2026-05-03 第一次交付（v0.0 静态 demo）
- ✅ 13 个文件，零 npm，可直接 cp 部署
- ✅ 端口与慢病项目错开（8090 vs 8080）

### 2026-05-03 第二次交付（v0.1 前后端一体）
- ✅ FastAPI 后端：4 路由 + LLM/ASR 抽象层 + 26 个 pytest 测试全过
- ✅ DeepSeek 适配器走 OpenAI-兼容 `/chat/completions`，mock 模式按 schema 字段名指纹路由
- ✅ 前端接入：`api.js` 统一 fetch，`interactions.js` 4 个表单 → 4 个端点，loading + toast 全覆盖
- ✅ 部署文件：`deploy/kocopilot-server.service` + `deploy/nginx.conf.example` + `scripts/deploy.sh`，与慢病项目占位符约定一致
- ⚠️ **PowerShell 5.1 编码坑**：`Get-Content -Raw` 默认按系统 ANSI 解码 UTF-8 文件 → 中文标点损坏。解决：批量改 HTML 时用 `[System.IO.File]::ReadAllBytes` + `[System.Text.Encoding]::UTF8.GetString`，或干脆用 IDE 的 Write/StrReplace 工具，避免 `Get-Content`/`Set-Content` 流。

### 2026-05-04 第三次交付（ASR：ffmpeg.wasm + 火山豆包 2.0）
- ✅ 新增 `services/asr_client.py::DoubaoBigmodelASRClient`：submit/query 异步轮询，X-Api-Status-Code 全状态码映射成中文提示
- ✅ 新增 `routers/asr.py::POST /api/asr/transcribe`：multipart/form-data 上传，落盘到 `var/asr-tmp/<uuid>.<ext>`，自动清理 10 分钟前的孤儿文件
- ✅ FastAPI middleware 给 HTML 页面加 COOP/COEP credentialless（满足 ffmpeg.wasm 的 SharedArrayBuffer 要求，不影响 CDN 字体）
- ✅ 新增 `asr-uploader.js`（ES module）：ffmpeg.wasm 0.12 抽 16kHz 单声道 mp3 + 进度回调 + 自动填 textarea
- ✅ 35 个 pytest 全过（原 26 + ASR client/endpoint 9）
- ⚠️ **本地真测豆包必须 ngrok**：火山异步任务模式需要公网音频 URL，`PUBLIC_BASE_URL=""` 时自动降级 mock（避免误以为成功）
- ⏳ **待用户验收**：① 浏览器打开 feature-1，上传一段 30 秒视频，看 ffmpeg.wasm 抽轨进度 ② 配 ngrok + DOUBAO 真调一次

### 2026-05-04 第四次交付（生产部署 artifacts 对齐慢病服务器）
- ✅ 新增 `scripts/install-on-medi-server.sh`：一键安装到现有慢病服务器（root 跑），自动建用户/拉代码/装依赖/写 .env/装 systemd/装 nginx/健康检查；交互式问域名 + 2 个 Key；幂等可重跑
- ✅ 新增 `scripts/health-check.sh`：生产端到端验收脚本，4 LLM 端点 + 1 ASR 端点；ASR 可选传一个真实 mp3 文件做完整轮询
- ✅ 通过 dig + curl + ipapi 主动探测，把 `zlhu.asia` 的真实基础设施事实写进 `docs/INFRA.md`（阿里云香港、IP 47.239.58.145、Ubuntu + nginx 1.18，已配 HTTPS 强制跳转）
- ⚠️ **当时设计基于「标准版异步」**：nginx 含 `/asr-tmp/` location、systemd `ReadWritePaths` 含 `var/asr-tmp`、env 含 `PUBLIC_BASE_URL` — 全部在 v0.6 中删除

### 2026-05-04 第五次交付（迁移到豆包**极速版**，部署大幅简化）
- ✅ 重写 `services/asr_client.py::DoubaoBigmodelASRClient`：标准版 submit/query 轮询 → 极速版 `/recognize/flash` 一次请求；资源 ID `volc.bigasr.auc` → `volc.bigasr.auc_turbo`；音频 base64 inline，废弃公网 URL 路径
- ✅ 重写 `routers/asr.py`：移除磁盘临时文件 + 移除 `_cleanup_stale_files`；ASRError 按 upstream code 映射 422/502
- ✅ `ASRClient` 抽象基类：主入口 `transcribe_bytes(audio_bytes)`；保留 `transcribe_url` 默认实现以保持向后兼容
- ✅ `config.py`：删 `doubao_submit_url` / `doubao_query_url` / `asr_poll_*` / `public_base_url` / `asr_tmp_dir` / `asr_tmp_max_age_seconds` 6 个字段，新增 `doubao_recognize_url` + `asr_timeout_seconds`
- ✅ `main.py`：移除 `/asr-tmp/` 静态挂载；COOP/COEP 中间件保留（ffmpeg.wasm 仍需 SharedArrayBuffer）
- ✅ `deploy/nginx.conf.example`：删 `/asr-tmp/` location；proxy 超时 200s → 90s
- ✅ `deploy/kocopilot-server.service`：gunicorn timeout 240s → 120s；`ReadWritePaths` 只保留 `server/logs/`
- ✅ `scripts/install-on-medi-server.sh`：移除 PUBLIC_BASE_URL 引导步骤；自动清理旧 .env 中的 6 个 legacy 字段；只剩 1 步手动 (certbot)
- ✅ **本地端到端真测豆包跑通**：SAPI 合成 565KB wav → POST → 2.83 秒返回 transcript（极速版承诺的 P95<5s 兑现）
- ✅ 35 个 pytest 全过（mock 路径 100% 覆盖）
- ⏳ **待用户做的 5 件事**：① 阿里云加 DNS A 记录 ② 火山开通**极速版**资源（资源 ID `volc.bigasr.auc_turbo`） ③ rsync 代码上服务器 ④ root 跑 install ⑤ certbot
- ⏳ **v0.6 计划**：① OSS 直传支持 100MB 上限的更长视频 ② 流式 SSE typewriter ③ slowapi IP 限频 ④ Sentry 错误监控

### 2026-05-04 第七次交付（feature-1 真正闭环：QA + 原创脚本）
- ✅ **第 1 步输入做成选择题**：上传视频/音频 vs 粘贴台词文本 用 tab 切换，消除"两个并列输入框到底填哪个"的歧义；ASR 完成后自动切到文本 tab 并填入识别结果，引导用户点「用 AI 拆解骨架」
- ✅ **第 2 步加空状态**：未拆解前显示「等待拆解」说明而非硬编码 demo 卡片，避免误导
- ✅ **第 3 步真做引导式问答**：新增 `POST /api/qa/next` 端点（DeepSeek 实现）；prompt 限制为 3 轮单选题（Hook / Body 切入 / CTA），路由层在 answers 长度 ≥ 3 时强制 `done=true`（router 拦截、不调 LLM、0ms 收敛）；前端用状态机驱动 IDLE→RUNNING(1..3)→DONE，progress 进度条 + 已答历史摘要 + 选项点过即冻结防重复
- ✅ **第 4 步真出原创脚本**：新增 `POST /api/script/generate`，基于骨架 + 3 个答案 + 人设生成 hook_narration + scenes[] + cta_narration + full_text；前端用 .koc-skeleton 卡片复用样式渲染，**复制纯文本**按钮调 `navigator.clipboard.writeText()` 并提示字符数
- ✅ **不开放自由输入（v0.x 决策）**：早期方案曾保留「让我自己输入…」自由文本框，但内测发现 LLM 把自由文本回填到下一轮 prompt 时容易出现"重复确认"循环、对话发散；v0.x 优先保收敛与产物质量，全部用 LLM 生成的可朗读选项，用户单选即可
- ✅ **mock fingerprint 扩到 6 个**：`hook_narration` → script、`rationale` → qa；保证 `LLM_PROVIDER=mock` 时新接口仍有合规 sample 返回
- ✅ **生产 ffmpeg.wasm 修复**：`@ffmpeg/ffmpeg` + `@ffmpeg/util` 改为本地 `/vendor/ffmpeg/` 同源加载（满足 Worker 同源约束）；nginx COOP/COEP 头在 `location /` 与 `/assets/` 内重复声明（修复 add_header 子块覆盖父块的经典坑）
- ⏳ **v0.7 计划**：① 第 3 步加"重新出题"按钮 ② 已生成的脚本写入工作台历史 ③ 一键导出脚本到剪贴板 + 钉钉/飞书 webhook

### 2026-05-04 第六次交付（产品形态调整 + 运维卡片）
- ✅ **首页 = 产品说明**：旧 `landing.html` 升格为 `index.html`，原工作台迁到 `workspace.html`；删除"爆款拆解"作为独立卖点的卡片（保留为工作台流程内的实现手段）；hero + 底部紫色 CTA 双重「进入工作台」
- ✅ **工作台历史看板**：新增 `koc-history.js` 模块（SRP），把"我的人设方案"和"我的拆解项目"以 localStorage 持久化（30 条上限）；KPI 卡也读 LS 实时算
- ✅ **标题车间锁定抖音**：前端删除 4 个平台 tab；`SEORequest.platform` 收紧为 `Literal["douyin"]`；prompt 重写为单平台抖音规则（钩子前置/标签密度/emoji 控制）；新增 2 个反向测试，37 通过
- ✅ **导航顺序统一**：人设生成放在爆款拆解前；feature-1 工作流条加 Step 0 = 人设生成
- ✅ **全站去 Demo 表述**：5 HTML + interactions.js 清干净 v0.x / Demo / 静态高保真 / 演示模式 等所有"未上线"暗示
- ✅ **push 脚本加防护**：`scripts/push-to-github.ps1` 加项目根目录守卫；`.cmd` 包装层加 `pushd "%~dp0.."` 自动切目录（修复了之前从父目录跑误伤无关 git 仓库的真实事故）
- ✅ **README 加第 11 章**：日常自助运维 cheat sheet，覆盖开发→push→部署→重启→看日志→排错→换 Key 全链路

---

## 11. 日常自助运维 Cheat Sheet（你独自跑全流程）

> 这一章是为了让你**完全脱离我**也能维护这个项目而写的。每个场景都给可复制粘贴的命令，按顺序抄就行。

### 11.1 开发流程：从改代码到上线的完整一圈

```
1. 改代码（VS Code / Cursor 任意编辑器）
       ↓
2. 本地起 uvicorn 自测              [.\run.ps1]
       ↓
3. 跑测试，确认没破东西              [server\venv\Scripts\python.exe -m pytest server/tests -q]
       ↓
4. 提交到 git                       [git add . ; git commit -m "..."]
       ↓
5. push 到 GitHub                   [.\scripts\push-to-github.cmd <repo-url> ...]
       ↓
6. SSH 上服务器跑 deploy.sh         [/opt/kocopilot/scripts/deploy.sh]
       ↓
7. 跑生产健康检查                    [/opt/kocopilot/scripts/health-check.sh]
       ↓
完工 ✓
```

### 11.2 常用命令一页打印（最重要）

| 我想干什么 | 命令（在 `D:\nocode\koc-copilot\` 下跑） |
|---|---|
| **本地起服务** | `.\run.ps1`（首次会装依赖；后续加 `$env:SKIP_INSTALL=1` 加速） |
| **本地停服务** | `.\stop.ps1` |
| **本地跑全套测试** | `.\server\venv\Scripts\python.exe -m pytest server/tests -q` |
| **看本地日志** | `Get-Content logs\uvicorn.log -Tail 50 -Wait` |
| **提交并推到 GitHub** | `git add .` → `git commit -m "your message"` → `git push` |
| **从 GitHub 拉最新代码** | `git pull` |
| **SSH 上服务器** | `ssh root@47.239.58.145`（你自己的 SSH key） |
| **服务器一键升级** | （在服务器上）`sudo /opt/kocopilot/scripts/deploy.sh` |
| **服务器看实时日志** | `sudo journalctl -u kocopilot-server -f` |
| **服务器重启服务** | `sudo systemctl restart kocopilot-server` |
| **服务器看 nginx 日志** | `sudo tail -f /var/log/nginx/access.log` |
| **生产健康检查** | （在服务器上）`bash /opt/kocopilot/scripts/health-check.sh https://kocopilot.zlhu.asia` |

### 11.3 场景一：我改了代码想发布

```powershell
# ⚠️ 必须在项目根目录跑
cd D:\nocode\koc-copilot

# 1. 本地自测
.\run.ps1
# 浏览器打开 http://127.0.0.1:8090 / 检查
.\stop.ps1

# 2. 跑测试
.\server\venv\Scripts\python.exe -m pytest server/tests -q

# 3. 提交
git status                    # 看改了哪些文件
git diff                      # 看具体改了什么
git add .                     # 添加全部改动
git commit -m "feat: 简短描述这次改了什么"

# 4. 推到 GitHub（首次设过身份后，以后直接 git push 即可）
git push

# 5. 部署到生产
ssh root@47.239.58.145
# 服务器上：
sudo /opt/kocopilot/scripts/deploy.sh
# 这个脚本会自动：备份当前版本 → git pull → pip install → 重启 → 健康检查 → 失败自动回滚
exit
```

### 11.4 场景二：服务挂了，5 分钟应急

按这个顺序排查：

```bash
ssh root@47.239.58.145

# A. 服务进程在不在？
sudo systemctl status kocopilot-server
# 如果 inactive/failed → 直接重启：
sudo systemctl restart kocopilot-server

# B. 看错误日志（最新 100 行）
sudo journalctl -u kocopilot-server -n 100 --no-pager

# C. nginx 通不通？
sudo systemctl status nginx
sudo tail -50 /var/log/nginx/error.log

# D. 端到端健康检查
curl -fsSL https://kocopilot.zlhu.asia/api/health
# 应该返回 {"status":"healthy",...}

# E. 全量 e2e 检查（耗时 ~30 秒，会真调一次每个 AI）
bash /opt/kocopilot/scripts/health-check.sh https://kocopilot.zlhu.asia
```

如果上面都没解决，**回滚**（deploy.sh 会备份每次发布）：

```bash
# 看历史备份
ls -la /opt/kocopilot.backups/
# 选最新一个稳定版本
sudo /opt/kocopilot/scripts/deploy.sh --rollback /opt/kocopilot.backups/<时间戳>
```

### 11.5 场景三：换 / 撤销 API Key

> **每隔 90 天换一次 Key 是好习惯**。Key 一旦不小心进过 git history，必须立刻撤销。

**DeepSeek**：

```bash
# 1. 在 https://platform.deepseek.com/api_keys 点旧 key 旁的 Disable / Delete
# 2. 在同页面新建一个 Key，复制（只能复制一次）
# 3. 服务器上更新 .env
ssh root@47.239.58.145
sudo nano /opt/kocopilot/server/.env
# 找到 DEEPSEEK_API_KEY=sk-xxx 一行，改成新 Key
# Ctrl+O 保存，Ctrl+X 退出
# 4. 重启服务（systemd 会重新读 .env）
sudo systemctl restart kocopilot-server
# 5. 验证
curl -fsSL https://kocopilot.zlhu.asia/api/health
```

**火山豆包**：流程一样，控制台在 [https://console.volcengine.com/speech/app](https://console.volcengine.com/speech/app)，环境变量名是 `DOUBAO_API_KEY`。

### 11.6 场景四：怎么开新功能分支

```powershell
cd D:\nocode\koc-copilot

# 1. 从 main 拉一个新分支
git checkout -b feat/my-new-feature

# 2. 改代码、提交
git add .
git commit -m "feat: 新增 XXX"

# 3. 推到 GitHub（第一次推某个新分支需要 -u）
git push -u origin feat/my-new-feature

# 4. 在 GitHub 网页发起 Pull Request 合到 main
# 5. 合并后回到 main 拉最新
git checkout main
git pull
# 6. 删掉本地的旧分支（远端的可以在 PR 合并时勾选自动删）
git branch -d feat/my-new-feature
```

### 11.7 场景五：突然想撤回上一次 commit

```powershell
# 我刚 commit 了但还没 push —— 撤回保留改动
git reset --soft HEAD~1

# 我刚 commit 了但还没 push —— 撤回并丢掉改动（小心！）
git reset --hard HEAD~1

# 我已经 push 了，需要"反向"再 commit 一次撤销
git revert HEAD
git push
```

### 11.8 场景六：本地 .env 配置忘了

`.env` **不在 git 里**（被 `.gitignore` 排除）。如果丢了：

```powershell
cd D:\nocode\koc-copilot
Copy-Item server\.env.example server\.env
notepad server\.env
# 填入 DEEPSEEK_API_KEY 和 DOUBAO_API_KEY
```

服务器上的 `.env` 在 `/opt/kocopilot/server/.env`（root 可读写，`kocopilot` 用户只读）。

### 11.9 不可破坏的红线（这几条踩了会出大事）

| ❌ 不要做 | ✅ 应该做 |
|---|---|
| 在 `D:\nocode\` 父目录跑 git 命令 | 永远 `cd D:\nocode\koc-copilot` 再跑 |
| 把 API Key 写到任何 `*.md` 或 `*.html` 里 | 只放在 `server/.env`（已被 gitignore） |
| 在生产服务器手动改 `/opt/kocopilot/server/app/*.py` | 永远在本地改 → push → `deploy.sh`，让生产服务器 git pull |
| `git push --force` 到 main 分支 | 永远只 `git push`；要回退用 `git revert` |
| 直接 `kill -9` 服务进程 | 用 `systemctl restart kocopilot-server` |
| 删 `.git/` 目录 | 真的要重新开局，先做 `git clone` 一份当备份再说 |

### 11.10 报错关键字 → 怎么处理

| 看到这个 | 通常原因 | 处理 |
|---|---|---|
| `LLM 调用失败：HTTP 401` | DeepSeek Key 错或被封 | 去 platform.deepseek.com 重置 |
| `LLM 调用失败：HTTP 429` | 余额不足 / 触发限频 | 充值 / 等几分钟 |
| `ASR 失败：upstream 401` | 火山 Key 错 | 去火山控制台核对 |
| `502 Bad Gateway`（nginx） | 后端 systemd 服务挂了 | `systemctl restart kocopilot-server` |
| `gunicorn timeout` | 视频太长 / DeepSeek 卡 | 检查 `journalctl -u kocopilot-server` 看上游耗时 |
| pytest 找不到 `app` 模块 | cwd 不对 | `cd server` 后再跑，或用 `python -m pytest server/tests` |
| `git push` 弹浏览器登录 | 凭证过期 | 用浏览器登 GitHub 重新授权即可 |
| GitHub 拒绝 push 显示 secret detected | 不小心把 key 写进了文件 | 删 key、`git commit --amend`、再 push |
