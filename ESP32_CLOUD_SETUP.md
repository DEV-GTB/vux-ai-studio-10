# ESP32 Cloud Setup

This guide connects the four-load `NEXUS-001` HTTP firmware to the Vux AI Studio dashboard. The Home Controller has separate Fan and Light ON/OFF buttons for each of its two rooms. The backend queues commands for the ESP32 to poll; device-side protection remains authoritative and must be tested with safe low-voltage loads first.

## 1. Rotate the exposed passwords

The Wi-Fi name and password pasted with the sketch should be treated as exposed. Change the phone hotspot password before connecting the device. Also rotate any provider API keys previously pasted into chat or source files. Keep replacement secrets out of the sketch except for the per-device token, which must be present on the ESP32 to authenticate it.

## 2. Deploy the backend to Render

1. Sign in to [Render](https://dashboard.render.com/). Click **New** > **Blueprint**.
2. Connect the GitHub account that contains this repository, select the repository and branch, then click **Apply**. Confirm Render reads the root `render.yaml` and the service plan is **Free**.
3. Render may ask for the variables marked `sync: false`. Enter these values in the Blueprint form, or later in the service's **Environment** tab. The app does not need a database.

   **Required to connect the ESP32 and view its telemetry:**

   | Variable | Value to enter |
   | --- | --- |
   | `NEXUS_DEVICE_TOKEN` | Generate a new private token using the PowerShell command below. Use the exact same token in the ESP32 sketch. |
   | `APP_ACCESS_CODE` | Create a different, private random code. You enter this in the website's Home Controller screen. |
   | `ALLOWED_ORIGIN` | Your exact Vercel site origin, e.g. `https://your-site.vercel.app`, no path or trailing slash. |

   **Only needed for the AI features:**

   | Variable | Value to enter |
   | --- | --- |
   | `GEMINI_API_KEY` | A newly rotated Gemini API key for chat. |
   | `HF_TOKEN` | A newly rotated Hugging Face token for image and 3D generation. |

   **Already supplied by `render.yaml`; normally leave these alone:**

   | Variable | Blueprint value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `GEMINI_MODEL` | `gemini-2.5-flash` |
   | `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image-preview` |
   | `RATE_LIMIT_WINDOW_MS` | `900000` |
   | `RATE_LIMIT_MAX` | `40` |
   | `NEXUS_DEVICE_ID` | `NEXUS-001`; supplied by the Blueprint. Keep this exact value in the firmware. |

4. Generate the device token in PowerShell. Run this command once for `NEXUS_DEVICE_TOKEN`, then run it again for a different `APP_ACCESS_CODE`. Save both privately; never commit or paste them into chat.

   ```powershell
   $bytes = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); -join ($bytes | ForEach-Object { $_.ToString('x2') }); $rng.Dispose()
   ```

5. Confirm the Blueprint value for `NEXUS_DEVICE_ID` is `NEXUS-001`. Set `ALLOWED_ORIGIN` to your current Vercel website address; you can correct it later if your domain changes.
6. Click **Deploy**. Wait for the service status to become **Live**. Copy its `https://...onrender.com` URL from the service page. Free Render services can sleep when idle and take about a minute to wake.
7. In a browser, open `https://YOUR-RENDER-URL/api/config`. A JSON response confirms the backend responds.

## 3. Point Vercel at Render

1. Open [Vercel](https://vercel.com/dashboard), select the existing Vux AI Studio project, then open **Settings** > **Environment Variables**.
2. Add the single frontend variable `VITE_API_BASE_URL` with the Render service URL, such as `https://vux-ai-studio.onrender.com` (no trailing slash). Select **Production** and any other environments where you test. Do not add provider keys or the device token to Vercel.
3. Click **Save**, then open **Deployments**, open the latest deployment's menu, and click **Redeploy**.
4. Copy the deployed website's exact origin. Return to Render > your service > **Environment**; set `ALLOWED_ORIGIN` to that origin if it was not entered during Blueprint setup. Save changes and let Render redeploy.
5. In the website, open **Home Controller** and enter the `APP_ACCESS_CODE` you set in Render. The code stays in page memory and is sent over HTTPS; it is not written into the frontend bundle or local storage.

## 4. Update the pasted ESP32 sketch

1. Install Arduino IDE 1.8.9 or newer. In **Tools** > **Board** > **Boards Manager**, search for **esp32 by Espressif Systems**, install it, then choose **Tools** > **Board** > **ESP32 Arduino** > **ESP32 Dev Module**.
2. Click **Sketch** > **Include Library** > **Manage Libraries...**. Search for and install **ArduinoJson** by Benoit Blanchon (version 6.21.x, because this sketch uses the v6 `DynamicJsonDocument` API), **Adafruit SSD1306**, and **Adafruit GFX Library**. Accept any prompt to install Adafruit dependencies. `WiFi`, `Wire`, `HTTPClient`, and `WiFiClientSecure` come with the ESP32 board package.
3. Set the sketch's Wi-Fi variables to your newly rotated phone hotspot credentials: `WIFI_SSID` is the hotspot name and `WIFI_PASSWORD` is its password. On the phone, enable the hotspot's **2.4 GHz** compatibility option if it has one; the ESP32 cannot join a 5 GHz-only hotspot.
4. Set `SERVER_URL` to your Render service origin, with no path, for example `https://vux-ai-studio.onrender.com`.
5. Set `DEVICE_ID` to `NEXUS-001`, exactly matching Render's `NEXUS_DEVICE_ID`.
6. Add this constant beside `DEVICE_ID`, using the same private value stored in Render's `NEXUS_DEVICE_TOKEN`:

   ```cpp
   const char* DEVICE_TOKEN = "your-private-device-token-from-render";
   ```

7. In `pollCommands()`, after a successful `http.begin(client, url)`, add an `Authorization` header before `http.GET()`. This is required; without it the API returns HTTP `401`:

   ```cpp
   http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
   ```

8. In `sendStatus()`, add the same `Authorization` header after `http.begin(client, url)` and before `http.POST(json)`. Both requests need the header.
9. The endpoint paths are `/api/device/poll?deviceId=` and `/api/device/status`. Polling returns `{"command":null}` when no action is waiting, or an object such as `{"command":{"command":"FAN_ON","room":1}}` after a dashboard button is pressed.
10. Do not use `client.setInsecure()` for a public deployment. It turns off HTTPS server-certificate verification, allowing an impersonated server to collect the device token. Configure the ESP32 TLS client with certificate verification using a trusted root CA before connecting real hardware.
11. Select **Tools** > **Port**, choose the ESP32's COM port, click **Verify**, then click **Upload**. Open **Tools** > **Serial Monitor**, choose `115200` baud, and confirm the device reports Wi-Fi connected and HTTP status `202` for status uploads and `200` for command polls.

## 5. Connect the phone hotspot and verify telemetry

1. Turn on the phone hotspot and leave mobile data enabled. The ESP32 joins it as a Wi-Fi client; it makes outbound HTTPS requests to Render. No port forwarding or inbound connection to the phone is needed.
2. Keep the phone within Wi-Fi range of the ESP32. Disable hotspot auto-off while testing. Some phones isolate hotspot clients or restrict traffic; if the ESP32 joins Wi-Fi but HTTPS fails, check hotspot client restrictions and mobile-data access.
3. Open the Vercel website, navigate to **Home Controller**, and wait for the first upload. Enter the `APP_ACCESS_CODE`. The two room panels show separate Fan and Light OFF/ON controls and the last device-reported state. Voltage and power remain unavailable because the pasted sketch does not measure voltage.
4. With the loads disconnected or using safe low-voltage test loads, press one appliance's **ON** button. The UI should say the command is queued, the ESP32 should receive it on its next poll, and the dashboard should confirm it after a fresh status upload. Test the matching **OFF** button. Test each fan and light separately. If a button is disabled, wait for fresh device telemetry or check the reported protection state.
5. In Render, open the service's **Logs** tab if the dashboard remains offline. The backend keeps the latest snapshot and pending commands in Node process memory; there is no database setup or telemetry history in this version.

## Safety and known limits

- Test first with relays disconnected or a safe low-voltage load. Mains wiring can cause fire, shock, or death; have a qualified person review isolation, relay ratings, fusing, enclosure, and fail-safe behavior.
- The pasted sketch's overcurrent threshold, ADC calibration, active-low relay logic, and room sensor interpretation must be validated against the actual hardware. Cloud telemetry is not a safety system.
- Render Free can sleep and has usage limits. The ESP32's three-second polling may wake it repeatedly; the first request after idle can be delayed. The device must continue local protection regardless of cloud state.
- No database is required for this prototype. The latest device snapshot and queued commands are held in Render process memory, so they are lost if Render restarts or redeploys. The ESP32 sends another status on its next 10-second cycle; the dashboard may show offline until that upload arrives. This design is intended for one Render instance and does not retain history.
- A single `NEXUS_DEVICE_TOKEN` is shared between the firmware and backend. Anyone who extracts it from physical firmware can impersonate the device; rotate it immediately if the board or firmware image is exposed.
- `APP_ACCESS_CODE` is a shared dashboard gate, not individual user accounts. Everyone who can see device data must receive the code privately. Rotate it in Render if it is shared beyond the intended users.
- Cloud commands are limited to the four fan/light ON/OFF actions. The backend only queues ON while the latest device state is `NORMAL` or `RECOVERED`; the firmware must still enforce its local `protectionActive` check. OFF controls are available whenever the device is online. Never rely on the cloud as a safety interlock.
- The current simple poll protocol has no per-command acknowledgement, expiry, or durable audit trail. The UI confirms a change only after the next telemetry upload reports the requested state. Do not expose remote controls widely or use them for mains switching until the protocol has stronger command IDs, expiry/replay protection, and independently reviewed hardware interlocks.