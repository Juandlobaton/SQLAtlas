"""Presentation: Health check endpoint."""

from typing import Any

from fastapi import APIRouter

from src.config import settings

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "parsing-engine",
        "version": settings.app_version,
    }
