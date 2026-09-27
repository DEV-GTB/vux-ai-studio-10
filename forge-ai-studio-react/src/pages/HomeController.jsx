import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAiContext, calculateSystemPower } from '../lib/nexusHomeController.js'
import { apiUrl } from '../lib/api.js'
import './HomeController.css'

const STATUS_URL = apiUrl('/api/device/state')

function getTimestampMs(value) {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatAge(value) {
  const timestamp = getTimestampMs(value)
  if (!timestamp) return 'Waiting for first device snapshot'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 2) return 'Updated just now'
  if (seconds < 60) return `Updated ${seconds}s ago`
  return `Updated ${Math.floor(seconds / 60)}m ago`
}

function MetricCard({ label, value, unit, detail, tone = 'lime' }) {
  const display = value === null || value === undefined ? '--' : value
  return (
    <article className={`hc-metric hc-metric-${tone}`}>
      <div className="hc-metric-topline"><span>{label}</span><span className="hc-metric-mark" aria-hidden="true" /></div>
      <div className="hc-metric-value">
        <span className="hc-number" key={display}>{display}</span>
        {value !== null && value !== undefined && unit ? <span className="hc-unit">{unit}</span> : null}
      </div>
      <div className="hc-metric-detail">{detail}</div>
    </article>
  )
}

function ApplianceControl({ roomId, label, isOn, onCommand, disabled, pending }) {
  return (
    <div className="hc-appliance-control">
      <div className="hc-appliance-status">
        <span>{label}</span>
        <strong className={isOn ? 'is-on' : ''}>{isOn ? 'ON' : 'OFF'}</strong>
      </div>
      <div className="hc-control-buttons" role="group" aria-label={`Room ${roomId} ${label} controls`}>
        <button
          type="button"
          className={`hc-control-button ${!isOn ? 'is-selected' : ''}`}
          onClick={() => onCommand(roomId, label, false)}
          disabled={disabled || pending || !isOn}
          aria-pressed={!isOn}
          title={`Turn Room ${roomId} ${label.toLowerCase()} off`}
        >
          OFF
        </button>
        <button
          type="button"
          className={`hc-control-button ${isOn ? 'is-selected' : ''}`}
          onClick={() => onCommand(roomId, label, true)}
          disabled={disabled || pending || isOn}
          aria-pressed={isOn}
          title={`Turn Room ${roomId} ${label.toLowerCase()} on`}
        >
          ON
        </button>
      </div>
    </div>
  )
}

function LinkSignal({ label, value, state }) {
  const connected = state === 'online'
  return (
    <div className="hc-link-signal">
      <span className={`hc-signal-dot ${connected ? 'is-live' : ''}`} aria-hidden="true" />
      <span className="hc-link-label">{label}</span>
      <span className="hc-link-value">{value}</span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="hc-skeleton" aria-label="Loading device data" role="status">
      <div className="hc-skeleton-line hc-skeleton-wide" />
      <div className="hc-skeleton-grid">
        <div className="hc-skeleton-block" />
        <div className="hc-skeleton-block" />
        <div className="hc-skeleton-block" />
      </div>
      <div className="hc-skeleton-line" />
    </div>
  )
}

