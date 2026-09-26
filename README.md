# Vux AI Studio

Vux AI Studio is a privacy-first assistant workspace for chat, ideation, and creative problem solving.

The app is designed to feel like a clean AI studio experience while keeping the identity focused on Vux and using the GTB AI SYSTEM

## What this app includes

- Chat experience with a Vux-branded interface
- Private, username-scoped local history
- English-first responses for non-coding prompts
- Secure server-side handling for AI requests
- Clean, dark-blue modern UI

## Local setup

```bash
cd forge-ai-studio
cp .env.example .env
# add your environment values in .env
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Deployment

This app is designed to run as a persistent Node server, not as a static-only site.

For public deployment, the recommended setup is:

- backend hosted on a Node-capable platform
- frontend served from a static host if needed
- secrets stored only on the server

## Security and privacy

- Keep API keys on the server only
- Do not expose keys or provider details in the browser
- Avoid public sharing of the real environment file

## ESP32 Home Controller

The Home Controller reads the ESP32 through the Node server at `/api/v1/iot/esp32/status`. The server polls the firmware's `/api/telemetry` endpoint and optionally `/api/diag`; the browser never contacts the ESP32 directly.

For local use, connect the computer running Node to the ESP32 access point and open the local Home Controller. Configure `ESP32_BASE_URL`, `ESP32_STATE_PATH`, and `ESP32_DIAG_PATH` in the server environment when the device uses a different address or route. Do not store Wi-Fi credentials in source control.

For Vercel, the React website and Node API can be deployed together using the repository's Vercel configuration. Set `GEMINI_API_KEY` in Vercel Project Settings > Environment Variables for AI chat. Do not set the ESP32 URL to `192.168.4.1` on Vercel: that address is private and only reachable from the device's local Wi-Fi. Cloud telemetry requires a separate authenticated device-to-cloud bridge; public relay commands are intentionally not exposed. Terminal execution and project mutation endpoints are disabled in production.

To deploy, import this repository into Vercel with the repository root as the project root. The checked-in `vercel.json` builds the React app and routes `/api/*` through the serverless Express backend. Add `GEMINI_API_KEY` as a server-side environment variable in Vercel and redeploy; never add provider secrets to a `VITE_*` variable. The public site and AI API will work, but live device status stays unavailable in Vercel until an authenticated outbound ESP32-to-cloud bridge is implemented. For production AI abuse protection, configure Vercel Firewall rate limits or a shared rate-limit store; per-instance Express limits are not a global serverless quota.

The supplied FW 1.2 telemetry includes ACS712 current validity, room sensor state, relay state, protection state, and raw diagnostics. Voltage is marked unavailable by that firmware. The cloud dashboard must not infer or replace invalid readings.

## Branding

This project is developed by Game Theory Building Studio and intentionally branded as Vux AI Studio across the app surface and identity layer.

If you want to adjust the look further, update the UI colors and text in the public interface without exposing any model provider details in the user-facing copy.

## Notes

- Session history is kept locally per username for a simple privacy-friendly flow.
- The app is designed to present itself consistently as Vux AI Studio, not as a vendor-specific tool.
- The system prompt and app identity are kept vendor-neutral by design.

If you want new features later, they can be added without changing the public Vux identity.