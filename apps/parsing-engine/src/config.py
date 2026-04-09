from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "SQLAtlas Parsing Engine"
    app_version: str = "0.1.0"
    debug: bool = False

    host: str = "0.0.0.0"  # noqa: S104
    port: int = 9300

    log_level: str = "INFO"
    log_format: str = "json"

    max_sql_length: int = 500_000
    parse_timeout_seconds: int = 60
    max_concurrent_parses: int = 5

    cors_origins: list[str] = ["http://localhost:9100", "http://localhost:9200"]

    api_key: str = ""

    model_config = {"env_prefix": "PARSER_", "env_file": ".env"}


settings = Settings()
