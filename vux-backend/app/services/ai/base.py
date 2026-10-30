from abc import ABC, abstractmethod
from typing import Any


class AIProvider(ABC):

    @abstractmethod
    async def generate(
        self,
        contents,
        model,
        system_instruction=None,
    ):
        raise NotImplementedError

    @abstractmethod
    async def generate_image(
        self,
        prompt,
        model,
    ):
        raise NotImplementedError
