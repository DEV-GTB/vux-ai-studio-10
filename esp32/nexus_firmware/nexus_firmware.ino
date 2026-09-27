#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>

// NEXUS AI low-voltage educational prototype.
// Physical protection remains local; MQTT is only a communication service.
namespace nexus {

constexpr char PROTOCOL_VERSION[] = "1.0";
constexpr char FIRMWARE_VERSION[] = "0.1.0";
constexpr uint8_t ROOM_COUNT = 3;
constexpr uint8_t RELAY_PINS[ROOM_COUNT] = {25, 26, 27};
constexpr bool RELAY_ACTIVE_LOW = true;
constexpr uint32_t TELEMETRY_INTERVAL_MS = 1000;
constexpr uint32_t COMMAND_TIMEOUT_MS = 10000;
constexpr uint32_t MAX_RECONNECT_MS = 30000;
constexpr uint8_t EVENT_QUEUE_SIZE = 12;
constexpr uint8_t COMMAND_HISTORY_SIZE = 16;
constexpr char AP_SSID[] = "NEXUS-SETUP";
constexpr char AP_PASSWORD[] = "CONFIGURE_ME";

// Fill these from a protected build/configuration process, never from the UI.
const char* WIFI_SSID = "CHANGE_ME";
const char* WIFI_PASSWORD = "CHANGE_ME";
const char* MQTT_HOST = "CHANGE_ME";
constexpr uint16_t MQTT_PORT = 8883;
const char* MQTT_USERNAME = "CHANGE_ME";
const char* MQTT_PASSWORD = "CHANGE_ME";
const char* MQTT_CA_CERT = R"CERT(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_BROKER_CA_CERTIFICATE
-----END CERTIFICATE-----
)CERT";

String deviceId;
String topicRoot;
WiFiClientSecure tlsClient;
PubSubClient mqttClient(tlsClient);
WebServer webServer(80);
Preferences preferences;

bool relayState[ROOM_COUNT] = {false, false, false};
uint32_t telemetrySequence = 0;
uint32_t commandSequence = 0;
uint32_t lastTelemetryAt = 0;
uint32_t nextWifiAttemptAt = 0;
uint32_t nextMqttAttemptAt = 0;
uint32_t reconnectDelayMs = 1000;

uint32_t unixTimeSeconds() {
  const time_t current = time(nullptr);
  return current > 1700000000 ? static_cast<uint32_t>(current) : 0;
}

struct QueuedEvent {
  String eventId;
  String type;
  String reason;
  uint32_t createdAt;
};
QueuedEvent eventQueue[EVENT_QUEUE_SIZE];
uint8_t eventHead = 0;
uint8_t eventCount = 0;
String processedCommands[COMMAND_HISTORY_SIZE];
uint8_t processedCommandHead = 0;

String makeId(const char* prefix, uint32_t value) {
  return String(prefix) + "-" + String(value, HEX);
}

void setRelay(uint8_t roomIndex, bool on) {
  if (roomIndex >= ROOM_COUNT) return;
  relayState[roomIndex] = on;
  digitalWrite(RELAY_PINS[roomIndex], RELAY_ACTIVE_LOW ? !on : on);
}

bool protectionAllows(uint8_t roomIndex, bool on) {
  // Replace this function with the existing deterministic protection engine.
  // A protected room must return false for ON; it must never be bypassed here.
  (void)roomIndex;
  (void)on;
  return true;
}

void enterSafeOutputs() {
  for (uint8_t index = 0; index < ROOM_COUNT; index++) {
    pinMode(RELAY_PINS[index], OUTPUT);
    setRelay(index, false);
  }
}

bool hasProcessedCommand(const String& commandId) {
  for (const String& processed : processedCommands) {
    if (processed == commandId) return true;
  }
  return false;
}

void rememberCommand(const String& commandId) {
  processedCommands[processedCommandHead] = commandId;
  processedCommandHead = (processedCommandHead + 1) % COMMAND_HISTORY_SIZE;
}

