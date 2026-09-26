ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",

    "audio/mpeg",
    "audio/wav",
    "audio/ogg",

    "video/mp4",
    "video/webm",

    "application/pdf",

    "text/plain",
    "text/markdown",
    "application/json",

    "text/html",
    "text/css",
    "text/javascript",

    "application/javascript",
}


def validate_file(
    content_type: str,
    size: int,
    max_size: int,
):
    if content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(
            f"Unsupported file type: {content_type}"
        )

    if size > max_size:
        raise ValueError(
            "File exceeds maximum allowed size"
        )
