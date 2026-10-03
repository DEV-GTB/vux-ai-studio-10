# ESP32 Local-Only Setup

This sketch runs the two-room, four-relay controller as a standalone Wi-Fi access point. It does not join an uplink network or connect to Render or another server. Join `NEXUS-LOCAL` and open `http://192.168.4.1/` for direct control.

## Before you start

- Set a private AP password in the sketch before use. Do not commit real Wi-Fi credentials.
- Test with the relay board disconnected or safe low-voltage loads. Use appropriately rated external fuses and protection; this firmware does not detect overloads.

## Configure and upload the firmware

1. Open `esp32/nexus_hybrid_control/nexus_hybrid_control.ino` in Arduino IDE and set `AP_PASSWORD` to a private password of at least 8 characters.
2. In **Tools** > **Board** > **Boards Manager**, install **esp32 by Espressif Systems 3.3.0 or newer**, then choose **ESP32 Dev Module** and the correct COM port.
3. In **Sketch** > **Include Library** > **Manage Libraries...**, install **ArduinoJson 6.21.x**, **Adafruit GFX Library**, and **Adafruit SSD1306**. `WiFi`, `Wire`, and `WebServer` are supplied by the ESP32 board package.
4. Click **Verify**, then **Upload**. Open **Tools** > **Serial Monitor** at `115200` baud. The sketch starts `NEXUS-LOCAL` only.

## Wiring

| Part | ESP32 connection | Notes |
| --- | --- | --- |
| Room 1 fan relay input | GPIO 25 | Active-low relay input |
| Room 1 light relay input | GPIO 26 | Active-low relay input |
| Room 2 fan relay input | GPIO 27 | Active-low relay input |
| Room 2 light relay input | GPIO 14 | Active-low relay input |
| Room 1 sensor output | GPIO 35 | Digital input; use 3.3 V-compatible logic and a shared ground |
| Room 2 sensor output | GPIO 32 | Digital input; use 3.3 V-compatible logic and a shared ground |
| Relay module supply and ground | Per module rating | Share logic ground; keep mains isolated from the ESP32 |
| OLED SDA | GPIO 21 | I2C, address 0x3C |
| OLED SCL | GPIO 22 | I2C, address 0x3C |
| OLED power | 3V3 and GND | Confirm the OLED module accepts 3.3 V |

Power the relay module according to its rating and keep mains wiring isolated from the ESP32. GPIO 35 is input-only and has no internal pull-up. This sketch has no voltage sensor, current sensor, load-feedback input, or buzzer output.

## Connect nearby controls

1. Join the phone to the `NEXUS-LOCAL` Wi-Fi network using the `AP_PASSWORD` from the sketch. “No internet” is expected on this direct local connection; stay connected.
2. Open `http://192.168.4.1/`. The page has separate Room 1/Room 2 Fan and Light ON/OFF buttons, room sensor readings, AP client count, and uptime.
3. Local button requests go directly to the ESP32. Internet, Vercel, Render, and a database are not used by this firmware.

## Open from the website

1. Open the website and navigate to **Home Controller** while internet access is available.
2. Connect the phone or computer to `NEXUS-LOCAL`; keep the connection even if the OS reports that Wi-Fi has no internet.
3. Choose **ESP32 LOCAL**. It opens `http://192.168.4.1/` in a new tab, leaving the website open in its original tab.
4. If the browser blocks local-network access, approve its local-network prompt if shown.

## Limitations and safety

- The relay state reports only what the ESP32 commanded. It cannot confirm relay contacts, load voltage, current flow, or a broken wire.
- This firmware does not measure voltage or current and cannot detect an overload or wiring break. It has no buzzer output. The OLED and local page show relay commands, room sensor input values, AP clients, uptime, and the explicit absence of electrical monitoring.
- Verify relay polarity, GPIO wiring, isolation, and external fusing with a qualified person before connecting loads. Never rely on this prototype as a certified mains safety system.
- Local Wi-Fi password access allows relay control to anyone connected to the ESP32 AP. Keep the AP password private and rotate it if exposed.