void enqueueEvent(const char* type, const char* reason) {
  if (eventCount == EVENT_QUEUE_SIZE) {
    eventHead = (eventHead + 1) % EVENT_QUEUE_SIZE;
    eventCount--;
  }

  const uint8_t index = (eventHead + eventCount) % EVENT_QUEUE_SIZE;
  eventQueue[index].eventId = makeId("EVT", millis());
  eventQueue[index].type = type;
  eventQueue[index].reason = reason;
  eventQueue[index].createdAt = millis();
  eventCount++;
}

void publishResponse(const String& commandId, const char* status, const char* reason) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<512> message;
  message["type"] = "response";
  message["protocolVersion"] = PROTOCOL_VERSION;
  message["deviceId"] = deviceId;
  message["commandId"] = commandId;
  message["status"] = status;
  if (reason != nullptr) message["reason"] = reason;
  message["timestamp"] = unixTimeSeconds();

  char payload[512];
  const size_t length = serializeJson(message, payload, sizeof(payload));
  mqttClient.publish((topicRoot + "/responses").c_str(), payload, length, true);
}

bool commandIsFresh(JsonDocument& command) {
  const uint32_t expiresAt = command["expiresAt"] | 0;
  const uint32_t currentTime = unixTimeSeconds();
  if (expiresAt == 0 || currentTime == 0) return false;
  return static_cast<int32_t>(expiresAt - currentTime) > 0;
}

void handleCommand(JsonDocument& command) {
  const String commandId = command["commandId"] | "";
  const String commandName = command["command"] | "";

  if (commandId.isEmpty() || commandName.isEmpty()) return;
  if (hasProcessedCommand(commandId)) {
    publishResponse(commandId, "DUPLICATE", "COMMAND_DUPLICATE");
    return;
  }
  if (!commandIsFresh(command)) {
    publishResponse(commandId, "REJECTED", "COMMAND_EXPIRED");
    return;
  }

  rememberCommand(commandId);
  publishResponse(commandId, "RECEIVED", nullptr);

  if (commandName == "SYNC_STATE") {
    publishResponse(commandId, "CONFIRMED", "STATE_SYNC_READY");
    return;
  }

  if (commandName == "ALL_OFF") {
    for (uint8_t index = 0; index < ROOM_COUNT; index++) setRelay(index, false);
    enqueueEvent("ALL_OFF_CONFIRMED", "REMOTE_ALL_OFF");
    publishResponse(commandId, "CONFIRMED", nullptr);
    return;
  }

  uint8_t roomIndex = (command["roomId"] | 0) - 1;
  if (roomIndex >= ROOM_COUNT) {
    publishResponse(commandId, "REJECTED", "INVALID_ROOM");
    return;
  }

  const bool wantsOn = commandName == "ROOM_ON";
  const bool wantsOff = commandName == "ROOM_OFF";
  const bool wantsRecheck = commandName == "ROOM_RECHECK";
  if (!wantsOn && !wantsOff && !wantsRecheck) {
    publishResponse(commandId, "REJECTED", "COMMAND_UNSUPPORTED");
    return;
  }

  publishResponse(commandId, "VALIDATING", nullptr);
  if (wantsRecheck) {
    // The existing protection engine must perform fresh sensor validation here.
    const bool safe = protectionAllows(roomIndex, true);
    if (!safe) {
      publishResponse(commandId, "PROTECTED", "RECHECK_UNSAFE");
      enqueueEvent("RECHECK_FAILED", "PROTECTION_ACTIVE");
      return;
    }
    publishResponse(commandId, "CONFIRMED", "RECHECK_SAFE");
    return;
  }

  if (!protectionAllows(roomIndex, wantsOn)) {
    publishResponse(commandId, "PROTECTED", "PROTECTION_ENGINE_REJECTED");
    enqueueEvent("COMMAND_REJECTED", "PROTECTED");
    return;
  }

  publishResponse(commandId, "EXECUTING", nullptr);
  setRelay(roomIndex, wantsOn);
  enqueueEvent(wantsOn ? "RELAY_ON" : "RELAY_OFF", "COMMAND_CONFIRMED");
  publishResponse(commandId, "CONFIRMED", nullptr);
}

