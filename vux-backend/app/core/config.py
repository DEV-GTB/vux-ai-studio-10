from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Vux AI Backend"
    app_env: str = "development"

    frontend_url: str = "http://localhost:5173"

    supabase_url: str
    supabase_service_role_key: str

    gemini_api_key: str

    gemini_text_model: str = "gemini-3.8-flash"
    gemini_image_model: str = "gemini-3.1-flash-image"

    max_file_size_mb: int = 50
    max_image_size_mb: int = 20

    rate_limit_per_minute: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
