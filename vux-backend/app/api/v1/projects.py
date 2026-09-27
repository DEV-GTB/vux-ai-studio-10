from fastapi import (
    APIRouter,
    Depends,
)

from app.schemas.chat import CreateProject
from app.core.security import get_current_user
from app.db.supabase import supabase


router = APIRouter()


@router.post("")
async def create_project(
    request: CreateProject,
    user=Depends(get_current_user),
):

    result = supabase.table(
        "projects"
    ).insert({
        "user_id": user["id"],
        "name": request.name,
        "description":
            request.description,
    }).execute()

    return {
        "success": True,
        "project": result.data[0],
    }


@router.get("")
async def list_projects(
    user=Depends(get_current_user),
):

    result = supabase.table(
        "projects"
    ).select("*").eq(
        "user_id",
        user["id"]
    ).order(
        "updated_at",
        desc=True
    ).execute()

    return {
        "projects": result.data
    }
