#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>

// =====================================================
// NEXUS_HOME
// ESP32 DevKit V1
// 2 LIGHT CONTROL + 2 VOLTAGE SENSORS
// 12V DC SYSTEM
// =====================================================

// ---------------- Wi-Fi ----------------
const char* AP_SSID     = "NEXUS_HOME";
const char* AP_PASSWORD = "Thariq2010";

// ---------------- Relay pins ----------------
const uint8_t LIGHT1_RELAY_PIN = 25;
const uint8_t LIGHT2_RELAY_PIN = 26;

// Most 4-channel relay modules are active LOW.
// If your relay works opposite, change this to false.
const bool RELAY_ACTIVE_LOW = true;

// ---------------- Voltage sensors ----------------
const uint8_t VOLTAGE1_PIN = 35;
const uint8_t VOLTAGE2_PIN = 32;

// ---------------- Web server ----------------
WebServer server(80);

// ---------------- Light states ----------------
bool light1State = false;
bool light2State = false;


// =====================================================
// RELAY CONTROL
// =====================================================

void setRelay(uint8_t pin, bool state)
{
  if (RELAY_ACTIVE_LOW)
  {
    digitalWrite(pin, state ? LOW : HIGH);
  }
  else
  {
    digitalWrite(pin, state ? HIGH : LOW);
  }
}


// =====================================================
// VOLTAGE SENSOR READING
// =====================================================

int readVoltageSensor(uint8_t pin)
{
  return analogRead(pin);
}


// =====================================================
// HTML PAGE
// =====================================================

String makePage()
{
  int sensor1 = readVoltageSensor(VOLTAGE1_PIN);
  int sensor2 = readVoltageSensor(VOLTAGE2_PIN);

  String html;

  html += "<!DOCTYPE html>";
  html += "<html>";
  html += "<head>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>NEXUS_HOME</title>";

  html += "<style>";

  html += "body{";
  html += "font-family:Arial,sans-serif;";
  html += "background:#101318;";
  html += "color:white;";
  html += "text-align:center;";
  html += "padding:20px;";
  html += "}";

  html += ".container{";
  html += "max-width:500px;";
  html += "margin:auto;";
  html += "}";

  html += ".title{";
  html += "font-size:32px;";
  html += "font-weight:bold;";
  html += "margin-bottom:5px;";
  html += "}";

  html += ".subtitle{";
  html += "color:#aaa;";
  html += "margin-bottom:25px;";
  html += "}";

  html += ".card{";
  html += "background:#1a1f27;";
  html += "border:1px solid #303744;";
  html += "border-radius:18px;";
  html += "padding:20px;";
  html += "margin:15px 0;";
  html += "}";

  html += ".room{";
  html += "font-size:22px;";
  html += "margin-bottom:10px;";
  html += "}";

  html += ".state{";
  html += "font-size:18px;";
  html += "margin:10px;";
  html += "}";

  html += "button{";
  html += "width:90%;";
  html += "padding:15px;";
  html += "border:0;";
  html += "border-radius:12px;";
  html += "font-size:18px;";
  html += "font-weight:bold;";
  html += "margin:6px;";
  html += "cursor:pointer;";
  html += "}";

  html += ".on{background:#20c878;color:white;}";
  html += ".off{background:#d94848;color:white;}";

  html += ".sensor{";
  html += "font-size:17px;";
  html += "margin:10px;";
  html += "color:#ddd;";
  html += "}";

  html += "</style>";
  html += "</head>";

  html += "<body>";
  html += "<div class='container'>";

  html += "<div class='title'>NEXUS_HOME</div>";
  html += "<div class='subtitle'>ESP32 Smart Light Controller</div>";

  // ---------------- Light 1 ----------------

  html += "<div class='card'>";
  html += "<div class='room'>LIGHT 1</div>";

  html += "<div class='state'>";
  html += light1State ? "STATUS: ON" : "STATUS: OFF";
  html += "</div>";

  html += "<a href='/light1/on'>";
  html += "<button class='on'>TURN ON</button>";
  html += "</a>";

  html += "<a href='/light1/off'>";
  html += "<button class='off'>TURN OFF</button>";
  html += "</a>";

  html += "<div class='sensor'>";
  html += "Voltage Sensor 1: ";
  html += String(sensor1);
  html += "</div>";

  html += "</div>";

  // ---------------- Light 2 ----------------

  html += "<div class='card'>";
  html += "<div class='room'>LIGHT 2</div>";

  html += "<div class='state'>";
  html += light2State ? "STATUS: ON" : "STATUS: OFF";
  html += "</div>";

  html += "<a href='/light2/on'>";
  html += "<button class='on'>TURN ON</button>";
  html += "</a>";

  html += "<a href='/light2/off'>";
  html += "<button class='off'>TURN OFF</button>";
  html += "</a>";

  html += "<div class='sensor'>";
  html += "Voltage Sensor 2: ";
  html += String(sensor2);
  html += "</div>";

  html += "</div>";

  // ---------------- System ----------------

  html += "<div class='card'>";
  html += "<div class='room'>NEXUS SYSTEM</div>";
  html += "<div class='sensor'>Wi-Fi: NEXUS_HOME</div>";
  html += "<div class='sensor'>IP: 192.168.4.1</div>";
  html += "<div class='sensor'>12V DC SYSTEM</div>";
  html += "</div>";

  html += "</div>";
  html += "</body>";
  html += "</html>";

  return html;
}


// =====================================================
// WEB ROUTES
// =====================================================

void handleRoot()
{
  server.send(200, "text/html", makePage());
}


void light1On()
{
  light1State = true;
  setRelay(LIGHT1_RELAY_PIN, true);

  server.sendHeader("Location", "/");
  server.send(303);
}


void light1Off()
{
  light1State = false;
  setRelay(LIGHT1_RELAY_PIN, false);

  server.sendHeader("Location", "/");
  server.send(303);
}


void light2On()
{
  light2State = true;
  setRelay(LIGHT2_RELAY_PIN, true);

  server.sendHeader("Location", "/");
  server.send(303);
}


void light2Off()
{
  light2State = false;
  setRelay(LIGHT2_RELAY_PIN, false);

  server.sendHeader("Location", "/");
  server.send(303);
}


// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);

  // Relay pins
  pinMode(LIGHT1_RELAY_PIN, OUTPUT);
  pinMode(LIGHT2_RELAY_PIN, OUTPUT);

  // IMPORTANT:
  // Start with both lights OFF.
  setRelay(LIGHT1_RELAY_PIN, false);
  setRelay(LIGHT2_RELAY_PIN, false);

  // Voltage sensor inputs
  pinMode(VOLTAGE1_PIN, INPUT);
  pinMode(VOLTAGE2_PIN, INPUT);

  // ESP32 access point
  WiFi.mode(WIFI_AP);

  WiFi.softAP(AP_SSID, AP_PASSWORD);

  Serial.println();
  Serial.println("================================");
  Serial.println("       NEXUS_HOME");
  Serial.println("================================");
  Serial.print("Wi-Fi: ");
  Serial.println(AP_SSID);
  Serial.print("Password: ");
  Serial.println(AP_PASSWORD);
  Serial.print("IP Address: ");
  Serial.println(WiFi.softAPIP());

  // Web routes
  server.on("/", handleRoot);

  server.on("/light1/on", light1On);
  server.on("/light1/off", light1Off);

  server.on("/light2/on", light2On);
  server.on("/light2/off", light2Off);

  server.begin();

  Serial.println("Web server started.");
}


// =====================================================
// LOOP
// =====================================================

void loop()
{
  server.handleClient();
}
