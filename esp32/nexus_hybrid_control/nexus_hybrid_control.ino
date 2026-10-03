#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <string.h>

namespace nexusHybrid {

constexpr char AP_SSID[] = "NEXUS-LOCAL";
const char* AP_PASSWORD = "CHANGE_ME_LOCALLY";

constexpr uint8_t ROOM1_FAN_PIN = 25;
constexpr uint8_t ROOM1_LIGHT_PIN = 26;
constexpr uint8_t ROOM2_FAN_PIN = 27;
constexpr uint8_t ROOM2_LIGHT_PIN = 14;
constexpr uint8_t ROOM1_SENSOR_PIN = 35;
constexpr uint8_t ROOM2_SENSOR_PIN = 32;
constexpr bool RELAY_ACTIVE_LOW = true;
constexpr uint8_t OLED_SDA_PIN = 21;
constexpr uint8_t OLED_SCL_PIN = 22;
constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;

constexpr uint32_t OLED_REFRESH_INTERVAL_MS = 1000;
constexpr uint32_t OLED_PAGE_INTERVAL_MS = 3000;

WebServer webServer(80);
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
bool displayReady = false;
bool room1Fan = false;
bool room1Light = false;
bool room2Fan = false;
bool room2Light = false;
uint32_t lastDisplayAt = 0;
uint32_t lastOledPageAt = 0;
uint8_t oledPage = 0;

struct DeviceSnapshot {
  bool room1Fan;
  bool room1Light;
  bool room2Fan;
  bool room2Light;
};

const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101512"><title>NEXUS Local Control</title>
<style>
:root{color-scheme:dark;--bg:#101512;--panel:#171e19;--line:#303b33;--ink:#eef2e8;--muted:#a1aea3;--lime:#b6ec72;--blue:#73d8d2;--red:#f28275}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 8% 0%,#263326 0,transparent 34%),var(--bg);color:var(--ink);font:16px system-ui,sans-serif}main{width:min(900px,100%);margin:auto;padding:28px 20px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}.eyebrow{color:var(--lime);font:700 11px ui-monospace,monospace;letter-spacing:.12em}h1{margin:6px 0 0;font-size:clamp(25px,6vw,36px)}.state{padding:8px 11px;border:1px solid var(--line);color:var(--muted);font:700 11px ui-monospace,monospace}.state.online{border-color:#536d3d;color:var(--lime)}.state.protected{border-color:#7d4139;color:var(--red)}.hint{margin:18px 0;color:var(--muted);font-size:13px;line-height:1.6}.rooms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.room{padding:18px;border:1px solid var(--line);background:var(--panel)}.room h2{margin:0 0 12px;font-size:19px}.load{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:13px 0;border-top:1px solid var(--line)}.load-name{font-weight:650}.load-state{display:block;margin-top:4px;color:var(--muted);font:700 11px ui-monospace,monospace}.load-state.on{color:var(--lime)}.buttons{display:flex;gap:5px;padding:3px;border:1px solid var(--line)}button{min-width:48px;min-height:38px;padding:0 10px;border:1px solid transparent;background:transparent;color:var(--muted);font:700 11px ui-monospace,monospace;cursor:pointer}button:hover:not(:disabled){border-color:var(--blue);color:var(--blue)}button.selected{border-color:#536d3d;background:#202a20;color:var(--lime)}button:disabled{cursor:not-allowed;opacity:.42}.metrics{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.metric{flex:1;min-width:150px;padding:13px;border:1px solid var(--line);background:#131a15}.metric span{display:block;color:var(--muted);font:700 10px ui-monospace,monospace}.metric strong{display:block;margin-top:7px;font:600 17px ui-monospace,monospace}.reset-button{margin-top:10px;border-color:var(--red);color:var(--red)}.reset-button[hidden]{display:none}.notice{min-height:24px;margin-top:16px;color:var(--blue);font-size:13px}.notice.error{color:var(--red)}.footer{margin-top:20px;color:var(--muted);font-size:12px;line-height:1.6}@media(max-width:620px){main{padding:20px 14px 36px}.rooms{grid-template-columns:1fr}.room{padding:15px}.load{gap:8px}.buttons button{min-width:44px}}
</style></head><body><main>
<header><div><div class="eyebrow">NEXUS / LOCAL CONTROL</div><h1>Home Control</h1></div><span id="connection" class="state">STARTING</span></header>
<p class="hint">Direct control over the NEXUS-LOCAL Wi-Fi network. This device does not connect to a cloud server.</p>
<section class="rooms" aria-label="Room appliances">
<article class="room"><h2>Room 1</h2><div class="load"><div><span class="load-name">Fan</span><span class="load-state" id="room1-fan-state">--</span></div><div class="buttons"><button id="room1-fan-off" onclick="setLoad(1,'fan',false)">OFF</button><button id="room1-fan-on" onclick="setLoad(1,'fan',true)">ON</button></div></div><div class="load"><div><span class="load-name">Light</span><span class="load-state" id="room1-light-state">--</span></div><div class="buttons"><button id="room1-light-off" onclick="setLoad(1,'light',false)">OFF</button><button id="room1-light-on" onclick="setLoad(1,'light',true)">ON</button></div></div><div class="metric"><span>ROOM SENSOR RAW</span><strong id="room1-sensor">--</strong></div></article>
<article class="room"><h2>Room 2</h2><div class="load"><div><span class="load-name">Fan</span><span class="load-state" id="room2-fan-state">--</span></div><div class="buttons"><button id="room2-fan-off" onclick="setLoad(2,'fan',false)">OFF</button><button id="room2-fan-on" onclick="setLoad(2,'fan',true)">ON</button></div></div><div class="load"><div><span class="load-name">Light</span><span class="load-state" id="room2-light-state">--</span></div><div class="buttons"><button id="room2-light-off" onclick="setLoad(2,'light',false)">OFF</button><button id="room2-light-on" onclick="setLoad(2,'light',true)">ON</button></div></div><div class="metric"><span>ROOM SENSOR RAW</span><strong id="room2-sensor">--</strong></div></article></section>
<section class="metrics" aria-label="Device status"><div class="metric"><span>DEVICE STATE</span><strong id="device-state">AVAILABLE</strong></div><div class="metric"><span>ACCESS POINT CLIENTS</span><strong id="clients">0</strong></div><div class="metric"><span>UPTIME</span><strong id="uptime">--</strong></div></section>
<p id="notice" class="notice" role="status"></p><p class="footer">Current monitoring is not installed. Use properly rated relays, fuses, and wiring; this controller does not detect overloads.</p></main>
<script>
function message(text,error=false){const el=document.querySelector('#notice');el.textContent=text;el.classList.toggle('error',error)}
function paint(room,name,on){const key=`room${room}-${name}`;const state=document.querySelector(`#${key}-state`);state.textContent=on?'ON':'OFF';state.classList.toggle('on',on);document.querySelector(`#${key}-on`).classList.toggle('selected',on);document.querySelector(`#${key}-off`).classList.toggle('selected',!on);document.querySelector(`#${key}-on`).disabled=on;document.querySelector(`#${key}-off`).disabled=!on}
async function refresh(){try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error(`State HTTP ${r.status}`);const d=await r.json();const badge=document.querySelector('#connection');badge.textContent='LOCAL ONLINE';badge.classList.add('online');document.querySelector('#device-state').textContent='AVAILABLE';document.querySelector('#clients').textContent=d.apClients;document.querySelector('#uptime').textContent=`${d.uptime}s`;document.querySelector('#room1-sensor').textContent=d.room1Sensor;document.querySelector('#room2-sensor').textContent=d.room2Sensor;paint(1,'fan',d.room1Fan);paint(1,'light',d.room1Light);paint(2,'fan',d.room2Fan);paint(2,'light',d.room2Light)}catch(e){const badge=document.querySelector('#connection');badge.textContent='DEVICE OFFLINE';badge.classList.remove('online');message(e.message,true)}}
async function setLoad(room,appliance,on){try{const r=await fetch('/api/relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,appliance,on})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||`Command HTTP ${r.status}`);message(`Room ${room} ${appliance} ${on?'ON':'OFF'} set.`);await refresh()}catch(e){message(e.message,true)}}
refresh();setInterval(refresh,1000)
</script></body></html>
)HTML";

DeviceSnapshot readDeviceSnapshot() {
  DeviceSnapshot snapshot;
  snapshot.room1Fan = room1Fan;
  snapshot.room1Light = room1Light;
  snapshot.room2Fan = room2Fan;
  snapshot.room2Light = room2Light;
  return snapshot;
}

bool apPasswordIsConfigured() {
  return AP_PASSWORD[0] != '\0' && strlen(AP_PASSWORD) >= 8 && strcmp(AP_PASSWORD, "CHANGE_ME_LOCALLY") != 0;
}

void setRelay(uint8_t pin, bool on) {
  digitalWrite(pin, RELAY_ACTIVE_LOW ? !on : on);
}

void allLoadsOff() {
  room1Fan = room1Light = room2Fan = room2Light = false;
  setRelay(ROOM1_FAN_PIN, false);
  setRelay(ROOM1_LIGHT_PIN, false);
  setRelay(ROOM2_FAN_PIN, false);
  setRelay(ROOM2_LIGHT_PIN, false);
}

bool setAppliance(uint8_t room, const char* appliance, bool on) {
  if (room < 1 || room > 2 || !appliance) return false;
  uint8_t pin = 0;
  bool* state = nullptr;
  if (room == 1 && strcmp(appliance, "fan") == 0) { pin = ROOM1_FAN_PIN; state = &room1Fan; }
  else if (room == 1 && strcmp(appliance, "light") == 0) { pin = ROOM1_LIGHT_PIN; state = &room1Light; }
  else if (room == 2 && strcmp(appliance, "fan") == 0) { pin = ROOM2_FAN_PIN; state = &room2Fan; }
  else if (room == 2 && strcmp(appliance, "light") == 0) { pin = ROOM2_LIGHT_PIN; state = &room2Light; }
  if (!state) return false;

  setRelay(pin, on);
  *state = on;
  return true;
}

void updateDisplay() {
  if (!displayReady || millis() - lastDisplayAt < OLED_REFRESH_INTERVAL_MS) return;
  lastDisplayAt = millis();
  const DeviceSnapshot snapshot = readDeviceSnapshot();
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  if (millis() - lastOledPageAt >= OLED_PAGE_INTERVAL_MS) {
    oledPage = (oledPage + 1) % 3;
    lastOledPageAt = millis();
  }

  if (oledPage == 0) {
    const uint32_t uptime = millis() / 1000;
    display.println("NEXUS LOCAL CONTROL");
    display.printf("IP: %s\n", WiFi.softAPIP().toString().c_str());
    display.printf("Clients: %u\n", WiFi.softAPgetStationNum());
    display.printf("Uptime: %luh %02lum\n", uptime / 3600, (uptime / 60) % 60);
    display.printf("R1 F:%s L:%s\n", snapshot.room1Fan ? "ON" : "OFF", snapshot.room1Light ? "ON" : "OFF");
    display.printf("R2 F:%s L:%s\n", snapshot.room2Fan ? "ON" : "OFF", snapshot.room2Light ? "ON" : "OFF");
  } else if (oledPage == 1) {
    display.println("INPUT DIAGNOSTICS");
    display.printf("Room 1 GPIO35: %d\n", digitalRead(ROOM1_SENSOR_PIN));
    display.printf("Room 2 GPIO32: %d\n", digitalRead(ROOM2_SENSOR_PIN));
    display.println("Current sensor: NONE");
    display.println("Voltage sensor: NONE");
    display.println("Overload detect: NO");
  } else {
    display.println("RELAY PIN MAP");
    display.println("R1 Fan   -> GPIO25");
    display.println("R1 Light -> GPIO26");
    display.println("R2 Fan   -> GPIO27");
    display.println("R2 Light -> GPIO14");
    display.println("Relay mode: ACTIVE LOW");
  }
  display.display();
}

void sendState() {
  const DeviceSnapshot snapshot = readDeviceSnapshot();
  StaticJsonDocument<512> state;
  state["firmwareVersion"] = "2.1.0-local";
  state["localApConnected"] = true;
  state["localControlActive"] = true;
  state["currentMonitoring"] = false;
  state["voltageMonitoring"] = false;
  state["overloadProtection"] = false;
  state["apClients"] = WiFi.softAPgetStationNum();
  state["localIp"] = WiFi.softAPIP().toString();
  state["room1Fan"] = snapshot.room1Fan;
  state["room1Light"] = snapshot.room1Light;
  state["room2Fan"] = snapshot.room2Fan;
  state["room2Light"] = snapshot.room2Light;
  state["room1Sensor"] = digitalRead(ROOM1_SENSOR_PIN);
  state["room2Sensor"] = digitalRead(ROOM2_SENSOR_PIN);
  state["uptime"] = millis() / 1000;
  String response;
  serializeJson(state, response);
  webServer.sendHeader("Cache-Control", "no-store");
  webServer.send(200, "application/json", response);
}

void handleRelayCommand() {
  StaticJsonDocument<192> command;
  if (deserializeJson(command, webServer.arg("plain")) != DeserializationError::Ok ||
      !command["room"].is<uint8_t>() || !command["appliance"].is<const char*>() ||
      !command["on"].is<bool>()) {
    webServer.send(400, "application/json", "{\"error\":\"INVALID_COMMAND\"}");
    return;
  }
  const uint8_t room = command["room"].as<uint8_t>();
  const char* appliance = command["appliance"].as<const char*>();
  const bool on = command["on"].as<bool>();
  if (!setAppliance(room, appliance, on)) {
    webServer.send(409, "application/json", "{\"error\":\"COMMAND_REJECTED\",\"message\":\"Unknown room or appliance.\"}");
    return;
  }
  webServer.send(200, "application/json", "{\"accepted\":true}");
}

void setup() {
  Serial.begin(115200);
  pinMode(ROOM1_FAN_PIN, OUTPUT);
  pinMode(ROOM1_LIGHT_PIN, OUTPUT);
  pinMode(ROOM2_FAN_PIN, OUTPUT);
  pinMode(ROOM2_LIGHT_PIN, OUTPUT);
  pinMode(ROOM1_SENSOR_PIN, INPUT);
  pinMode(ROOM2_SENSOR_PIN, INPUT);
  allLoadsOff();

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  displayReady = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (!displayReady) Serial.println("OLED not detected; continuing without display.");

  if (!apPasswordIsConfigured()) {
    Serial.println("Set a private AP password of at least 8 characters in the sketch configuration.");
    while (true) delay(1000);
  }

  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD, 1, false, 4)) {
    Serial.println("Could not start the NEXUS local Wi-Fi network.");
    while (true) delay(1000);
  }

  webServer.on("/", HTTP_GET, []() { webServer.send_P(200, "text/html", INDEX_HTML); });
  webServer.on("/api/state", HTTP_GET, sendState);
  webServer.on("/api/relay", HTTP_POST, handleRelayCommand);
  webServer.on("/api/health", HTTP_GET, []() { webServer.send(200, "application/json", "{\"status\":\"local-control-ok\",\"localOnly\":true}"); });
  webServer.onNotFound([]() { webServer.send(404, "application/json", "{\"error\":\"NOT_FOUND\"}"); });
  webServer.begin();

  Serial.printf("Local Wi-Fi: %s\n", AP_SSID);
  Serial.printf("Local control page: http://%s/\n", WiFi.softAPIP().toString().c_str());
  Serial.println("Local-only mode; no server connection is configured.");
}

void loop() {
  updateDisplay();
  webServer.handleClient();
  delay(2);
}

} // namespace nexusHybrid

void setup() { nexusHybrid::setup(); }
void loop() { nexusHybrid::loop(); }
