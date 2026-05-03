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
    script: str = Field(..., min_length=20, max_length=10000)
    platform: Literal["douyin", "xiaohongshu", "wechat_video", "bilibili"] = "douyin"
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
