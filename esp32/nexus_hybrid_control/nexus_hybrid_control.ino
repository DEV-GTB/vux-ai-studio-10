#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <math.h>
#include <string.h>
#include "nexus_secrets.h"

namespace nexusHybrid {

constexpr char AP_SSID[] = "NEXUS-LOCAL";
const char* AP_PASSWORD = NEXUS_AP_PASSWORD;
const char* CLOUD_WIFI_SSID = NEXUS_CLOUD_WIFI_SSID;
const char* CLOUD_WIFI_PASSWORD = NEXUS_CLOUD_WIFI_PASSWORD;
const char* SERVER_URL = "https://vux-ai-studio.onrender.com";
const char* DEVICE_ID = "NEXUS-001";
const char* DEVICE_TOKEN = NEXUS_DEVICE_TOKEN;

const char GLOBALSIGN_ECC_ROOT_CA_R4[] PROGMEM = R"CERT(
-----BEGIN CERTIFICATE-----
MIIB3DCCAYOgAwIBAgINAgPlfvU/k/2lCSGypjAKBggqhkjOPQQDAjBQMSQwIgYDVQQLExtHbG9iYWxT
aWduIEVDQyBSb290IENBIC0gUjQxEzARBgNVBAoTCkdsb2JhbFNpZ24xEzARBgNVBAMTCkdsb2JhbFNp
Z24wHhcNMTIxMTEzMDAwMDAwWhcNMzgwMTE5MDMxNDA3WjBQMSQwIgYDVQQLExtHbG9iYWxTaWduIEVD
QyBSb290IENBIC0gUjQxEzARBgNVBAoTCkdsb2JhbFNpZ24xEzARBgNVBAMTCkdsb2JhbFNpZ24wWTAT
BgcqhkjOPQIBBggqhkjOPQMBBwNCAAS4xnnTj2wlDp8uORkcA6SumuU5BwkWymOxuYb4ilfBV85C+nOh
92VC/x7BALJucw7/xyHlGKSq2XE/qNS5zowdo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUw
AwEB/zAdBgNVHQ4EFgQUVLB7rUW44kB/+wpu+74zyTyjhNUwCgYIKoZIzj0EAwIDRwAwRAIgIk90crlg
r/HmnKAWBVBfw147bmF0774BxL4YSFlhgjICICadVGNA3jdgUM/I2O2dgq43mLyjj0xMqTQrbO/7lZsm
-----END CERTIFICATE-----
)CERT";

constexpr uint8_t ROOM1_FAN_PIN = 25;
constexpr uint8_t ROOM1_LIGHT_PIN = 26;
constexpr uint8_t ROOM2_FAN_PIN = 27;
constexpr uint8_t ROOM2_LIGHT_PIN = 14;
constexpr uint8_t ACS712_PIN = 34;
constexpr uint8_t ROOM1_SENSOR_PIN = 35;
constexpr uint8_t ROOM2_SENSOR_PIN = 32;
constexpr uint8_t STATUS_LED_PIN = 2;
constexpr uint8_t BUZZER_PIN = 13;
constexpr bool RELAY_ACTIVE_LOW = true;
constexpr uint8_t OLED_SDA_PIN = 21;
constexpr uint8_t OLED_SCL_PIN = 22;
constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 64;

// Calibrate against the installed ACS712 module and safe test loads.
constexpr float ACS712_SENSITIVITY_V_PER_AMP = 0.100f;
constexpr float ACS712_ZERO_VOLTAGE = 2.50f;
constexpr float OVERCURRENT_LIMIT_AMPS = 3.0f;
constexpr uint16_t CURRENT_SAMPLE_COUNT = 400;
constexpr uint32_t CURRENT_SAMPLE_INTERVAL_MS = 1000;
constexpr uint32_t OVERCURRENT_CONFIRM_MS = 1000;
constexpr uint32_t SAFE_RESET_CONFIRM_MS = 3000;
constexpr uint32_t STATUS_INTERVAL_MS = 10000;
constexpr uint32_t COMMAND_POLL_INTERVAL_MS = 3000;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 15000;
constexpr uint32_t OLED_REFRESH_INTERVAL_MS = 1000;

