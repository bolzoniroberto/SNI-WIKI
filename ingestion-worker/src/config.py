from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    wikijs_url: str = "http://wiki:3000"
    wikijs_token: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_model_heavy: str = "gemini-2.5-pro"
    embedding_model: str = "text-embedding-004"
    inbox_dir: Path = Path("/app/inbox")
    ocr_lang: str = "ita"
    ocr_text_threshold_chars: int = 100  # per page; below => treat as scanned
    glm_ocr_url: str = ""  # e.g. http://host.docker.internal:11434
    glm_ocr_model: str = "glm-ocr:latest"

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def glm_ocr_enabled(self) -> bool:
        return bool(self.glm_ocr_url)


settings = Settings()
