"""Application configuration loader.

Why this module exists:
- Centralizes all environment-variable parsing so business code never reads `os.environ` directly.
- Uses Pydantic BaseSettings to enforce type safety and provide sensible defaults.
- Allows hot reload during local dev (uvicorn --reload picks up .env changes on restart).

Design notes:
- Following Dependency Inversion: business code depends on `Settings`, not on `os` directly.
- `lru_cache` on `get_settings()` so the same Settings object is reused across the app.
"""
from functools import lru_cache
from pathlib import Path
from typing import List, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve project paths once at import time.
# Layout: <project_root>/server/app/config.py
_THIS_FILE = Path(__file__).resolve()
SERVER_DIR = _THIS_FILE.parent.parent          # .../koc-copilot/server
PROJECT_ROOT = SERVER_DIR.parent               # .../koc-copilot
DEFAULT_STATIC_ROOT = PROJECT_ROOT             # frontend lives at koc-copilot/*.html
DEFAULT_ENV_FILE = SERVER_DIR / ".env"


class Settings(BaseSettings):
    """All runtime configuration. Backed by environment variables and an optional `.env` file."""

    # === Server ===
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=8090)

    # === LLM ===
    llm_provider: Literal["mock", "deepseek"] = Field(default="mock")
    deepseek_api_key: str = Field(default="")
    deepseek_base_url: str = Field(default="https://api.deepseek.com")
    deepseek_model: str = Field(default="deepseek-chat")
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    llm_timeout_seconds: int = Field(default=60, ge=5, le=300)
    llm_max_tokens: int = Field(default=2048, ge=128, le=8192)

    # === ASR (Doubao 极速版 / turbo / flash) ===
    # 极速版 = 一次请求拿结果 + 支持 base64 inline 上传 → 不再需要公网 URL（PUBLIC_BASE_URL 已废弃）。
    asr_provider: Literal["mock", "doubao"] = Field(default="mock")
    doubao_api_key: str = Field(default="")
    doubao_resource_id: str = Field(default="volc.bigasr.auc_turbo")
    doubao_recognize_url: str = Field(
        default="https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
    )
    # 极速版上限 100MB / 2h，但我们再按出口带宽做收敛（推荐 ≤ 20MB），timeout 60s 给足余量。
    asr_timeout_seconds: int = Field(default=60, ge=10, le=300)

    # === CORS ===
    cors_origins: str = Field(default="*")

    # === Logging ===
    log_level: str = Field(default="INFO")
    log_dir: Path = Field(default=SERVER_DIR / "logs")

    # === Static files ===
    static_root: Path = Field(default=DEFAULT_STATIC_ROOT)

    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list. `*` stays as `["*"]`."""
        raw = self.cors_origins.strip()
        if not raw:
            return []
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        """Heuristic: production usually binds 0.0.0.0 or non-default port behind nginx."""
        return self.port != 8090 or self.host == "0.0.0.0"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance. Use this everywhere instead of `Settings()` directly."""
    return Settings()
