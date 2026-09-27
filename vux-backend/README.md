# Vux AI Backend

FastAPI backend for Vux AI Studio with Supabase and Gemini integration.

## Architecture

```
Frontend (React)
    ↓ HTTPS
FastAPI Backend
    ↓
AI Router
    ↓
Gemini / Other Providers
    ↓
Supabase (Auth, PostgreSQL, Storage, pgvector)
```

## Features

- **Authentication**: JWT-based auth with Supabase
- **Chat**: Multi-modal AI chat with Gemini
- **Files**: Upload and manage files with validation
- **Images**: AI image generation
- **Projects**: Project management for AI development
- **AI Abstraction**: Provider-agnostic AI routing

## Setup

### Prerequisites

- Python 3.13+
- Supabase project
- Gemini API key

### Installation

1. Create virtual environment:
```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
APP_NAME=Vux AI Backend
APP_ENV=development

FRONTEND_URL=http://localhost:5173

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret

GEMINI_API_KEY=your-secret

GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image

MAX_FILE_SIZE_MB=50
MAX_IMAGE_SIZE_MB=20

RATE_LIMIT_PER_MINUTE=30
```

### Database Setup

Run the migration in Supabase SQL editor:
```bash
cat migrations/001_initial.sql
```

This creates:
- Profiles, projects, conversations, messages tables
- Files, generations, usage tables
- Embeddings with pgvector
- Row-level security policies

### Create Supabase Storage Buckets

Create these buckets in Supabase:
- `user-files`
- `generated-images`
- `project-files`

## Running

### Development

```bash
uvicorn app.main:app --reload
```

Server runs at `http://localhost:8000`

API docs at `http://localhost:8000/docs`

### Docker

```bash
docker-compose up --build
```

## API Endpoints

### Health
- `GET /` - Root endpoint
- `GET /api/v1/health` - Health check

### Chat
- `POST /api/v1/chat` - Send chat message

### Files
- `POST /api/v1/files/upload` - Upload file

### Images
- `POST /api/v1/images/generate` - Generate image

### Projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects` - List projects

## Authentication

All protected endpoints require:
```
Authorization: Bearer <supabase_jwt_token>
```

The backend validates the JWT and extracts user ID.

## AI Provider Architecture

The backend uses an AI Router pattern:

```python
AI Router
├── GeminiProvider
├── OpenAIProvider (future)
├── AnthropicProvider (future)
└── LocalProvider (future)
```

This allows easy provider switching without frontend changes.

## File Validation

Supported MIME types:
- Images: jpeg, png, webp, gif
- Audio: mpeg, wav, ogg
- Video: mp4, webm
- Documents: pdf
- Text: plain, markdown, json, html, css, javascript

## Security

- JWT authentication with Supabase
- Row-level security on all tables
- File ownership verification
- File type and size validation
- CORS configured for frontend

## Project Structure

```
vux-backend/
├── app/
│   ├── api/v1/          # API endpoints
│   ├── core/            # Config, security
│   ├── db/              # Database clients
│   ├── models/          # Database models
│   ├── schemas/         # Pydantic schemas
│   ├── services/         # Business logic
│   │   ├── ai/          # AI providers
│   │   ├── files/       # File services
│   │   └── agents/      # Agent services
│   └── main.py          # FastAPI app
├── migrations/          # SQL migrations
├── tests/               # Tests
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Development

### Adding a New AI Provider

1. Create provider in `app/services/ai/`:
```python
from app.services.ai.base import AIProvider

class NewProvider(AIProvider):
    async def generate(self, contents, model, system_instruction=None):
        # Implementation
        pass

    async def generate_image(self, prompt, model):
        # Implementation
        pass
```

2. Add to AI Router in `app/services/ai/router.py`

### Adding a New Endpoint

1. Create schema in `app/schemas/`
2. Create endpoint in `app/api/v1/`
3. Register in `app/api/v1/router.py`

## License

MIT
