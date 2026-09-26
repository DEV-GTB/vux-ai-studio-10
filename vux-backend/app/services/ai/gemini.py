from google import genai
from google.genai import types

from app.core.config import settings
from app.services.ai.base import AIProvider


class GeminiProvider(AIProvider):

    def __init__(self):
        self.client = genai.Client(
            api_key=settings.gemini_api_key
        )

    async def generate(
        self,
        contents,
        model=None,
        system_instruction=None,
    ):
        model = model or settings.gemini_text_model

        config = None

        if system_instruction:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction
            )

        response = self.client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

        return {
            "text": response.text,
            "model": model,
        }

    async def generate_image(
        self,
        prompt,
        model=None,
    ):
        model = model or settings.gemini_image_model

        response = self.client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE', 'TEXT']
            ),
        )

        # Extract image data from response
        image_data = None
        for candidate in response.candidates:
            for part in candidate.content.parts:
                if part.inline_data and part.inline_data.data:
                    image_data = part.inline_data.data
                    break

        return {
            "image": image_data,
            "model": model,
        }
