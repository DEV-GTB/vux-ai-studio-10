# VUX AI

VUX AI is a private, full-stack AI workspace for secure chat, creative image and 3D generation, project intelligence, local-first training, and knowledge retrieval. It is designed to run as a self-hosted developer tool and keeps training datasets, private adapters, knowledge storage, and runtime artifacts outside the public site.

The product is owned and operated as **VUX AI** by GTB Studio (Game Theory Building Studio). The assistant, UI copy, and error handling all speak as VUX AI.

## What VUX AI includes

- Intelligent chat assistant for coding help, explanations, refactors, tests, and documentation
- Image generation with quality and resolution guidance (1K / 2K / 4K / 8K presets) and clarity-focused prompt sentences
- Image editing workflows with reference images and upscaling
- 3D object generation and preview workflows
- Coding workspace with file tree, editor, terminal, and preview panels
- Connected-home control surface for ESP32 devices
- Private knowledge ingestion and search
- Private, server-side AI training utilities
- Local file storage, backup, and restore support
- Security controls including access codes, rate limiting, and safe generic error responses

## Local setup

1. Install Node.js 18 or newer.
2. Install dependencies:

   ```powershell
   npm install
   ```

3. Create a local environment file from the example:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Add your private credentials to `.env`. Do not commit `.env`; it is intentionally ignored.
5. Start the backend:

   ```powershell
   node server.js
   ```

6. Open the application at the configured address and complete the setup flow.

## Frontend development

```powershell
cd forge-ai-studio-react
npm install
npm run build
```

The main site uses component-level transitions, smooth sidebar navigation, loading states, and small entrance animations for feature workspaces.

## Security and privacy

- Provider keys and private configuration belong only in the backend environment
- The environment file containing secrets must never be committed
- Terminal execution and project mutation endpoints are disabled in production
- Private training files are not served through the public interface
- All errors are returned as safe generic messages

## Training and knowledge

- Training datasets, adapters, generated artifacts, and knowledge databases are stored privately server-side
- Seed knowledge is used only when explicitly configured
- Training and retrieval flows use protected backend routes

## Deployment

- Use the included deployment files for container and platform deployment
- Configure environment variables on the hosting platform, not in public files
- Keep private service endpoints behind authenticated access
- Configure rate limiting and access controls before exposing the application

## Development

- Run tests:

  ```powershell
  npm test
  ```

- Keep changes consistent with the existing route, library, and page structure
- Avoid putting secrets in public JavaScript bundles
- Keep user-facing copy generic and free of implementation details

## License

See `LICENSE` for licensing information.
