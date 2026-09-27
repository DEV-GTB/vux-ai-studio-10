# ESP32 Local + Cloud Setup

This hybrid sketch combines the two-room, four-relay local controller with the existing Render HTTP API. The ESP32 always offers nearby control at `http://192.168.4.1/`; when configured with a separate Wi-Fi uplink, it also uploads status and polls Render for website commands. Local protection remains authoritative. The website's AI continues to run through Vercel and Render; the ESP32 does not host or run the AI model.

## Before you start

- Change the phone hotspot password and provider keys previously pasted into chat. Never commit the real Wi-Fi password, AP password, or device token.
- Test with the relay board disconnected or safe low-voltage loads. The ACS712 calibration and 3 A threshold are examples, not certified protection settings.
- A phone generally cannot be both the hotspot uplink and the Wi-Fi client controlling the ESP32 AP at the same time. For cloud + local webpage at once, connect the ESP32's `CLOUD_WIFI_SSID` to a separate router/second hotspot and connect the phone to `NEXUS-LOCAL`. Local controls still work without any cloud uplink.

## Configure the cloud service

The Vercel site and Render service are already live. Their API endpoints were checked; the chat route returned a Gemini response, and Render's browser CORS preflight accepts the Vercel origin.

1. In Render > `vux-ai-studio` > **Environment**, make sure these are set:
   - `NEXUS_DEVICE_ID` = `NEXUS-001`
   - `NEXUS_DEVICE_TOKEN` = a new private random token
   - `APP_ACCESS_CODE` = a separate private dashboard code
   - `ALLOWED_ORIGIN` = `https://vux-ai-studio-10.vercel.app`
   - `GEMINI_API_KEY` = a valid rotated Gemini key for website AI
2. In Vercel > project > **Settings** > **Environment Variables**, make sure `VITE_API_BASE_URL` is `https://vux-ai-studio.onrender.com`, then redeploy if you changed it.
3. Do not send either secret through chat or put it in a committed sketch.

## Configure and upload the firmware

1. In File Explorer, copy `esp32/nexus_hybrid_control/nexus_secrets.example.h` in the same folder and rename the copy to `nexus_secrets.h`. The real file is ignored by Git.
2. Open `esp32/nexus_hybrid_control/nexus_hybrid_control.ino` in Arduino IDE. Edit `nexus_secrets.h`: set `NEXUS_AP_PASSWORD` to a private password of at least 8 characters. For cloud mode also set `NEXUS_CLOUD_WIFI_SSID`, `NEXUS_CLOUD_WIFI_PASSWORD`, and the exact Render `NEXUS_DEVICE_TOKEN`; leave cloud values at `CHANGE_ME` for local-only mode.
3. In **Tools** > **Board** > **Boards Manager**, install **esp32 by Espressif Systems 3.3.0 or newer**, then choose **ESP32 Dev Module** and the correct COM port.
4. In **Sketch** > **Include Library** > **Manage Libraries...**, install **ArduinoJson 6.21.x**. `WiFi`, `WiFiClientSecure`, `HTTPClient`, `WebServer`, and `math.h` are supplied by the ESP32 board package.
5. Keep `DEVICE_ID` as `NEXUS-001` and `SERVER_URL` as `https://vux-ai-studio.onrender.com`. The sketch validates TLS against the verified GlobalSign ECC Root R4 certificate used by the current Render endpoint; if the endpoint's certificate chain changes, update the root after verifying it independently.
6. Click **Verify**, then **Upload**. Open **Tools** > **Serial Monitor** at `115200` baud.

## Connect nearby controls

1. Join the phone to the `NEXUS-LOCAL` Wi-Fi network using the `AP_PASSWORD` from the sketch. “No internet” is expected on this direct local connection; stay connected.
2. Open `http://192.168.4.1/`. The page has separate Room 1/Room 2 Fan and Light ON/OFF buttons, current estimate, sensor readings, and local protection status.
3. Local button requests go directly to the ESP32. Internet, Vercel, Render, and a database are not needed for nearby control.

## Connect the website and AI

1. To make Render reachable, the ESP32 must associate to the separate configured `CLOUD_WIFI_SSID`. Serial Monitor should show `Cloud status accepted: HTTP 202` every 10 seconds and should not show poll errors; successful polls return HTTP 200.
2. Open the deployed Vercel website, finish its sign-up/onboarding, navigate to **Home Controller**, and enter Render's `APP_ACCESS_CODE`. The device should appear after its first accepted upload.
3. Test one Fan/Light action at a time with safe low-voltage loads. The website queues commands in Render; the ESP32 fetches them on its next poll, checks its own protection state, changes the relay, then reports the new state on its next upload.
4. The website's AI chat is separate from relay control. It sends `/api/chat` to Render, which calls Gemini with the server-side `GEMINI_API_KEY`; the ESP32 never needs a Gemini key.
5. If a request fails, check Render > service > **Logs**. Firmware logs distinguish TLS/network errors from HTTP status codes: `401` means token/header mismatch, `403` means device ID mismatch, `400` means payload mismatch, `202` is an accepted upload, and poll `200` is success.

## Limitations and safety

- The ESP32 AP and STA share one Wi-Fi radio. Connecting its STA to a router may change the AP channel; nearby clients should reconnect automatically, but test the actual phone/router combination.
- Render Free can sleep/restart and keeps only the latest status and in-memory command queue. A restart clears pending data; the device re-uploads status on its next cycle.
- Sensor current is only an estimate. Validate ACS712 sensitivity, zero-current offset, threshold, relay polarity, GPIO wiring, isolation, and fusing with a qualified person. Never rely on the cloud or this prototype as a certified mains safety system.
- Local Wi-Fi password access allows relay control to anyone connected to the ESP32 AP. Keep the AP password private and rotate it if exposed.