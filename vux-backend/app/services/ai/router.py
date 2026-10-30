from app.services.ai.gemini_flash import GeminiFlashProvider


class AIRouter:

    def __init__(self):
        self.gemini = GeminiFlashProvider()

    async def chat(
        self,
        provider: str,
        contents,
        model: str | None = None,
        system_instruction: str | None = None,
    ):

        if provider == "gemini":
            return await self.gemini.generate(
                contents=contents,
                model=model,
                system_instruction=system_instruction,
            )

        raise ValueError(
            f"Unsupported provider: {provider}"
        )

    async def generate_image(
        self,
        provider: str,
        prompt: str,
        model: str | None = None,
    ):
        if provider == "gemini":
            return await self.gemini.generate_image(
                prompt=prompt,
                model=model,
            )

        raise ValueError(
            f"Unsupported provider: {provider}"
        )