export function HomeController({ setCurrentPage }) {
  const [device, setDevice] = useState(null)
  const [deviceEndpoint, setDeviceEndpoint] = useState('http://192.168.4.1')
  const [connection, setConnection] = useState('CONNECTING')
  const [error, setError] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [accessCodeError, setAccessCodeError] = useState('')
  const [pendingControl, setPendingControl] = useState(null)
  const [controlMessage, setControlMessage] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('Summarize the current device health and any risks.')
  const [aiReply, setAiReply] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const seenAlerts = useRef(new Set())
  const hasDeviceRef = useRef(false)

  useEffect(() => {
    if (!accessCode) return undefined

    const controller = new AbortController()
    let active = true
    let inFlight = false

    async function refresh() {
      if (inFlight) return
      inFlight = true

      try {
        const response = await fetch(STATUS_URL, {
          headers: { Accept: 'application/json', 'X-App-Access-Code': accessCode },
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (response.status === 401) {
          setAccessCode('')
          setAccessCodeError('That access code was not accepted. Check it and try again.')
          return
        }
        if (!response.ok) throw new Error(payload.message || `Device bridge returned HTTP ${response.status}.`)
        if (!payload.device) throw new Error('The device bridge returned no device state.')
        if (!active) return
        hasDeviceRef.current = true
        setDevice(payload.device)
        setDeviceEndpoint(payload.source?.endpoint || 'Cloud HTTPS API')
        const ageMs = Date.now() - (getTimestampMs(payload.receivedAt) || 0)
        const isStale = ageMs > 30000
        setConnection(isStale ? 'STALE' : 'LIVE')
        setError(isStale ? 'No new device status has arrived in the last 30 seconds.' : '')
        setLastRefresh(payload.receivedAt || new Date().toISOString())
      } catch (requestError) {
        if (!active || requestError.name === 'AbortError') return
        setConnection(hasDeviceRef.current ? 'STALE' : 'OFFLINE')
        setError(requestError.message || 'The ESP32 could not be reached.')
      } finally {
        inFlight = false
      }
    }

    refresh()
    const interval = window.setInterval(refresh, 2000)
    return () => {
      active = false
      controller.abort()
      window.clearInterval(interval)
    }
  }, [accessCode, refreshSignal])

  const system = device?.telemetry?.system || {}
  const voltage = system.voltage ?? null
  const current = system.current ?? null
  const power = calculateSystemPower(voltage, current)
  const rooms = device?.rooms || []
  const pendingRoom = pendingControl ? rooms.find((item) => Number(item.roomId) === pendingControl.roomId) : null
  const pendingActualState = pendingControl
    ? pendingControl.appliance === 'FAN' ? pendingRoom?.fanOn : pendingRoom?.lightOn
    : undefined
  const protection = device?.protection?.state || 'UNKNOWN'
  const uptime = Number.isFinite(Number(device?.uptime)) ? Math.floor(Number(device.uptime)) : null
  const localApValue = device?.wifi?.localApConnected === true
    ? 'LOCAL NETWORK ONLINE'
    : device?.wifi?.localApConnected === false
      ? 'LOCAL NETWORK OFFLINE'
      : 'NOT REPORTED'
  const uplinkValue = device?.wifi?.stationConnected === true ? 'INTERNET UPLINK ONLINE' : 'NO CLOUD UPLINK'
  const backendValue = device?.backendConnected === true
    ? 'CLOUD LINK ONLINE'
    : device?.backendConnected === false
      ? 'CLOUD LINK OFFLINE'
      : 'NOT REPORTED'
  const protectionAllowsOn = ['NORMAL', 'RECOVERED'].includes(protection)
  const controlsDisabled = connection !== 'LIVE' || !device

  const alertItems = useMemo(() => {
    const items = (device?.alerts || []).map((alert, index) => ({
      key: alert.eventId || `${alert.type || alert.eventType || 'device-alert'}-${index}`,
      title: alert.type || alert.eventType || 'DEVICE EVENT',
      message: alert.message || alert.reason || 'Device reported an event.',
      severity: String(alert.severity || 'info').toLowerCase(),
    }))
    if (protection === 'PROTECTED') {
      items.unshift({
        key: 'protection-active',
        title: 'PROTECTION ACTIVE',
        message: 'A protected state is active. Relay controls remain unavailable pending device-side recheck.',
        severity: 'high',
      })
    }
    if (connection === 'OFFLINE' || connection === 'STALE') {
      items.unshift({
        key: `connection-${connection}`,
        title: connection === 'STALE' ? 'DEVICE DATA STALE' : 'DEVICE OFFLINE',
        message: error || 'No current device snapshot is available.',
        severity: 'warning',
      })
    }
    return items
  }, [connection, device?.alerts, error, protection])

  useEffect(() => {
    if (!alertsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return
    for (const alert of alertItems) {
      if (seenAlerts.current.has(alert.key)) continue
      seenAlerts.current.add(alert.key)
      if (alert.severity === 'high' || alert.severity === 'critical' || alert.key.startsWith('connection-')) {
        new Notification(alert.title, { body: alert.message })
      }
    }
  }, [alertItems, alertsEnabled])

  useEffect(() => {
    if (!pendingControl) return undefined

    const confirmationTimeout = window.setTimeout(() => {
      setPendingControl(null)
      setControlMessage('No updated device status confirmed that command. Check the ESP32 connection and protection state.')
    }, 25000)

    return () => window.clearTimeout(confirmationTimeout)
  }, [pendingControl])

  useEffect(() => {
    if (!pendingControl) return
    if (getTimestampMs(lastRefresh) > pendingControl.queuedAt) {
      if (pendingActualState === pendingControl.on) {
        setPendingControl(null)
        setControlMessage(`Room ${pendingControl.roomId} ${pendingControl.appliance.toLowerCase()} confirmed ${pendingControl.on ? 'on' : 'off'}.`)
      }
    }
  }, [lastRefresh, pendingActualState, pendingControl])

  async function enableNotifications() {
    if (!('Notification' in window)) {
      setError('This browser does not support desktop notifications.')
      return
    }
    const permission = await Notification.requestPermission()
    setAlertsEnabled(permission === 'granted')
  }

  async function analyzeWithAi(event) {
    event.preventDefault()
    if (!device) {
      setAiError('Connect the ESP32 before requesting an analysis.')
      return
    }

    setAiLoading(true)
    setAiError('')
    setAiReply('')
    const context = buildAiContext({
      deviceId: device.deviceId,
      roomId: 'ALL',
      userQuestion: aiQuestion,
      deviceState: { status: device.status, protection },
      event: alertItems[0] || {},
      recentTelemetry: { voltage, current, power, timestamp: device.telemetry?.timestamp },
      sensorQuality: { voltage: system.voltageQuality, current: system.currentQuality },
      protectionState: device.protection || {},
      configuration: { source: 'ESP32_HTTP_READ_ONLY', sequence: device.sequence, uptime },
    })

    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Analyze this live ESP32 telemetry as a cautious home-device assistant. State clearly when values are missing, never claim a safety check passed unless the telemetry proves it, and do not suggest bypassing protection.\n\nTelemetry JSON:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${aiQuestion}`,
          }],
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || `AI service returned HTTP ${response.status}.`)
      setAiReply(payload.text || 'The AI service returned an empty response.')
    } catch (requestError) {
      setAiError(requestError.message || 'AI analysis failed.')
    } finally {
      setAiLoading(false)
    }
  }

  async function sendApplianceCommand(roomId, appliance, on) {
    if (!accessCode || controlsDisabled || pendingControl) return
    setControlMessage('')

    try {
      const response = await fetch(apiUrl('/api/device/command'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Access-Code': accessCode,
        },
        body: JSON.stringify({
          room: roomId,
          command: `${appliance}_${on ? 'ON' : 'OFF'}`,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (response.status === 401) {
        setAccessCode('')
        setAccessCodeError('That access code was not accepted. Check it and try again.')
        return
      }
      if (!response.ok) throw new Error(payload.message || payload.error || `Command request failed (${response.status}).`)

      setPendingControl({ roomId, appliance, on, queuedAt: Date.now() })
      setControlMessage(`Room ${roomId} ${appliance.toLowerCase()} command queued; waiting for device confirmation.`)
    } catch (requestError) {
      setControlMessage(requestError.message || 'Could not send the control command.')
    }
  }

  const isInitialLoading = !device && connection === 'CONNECTING'
  const deviceName = device?.name || 'NEXUS ESP32'

  function connectDashboard(event) {
    event.preventDefault()
    if (!accessCodeInput) return
    setAccessCodeError('')
    setAccessCode(accessCodeInput)
    setAccessCodeInput('')
  }

  return (
    <div className="hc-page">
      <header className="hc-header">
        <div className="hc-header-inner">
          <div className="hc-brandline"><span className="hc-brand-mark">N</span><span>VUX AI STUDIO</span><span className="hc-brand-divider">/</span><span>FIELD SYSTEMS</span></div>
          <div className="hc-header-actions">
            <span className={`hc-live-badge ${connection === 'LIVE' ? 'is-live' : ''}`}><i />{connection}</span>
            <button type="button" className="hc-icon-button" onClick={() => setRefreshSignal((value) => value + 1)} title="Refresh now" aria-label="Refresh now">↻</button>
            <button type="button" className="hc-back-button" onClick={() => setCurrentPage('home')}>← <span>Studio</span></button>
          </div>
        </div>
      </header>

      <main className="hc-main">
        <section className="hc-title-row">
          <div>
            <p className="hc-eyebrow">NEXUS / HOME CONTROL / 01</p>
            <h1>Home Controller<span className="hc-title-period">.</span></h1>
            <p className="hc-subtitle">Live device telemetry, link health, and protected output state.</p>
          </div>
          <div className="hc-source">
            <span className="hc-source-label">DEVICE BRIDGE</span>
            <span className="hc-source-address">{deviceEndpoint}</span>
            <span className="hc-source-refresh">{formatAge(lastRefresh)}</span>
          </div>
        </section>

        {!accessCode ? <section className="hc-panel hc-ai-panel" aria-labelledby="hc-access-title">
          <div className="hc-panel-heading"><div><span className="hc-section-tag">PRIVATE DEVICE DATA</span><h2 id="hc-access-title">Dashboard access</h2></div></div>
          <form onSubmit={connectDashboard} className="hc-ai-form">
            <label className="hc-sr-only" htmlFor="hc-access-code">Dashboard access code</label>
            <input id="hc-access-code" type="password" autoComplete="current-password" value={accessCodeInput} onChange={(event) => setAccessCodeInput(event.target.value)} placeholder="Enter dashboard access code" required />
            <button type="submit">Connect <span aria-hidden="true">↗</span></button>
          </form>
          {accessCodeError ? <p className="hc-ai-error" role="alert">{accessCodeError}</p> : null}
        </section> : null}

        {error ? <div className="hc-error" role="alert"><span className="hc-error-icon">!</span><span>{error}</span><button type="button" onClick={() => setRefreshSignal((value) => value + 1)}>Retry</button></div> : null}

        {isInitialLoading ? <Skeleton /> : null}

        {accessCode && !isInitialLoading ? (
          <>
            <section className="hc-device-band" aria-label="Device summary">
              <div className="hc-device-identity">
                <div className="hc-device-glyph" aria-hidden="true"><span /><span /><span /></div>
                <div>
                  <span className="hc-section-tag">ACTIVE NODE</span>
                  <h2>{deviceName}</h2>
                  <p>{device?.deviceId || 'Waiting for device identity'} <span>·</span> FW {device?.firmwareVersion || '—'}</p>
                </div>
              </div>
              <div className="hc-device-stats">
                <div><span>SEQUENCE</span><strong>{device?.sequence ?? '—'}</strong></div>
                <div><span>UPTIME</span><strong>{uptime === null ? '—' : `${uptime}s`}</strong></div>
                <div><span>PROTECTION</span><strong className={protection === 'PROTECTED' ? 'hc-danger-text' : ''}>{protection}</strong></div>
              </div>
            </section>

            <section className="hc-metrics-grid" aria-label="System measurements">
              <MetricCard label="System voltage" value={voltage === null ? null : Number(voltage).toFixed(2)} unit="V" detail={system.voltageQuality || 'AWAITING SENSOR'} tone="lime" />
              <MetricCard label="System current" value={current === null ? null : Number(current).toFixed(3)} unit="A" detail={`ACS712 · ${system.currentQuality || 'AWAITING SENSOR'}`} tone="blue" />
              <MetricCard label="Calculated power" value={power === null ? null : Number(power).toFixed(2)} unit="W" detail={power === null ? 'REQUIRES VOLTAGE + CURRENT' : 'V × A'} tone="amber" />
            </section>

            <section className="hc-content-grid">
              <div className="hc-panel hc-outputs-panel">
                <div className="hc-panel-heading">
                  <div><span className="hc-section-tag">OUTPUT CONTROL</span><h2>Room circuits</h2></div>
                  <span className="hc-readonly-label">DEVICE INTERLOCKED</span>
                </div>
                <div className="hc-room-controls">
                  {[1, 2].map((roomId) => {
                    const room = rooms.find((item) => Number(item.roomId) === roomId)
                    const isRoomPending = pendingControl?.roomId === roomId
                    return (
                      <article className="hc-room-control-card" key={roomId}>
                        <div className="hc-room-control-heading">
                          <div><span className="hc-section-tag">ZONE 0{roomId}</span><h3>{room?.name || `Room ${roomId}`}</h3></div>
                          <span className={`hc-room-indicator ${room?.fanOn || room?.lightOn ? 'is-on' : ''}`} aria-label={room?.fanOn || room?.lightOn ? 'A load is on' : 'All loads are off'} />
                        </div>
                        <ApplianceControl roomId={roomId} label="FAN" isOn={room?.fanOn === true} onCommand={sendApplianceCommand} disabled={controlsDisabled || (!protectionAllowsOn && !room?.fanOn)} pending={Boolean(isRoomPending)} />
                        <ApplianceControl roomId={roomId} label="LIGHT" isOn={room?.lightOn === true} onCommand={sendApplianceCommand} disabled={controlsDisabled || (!protectionAllowsOn && !room?.lightOn)} pending={Boolean(isRoomPending)} />
                        <p className="hc-room-sensor">Sensor {room?.sensorState || 'UNAVAILABLE'}{room?.sensorRaw === null || room?.sensorRaw === undefined ? '' : ` · raw ${room.sensorRaw}`}</p>
                      </article>
                    )
                  })}
                </div>
                <p className="hc-panel-footnote">ON commands are blocked unless the latest device report is safe. The ESP32 performs its own protection check before changing a relay. OFF commands remain available while connected.</p>
                {controlMessage ? <p className="hc-control-message" role="status">{controlMessage}</p> : null}
              </div>

              <div className="hc-panel hc-links-panel">
                <div className="hc-panel-heading">
                  <div><span className="hc-section-tag">NETWORK PATH</span><h2>Connection health</h2></div>
                  <span className="hc-rssi">RSSI <b>{device?.wifi?.rssi ?? '—'}{device?.wifi?.rssi !== null && device?.wifi?.rssi !== undefined ? ' dBm' : ''}</b></span>
                </div>
                <div className="hc-link-list">
                  <LinkSignal label="ESP32 HTTP" value={connection} state={connection === 'LIVE' ? 'online' : ''} />
                  <LinkSignal label="NEXUS local Wi-Fi" value={localApValue} state={device?.wifi?.localApConnected === true ? 'online' : ''} />
                  <LinkSignal label="Phone hotspot uplink" value={uplinkValue} state={device?.wifi?.stationConnected ? 'online' : ''} />
                  <LinkSignal label="Cloud backend" value={backendValue} state={device?.backendConnected === true ? 'online' : ''} />
                </div>
                <div className="hc-link-footer"><span>Last device timestamp</span><strong>{device?.telemetry?.timestamp ? new Date(getTimestampMs(device.telemetry.timestamp) || 0).toLocaleTimeString() : 'NOT REPORTED'}</strong></div>
                {device?.diagnostics ? <div className="hc-diag-grid" aria-label="Raw sensor diagnostics">
                  {['r1', 'r2', 'r3'].map((key, index) => <div key={key}><span>ROOM {index + 1} RAW</span><strong>{device.diagnostics[key]?.raw ?? '—'}</strong></div>)}
                  <div><span>ACS712 ADC</span><strong>{device.diagnostics.acsRaw ?? '—'}</strong></div>
                </div> : null}
              </div>
            </section>

            <section className="hc-bottom-grid">
              <div className="hc-panel hc-alert-panel">
                <div className="hc-panel-heading">
                  <div><span className="hc-section-tag">EVENT STREAM</span><h2>Alerts <span className="hc-alert-count">{alertItems.length}</span></h2></div>
                  <button type="button" className={`hc-notify-button ${alertsEnabled ? 'is-enabled' : ''}`} onClick={enableNotifications} title="Enable desktop alerts">{alertsEnabled ? 'ALERTS ON' : 'ENABLE ALERTS'}</button>
                </div>
                <div className="hc-alert-list" aria-live="polite">
                  {alertItems.length ? alertItems.slice(0, 5).map((alert) => (
                    <article className={`hc-alert-item severity-${alert.severity}`} key={alert.key}>
                      <span className="hc-alert-marker" aria-hidden="true" />
                      <div><strong>{alert.title}</strong><p>{alert.message}</p></div>
                    </article>
                  )) : <div className="hc-empty-alerts"><span>✓</span><div><strong>No active alerts</strong><p>Device-reported events will appear here.</p></div></div>}
                </div>
              </div>

              <div className="hc-panel hc-ai-panel">
                <div className="hc-panel-heading">
                  <div><span className="hc-section-tag">VUX AI / LIVE CONTEXT</span><h2>Ask about this device</h2></div>
                  <span className="hc-ai-mark">AI</span>
                </div>
                <form onSubmit={analyzeWithAi} className="hc-ai-form">
                  <label className="hc-sr-only" htmlFor="hc-ai-question">Question about device telemetry</label>
                  <input id="hc-ai-question" value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} maxLength={240} placeholder="Ask about the current device state" />
                  <button type="submit" disabled={aiLoading || !device}>{aiLoading ? <><span className="hc-spinner" /> Analyzing</> : <>Analyze <span aria-hidden="true">↗</span></>}</button>
                </form>
                {aiError ? <p className="hc-ai-error" role="alert">{aiError}</p> : null}
                {aiReply ? <div className="hc-ai-reply" aria-live="polite">{aiReply}</div> : <p className="hc-ai-hint">Analysis uses the latest device snapshot. Missing sensor values are sent as unavailable.</p>}
              </div>
            </section>
          </>
        ) : null}

        <footer className="hc-footer"><span>VUX AI STUDIO <i>/</i> NEXUS</span><span>Polling every 2 seconds <b className={connection === 'LIVE' ? 'is-live' : ''} /></span></footer>
      </main>
    </div>
  )
}