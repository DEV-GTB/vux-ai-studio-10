# ESP32 Local Control

This is an alternative to Render/Vercel for nearby control. The ESP32 hosts its own password-protected Wi-Fi network and webpage. The phone joins that network and opens `http://192.168.4.1/`; the phone hotspot, cloud API, and database are not used.

## Upload

1. Open `esp32/nexus_local_control/nexus_local_control.ino` in Arduino IDE 1.8.19 or newer. Keep the existing MQTT sketch unchanged.
2. Install **esp32 by Espressif Systems** from **Tools > Board > Boards Manager**, then select **ESP32 Dev Module** and the board's **COM port**.
3. From **Sketch > Include Library > Manage Libraries...**, install **ArduinoJson** 6.21.x.
4. In the new sketch, replace `AP_PASSWORD` with your own Wi-Fi password of at least 8 characters. It intentionally refuses to start while the placeholder remains.
5. Click **Verify**, then **Upload**. Open **Tools > Serial Monitor** at `115200` baud. It should print `Wi-Fi: NEXUS-LOCAL` and `Open: http://192.168.4.1/`.
6. On the phone, open Wi-Fi settings and join **NEXUS-LOCAL** with the password you set. The phone may say “No internet”; stay connected. Open `http://192.168.4.1/` in the browser.

## Controls and protection

The page has separate Fan and Light OFF/ON controls for Room 1 and Room 2. It communicates directly with the ESP32; it does not call the website backend. ON requests are rejected while the local overcurrent latch is active, and the firmware turns all four relays off when the threshold is exceeded for the confirmation interval. Reset is allowed only after current remains below the threshold for three seconds.

The ACS712 sensitivity, zero-current voltage, and 3 A limit in this sketch are example calibration values, not verified safety limits. Test with relays disconnected or safe low-voltage loads first. Do not use the current estimate as a certified mains safety device; have the actual sensor, relay isolation, fusing, and wiring reviewed by a qualified person before connecting mains loads. The local page is available to anyone who knows the AP password, so keep it private and change it if disclosed.

This local-only sketch does not upload telemetry to Render and does not expose internet remote control. To return to cloud mode, upload the separate cloud firmware and use the cloud setup guide.