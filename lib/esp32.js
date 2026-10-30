export function normalizeEsp32State(payload, receivedAt = new Date().toISOString(), diagnostics = null) {
  const source = payload?.device || payload?.data || payload;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('ESP32 state must be a JSON object.');
  }

  const telemetry = source.telemetry || {};
  const system = telemetry.system || source.system || {};
  const rooms = Array.isArray(source.rooms)
    ? source.rooms.map((room, index) => {
        const relayState = typeof room.relayState === 'boolean'
          ? room.relayState ? 'ON' : 'OFF'
          : room.relayState || room.state || 'UNKNOWN';
        const roomState = room.stateName || room.state || relayState;
        const roomDiagnostics = diagnostics?.[`r${room.roomId ?? index + 1}`] || {};
        return {
          ...room,
          roomId: room.roomId ?? index + 1,
          state: roomState,
          stateName: roomState,
          relayState,
          sensorPresent: room.sensorPresent ?? roomDiagnostics.present ?? null,
          sensorRaw: room.sensorRaw ?? roomDiagnostics.raw ?? null,
          sensorState: room.sensorValid === true
            ? 'VALID'
            : room.sensorValid === false
              ? 'INVALID'
              : room.sensorState || 'UNAVAILABLE',
          lastEvent: room.lastEvent || {
            type: room.faultCode || (roomState === 'NORMAL' ? 'NONE' : roomState),
          },
        };
      })
    : [];
  const protectedRoom = rooms.find((room) => room.stateName === 'PROTECTED');
  const sensorErrorRoom = rooms.find((room) => room.stateName === 'SENSOR_ERROR');
  const warningRoom = rooms.find((room) => room.stateName !== 'NORMAL' && room.stateName !== 'PROTECTED');
  const protectionState = protectedRoom
    ? 'PROTECTED'
    : sensorErrorRoom
      ? 'SENSOR_ERROR'
      : warningRoom
        ? 'WARNING'
        : rooms.length
          ? 'NORMAL'
          : 'UNKNOWN';
  const voltageValid = source.voltageValid === true;
  const currentValid = source.currentValid === true;
  const voltage = voltageValid ? source.systemVoltage : system.voltage;
  const current = currentValid ? source.systemCurrent : system.current;
  const mappedAlerts = Array.isArray(source.alerts) ? source.alerts : rooms
    .filter((room) => room.stateName !== 'NORMAL')
    .map((room) => ({
      eventId: `room-${room.roomId}-${room.stateName}-${room.faultCode || ''}`,
      type: room.faultCode || room.stateName,
      severity: room.stateName === 'PROTECTED' || room.stateName === 'SENSOR_ERROR' ? 'high' : 'warning',
      message: `${room.name || `Room ${room.roomId}`} reports ${room.stateName}${room.faultCode ? ` (${room.faultCode})` : ''}.`,
    }));

  return {
    device: {
      ...source,
      name: source.name || 'NEXUS AI Home Controller',
      deviceId: source.deviceId || 'ESP32-DEVICE',
      status: source.status || 'ONLINE',
      firmwareVersion: source.firmwareVersion || 'UNAVAILABLE',
      wifi: source.wifi || {
        connected: source.wifiConnected ?? false,
        rssi: source.wifiRSSI ?? null,
      },
      backendConnected: source.backendConnected ?? null,
      mqtt: source.mqtt || { connected: null },
      protection: source.protection || { state: protectionState },
      telemetry: {
        ...telemetry,
        system: {
          ...system,
          voltage: voltage ?? null,
          current: current ?? null,
          power: voltageValid && currentValid ? source.systemPower ?? null : system.power ?? null,
          voltageQuality: source.voltageValid === undefined
            ? system.voltageQuality || (voltage === null || voltage === undefined ? 'UNAVAILABLE' : 'VALID')
            : voltageValid ? 'VALID' : 'UNAVAILABLE',
          currentQuality: source.currentValid === undefined
            ? system.currentQuality || (current === null || current === undefined ? 'UNAVAILABLE' : 'VALID')
            : currentValid ? 'VALID' : 'INVALID',
        },
        timestamp: telemetry.timestamp || source.timestamp || receivedAt,
      },
      rooms,
      diagnostics: diagnostics || null,
      alerts: mappedAlerts,
      lastSeen: source.timestamp || telemetry.timestamp || receivedAt,
    },
    receivedAt,
  };
}