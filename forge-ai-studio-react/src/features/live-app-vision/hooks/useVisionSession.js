import { useCallback, useState } from 'react';
import {
  connectPreview as apiConnect,
  disconnectPreview as apiDisconnect,
  captureScreenshot as apiCapture,
  getEvents as apiEvents,
} from '../api/visionClient';

export function useVisionSession() {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [events, setEvents] = useState([]);
  const [diffResult, setDiffResult] = useState(null);

  const connect = useCallback(async (url) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiConnect(url);
      setSession(result.session);
      return result.session;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Connection failed';
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await apiDisconnect(session.sessionId);
      setSession(null);
      setScreenshots([]);
      setEvents([]);
      setDiffResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Disconnect failed');
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [session]);

  const capture = useCallback(async (label, mode = 'viewport') => {
    if (!session) throw new Error('Connect a preview first.');
    setBusy(true);
    setError(null);
    try {
      const result = await apiCapture(session.sessionId, { mode, label });
      setScreenshots((current) => [result.screenshot, ...current]);
      return result.screenshot;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed');
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [session]);

  const refreshEvents = useCallback(async () => {
    if (!session) return [];
    const result = await apiEvents(session.sessionId);
    setEvents(result.events || []);
    return result.events || [];
  }, [session]);

  return {
    session, busy, error, screenshots, events, diffResult,
    setScreenshots, setEvents, setDiffResult, setError,
    connect, disconnect, capture, refreshEvents,
  };
}