"""Pydantic request/response schemas for all API endpoints.

Design rationale:
- Single Responsibility: this file only defines I/O contracts; no business logic.
- Each endpoint has a clearly named request/response pair (Interface Segregation).
- Optional fields default to None / [] / "" so frontend can submit partial data during draft.
- We keep field names snake_case in JSON to match Python conventions; frontend should adapt.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# =========================================================================
# Health
# =========================================================================
class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    version: str
    llm_provider: str
    asr_provider: str


# =========================================================================
# Module 2 — Persona Generation
# =========================================================================
class PersonaRequest(BaseModel):
    background: str = Field(..., min_length=1, max_length=500, description="职业背景")
    interests: str = Field(..., min_length=1, max_length=500, description="兴趣 / 可拍内容")
    resources: str = Field(..., min_length=1, max_length=500, description="可用资源")


class PersonaPlan(BaseModel):
    name: str = Field(..., description="人设名（短句标题）")
    differentiation: str = Field(..., description="差异化逻辑")
    rationale: str = Field(..., description="为什么这个人设值得做")
    reference_accounts: List[str] = Field(default_factory=list, description="对标账号示意")
    onboarding_advice: str = Field(..., description="起号建议")
    monetization_outlook: str = Field(..., description="变现预判")
    score: int = Field(..., ge=1, le=5, description="推荐星级 1-5")


class PersonaResponse(BaseModel):
    personas: List[PersonaPlan] = Field(..., min_length=1, max_length=5)
    model_used: str
    elapsed_ms: int


# =========================================================================
# Module 1 — Skeleton Extraction (脚本拆解)
# =========================================================================
class SkeletonRequest(BaseModel):
    """v0.1：只接受文本输入；ASR 路径在 /api/asr/transcribe 单独提供。"""
    transcript: str = Field(..., min_length=20, max_length=10000, description="视频台词文本")
    persona_hint: Optional[str] = Field(default=None, max_length=500, description="用户当前人设上下文（可选）")


class NarrativeBeat(BaseModel):
    timestamp: str = Field(..., description="时间区间，如 0:05-1:30")
    title: str
    description: str
    emotion_arc: Optional[str] = None


class HookSection(BaseModel):
    strategy: Literal[
        "痛点前置", "反常识陈述", "悬念提问", "视觉冲击", "身份认同", "数字罗列", "其他"
    ]
    text: str = Field(..., description="原视频前 3 秒台词原文")
    explanation: str = Field(..., description="钩子设计原理与可迁移方法论")


class CTASection(BaseModel):
    strategy: Literal[
        "点赞收藏", "评论区留言", "关注追更", "引导私域", "其他"
    ]
    text: str
    explanation: str


class SkeletonResponse(BaseModel):
    hook: HookSection
    body: List[NarrativeBeat]
    cta: CTASection
    transferable_template: str = Field(..., description="去除原内容、保留结构的可复用模板")
    model_used: str
    elapsed_ms: int


# =========================================================================
# Module 3 — SEO / Metadata
# =========================================================================
class SEORequest(BaseModel):
    """Module 3 request payload.

    `platform` is currently locked to "douyin" (the multi-platform picker was
    removed from the UI). The field is kept (instead of dropped) so older
    clients that still send `platform=douyin` keep working, and so we have a
    forward-compat seam for future platform-specific prompt files.
    """

    script: str = Field(..., min_length=20, max_length=10000)
    platform: Literal["douyin"] = "douyin"
    persona_hint: Optional[str] = Field(default=None, max_length=500)


class TitleCandidate(BaseModel):
    type: Literal["反常识型", "数字型", "身份型", "痛点型", "悬念型", "其他"]
    text: str
    char_count: int
    notes: Optional[str] = None


class TagCluster(BaseModel):
    broad_traffic: List[str] = Field(default_factory=list, description="泛流量词")
    long_tail: List[str] = Field(default_factory=list, description="精准长尾词")
    challenge_topics: List[str] = Field(default_factory=list, description="话题挑战")


class SEOResponse(BaseModel):
    titles: List[TitleCandidate] = Field(..., min_length=3, max_length=8)
    description: str = Field(..., max_length=200)
    tags: TagCluster
    platform: str
    model_used: str
    elapsed_ms: int


# =========================================================================
# Module 4 — Comments Sorting
# =========================================================================
class CommentsRequest(BaseModel):
    raw_text: str = Field(..., min_length=10, max_length=20000, description="原始评论区文本（每行一条）")
    persona_hint: Optional[str] = Field(default=None, max_length=500)


class ReplyDraft(BaseModel):
    tone: Literal["专业解读", "幽默调侃", "共情安抚"]
    text: str = Field(..., max_length=300)


class ClassifiedComment(BaseModel):
    author: Optional[str] = None
    text: str
    classification: Literal["干货提问", "争议探讨", "高互动潜力", "下期选题", "敏感场", "中价值", "灌水"]
    replies: List[ReplyDraft] = Field(default_factory=list)


class CommentsResponse(BaseModel):
    high_value: List[ClassifiedComment]
    medium_value: List[ClassifiedComment]
    low_value_count: int = Field(..., description="低价值灌水仅返回数量，不返回内容")
    model_used: str
    elapsed_ms: int


# =========================================================================
# Module 5 — Guided Q&A (引导式问答)
# =========================================================================
# 设计哲学：
#   feature-1 的第 3 步把"对标拆解"转化为"原创素材"——不是让 AI 替用户写，
#   而是用 ≤ 3 轮纯选项题让用户做出 3 个关键创作决策（Hook 角度 / Body 切入 / CTA 风格）。
#
# 为什么不开放自由输入：
#   早期方案曾保留「让我自己输入…」自由文本出口，但实测发现：
#   1. 用户一旦写自由文本，对话很容易"发散"，下一轮问题失去锚点；
#   2. LLM 把自由文本回填到下一轮 prompt 里时，会出现"重复确认"循环；
#   3. v0.x 阶段优先保收敛、保产物质量，自由输入留到后续版本再做。
#   所以现在 100% 是"AI 出 3-4 个具体可朗读选项 → 用户单选 → 进入下一轮"。
#
# 轮次约束：
#   MAX_QA_ROUNDS = 3 —— 3 轮足以覆盖 Hook / Body 关键差异化 / CTA 三个核心维度，
#   超过 3 轮用户就会失去耐心。Router 在 answers 数组长度 ≥ 3 时直接返回 done=true
#   而不再调用 LLM——确定性收敛。
MAX_QA_ROUNDS = 3


class QAAnswer(BaseModel):
    """已答轮次的回放（前端把累积历史回传给后端，让 AI 出下一题时知道前面选了什么）。"""

    round: int = Field(..., ge=1, le=MAX_QA_ROUNDS)
    question: str = Field(..., max_length=500)
    choice: str = Field(..., min_length=1, max_length=500, description="用户选中的那个 option.label 文本")


class QARequest(BaseModel):
    """每一轮问答的请求体；前端在每次 /next 调用时回传完整 history。"""

    skeleton: dict = Field(..., description="第 2 步生成的骨架（hook/body/cta）原样回传")
    transcript: Optional[str] = Field(default=None, max_length=10000, description="原视频台词（可选，给 AI 补充上下文）")
    persona_hint: Optional[str] = Field(default=None, max_length=500, description="当前人设")
    # 用户在第 3 步开始前自行填的「创作要求」——时长 / 节奏 / 风格 / 自由补充。
    # 这个字段只是『软约束』：影响 LLM 出题选项的取向（如时长 = 30s 时 options 就该短促有冲击），
    # 不影响轮次硬收敛（Router 仍按 MAX_QA_ROUNDS 拦截）。
    brief: Optional[str] = Field(default=None, max_length=1000, description="用户自填的创作要求（时长/节奏/风格/自由补充）")
    answers: List[QAAnswer] = Field(default_factory=list, max_length=MAX_QA_ROUNDS)


class QAOption(BaseModel):
    """单选选项；不再有 freeform 出口，所有选项都是 AI 提前生成的可朗读具体内容。"""

    label: str = Field(..., min_length=1, max_length=200)


class QAResponse(BaseModel):
    """单轮回复：要么是新一轮的题，要么是 done=True 进入脚本阶段。"""

    round: int = Field(..., ge=1, le=MAX_QA_ROUNDS)
    done: bool = Field(..., description="True 时前端跳到第 4 步生成脚本，忽略 question/options")
    question: Optional[str] = Field(default=None, max_length=500)
    rationale: Optional[str] = Field(default=None, max_length=300, description="给前端可选展示的『为什么问这个』")
    options: List[QAOption] = Field(default_factory=list, max_length=4)
    model_used: str
    elapsed_ms: int


# =========================================================================
# Module 6 — Final Script (基于骨架 + Q&A 回答生成原创分镜脚本)
# =========================================================================
class ScriptRequest(BaseModel):
    skeleton: dict = Field(..., description="第 2 步骨架原样回传")
    answers: List[QAAnswer] = Field(default_factory=list, max_length=MAX_QA_ROUNDS)
    persona_hint: Optional[str] = Field(default=None, max_length=500)
    transcript: Optional[str] = Field(default=None, max_length=10000)
    # 与 QARequest.brief 一致——前端把第 3 步开始前用户填的创作要求继续透传到第 4 步，
    # 让脚本生成阶段做到「时长/节奏/风格」与出题阶段保持一致。
    brief: Optional[str] = Field(default=None, max_length=1000, description="用户自填的创作要求（时长/节奏/风格/自由补充）")


class ScriptScene(BaseModel):
    """脚本里一个分镜片段。结构刻意与 NarrativeBeat 对齐，方便前端复用 .koc-skeleton 卡片样式。"""

    timestamp: str
    title: str
    narration: str = Field(..., description="该片段的具体口播文字（创作者可直接朗读）")
    visual: Optional[str] = Field(default=None, max_length=500, description="画面/镜头建议")


class ScriptResponse(BaseModel):
    hook_narration: str = Field(..., max_length=500, description="开场 3 秒的口播台词")
    scenes: List[ScriptScene] = Field(..., min_length=2, max_length=8)
    cta_narration: str = Field(..., max_length=500)
    full_text: str = Field(..., description="拼接后的完整脚本纯文本（供前端一键复制）")
    model_used: str
    elapsed_ms: int


# =========================================================================
# ASR — separate endpoint (only used by Module 1's frontend uploader)
# =========================================================================
class ASRResponse(BaseModel):
    transcript: str
    duration_seconds: float
    provider: str
    elapsed_ms: int


# =========================================================================
# Common error envelope
# =========================================================================
class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
    trace_id: Optional[str] = None
