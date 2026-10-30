from pydantic import BaseModel, Field


class ChatAttachment(BaseModel):
    file_id: str


class ChatRequest(BaseModel):

    conversation_id: str | None = None

    message: str = Field(
        min_length=1,
        max_length=100000,
    )

    model: str | None = None

    provider: str = "gemini"

    attachments: list[ChatAttachment] = []

    thinking_level: str | None = None


class ImageGenerationRequest(BaseModel):
    prompt: str
    model: str | None = None


class CreateProject(BaseModel):
    name: str
    description: str | None = None