enum DeviceState : uint8_t { STATE_NORMAL, STATE_WARNING, STATE_VERIFYING, STATE_PROTECTED };

WebServer webServer(80);
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
portMUX_TYPE deviceStateMux = portMUX_INITIALIZER_UNLOCKED;
bool displayReady = false;
bool room1Fan = false;
bool room1Light = false;
bool room2Fan = false;
bool room2Light = false;
bool protectionLatched = false;
bool currentSampleValid = false;
bool cloudStatusAccepted = false;
bool localControlActive = false;
float systemCurrent = 0.0f;
uint32_t lastCurrentSampleAt = 0;
uint32_t lastDisplayAt = 0;
uint32_t overcurrentStartedAt = 0;
uint32_t safeCurrentStartedAt = 0;
uint32_t nextWifiAttemptAt = 0;
uint32_t wifiRetryDelayMs = WIFI_RETRY_INTERVAL_MS;
bool alertActive = false;
uint32_t lastNotificationAtMs = 0;
uint32_t lastUsageSaveAtMs = 0;

struct DeviceUsageStats {
  uint32_t magic;
  uint32_t totalOnSeconds;
  uint32_t totalAlertCount;
  uint32_t lastAlertEpoch;
  float peakCurrent;
  float totalEnergyWh;
};

DeviceUsageStats usageStats = { 0x4E585354u, 0, 0, 0, 0.0f, 0.0f };

struct DeviceSnapshot {
  bool room1Fan;
  bool room1Light;
  bool room2Fan;
  bool room2Light;
  bool protectionLatched;
  bool overcurrentVerifying;
  bool currentSampleValid;
  bool cloudStatusAccepted;
  float current;
};

