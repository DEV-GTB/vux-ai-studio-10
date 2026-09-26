export function calculateSystemPower(voltage, current) {
  if (voltage === null || voltage === undefined || current === null || current === undefined) {
    return null;
  }

  if (Number.isNaN(Number(voltage)) || Number.isNaN(Number(current))) {
    return null;
  }

  return Number(voltage) * Number(current);
}

export function deriveConnectionState({ wifi, mqtt, backend, realtime } = {}) {
  return {
    wifi: wifi === true ? 'ONLINE' : wifi === false ? 'OFFLINE' : 'UNKNOWN',
    mqtt: mqtt === true ? 'SECURE' : mqtt === false ? 'OFFLINE' : 'UNKNOWN',
    backend: backend === true ? 'ONLINE' : backend === false ? 'OFFLINE' : 'CHECKING',
    realtime: realtime === true ? 'CONNECTED' : realtime === false ? 'DISCONNECTED' : 'CONNECTING',
  };
}

export function buildProtectionStatus({ roomId, value, threshold, duration, status = 'UNKNOWN' } = {}) {
  const safeRoom = roomId ?? 'room';

  if (status === 'PROTECTED') {
    return {
      state: 'PROTECTED',
      reason: 'CURRENT_HIGH',
      message: `Room ${safeRoom} is protected because the system reported ${Number(value ?? 0).toFixed(2)} A against a ${Number(threshold ?? 0).toFixed(2)} A threshold for ${Number(duration ?? 0).toFixed(1)} s.`,
    };
  }

  return {
    state: status,
    reason: 'NONE',
    message: `Room ${safeRoom} state is ${status}.`,
  };
}

export function buildAiContext({
  deviceId,
  roomId,
  userQuestion,
  deviceState,
  event,
  recentTelemetry,
  sensorQuality,
  protectionState,
  configuration,
  ...rest
} = {}) {
  const safeDeviceState = deviceState ?? {};
  const safeContext = {
    source: 'NEXUS_HOME_CONTROLLER',
    deviceId,
    roomId,
    userQuestion,
    currentState: safeDeviceState,
    deviceState: safeDeviceState,
    event: event ?? {},
    recentTelemetry: recentTelemetry ?? {},
    sensorQuality: sensorQuality ?? {},
    protectionState: protectionState ?? {},
    configuration: configuration ?? {},
  };

  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && /password|secret|token|key/i.test(key)) continue;
    if (typeof value === 'object' && value && /password|secret|token|key/i.test(key)) continue;
    safeContext[key] = value;
  }

  return safeContext;
}
