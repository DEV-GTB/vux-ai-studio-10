import uuid

from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    HTTPException,
)

from app.core.security import get_current_user
from app.core.config import settings
from app.services.files.validator import validate_file
from app.db.supabase import supabase


router = APIRouter()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):

    data = await file.read()

    max_size = (
        settings.max_file_size_mb
        * 1024
        * 1024
    )

    try:
        validate_file(
            file.content_type or "",
            len(data),
            max_size,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    extension = ""

    if file.filename and "." in file.filename:
        extension = (
            "." + file.filename.split(".")[-1]
        )

    object_name = (
        f"{user['id']}/"
        f"{uuid.uuid4()}"
        f"{extension}"
    )

    supabase.storage \
        .from_("user-files") \
        .upload(
            object_name,
            data,
            {
                "content-type":
                    file.content_type
                    or "application/octet-stream"
            },
        )

    record = supabase.table(
        "files"
    ).insert({
        "user_id": user["id"],
        "filename": file.filename,
        "storage_path": object_name,
        "mime_type": file.content_type,
        "size_bytes": len(data),
    }).execute()

    return {
        "success": True,
        "file": record.data[0],
    }