void onMqttMessage(char* topic, uint8_t* bytes, unsigned int length) {
  if (String(topic) != topicRoot + "/commands") return;
  if (length > 1024) return;

  StaticJsonDocument<1024> command;
  if (deserializeJson(command, bytes, length) != DeserializationError::Ok) return;
  handleCommand(command);
}

void publishAvailability(const char* state) {
  if (mqttClient.connected()) mqttClient.publish((topicRoot + "/availability").c_str(), state, true);
}

void populateState(JsonDocument& state) {
  const bool stationConnected = WiFi.status() == WL_CONNECTED;
  state["type"] = "state";
  state["protocolVersion"] = PROTOCOL_VERSION;
  state["name"] = "NEXUS ESP32 Home Controller";
  state["firmwareVersion"] = FIRMWARE_VERSION;
  state["deviceId"] = deviceId;
  state["status"] = "ONLINE";
  state["sequence"] = telemetrySequence;
  state["uptime"] = millis() / 1000;
  state["wifi"]["connected"] = stationConnected;
  if (stationConnected) state["wifi"]["rssi"] = WiFi.RSSI();
  else state["wifi"]["rssi"] = nullptr;
  state["mqtt"]["connected"] = mqttClient.connected();
  state["protection"]["state"] = "UNKNOWN";
  state["timestamp"] = unixTimeSeconds();

  JsonObject telemetry = state.createNestedObject("telemetry");
  JsonObject system = telemetry.createNestedObject("system");
  system["voltage"] = nullptr;
  system["current"] = nullptr;
  system["voltageQuality"] = "UNAVAILABLE";
  system["currentQuality"] = "UNAVAILABLE";
  telemetry["timestamp"] = unixTimeSeconds();

  JsonArray rooms = state.createNestedArray("rooms");
  for (uint8_t index = 0; index < ROOM_COUNT; index++) {
    JsonObject room = rooms.createNestedObject();
    room["roomId"] = index + 1;
    room["name"] = String("Room ") + String(index + 1);
    room["state"] = relayState[index] ? "ON" : "OFF";
    room["relayState"] = relayState[index] ? "ON" : "OFF";
    room["sensorState"] = "UNAVAILABLE";
    room["lastEvent"]["type"] = "UNKNOWN";
  }
}

void handleHttpState() {
  StaticJsonDocument<1536> state;
  populateState(state);
  String response;
  serializeJson(state, response);
  webServer.send(200, "application/json", response);
}

void handleHttpRoot() {
  webServer.send(200, "text/html", R"HTML(<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXUS ESP32</title><style>body{margin:0;background:#111814;color:#e7eee8;font:16px system-ui;padding:32px}main{max-width:760px;margin:auto}h1{font-size:28px}p{color:#aab7ad}pre{white-space:pre-wrap;background:#1d2820;padding:18px;border-left:3px solid #a6e267}</style>
<main><p>NEXUS / DEVICE LINK</p><h1>ESP32 is reachable</h1><p>Read-only live state, refreshed once per second.</p><pre id="state">Connecting...</pre></main>
<script>async function refresh(){try{const response=await fetch('/api/state');if(!response.ok)throw Error(response.status);document.querySelector('#state').textContent=JSON.stringify(await response.json(),null,2)}catch(error){document.querySelector('#state').textContent='State unavailable: '+error.message}}refresh();setInterval(refresh,1000)</script></html>)HTML");
}