const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101512"><title>NEXUS Local Control</title>
<style>
:root{color-scheme:dark;--bg:#101512;--panel:#171e19;--line:#303b33;--ink:#eef2e8;--muted:#a1aea3;--lime:#b6ec72;--blue:#73d8d2;--red:#f28275}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 8% 0%,#263326 0,transparent 34%),var(--bg);color:var(--ink);font:16px system-ui,sans-serif}main{width:min(900px,100%);margin:auto;padding:28px 20px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}.eyebrow{color:var(--lime);font:700 11px ui-monospace,monospace;letter-spacing:.12em}h1{margin:6px 0 0;font-size:clamp(25px,6vw,36px)}.state{padding:8px 11px;border:1px solid var(--line);color:var(--muted);font:700 11px ui-monospace,monospace}.state.online{border-color:#536d3d;color:var(--lime)}.state.protected{border-color:#7d4139;color:var(--red)}.hint{margin:18px 0;color:var(--muted);font-size:13px;line-height:1.6}.rooms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.room{padding:18px;border:1px solid var(--line);background:var(--panel)}.room h2{margin:0 0 12px;font-size:19px}.load{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:13px 0;border-top:1px solid var(--line)}.load-name{font-weight:650}.load-state{display:block;margin-top:4px;color:var(--muted);font:700 11px ui-monospace,monospace}.load-state.on{color:var(--lime)}.buttons{display:flex;gap:5px;padding:3px;border:1px solid var(--line)}button{min-width:48px;min-height:38px;padding:0 10px;border:1px solid transparent;background:transparent;color:var(--muted);font:700 11px ui-monospace,monospace;cursor:pointer}button:hover:not(:disabled){border-color:var(--blue);color:var(--blue)}button.selected{border-color:#536d3d;background:#202a20;color:var(--lime)}button:disabled{cursor:not-allowed;opacity:.42}.metrics{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.metric{flex:1;min-width:150px;padding:13px;border:1px solid var(--line);background:#131a15}.metric span{display:block;color:var(--muted);font:700 10px ui-monospace,monospace}.metric strong{display:block;margin-top:7px;font:600 17px ui-monospace,monospace}.reset-button{margin-top:10px;border-color:var(--red);color:var(--red)}.reset-button[hidden]{display:none}.notice{min-height:24px;margin-top:16px;color:var(--blue);font-size:13px}.notice.error{color:var(--red)}.footer{margin-top:20px;color:var(--muted);font-size:12px;line-height:1.6}@media(max-width:620px){main{padding:20px 14px 36px}.rooms{grid-template-columns:1fr}.room{padding:15px}.load{gap:8px}.buttons button{min-width:44px}}
</style></head><body><main>
<header><div><div class="eyebrow">NEXUS / LOCAL + CLOUD</div><h1>Home Control</h1></div><span id="connection" class="state">STARTING</span></header>
<p class="hint">Local buttons work directly over NEXUS-LOCAL Wi-Fi. Cloud status and website commands use the configured Wi-Fi uplink when available.</p>
<section class="rooms" aria-label="Room appliances">
<article class="room"><h2>Room 1</h2><div class="load"><div><span class="load-name">Fan</span><span class="load-state" id="room1-fan-state">--</span></div><div class="buttons"><button id="room1-fan-off" onclick="setLoad(1,'fan',false)">OFF</button><button id="room1-fan-on" onclick="setLoad(1,'fan',true)">ON</button></div></div><div class="load"><div><span class="load-name">Light</span><span class="load-state" id="room1-light-state">--</span></div><div class="buttons"><button id="room1-light-off" onclick="setLoad(1,'light',false)">OFF</button><button id="room1-light-on" onclick="setLoad(1,'light',true)">ON</button></div></div><div class="metric"><span>ROOM SENSOR RAW</span><strong id="room1-sensor">--</strong></div></article>
<article class="room"><h2>Room 2</h2><div class="load"><div><span class="load-name">Fan</span><span class="load-state" id="room2-fan-state">--</span></div><div class="buttons"><button id="room2-fan-off" onclick="setLoad(2,'fan',false)">OFF</button><button id="room2-fan-on" onclick="setLoad(2,'fan',true)">ON</button></div></div><div class="load"><div><span class="load-name">Light</span><span class="load-state" id="room2-light-state">--</span></div><div class="buttons"><button id="room2-light-off" onclick="setLoad(2,'light',false)">OFF</button><button id="room2-light-on" onclick="setLoad(2,'light',true)">ON</button></div></div><div class="metric"><span>ROOM SENSOR RAW</span><strong id="room2-sensor">--</strong></div></article></section>
<section class="metrics" aria-label="Device safety status"><div class="metric"><span>PROTECTION</span><strong id="protection">CHECKING</strong><button id="reset-protection" class="reset-button" hidden onclick="resetProtection()">RESET AFTER SAFE CHECK</button></div><div class="metric"><span>ACS712 CURRENT ESTIMATE</span><strong id="current">CALIBRATING</strong></div><div class="metric"><span>CLOUD UPLINK</span><strong id="cloud">OFFLINE</strong></div></section>
<p id="notice" class="notice" role="status"></p><p class="footer">If protection trips, all loads turn off. The ESP32 checks protection locally; cloud commands cannot bypass it. Calibrate sensor and relay hardware before connecting real loads.</p></main>
<script>
let protectedNow=true;function message(text,error=false){const el=document.querySelector('#notice');el.textContent=text;el.classList.toggle('error',error)}
function paint(room,name,on){const key=`room${room}-${name}`;const state=document.querySelector(`#${key}-state`);state.textContent=on?'ON':'OFF';state.classList.toggle('on',on);document.querySelector(`#${key}-on`).classList.toggle('selected',on);document.querySelector(`#${key}-off`).classList.toggle('selected',!on);document.querySelector(`#${key}-on`).disabled=protectedNow||on;document.querySelector(`#${key}-off`).disabled=!on}
async function refresh(){try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error(`State HTTP ${r.status}`);const d=await r.json();protectedNow=d.protectionLatched||d.overcurrentVerifying;const badge=document.querySelector('#connection');badge.textContent='LOCAL ONLINE';badge.classList.add('online');badge.classList.toggle('protected',protectedNow);document.querySelector('#protection').textContent=d.protectionLatched?'PROTECTED':d.overcurrentVerifying?'VERIFYING':'NORMAL';document.querySelector('#protection').style.color=protectedNow?'var(--red)':'var(--lime)';document.querySelector('#reset-protection').hidden=!d.protectionLatched;document.querySelector('#current').textContent=d.currentValid?`${Number(d.current).toFixed(2)} A`:'CALIBRATING';document.querySelector('#cloud').textContent=d.cloudConnected?'CONNECTED':'OFFLINE';document.querySelector('#room1-sensor').textContent=d.room1Sensor;document.querySelector('#room2-sensor').textContent=d.room2Sensor;paint(1,'fan',d.room1Fan);paint(1,'light',d.room1Light);paint(2,'fan',d.room2Fan);paint(2,'light',d.room2Light)}catch(e){const badge=document.querySelector('#connection');badge.textContent='DEVICE OFFLINE';badge.classList.remove('online');message(e.message,true)}}
async function setLoad(room,appliance,on){try{const r=await fetch('/api/relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,appliance,on})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||`Command HTTP ${r.status}`);message(`Room ${room} ${appliance} ${on?'ON':'OFF'} set.`);await refresh()}catch(e){message(e.message,true)}}
async function resetProtection(){try{const r=await fetch('/api/protection/reset',{method:'POST'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||`Reset HTTP ${r.status}`);message('Protection reset after a safe current check.');await refresh()}catch(e){message(e.message,true)}}refresh();setInterval(refresh,1000)
</script></body></html>
)HTML";

DeviceSnapshot readDeviceSnapshot() {
  DeviceSnapshot snapshot;
  portENTER_CRITICAL(&deviceStateMux);
  snapshot.room1Fan = room1Fan;
  snapshot.room1Light = room1Light;
  snapshot.room2Fan = room2Fan;
  snapshot.room2Light = room2Light;
  snapshot.protectionLatched = protectionLatched;
  snapshot.overcurrentVerifying = !currentSampleValid || (overcurrentStartedAt != 0 && !protectionLatched);
  snapshot.currentSampleValid = currentSampleValid;
  snapshot.cloudStatusAccepted = cloudStatusAccepted;
  snapshot.current = systemCurrent;
  portEXIT_CRITICAL(&deviceStateMux);
  return snapshot;
}

uint8_t stateCode(const DeviceSnapshot& snapshot) {
  if (snapshot.protectionLatched) return STATE_PROTECTED;
  if (snapshot.overcurrentVerifying) return STATE_VERIFYING;
  return STATE_NORMAL;
}

bool cloudConfigured() {
  return CLOUD_WIFI_SSID[0] != '\0' && strcmp(CLOUD_WIFI_SSID, "CHANGE_ME") != 0 &&
    CLOUD_WIFI_PASSWORD[0] != '\0' && strcmp(CLOUD_WIFI_PASSWORD, "CHANGE_ME") != 0 &&
    DEVICE_TOKEN[0] != '\0' && strcmp(DEVICE_TOKEN, "CHANGE_ME") != 0;
}

bool apPasswordIsConfigured() {
  return AP_PASSWORD[0] != '\0' && strlen(AP_PASSWORD) >= 8 && strcmp(AP_PASSWORD, "CHANGE_ME_LOCALLY") != 0;
}

float readCurrentRms() {
  double sumSquares = 0.0;
  for (uint16_t index = 0; index < CURRENT_SAMPLE_COUNT; index++) {
    const float voltage = analogRead(ACS712_PIN) * (3.3f / 4095.0f);
    const float centeredVoltage = voltage - ACS712_ZERO_VOLTAGE;
    sumSquares += centeredVoltage * centeredVoltage;
    delayMicroseconds(250);
  }
  return sqrtf(static_cast<float>(sumSquares / CURRENT_SAMPLE_COUNT)) / ACS712_SENSITIVITY_V_PER_AMP;
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

void setAllLoadsOffLocked() {
  allLoadsOff();
}

bool anyLoadActive() {
  return room1Fan || room1Light || room2Fan || room2Light;
}

void loadUsageStats() {
  EEPROM.begin(sizeof(DeviceUsageStats));
  EEPROM.get(0, usageStats);
  if (usageStats.magic != 0x4E585354u) {
    usageStats = { 0x4E585354u, 0, 0, 0, 0.0f, 0.0f };
    EEPROM.put(0, usageStats);
    EEPROM.commit();
  }
  lastUsageSaveAtMs = millis();
}

void saveUsageStats() {
  EEPROM.put(0, usageStats);
  EEPROM.commit();
  lastUsageSaveAtMs = millis();
}

void updateUsageStats() {
  const uint32_t now = millis();
  if (!anyLoadActive()) return;
  if (now - lastUsageSaveAtMs < 1000) return;
  const float watts = systemCurrent * 230.0f;
  const float energyWh = (watts / 3600.0f) * (float)(now - lastUsageSaveAtMs) / 1000.0f;
  usageStats.totalOnSeconds += (now - lastUsageSaveAtMs) / 1000;
  usageStats.totalEnergyWh += energyWh;
  if (systemCurrent > usageStats.peakCurrent) usageStats.peakCurrent = systemCurrent;
  if (now - lastUsageSaveAtMs > 60000) {
    saveUsageStats();
  }
}

void triggerAlert(const char* type, const char* message) {
  const uint32_t now = millis();
  if (alertActive && now - lastNotificationAtMs < 30000UL) return;
  alertActive = true;
  lastNotificationAtMs = now;
  usageStats.totalAlertCount += 1;
  usageStats.lastAlertEpoch = now / 1000;
  digitalWrite(STATUS_LED_PIN, HIGH);
  tone(BUZZER_PIN, 2200, 180);
  Serial.printf("ALERT %s: %s\n", type, message);
  if (WiFi.status() == WL_CONNECTED && cloudConfigured()) {
    WiFiClientSecure client;
    client.setCACert(GLOBALSIGN_ECC_ROOT_CA_R4);
    HTTPClient http;
    const String url = String(SERVER_URL) + "/api/device/alert";
    if (http.begin(client, url)) {
      http.setConnectTimeout(8000);
      http.setTimeout(8000);
      http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
      http.addHeader("Content-Type", "application/json");
      StaticJsonDocument<256> alert;
      alert["deviceId"] = DEVICE_ID;
      alert["type"] = type;
      alert["message"] = message;
      alert["currentA"] = systemCurrent;
      alert["timestamp"] = now / 1000;
      String body;
      serializeJson(alert, body);
      http.POST(body);
      http.end();
    }
  }
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

  portENTER_CRITICAL(&deviceStateMux);
  if (on && (protectionLatched || !currentSampleValid || overcurrentStartedAt != 0)) {
    portEXIT_CRITICAL(&deviceStateMux);
    return false;
  }
  setRelay(pin, on);
  *state = on;
  portEXIT_CRITICAL(&deviceStateMux);
  return true;
}

void updateProtection() {
  if (millis() - lastCurrentSampleAt < CURRENT_SAMPLE_INTERVAL_MS) return;
  lastCurrentSampleAt = millis();
  const float sampledCurrent = readCurrentRms();
  bool protectionTripped = false;
  portENTER_CRITICAL(&deviceStateMux);
  systemCurrent = sampledCurrent;
  currentSampleValid = true;

  if (systemCurrent > OVERCURRENT_LIMIT_AMPS) {
    safeCurrentStartedAt = 0;
    if (overcurrentStartedAt == 0) overcurrentStartedAt = millis();
    if (!protectionLatched && millis() - overcurrentStartedAt >= OVERCURRENT_CONFIRM_MS) {
      protectionLatched = true;
      setAllLoadsOffLocked();
      protectionTripped = true;
      alertActive = false;
    }
  } else {
    overcurrentStartedAt = 0;
    if (protectionLatched && safeCurrentStartedAt == 0) safeCurrentStartedAt = millis();
  }
  portEXIT_CRITICAL(&deviceStateMux);

  const uint32_t now = millis();
  digitalWrite(STATUS_LED_PIN, protectionLatched ? HIGH : LOW);
  if (protectionTripped) {
    Serial.println("LOCAL PROTECTION LATCHED; all relays off");
    triggerAlert("OVER_CURRENT", "Current exceeded the configured safe limit; all loads switched off.");
  } else if (systemCurrent > OVERCURRENT_LIMIT_AMPS * 0.75f) {
    if (alertActive && now - lastNotificationAtMs > 30000UL) {
      alertActive = false;
    }
    triggerAlert("CURRENT_WARNING", "Current is rising toward the protection threshold.");
  } else {
    alertActive = false;
  }
}

void updateDisplay() {
  if (!displayReady || millis() - lastDisplayAt < OLED_REFRESH_INTERVAL_MS) return;
  lastDisplayAt = millis();
  const DeviceSnapshot snapshot = readDeviceSnapshot();
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("NEXUS HYBRID CONTROL");
  display.printf("AP: %s\n", AP_SSID);
  display.printf("Cloud: %s\n", cloudStatusAccepted ? "ONLINE" : "OFFLINE");
  display.printf("State: %s\n", snapshot.protectionLatched ? "PROTECTED" : snapshot.overcurrentVerifying ? "VERIFYING" : "NORMAL");
  if (snapshot.currentSampleValid) display.printf("Current: %.2f A\n", snapshot.current);
  else display.println("Current: CALIBRATING");
  display.printf("R1 F:%s L:%s\n", snapshot.room1Fan ? "ON" : "OFF", snapshot.room1Light ? "ON" : "OFF");
  display.printf("R2 F:%s L:%s\n", snapshot.room2Fan ? "ON" : "OFF", snapshot.room2Light ? "ON" : "OFF");
  display.display();
}

void sendState() {
  const DeviceSnapshot snapshot = readDeviceSnapshot();
  const bool stationConnected = cloudConfigured() && WiFi.status() == WL_CONNECTED;
  StaticJsonDocument<512> state;
  state["deviceId"] = DEVICE_ID;
  state["firmwareVersion"] = "2.0.0-hybrid";
  state["state"] = stateCode(snapshot);
  state["currentValid"] = snapshot.currentSampleValid;
  state["protectionLatched"] = snapshot.protectionLatched;
  state["overcurrentVerifying"] = snapshot.overcurrentVerifying;
  state["current"] = snapshot.current;
  state["currentLimitA"] = OVERCURRENT_LIMIT_AMPS;
  state["cloudConnected"] = stationConnected && snapshot.cloudStatusAccepted;
  state["wifiConnected"] = stationConnected;
  state["localApConnected"] = true;
  state["localControlActive"] = true;
  state["cloudModeEnabled"] = cloudConfigured();
  state["wifiRSSI"] = stationConnected ? WiFi.RSSI() : 0;
  state["usageSeconds"] = usageStats.totalOnSeconds;
  state["peakCurrentA"] = usageStats.peakCurrent;
  state["totalEnergyWh"] = usageStats.totalEnergyWh;
  state["lastAlertAt"] = usageStats.lastAlertEpoch;
  state["alertType"] = alertActive ? "OVER_CURRENT" : "NONE";
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
    webServer.send(409, "application/json", "{\"error\":\"COMMAND_REJECTED\",\"message\":\"Unknown appliance or local protection blocks this action.\"}");
    return;
  }
  webServer.send(200, "application/json", "{\"accepted\":true}");
}

void handleProtectionReset() {
  const float sampledCurrent = readCurrentRms();
  portENTER_CRITICAL(&deviceStateMux);
  systemCurrent = sampledCurrent;
  currentSampleValid = true;
  const bool canReset = protectionLatched && safeCurrentStartedAt != 0 &&
    millis() - safeCurrentStartedAt >= SAFE_RESET_CONFIRM_MS &&
    systemCurrent < OVERCURRENT_LIMIT_AMPS;
  if (canReset) {
    protectionLatched = false;
    safeCurrentStartedAt = 0;
  }
  portEXIT_CRITICAL(&deviceStateMux);
  if (!canReset) {
    webServer.send(409, "application/json", "{\"error\":\"UNSAFE_TO_RESET\",\"message\":\"Current must remain below the limit for three seconds before reset.\"}");
    return;
  }
  digitalWrite(STATUS_LED_PIN, LOW);
  webServer.send(200, "application/json", "{\"accepted\":true}");
}

void cloudRequestFailed(const char* action, int code) {
  portENTER_CRITICAL(&deviceStateMux);
  cloudStatusAccepted = false;
  portEXIT_CRITICAL(&deviceStateMux);
  Serial.printf("Cloud %s failed: HTTP %d\n", action, code);
  Serial.println("Local AP control remains active at http://192.168.4.1/");
}

void sendCloudStatus() {
  if (!cloudConfigured() || WiFi.status() != WL_CONNECTED) return;
  const DeviceSnapshot snapshot = readDeviceSnapshot();
  WiFiClientSecure client;
  client.setCACert(GLOBALSIGN_ECC_ROOT_CA_R4);
  HTTPClient http;
  const String url = String(SERVER_URL) + "/api/device/status";
  if (!http.begin(client, url)) { cloudRequestFailed("status setup", -1); return; }
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> status;
  status["deviceId"] = DEVICE_ID;
  status["firmwareVersion"] = "2.0.0-hybrid";
  status["state"] = stateCode(snapshot);
  if (snapshot.currentSampleValid) status["systemCurrent"] = snapshot.current;
  status["currentLimitA"] = OVERCURRENT_LIMIT_AMPS;
  status["wifiConnected"] = true;
  status["localApConnected"] = true;
  status["wifiRSSI"] = WiFi.RSSI();
  status["usageSeconds"] = usageStats.totalOnSeconds;
  status["peakCurrentA"] = usageStats.peakCurrent;
  status["totalEnergyWh"] = usageStats.totalEnergyWh;
  status["alertType"] = alertActive ? "OVER_CURRENT" : "NONE";
  status["room1Fan"] = snapshot.room1Fan;
  status["room1Light"] = snapshot.room1Light;
  status["room2Fan"] = snapshot.room2Fan;
  status["room2Light"] = snapshot.room2Light;
  status["room1Sensor"] = digitalRead(ROOM1_SENSOR_PIN);
  status["room2Sensor"] = digitalRead(ROOM2_SENSOR_PIN);
  status["uptime"] = millis() / 1000;
  String body;
  serializeJson(status, body);
  const int code = http.POST(body);
  if (code == 202) {
    portENTER_CRITICAL(&deviceStateMux);
    cloudStatusAccepted = true;
    portEXIT_CRITICAL(&deviceStateMux);
    Serial.println("Cloud status accepted: HTTP 202");
  } else {
    cloudRequestFailed("status upload", code);
    Serial.println(http.getString());
  }
  http.end();
}

void pollCloudCommands() {
  if (!cloudConfigured() || WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setCACert(GLOBALSIGN_ECC_ROOT_CA_R4);
  HTTPClient http;
  const String url = String(SERVER_URL) + "/api/device/poll?deviceId=" + DEVICE_ID;
  if (!http.begin(client, url)) { cloudRequestFailed("poll setup", -1); return; }
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  const int code = http.GET();
  if (code != 200) {
    cloudRequestFailed("command poll", code);
    Serial.println(http.getString());
    http.end();
    return;
  }

  StaticJsonDocument<384> response;
  const String responseBody = http.getString();
  const DeserializationError error = deserializeJson(response, responseBody);
  if (error) {
    Serial.printf("Cloud poll JSON error: %s\n", error.c_str());
    http.end();
    return;
  }
  JsonObject command = response["command"].as<JsonObject>();
  if (!command.isNull()) {
    const char* name = command["command"] | "";
    const uint8_t room = command["room"] | 0;
    const char* appliance = "";
    bool on = false;
    if (strcmp(name, "FAN_ON") == 0) { appliance = "fan"; on = true; }
    else if (strcmp(name, "FAN_OFF") == 0) { appliance = "fan"; }
    else if (strcmp(name, "LIGHT_ON") == 0) { appliance = "light"; on = true; }
    else if (strcmp(name, "LIGHT_OFF") == 0) { appliance = "light"; }
    if (appliance[0] != '\0' && setAppliance(room, appliance, on)) {
      Serial.printf("Cloud command executed: room %u %s %s\n", room, appliance, on ? "ON" : "OFF");
    } else {
      Serial.println("Cloud command rejected by local validation/protection");
    }
  }
  http.end();
}

void ensureCloudWifi() {
  if (!cloudConfigured() || WiFi.status() == WL_CONNECTED) return;
  const uint32_t now = millis();
  if (static_cast<int32_t>(now - nextWifiAttemptAt) < 0) return;
  nextWifiAttemptAt = now + wifiRetryDelayMs;
  Serial.printf("Cloud Wi-Fi reconnect attempt: %s\n", CLOUD_WIFI_SSID);
  WiFi.begin(CLOUD_WIFI_SSID, CLOUD_WIFI_PASSWORD);
  wifiRetryDelayMs = wifiRetryDelayMs < 60000 ? wifiRetryDelayMs * 2 : 120000;
}

void cloudTask(void* parameter) {
  uint32_t nextPollAt = 0;
  uint32_t nextStatusAt = 0;
  for (;;) {
    ensureCloudWifi();
    if (WiFi.status() == WL_CONNECTED) {
      const uint32_t now = millis();
      if (static_cast<int32_t>(now - nextPollAt) >= 0) {
        nextPollAt = now + COMMAND_POLL_INTERVAL_MS;
        pollCloudCommands();
      }
      if (static_cast<int32_t>(now - nextStatusAt) >= 0) {
        nextStatusAt = now + STATUS_INTERVAL_MS;
        sendCloudStatus();
      }
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(ROOM1_FAN_PIN, OUTPUT);
  pinMode(ROOM1_LIGHT_PIN, OUTPUT);
  pinMode(ROOM2_FAN_PIN, OUTPUT);
  pinMode(ROOM2_LIGHT_PIN, OUTPUT);
  pinMode(ROOM1_SENSOR_PIN, INPUT);
  pinMode(ROOM2_SENSOR_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  allLoadsOff();

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  displayReady = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (!displayReady) Serial.println("OLED not detected; continuing without display.");

  if (!apPasswordIsConfigured()) {
    Serial.println("Set a private AP password of at least 8 characters in nexus_secrets.h.");
    while (true) delay(1000);
  }

  loadUsageStats();
  WiFi.mode(WIFI_AP_STA);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD, 1, false, 4)) {
    Serial.println("Could not start the NEXUS local Wi-Fi network.");
    while (true) delay(1000);
  }

  webServer.on("/", HTTP_GET, []() { webServer.send_P(200, "text/html", INDEX_HTML); });
  webServer.on("/api/state", HTTP_GET, sendState);
  webServer.on("/api/relay", HTTP_POST, handleRelayCommand);
  webServer.on("/api/protection/reset", HTTP_POST, handleProtectionReset);
  webServer.on("/api/health", HTTP_GET, []() {
    webServer.send(200, "application/json", "{\"status\":\"local-control-ok\",\"localUrl\":\"http://192.168.4.1/\",\"cloudConnected\":" + String(WiFi.status() == WL_CONNECTED && cloudConfigured()) + "}");
  });
  webServer.onNotFound([]() { webServer.send(404, "application/json", "{\"error\":\"NOT_FOUND\"}"); });
  webServer.begin();

  localControlActive = true;
  Serial.printf("Local Wi-Fi: %s\n", AP_SSID);
  Serial.printf("Local control page: http://%s/\n", WiFi.softAPIP().toString().c_str());
  Serial.println("Local control is always active. If cloud fails, use http://192.168.4.1/");
  if (cloudConfigured()) {
    WiFi.setAutoReconnect(true);
    WiFi.begin(CLOUD_WIFI_SSID, CLOUD_WIFI_PASSWORD);
    nextWifiAttemptAt = millis() + WIFI_RETRY_INTERVAL_MS;
    Serial.printf("Cloud uplink starting: %s\n", CLOUD_WIFI_SSID);
    const BaseType_t taskCreated = xTaskCreatePinnedToCore(cloudTask, "nexusCloud", 12288, nullptr, 1, nullptr, 0);
    if (taskCreated != pdPASS) Serial.println("Could not start cloud task; local controls remain available.");
  } else {
    Serial.println("Cloud uplink disabled; local AP controls remain available.");
  }
}

void loop() {
  updateProtection();
  updateUsageStats();
  updateDisplay();
  webServer.handleClient();
  if (millis() - lastUsageSaveAtMs > 60000UL) saveUsageStats();
  delay(2);
}

} // namespace nexusHybrid

void setup() { nexusHybrid::setup(); }
void loop() { nexusHybrid::loop(); }
