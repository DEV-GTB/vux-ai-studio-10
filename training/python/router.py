"""Minimal task router. Port this logic to app/router.py or Node as needed."""
ROUTES = {
    "coding": "coding",
    "debugging": "coding",
    "code_review": "coding",
    "mathematics": "knowledge",
    "india_knowledge": "knowledge",
    "kerala_knowledge": "knowledge",
    "translation": "translation",
    "image_generation": "image",
    "video_generation": "video",
    "3d_generation": "three_d",
    "music_generation": "music",
}


def choose_model(task):
    return ROUTES.get(task, "general")


if __name__ == "__main__":
    for t in ["coding", "mathematics", "unknown"]:
        print(t, "->", choose_model(t))