void startHttpServer() {
  webServer.on("/", HTTP_GET, handleHttpRoot);
  webServer.on("/api/state", HTTP_GET, handleHttpState);
  webServer.onNotFound([]() { webServer.send(404, "application/json", "{\"error\":\"NOT_FOUND\"}"); });
  webServer.begin();
}

void publishStateSnapshot() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<1536> state;
  populateState(state);
  char payload[1536];
  const size_t length = serializeJson(state, payload, sizeof(payload));
  mqttClient.publish((topicRoot + "/state").c_str(), payload, length, true);
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;
  telemetrySequence++;
  publishStateSnapshot();

  StaticJsonDocument<256> heartbeat;
  heartbeat["type"] = "heartbeat";
  heartbeat["protocolVersion"] = PROTOCOL_VERSION;
  heartbeat["deviceId"] = deviceId;
  heartbeat["sequence"] = telemetrySequence;
  heartbeat["uptime"] = millis() / 1000;
  heartbeat["timestamp"] = unixTimeSeconds();
  heartbeat["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  heartbeat["mqttConnected"] = mqttClient.connected();

  char payload[256];
  const size_t length = serializeJson(heartbeat, payload, sizeof(payload));
  mqttClient.publish((topicRoot + "/telemetry").c_str(), payload, length, false);
}

void publishQueuedEvents() {
  while (mqttClient.connected() && eventCount > 0) {
    QueuedEvent& event = eventQueue[eventHead];
    StaticJsonDocument<384> message;
    message["type"] = "event";
    message["protocolVersion"] = PROTOCOL_VERSION;
    message["deviceId"] = deviceId;
    message["eventId"] = event.eventId;
    message["eventType"] = event.type;
    message["reason"] = event.reason;
    message["timestamp"] = unixTimeSeconds();

    char payload[384];
    const size_t length = serializeJson(message, payload, sizeof(payload));
    if (!mqttClient.publish((topicRoot + "/events").c_str(), payload, length, false)) return;
    eventHead = (eventHead + 1) % EVENT_QUEUE_SIZE;
    eventCount--;
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED || millis() < nextWifiAttemptAt) return;
  nextWifiAttemptAt = millis() + reconnectDelayMs;
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected() || millis() < nextMqttAttemptAt) return;
  nextMqttAttemptAt = millis() + reconnectDelayMs;

  const String clientId = "nexus-" + deviceId;
  const bool connected = mqttClient.connect(
    clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD,
    (topicRoot + "/availability").c_str(), 1, true, "OFFLINE"
  );

  if (!connected) {
    reconnectDelayMs = min(reconnectDelayMs * 2, MAX_RECONNECT_MS);
    return;
  }

  reconnectDelayMs = 1000;
  mqttClient.subscribe((topicRoot + "/commands").c_str(), 1);
  mqttClient.subscribe((topicRoot + "/config").c_str(), 1);
  publishAvailability("ONLINE");
  publishStateSnapshot();
  publishTelemetry();
  publishQueuedEvents();
}

void setup() {
  Serial.begin(115200);
  enterSafeOutputs();

  preferences.begin("nexus", false);
  deviceId = preferences.getString("deviceId", "");
  if (deviceId.isEmpty()) {
    deviceId = "NEXUS-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    preferences.putString("deviceId", deviceId);
  }
  preferences.end();

  topicRoot = "nexus/v1/devices/" + deviceId;
  tlsClient.setCACert(MQTT_CA_CERT);
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(1200);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  startHttpServer();
  Serial.printf("NEXUS device page: http://%s/\n", WiFi.softAPIP().toString().c_str());
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
}

void loop() {
  // Never block here: protection/sensor work must be called every loop iteration.
  connectWifi();
  connectMqtt();
  mqttClient.loop();
  webServer.handleClient();

  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();
    // Run the existing protection engine before publishing its resulting state.
    publishTelemetry();
  }

  publishQueuedEvents();
}

} // namespace nexus

void setup() {
  nexus::setup();
}

void loop() {
  nexus::loop();
}
