import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSystemPower,
  deriveConnectionState,
  buildProtectionStatus,
  buildAiContext,
} from '../forge-ai-studio-react/src/lib/nexusHomeController.js';

test('calculateSystemPower returns null when voltage or current is unavailable', () => {
  assert.equal(calculateSystemPower(null, 0.84), null);
  assert.equal(calculateSystemPower(12.18, null), null);
});

test('calculateSystemPower uses P = V × I and keeps numeric precision', () => {
  assert.equal(calculateSystemPower(12.18, 0.84), 10.2312);
});

test('deriveConnectionState distinguishes Wi-Fi, MQTT, backend and realtime states', () => {
  const state = deriveConnectionState({
    wifi: true,
    mqtt: false,
    backend: true,
    realtime: true,
  });

  assert.equal(state.wifi, 'ONLINE');
  assert.equal(state.mqtt, 'OFFLINE');
  assert.equal(state.backend, 'ONLINE');
  assert.equal(state.realtime, 'CONNECTED');
});

test('buildProtectionStatus marks protected rooms without hiding the evidence', () => {
  const state = buildProtectionStatus({
    roomId: 2,
    value: 1.82,
    threshold: 1.5,
    duration: 3,
    status: 'PROTECTED',
  });

  assert.equal(state.state, 'PROTECTED');
  assert.equal(state.reason, 'CURRENT_HIGH');
  assert.match(state.message, /Room 2/i);
});

test('buildAiContext strips secrets and includes only safe evidence', () => {
  const context = buildAiContext({
    deviceId: 'NEXUS-A1B2C3',
    userQuestion: 'Why did Room 2 turn off?',
    deviceState: { protection: 'PROTECTED' },
    event: { type: 'CURRENT_HIGH', value: 1.82 },
    mqttPassword: 'secret',
  });

  assert.equal(context.deviceId, 'NEXUS-A1B2C3');
  assert.equal(context.userQuestion, 'Why did Room 2 turn off?');
  assert.equal(context.deviceState.protection, 'PROTECTED');
  assert.equal(context.mqttPassword, undefined);
});
