#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

namespace nexusLocal {

constexpr char AP_SSID[] = "NEXUS-LOCAL";
constexpr char AP_PASSWORD[] = "CHANGE_ME_LOCALLY";
constexpr bool RELAY_ACTIVE_LOW = true;

constexpr uint8_t ROOM1_FAN_PIN = 25;
constexpr uint8_t ROOM1_LIGHT_PIN = 26;
constexpr uint8_t ROOM2_FAN_PIN = 27;
constexpr uint8_t ROOM2_LIGHT_PIN = 14;
constexpr uint8_t ACS712_PIN = 34;
constexpr uint8_t ROOM1_SENSOR_PIN = 35;
constexpr uint8_t ROOM2_SENSOR_PIN = 32;

// These values require calibration for the exact ACS712 module and load.
constexpr float ACS712_SENSITIVITY_V_PER_AMP = 0.100f;
constexpr float ACS712_ZERO_VOLTAGE = 2.50f;
constexpr float OVERCURRENT_LIMIT_AMPS = 3.0f;
constexpr uint16_t CURRENT_SAMPLE_COUNT = 400;
constexpr uint32_t CURRENT_SAMPLE_INTERVAL_MS = 1000;
constexpr uint32_t OVERCURRENT_CONFIRM_MS = 1000;
constexpr uint32_t SAFE_RESET_CONFIRM_MS = 3000;

WebServer webServer(80);

bool room1Fan = false;
bool room1Light = false;
bool room2Fan = false;
bool room2Light = false;
bool protectionLatched = false;
float systemCurrent = 0.0f;
uint32_t lastCurrentSampleAt = 0;
uint32_t overcurrentStartedAt = 0;
uint32_t safeCurrentStartedAt = 0;

const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#101512">
  <title>NEXUS Local Control</title>
  <style>
    :root{color-scheme:dark;--bg:#101512;--panel:#171e19;--line:#303b33;--ink:#eef2e8;--muted:#a1aea3;--lime:#b6ec72;--blue:#73d8d2;--red:#f28275}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 8% 0%,#263326 0,transparent 34%),var(--bg);color:var(--ink);font:16px system-ui,sans-serif}
    main{width:min(900px,100%);margin:auto;padding:28px 20px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}
    .eyebrow{color:var(--lime);font:700 11px ui-monospace,monospace;letter-spacing:.12em}h1{margin:6px 0 0;font-size:clamp(25px,6vw,36px)}.state{padding:8px 11px;border:1px solid var(--line);color:var(--muted);font:700 11px ui-monospace,monospace}
    .state.online{border-color:#536d3d;color:var(--lime)}.state.protected{border-color:#7d4139;color:var(--red)}.hint{margin:18px 0;color:var(--muted);font-size:13px;line-height:1.6}
    .rooms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.room{padding:18px;border:1px solid var(--line);background:var(--panel)}.room h2{margin:0 0 12px;font-size:19px}
    .load{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:13px 0;border-top:1px solid var(--line)}.load-name{font-weight:650}.load-state{display:block;margin-top:4px;color:var(--muted);font:700 11px ui-monospace,monospace}.load-state.on{color:var(--lime)}
    .buttons{display:flex;gap:5px;padding:3px;border:1px solid var(--line)}button{min-width:48px;min-height:38px;padding:0 10px;border:1px solid transparent;background:transparent;color:var(--muted);font:700 11px ui-monospace,monospace;cursor:pointer}
    button:hover:not(:disabled){border-color:var(--blue);color:var(--blue)}button.selected{border-color:#536d3d;background:#202a20;color:var(--lime)}button:disabled{cursor:not-allowed;opacity:.42}
    .metrics{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.metric{flex:1;min-width:150px;padding:13px;border:1px solid var(--line);background:#131a15}.metric span{display:block;color:var(--muted);font:700 10px ui-monospace,monospace}.metric strong{display:block;margin-top:7px;font:600 17px ui-monospace,monospace}
    .reset-button{margin-top:10px;border-color:var(--red);color:var(--red)}.reset-button[hidden]{display:none}
    .notice{min-height:24px;margin-top:16px;color:var(--blue);font-size:13px}.notice.error{color:var(--red)}.footer{margin-top:20px;color:var(--muted);font-size:12px;line-height:1.6}
    @media(max-width:620px){main{padding:20px 14px 36px}.rooms{grid-template-columns:1fr}.room{padding:15px}.load{gap:8px}.buttons button{min-width:44px}}
  </style>
</head>
<body>
  <main>
    <header><div><div class="eyebrow">NEXUS / LOCAL NETWORK</div><h1>Home Control</h1></div><span id="connection" class="state">CONNECTING</span></header>
    <p class="hint">Direct ESP32 Wi-Fi control. The device protection check runs locally and does not depend on internet.</p>
    <section class="rooms" aria-label="Room appliances">
      <article class="room" id="room1"><h2>Room 1</h2><div class="load"><div><span class="load-name">Fan</span><span class="load-state" id="room1-fan-state">--</span></div><div class="buttons"><button id="room1-fan-off" onclick="setLoad(1,'fan',false)">OFF</button><button id="room1-fan-on" onclick="setLoad(1,'fan',true)">ON</button></div></div><div class="load"><div><span class="load-name">Light</span><span class="load-state" id="room1-light-state">--</span></div><div class="buttons"><button id="room1-light-off" onclick="setLoad(1,'light',false)">OFF</button><button id="room1-light-on" onclick="setLoad(1,'light',true)">ON</button></div></div><div class="metric"><span>ROOM SENSOR RAW</span><strong id="room1-sensor">--</strong></div></article>
      <article class="room" id="room2"><h2>Room 2</h2><div class="load"><div><span class="load-name">Fan</span><span class="load-state" id="room2-fan-state">--</span></div><div class="buttons"><button id="room2-fan-off" onclick="setLoad(2,'fan',false)">OFF</button><button id="room2-fan-on" onclick="setLoad(2,'fan',true)">ON</button></div></div><div class="load"><div><span class="load-name">Light</span><span class="load-state" id="room2-light-state">--</span></div><div class="buttons"><button id="room2-light-off" onclick="setLoad(2,'light',false)">OFF</button><button id="room2-light-on" onclick="setLoad(2,'light',true)">ON</button></div></div><div class="metric"><span>ROOM SENSOR RAW</span><strong id="room2-sensor">--</strong></div></article>
    </section>
    <section class="metrics" aria-label="Device safety status"><div class="metric"><span>PROTECTION</span><strong id="protection">CHECKING</strong><button id="reset-protection" class="reset-button" hidden onclick="resetProtection()">RESET AFTER SAFE CHECK</button></div><div class="metric"><span>ACS712 CURRENT ESTIMATE</span><strong id="current">-- A</strong></div></section>
    <p id="notice" class="notice" role="status"></p>
    <p class="footer">If protection trips, all loads turn off. Clear the fault and wait for a safe current reading before using Reset. Local protection values must be calibrated for your actual sensor and load.</p>
  </main>
  <script>
    let protectedNow=true
    function showMessage(text,isError=false){const node=document.querySelector('#notice');node.textContent=text;node.classList.toggle('error',isError)}
    function paintLoad(room,name,on){const key=`room${room}-${name}`;document.querySelector(`#${key}-state`).textContent=on?'ON':'OFF';document.querySelector(`#${key}-state`).classList.toggle('on',on);document.querySelector(`#${key}-on`).classList.toggle('selected',on);document.querySelector(`#${key}-off`).classList.toggle('selected',!on);document.querySelector(`#${key}-on`).disabled=protectedNow||on;document.querySelector(`#${key}-off`).disabled=!on}
    async function refresh(){try{const response=await fetch('/api/state',{cache:'no-store'});if(!response.ok)throw Error(`State HTTP ${response.status}`);const data=await response.json();protectedNow=data.protectionLatched||data.overcurrentVerifying;const state=document.querySelector('#connection');state.textContent='ESP32 ONLINE';state.classList.add('online');document.querySelector('#protection').textContent=data.protectionLatched?'PROTECTED':data.overcurrentVerifying?'VERIFYING':'NORMAL';document.querySelector('#protection').style.color=protectedNow?'var(--red)':'var(--lime)';document.querySelector('#reset-protection').hidden=!data.protectionLatched;document.querySelector('#current').textContent=`${Number(data.current).toFixed(2)} A`;document.querySelector('#room1-sensor').textContent=data.room1Sensor;document.querySelector('#room2-sensor').textContent=data.room2Sensor;paintLoad(1,'fan',data.room1Fan);paintLoad(1,'light',data.room1Light);paintLoad(2,'fan',data.room2Fan);paintLoad(2,'light',data.room2Light)}catch(error){const state=document.querySelector('#connection');state.textContent='DEVICE OFFLINE';state.classList.remove('online');showMessage(error.message,true)}}
    async function setLoad(room,appliance,on){try{const response=await fetch('/api/relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,appliance,on})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||`Command HTTP ${response.status}`);showMessage(`Room ${room} ${appliance} ${on?'ON':'OFF'} set locally.`);await refresh()}catch(error){showMessage(error.message,true)}}
    async function resetProtection(){try{const response=await fetch('/api/protection/reset',{method:'POST'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||`Reset HTTP ${response.status}`);showMessage('Protection reset after a safe current check.');await refresh()}catch(error){showMessage(error.message,true)}}
    refresh();setInterval(refresh,1000)
  </script>
</body>
</html>
)HTML";

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

void updateProtection() {
  if (millis() - lastCurrentSampleAt < CURRENT_SAMPLE_INTERVAL_MS) return;
  lastCurrentSampleAt = millis();
  systemCurrent = readCurrentRms();

  if (systemCurrent > OVERCURRENT_LIMIT_AMPS) {
    safeCurrentStartedAt = 0;
    if (overcurrentStartedAt == 0) overcurrentStartedAt = millis();
    if (!protectionLatched && millis() - overcurrentStartedAt >= OVERCURRENT_CONFIRM_MS) {
      protectionLatched = true;
      allLoadsOff();
    }
    return;
  }

  overcurrentStartedAt = 0;
  if (protectionLatched && safeCurrentStartedAt == 0) safeCurrentStartedAt = millis();
}

uint8_t getRelayPin(uint8_t room, const char* appliance) {
  if (room == 1 && strcmp(appliance, "fan") == 0) return ROOM1_FAN_PIN;
  if (room == 1 && strcmp(appliance, "light") == 0) return ROOM1_LIGHT_PIN;
  if (room == 2 && strcmp(appliance, "fan") == 0) return ROOM2_FAN_PIN;
  if (room == 2 && strcmp(appliance, "light") == 0) return ROOM2_LIGHT_PIN;
  return 0;
}

void sendState() {
  StaticJsonDocument<512> state;
  state["protectionLatched"] = protectionLatched;
  state["current"] = systemCurrent;
  state["room1Fan"] = room1Fan;
  state["room1Light"] = room1Light;
  state["room2Fan"] = room2Fan;
  state["room2Light"] = room2Light;
  state["room1Sensor"] = digitalRead(ROOM1_SENSOR_PIN);
  state["room2Sensor"] = digitalRead(ROOM2_SENSOR_PIN);
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
  const uint8_t pin = getRelayPin(room, appliance);
  if (pin == 0) {
    webServer.send(400, "application/json", "{\"error\":\"UNKNOWN_APPLIANCE\"}");
    return;
  }
  if (on && protectionLatched) {
    webServer.send(409, "application/json", "{\"error\":\"PROTECTION_ACTIVE\",\"message\":\"Local overcurrent protection is active.\"}");
    return;
  }

  setRelay(pin, on);
  if (room == 1 && strcmp(appliance, "fan") == 0) room1Fan = on;
  if (room == 1 && strcmp(appliance, "light") == 0) room1Light = on;
  if (room == 2 && strcmp(appliance, "fan") == 0) room2Fan = on;
  if (room == 2 && strcmp(appliance, "light") == 0) room2Light = on;
  webServer.send(200, "application/json", "{\"accepted\":true}");
}

void handleProtectionReset() {
  systemCurrent = readCurrentRms();
  if (!protectionLatched || safeCurrentStartedAt == 0 ||
      millis() - safeCurrentStartedAt < SAFE_RESET_CONFIRM_MS ||
      systemCurrent >= OVERCURRENT_LIMIT_AMPS) {
    webServer.send(409, "application/json", "{\"error\":\"UNSAFE_TO_RESET\",\"message\":\"Current must remain below the limit for three seconds before reset.\"}");
    return;
  }

  protectionLatched = false;
  safeCurrentStartedAt = 0;
  webServer.send(200, "application/json", "{\"accepted\":true}");
}

bool apPasswordIsConfigured() {
  return strlen(AP_PASSWORD) >= 8 && strcmp(AP_PASSWORD, "CHANGE_ME_LOCALLY") != 0;
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
  allLoadsOff();

  if (!apPasswordIsConfigured()) {
    Serial.println("Set a private AP_PASSWORD of at least 8 characters before use.");
    while (true) delay(1000);
  }

  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.println("Could not start the NEXUS local Wi-Fi network.");
    while (true) delay(1000);
  }

  webServer.on("/", HTTP_GET, []() { webServer.send_P(200, "text/html", INDEX_HTML); });
  webServer.on("/api/state", HTTP_GET, sendState);
  webServer.on("/api/relay", HTTP_POST, handleRelayCommand);
  webServer.on("/api/protection/reset", HTTP_POST, handleProtectionReset);
  webServer.onNotFound([]() { webServer.send(404, "application/json", "{\"error\":\"NOT_FOUND\"}"); });
  webServer.begin();

  Serial.printf("Wi-Fi: %s\n", AP_SSID);
  Serial.printf("Open: http://%s/\n", WiFi.softAPIP().toString().c_str());
}

void loop() {
  updateProtection();
  webServer.handleClient();
  delay(2);
}

} // namespace nexusLocal

void setup() { nexusLocal::setup(); }
void loop() { nexusLocal::loop(); }