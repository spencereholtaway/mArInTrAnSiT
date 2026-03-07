import { useState, useEffect } from 'react'
import { Smile, Info, TriangleAlert, CircleX, Loader } from 'lucide-react'
import routeData from '../data/routeData.json'

const API_KEY = import.meta.env.VITE_MARIN_TRANSIT_API_KEY
const VEHICLE_URL = import.meta.env.DEV
  ? `/api/VehicleMonitoring?api_key=${API_KEY}&agency=MA&Format=json`
  : `/api/vehicle-monitoring`
const ALERTS_URL = import.meta.env.DEV
  ? `/api/SituationExchange?api_key=${API_KEY}&agency=MA&Format=json`
  : `/api/service-alerts`
const STOP_MONITORING_URL = (stopCode) => import.meta.env.DEV
  ? `/api/StopMonitoring?api_key=${API_KEY}&agency=MA&stopCode=${stopCode}&Format=json`
  : `/api/stop-monitoring?stopCode=${stopCode}`

const NEARBY_THRESHOLD_METERS = 15

// Snap a GPS point to the nearest segment on a shape polyline.
// Each point is [lat, lng, distAlongShape].
// Returns the interpolated distance along the shape at the closest point.
function snapToShape(lat, lng, points) {
  let bestSqDist = Infinity
  let bestAlongDist = 0

  for (let i = 0; i < points.length - 1; i++) {
    const [lat1, lng1, d1] = points[i]
    const [lat2, lng2, d2] = points[i + 1]

    // Project onto segment using simple Euclidean (fine at city scale)
    const dx = lat2 - lat1
    const dy = lng2 - lng1
    const len2 = dx * dx + dy * dy

    let t = 0
    if (len2 > 0) {
      t = ((lat - lat1) * dx + (lng - lng1) * dy) / len2
      t = Math.max(0, Math.min(1, t))
    }

    const projLat = lat1 + t * dx
    const projLng = lng1 + t * dy
    const dLat = lat - projLat
    const dLng = lng - projLng
    const sqDist = dLat * dLat + dLng * dLng

    if (sqDist < bestSqDist) {
      bestSqDist = sqDist
      bestAlongDist = d1 + t * (d2 - d1)
    }
  }

  return bestAlongDist
}

// Get bus position as 0-100% along the route line
function getBusPosition(vehicle, routeInfo) {
  const journey = vehicle.MonitoredVehicleJourney
  const loc = journey?.VehicleLocation
  if (!loc) return null

  const busLat = Number(loc.Latitude)
  const busLng = Number(loc.Longitude)
  if (!busLat || !busLng) return null

  const dirRef = journey?.DirectionRef
  const dirs = Object.keys(routeInfo.directions)
  const displayDir = dirs[0]

  // Always snap to display direction shape so bus aligns with displayed stops
  const shape = routeInfo.directions[displayDir]
  if (!shape || !shape.points.length) return null

  const snapDist = snapToShape(busLat, busLng, shape.points)
  const pct = (snapDist / shape.totalDist) * 100

  // movingRight = traveling left-to-right on the display line
  const busDir = dirRef && routeInfo.directions[dirRef] ? dirRef : displayDir
  const movingRight = busDir === displayDir

  return { pct: Math.min(100, Math.max(0, pct)), movingRight }
}

// Calculate countdown to next update (polling every 30 seconds)
function getNextUpdateCountdown(date) {
  if (!date) return 'Loading...'
  const POLL_INTERVAL = 30000 // 30 seconds
  const now = new Date()
  const elapsed = now - date
  const remaining = Math.max(0, POLL_INTERVAL - elapsed)
  const seconds = Math.ceil(remaining / 1000)
  return `Updating in ${seconds}s`
}

// Haversine distance between two GPS points, returns meters
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Parse StopMonitoring API response into arrival objects
function parseArrivals(data) {
  const delivery = data?.Siri?.ServiceDelivery ?? data?.ServiceDelivery
  const visits = delivery?.StopMonitoringDelivery?.MonitoredStopVisit || []
  const arr = Array.isArray(visits) ? visits : [visits]
  const parsed = arr.map(v => {
    const journey = v.MonitoredVehicleJourney
    if (!journey) return null
    const call = journey.MonitoredCall
    const expectedTime = call?.ExpectedArrivalTime || call?.AimedArrivalTime
    const lineRef = journey.LineRef
    const destination = Array.isArray(journey.DestinationName)
      ? journey.DestinationName[0]?.value || journey.DestinationName[0]
      : journey.DestinationName?.value || journey.DestinationName
    if (!lineRef || !expectedTime) return null
    const minutesAway = Math.round((new Date(expectedTime) - new Date()) / 60000)
    return { lineRef, destination, minutesAway }
  }).filter(Boolean).filter(a => a.minutesAway >= 0).sort((a, b) => a.minutesAway - b.minutesAway)

  // Keep only the next arrival per line+destination
  const seen = new Set()
  return parsed.filter(a => {
    const key = `${a.lineRef}|${a.destination}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Build routes array from GTFS data
const routes = Object.entries(routeData).map(([id, data]) => {
  const dirs = Object.keys(data.directions)
  const displayDir = dirs[0]
  const returnDir = dirs[1] || null
  const displayData = data.directions[displayDir]

  // Top edge: display direction stops with 0-100% pct
  const topStops = displayData.stops.map(s => ({
    id: s.id,
    name: s.name,
    pct: displayData.totalDist > 0 ? (s.dist / displayData.totalDist) * 100 : 0,
  }))

  // Bottom edge: return direction stops snapped to display shape
  let bottomStops = []
  if (returnDir && displayData.points?.length) {
    const returnData = data.directions[returnDir]
    bottomStops = (returnData?.stops || []).map(s => {
      if (s.lat == null || s.lng == null) return null
      const snapDist = snapToShape(s.lat, s.lng, displayData.points)
      return {
        id: s.id,
        name: s.name,
        pct: Math.min(100, Math.max(0, displayData.totalDist > 0 ? (snapDist / displayData.totalDist) * 100 : 0)),
      }
    }).filter(Boolean)
  }

  return {
    id,
    name: data.name,
    stops: displayData.stops,         // kept for buildStopData pct lookup
    totalDist: displayData.totalDist, // kept for buildStopData
    topStops,
    bottomStops,
    firstStop: displayData.stops[0]?.name || '',
    lastStop: displayData.stops[displayData.stops.length - 1]?.name || '',
  }
})

function RouteCircle({ routeId }) {
  return (
    <div className="w-9 h-9 rounded-full border-2 border-black bg-white flex items-center justify-center text-xs font-bold text-black shrink-0">
      {routeId}
    </div>
  )
}

function AlertCircle({ severity }) {
  // severity: null=loading, undefined/no entry=ok, 'info'/'normal'/'undefined'=info, 'slight'=warning, 'severe'=severe
  const [hovered, setHovered] = useState(false)
  let content, borderColor, label
  if (severity === null) {
    content = <Loader size={18} className="text-gray-400 animate-spin" />
    borderColor = 'border-gray-400'
    label = 'Checking for alerts…'
  } else if (severity === 'severe') {
    content = <CircleX size={18} className="text-red-500" />
    borderColor = 'border-red-500'
    label = 'Severe disruption'
  } else if (severity === 'slight') {
    content = <TriangleAlert size={18} className="text-yellow-500" />
    borderColor = 'border-yellow-500'
    label = 'Service alert'
  } else if (severity && severity !== 'ok') {
    content = <Info size={18} className="text-blue-500" />
    borderColor = 'border-blue-500'
    label = 'Service advisory'
  } else {
    content = <Smile size={18} className="text-green-500" />
    borderColor = 'border-green-500'
    label = 'No alerts'
  }
  const isAlert = severity && severity !== 'ok'
  const circle = (
    <div className={`w-9 h-9 rounded-full border-2 ${borderColor} bg-white flex items-center justify-center ${isAlert ? 'cursor-pointer hover:brightness-95' : ''}`}>
      {content}
    </div>
  )
  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isAlert ? (
        <a href="https://marintransit.org/alerts" target="_blank" rel="noopener noreferrer">{circle}</a>
      ) : circle}
      {hovered && (
        <div className="absolute bottom-full right-0 mb-2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
          {label}{isAlert ? ' — click for details' : ''}
        </div>
      )}
    </div>
  )
}

function StopTick({ pct, stopName, onTop }) {
  const [showTooltip, setShowTooltip] = useState(false)
  return (
    <div
      className="absolute cursor-pointer"
      style={{
        left: `${pct}%`,
        top: onTop ? '35%' : '65%',
        width: '7px',
        height: '7px',
        backgroundColor: 'white',
        border: '2px solid #374151',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 3,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {showTooltip && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-20"
          style={onTop ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }}
        >
          {stopName}
        </div>
      )}
    </div>
  )
}

function NearbyStopMarker({ pct }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: `${pct}%`,
        top: '35%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
      }}
    >
      <div className="absolute w-5 h-5 rounded-full bg-blue-400 animate-ping" />
      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow relative" />
    </div>
  )
}

function BusDot({ position, delay, movingRight, lineRef, destination, nextStop, nextArrivalTime }) {
  const [hovered, setHovered] = useState(false)
  let nextMins = null
  if (nextArrivalTime) {
    const m = Math.round((new Date(nextArrivalTime) - new Date()) / 60000)
    nextMins = m <= 0 ? 'Now' : `${m}m`
  }
  // Top track (35%) for display-direction buses, bottom track (65%) for return-direction buses
  const trackTop = movingRight ? '35%' : '65%'
  return (
    <div
      className="absolute flex items-center justify-center cursor-pointer"
      style={{ left: `${position}%`, top: trackTop, width: '48px', height: '48px', transform: 'translate(-50%, -50%)', zIndex: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 whitespace-nowrap z-20 space-y-0.5 pointer-events-none"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            // Tooltip above for top-track buses, below for bottom-track buses
            ...(movingRight ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
          }}
        >
          <div className="font-bold">{lineRef} → {destination}</div>
          {nextStop && <div className="text-gray-300">Next: {nextStop}{nextMins ? ` · ${nextMins}` : ''}</div>}
        </div>
      )}
      {/* Pulse ring tied to bounce at 1.5x stagger */}
      <div
        className="absolute w-8 h-8 rounded-full animate-ping bg-lime-400"
        style={{ animationDelay: `${delay * 1.5}s` }}
      />
      {/* Bus: bounce wrapper → flip inner */}
      <div className="animate-bounce absolute" style={{ animationDelay: `${delay}s` }}>
        <div className="text-2xl" style={{ transform: movingRight ? 'scaleX(1)' : 'scaleX(-1)' }}>🚌</div>
      </div>
      {/* Chevron: offset wrapper → bounce wrapper → flip inner */}
      <div className="absolute" style={{ transform: movingRight ? 'translateX(20px)' : 'translateX(-20px)' }}>
        <div className="animate-bounce" style={{ animationDelay: `${delay}s` }}>
          <div className="text-red-500 font-bold text-2xl" style={{ transform: movingRight ? 'scaleX(1)' : 'scaleX(-1)', opacity: 0.7 }}>›</div>
        </div>
      </div>
    </div>
  )
}

function RouteLine({ route, vehicles, nearbyStopPct, alertSeverity }) {
  const routeInfo = routeData[route.id]
  return (
    // Align circles (36px) to vertical center of the 56px pill → mt-[10px]
    <div className="flex gap-3">
      <div className="mt-[10px] shrink-0"><RouteCircle routeId={route.id} /></div>

      <div className="flex-1 min-w-0">
        {/* Racetrack: rounded rectangle with two tracks inside */}
        <div className="relative" style={{ height: '56px' }}>
          {/* Pill border */}
          <div className="absolute inset-0 border-2 border-gray-700 rounded-xl" />

          {/* Top track line — display direction (left → right) */}
          <div className="absolute bg-gray-300" style={{ left: '3%', right: '3%', height: '1px', top: '35%' }} />

          {/* Bottom track line — return direction (right → left) */}
          <div className="absolute bg-gray-300" style={{ left: '3%', right: '3%', height: '1px', top: '65%' }} />

          {/* Display direction stop ticks (top) */}
          {route.topStops.map(stop => (
            <StopTick key={`top-${stop.id}`} pct={stop.pct} stopName={stop.name} onTop={true} />
          ))}

          {/* Return direction stop ticks (bottom) */}
          {route.bottomStops.map(stop => (
            <StopTick key={`bot-${stop.id}`} pct={stop.pct} stopName={stop.name} onTop={false} />
          ))}

          {/* Nearby stop location marker (on top/display track) */}
          {nearbyStopPct !== undefined && <NearbyStopMarker pct={nearbyStopPct} />}

          {/* Vehicle dots — split to top or bottom track by movingRight */}
          {vehicles.map((vehicle, i) => {
            const pos = getBusPosition(vehicle, routeInfo)
            if (pos === null) return null
            const journey = vehicle.MonitoredVehicleJourney
            const ref = journey?.VehicleRef || String(i)
            const delay = (ref.charCodeAt(ref.length - 1) % 8) * 0.1
            const destination = journey?.DestinationName?.value || journey?.DestinationName || ''
            const nextStop = journey?.MonitoredCall?.StopPointName || ''
            const nextArrivalTime = journey?.MonitoredCall?.ExpectedArrivalTime || journey?.MonitoredCall?.AimedArrivalTime || ''
            return (
              <BusDot key={ref} position={pos.pct} delay={delay} movingRight={pos.movingRight}
                lineRef={route.id} destination={destination} nextStop={nextStop} nextArrivalTime={nextArrivalTime} />
            )
          })}
        </div>

        {/* Terminal labels below the pill */}
        <div className="flex justify-between mt-1">
          <div className="text-gray-400 truncate leading-tight" style={{ fontSize: '9px', maxWidth: '45%' }}>{route.firstStop}</div>
          <div className="text-gray-400 text-right truncate leading-tight" style={{ fontSize: '9px', maxWidth: '45%' }}>{route.lastStop}</div>
        </div>
      </div>

      <div className="mt-[10px] shrink-0"><AlertCircle severity={alertSeverity} /></div>
    </div>
  )
}

const ALERT_OPTIONS = [
  { value: 'ok',     label: 'No alerts' },
  { value: 'info',   label: 'Advisory' },
  { value: 'slight', label: 'Alert' },
  { value: 'severe', label: 'Severe' },
]

function DevPanel({ locationOverride, onOverride, alertOverrides, onAlertOverride, onGoLive }) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  function apply() {
    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) onOverride({ lat: parsedLat, lng: parsedLng })
  }

  function clear() {
    onOverride(null)
    setLat('')
    setLng('')
  }

  function useDeviceLocation() {
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords
        setLat(String(latitude))
        setLng(String(longitude))
        onOverride(null)
      },
      error => console.error('Geolocation error:', error)
    )
  }

  return (
    <div className="border-t-2 border-dashed border-gray-300 mt-8 pt-5 pb-8">
      <div className="text-xs font-mono font-bold text-gray-400 mb-3 tracking-widest">DEV TOOLS</div>
      <div className="text-xs font-semibold text-gray-600 mb-2">Simulate Location</div>
      <div className="flex gap-2 items-center mb-2 flex-wrap">
        <input
          type="number" step="any" placeholder="Latitude" value={lat}
          onChange={e => setLat(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-xs font-mono w-36"
        />
        <input
          type="number" step="any" placeholder="Longitude" value={lng}
          onChange={e => setLng(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-xs font-mono w-36"
        />
        <button onClick={apply} className="bg-blue-500 text-white px-3 py-1 rounded text-xs font-medium">
          Simulate
        </button>
        {locationOverride && (
          <button onClick={clear} className="bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs font-medium">
            Clear
          </button>
        )}
        <button onClick={useDeviceLocation} className="bg-green-500 text-white px-3 py-1 rounded text-xs font-medium">
          Use Device Location
        </button>
      </div>
      {locationOverride && (
        <div className="text-xs font-mono text-blue-500 mt-2">
          Simulating {locationOverride.lat.toFixed(6)}, {locationOverride.lng.toFixed(6)}
        </div>
      )}

      <div className="mt-6">
        <div className="text-xs font-semibold text-gray-600 mb-2">Simulate Service Alerts</div>
        <table className="text-xs w-full">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-medium pb-1 pr-4">Route</th>
              {ALERT_OPTIONS.map(o => (
                <th key={o.value} className="font-medium pb-1 pr-3">{o.label}</th>
              ))}
              <th className="font-medium pb-1">Live</th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => (
              <tr key={route.id} className="border-t border-gray-100">
                <td className="py-1 pr-4 font-mono font-bold text-gray-600">{route.id}</td>
                {ALERT_OPTIONS.map(o => (
                  <td key={o.value} className="py-1 pr-3">
                    <input
                      type="radio"
                      name={`alert-${route.id}`}
                      checked={alertOverrides[route.id] === o.value}
                      onChange={() => onAlertOverride(route.id, o.value)}
                    />
                  </td>
                ))}
                <td className="py-1">
                  <input
                    type="radio"
                    name={`alert-${route.id}`}
                    checked={alertOverrides[route.id] === undefined}
                    onChange={() => {
                      const next = { ...alertOverrides }
                      delete next[route.id]
                      onAlertOverride(route.id, undefined)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button onClick={onGoLive} className="bg-green-500 text-white px-3 py-1 rounded text-xs font-medium">
          Go Live
        </button>
        <span className="text-xs text-gray-400 ml-2">Resets location and all alert overrides to live data</span>
      </div>
    </div>
  )
}

export default function Home() {
  const [vehiclesByLine, setVehiclesByLine] = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)
  const [relativeTime, setRelativeTime] = useState('Loading...')
  const [alertsByLine, setAlertsByLine] = useState(null) // null = loading
  const [alertOverrides, setAlertOverrides] = useState({}) // routeId → severity override
  const [deviceLocation, setDeviceLocation] = useState(null)
  const [locationOverride, setLocationOverride] = useState(null)
  const [nearestStop, setNearestStop] = useState(null)
  const [nearbyStops, setNearbyStops] = useState([])
  const [selectedStop, setSelectedStop] = useState(null)
  const [arrivalsByStop, setArrivalsByStop] = useState({})

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await fetch(VEHICLE_URL)
        const text = await res.text()
        const data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
        const activities = data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery?.VehicleActivity || []
        const byLine = {}
        for (const v of activities) {
          const lineRef = v.MonitoredVehicleJourney?.LineRef
          if (!lineRef) continue
          if (!byLine[lineRef]) byLine[lineRef] = []
          byLine[lineRef].push(v)
        }
        setVehiclesByLine(byLine)
        setLastUpdated(new Date())
      } catch (err) {
        console.error('Vehicle fetch failed:', err)
      }
    }

    fetchVehicles()
    const interval = setInterval(fetchVehicles, 30000)
    return () => clearInterval(interval)
  }, [])

  // Fetch service alerts (every 5 minutes)
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch(ALERTS_URL)
        const text = await res.text()
        const data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
        const situations = data?.Siri?.ServiceDelivery?.SituationExchangeDelivery?.Situations?.PtSituationElement || []
        const byLine = {}
        for (const sit of situations) {
          const severity = (sit.Severity || 'unknown').toLowerCase()
          const journeys = sit.Affects?.VehicleJourneys?.AffectedVehicleJourney
          const lines = Array.isArray(journeys) ? journeys : journeys ? [journeys] : []
          for (const j of lines) {
            const lineRef = j.LineRef
            if (!lineRef) continue
            const current = byLine[lineRef]
            // Escalate severity: info < warning < severe
            const rank = { info: 1, slight: 2, normal: 1, severe: 3, undefined: 1 }
            const newRank = rank[severity] || 1
            if (!current || newRank > (rank[current] || 1)) byLine[lineRef] = severity
          }
        }
        setAlertsByLine(byLine)
      } catch (err) {
        console.error('Alerts fetch failed:', err)
        setAlertsByLine({})
      }
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Update countdown display every second
  useEffect(() => {
    const timer = setInterval(() => {
      setRelativeTime(getNextUpdateCountdown(lastUpdated))
    }, 1000)
    return () => clearInterval(timer)
  }, [lastUpdated])

  // Fetch arrivals for a set of stopIds sequentially to avoid rate limiting
  async function fetchArrivalsForStops(stopIds) {
    for (const stopId of stopIds) {
      try {
        const res = await fetch(STOP_MONITORING_URL(stopId))
        const text = await res.text()
        const data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
        const arrivals = parseArrivals(data)
        setArrivalsByStop(prev => ({ ...prev, [stopId]: arrivals }))
      } catch (err) {
        console.error(`Failed to fetch arrivals for stop ${stopId}:`, err)
        setArrivalsByStop(prev => ({ ...prev, [stopId]: [] }))
      }
      // Small delay between requests to avoid rate limiting
      await new Promise(r => setTimeout(r, 150))
    }
  }

  // Fetch arrivals when nearby stops or active stop changes; refresh every 30s
  useEffect(() => {
    const activeStop = nearestStop ?? selectedStop
    const stopIds = activeStop
      ? [activeStop.stopId]
      : nearbyStops.map(s => s.stopId)
    if (stopIds.length === 0) return
    fetchArrivalsForStops(stopIds)
    const interval = setInterval(() => fetchArrivalsForStops(stopIds), 30000)
    return () => clearInterval(interval)
  }, [nearbyStops, nearestStop, selectedStop])

  // Watch device location
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDeviceLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Find nearest stop + nearby stops when device location changes
  useEffect(() => {
    const location = locationOverride ?? deviceLocation
    if (!location) return

    // Build list of unique stops with distances (dedup by stopId)
    const stopDistances = new Map()
    for (const route of routes) {
      for (const stop of route.stops) {
        if (stopDistances.has(stop.id)) continue
        const d = haversineMeters(location.lat, location.lng, stop.lat, stop.lng)
        stopDistances.set(stop.id, { stopId: stop.id, stopName: stop.name, distanceMeters: d })
      }
    }

    // Sort by distance and take closest 5
    const sorted = [...stopDistances.values()].sort((a, b) => a.distanceMeters - b.distanceMeters)
    setNearbyStops(sorted.slice(0, 5))

    // Auto-detect if within threshold
    const closest = sorted[0]
    if (closest && closest.distanceMeters <= NEARBY_THRESHOLD_METERS) {
      const stopData = buildStopData(closest.stopId, closest.stopName, closest.distanceMeters)
      setNearestStop(stopData)
      setSelectedStop(null)
    } else {
      setNearestStop(null)
    }
  }, [deviceLocation, locationOverride])

  function buildStopData(stopId, stopName, distanceMeters) {
    const pctByRoute = {}
    const routeIds = []
    for (const route of routes) {
      const stop = route.stops.find(s => s.id === stopId)
      if (stop) {
        pctByRoute[route.id] = route.totalDist > 0 ? (stop.dist / route.totalDist) * 100 : 0
        routeIds.push(route.id)
      }
    }
    return { stopId, stopName, distanceMeters, routeIds, pctByRoute }
  }

  function selectNearbyStop(stop) {
    const stopData = buildStopData(stop.stopId, stop.stopName, stop.distanceMeters)
    setSelectedStop(stopData)
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-clip">
      {/* Header - full width with rounded bottom */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-green-700 to-lime-400 rounded-b-lg shadow-lg">
        <div className="px-6 py-2 flex items-center justify-between">
          <h1 style={{ fontFamily: 'Quintessential', fontSize: '32px' }} className="text-white m-0">
            Marin Transit
          </h1>
          <div className="text-green-900 text-xs font-medium whitespace-nowrap">
            {relativeTime}
          </div>
        </div>
      </div>

      <div className="md:px-12 lg:px-24">

        <div className="py-8 space-y-6">
          {/* Nearby stops carousel - shown when not auto-detected and no manual selection */}
          {!nearestStop && !selectedStop && nearbyStops.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-blue-800 mb-2 px-6 md:px-0">Nearest stops</div>
              <div className="md:-mx-12 lg:-mx-24 overflow-x-auto no-scrollbar">
                <div className="flex gap-3 px-6 md:px-12 lg:px-24 pb-4">
                  {nearbyStops.map(stop => {
                    const arrivals = (arrivalsByStop[stop.stopId] || []).slice(0, 3)
                    return (
                      <button
                        key={stop.stopId}
                        onClick={() => selectNearbyStop(stop)}
                        className="liquid-glass shrink-0 px-5 py-3 text-left"
                      >
                        <div className="text-sm font-semibold text-blue-800 whitespace-nowrap">{stop.stopName}</div>
                        <div className="text-xs text-gray-400 mt-0.5 mb-2">{Math.round(stop.distanceMeters)}m away</div>
                        {arrivalsByStop[stop.stopId] === undefined ? (
                          <div className="text-xs text-gray-300 italic">Loading…</div>
                        ) : arrivals.length > 0 ? (
                          <div className="space-y-1">
                            {arrivals.map((a, i) => (
                              <div key={i} className="text-xs text-gray-600 whitespace-nowrap">
                                <span className="font-semibold">{a.lineRef}</span> to {a.destination} · {a.minutesAway === 0 ? 'Now' : `${a.minutesAway}m`}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-300 italic">No upcoming arrivals</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Your stop panel - auto-detected or manually selected */}
          {(() => {
            const activeStop = nearestStop ?? selectedStop
            if (!activeStop || !activeStop.routeIds.length) return null
            return (
              <div className="liquid-glass p-6 space-y-6">
                <div>
                  <div className="text-sm font-semibold text-blue-800 mb-3">
                    Your stop · {activeStop.stopName}
                  </div>
                  {(() => {
                    const arrivals = (arrivalsByStop[activeStop.stopId] || []).slice(0, 5)
                    return arrivalsByStop[activeStop.stopId] === undefined ? (
                      <div className="text-xs text-gray-300 italic">Loading arrivals…</div>
                    ) : arrivals.length > 0 ? (
                      <div className="space-y-1.5">
                        {arrivals.map((a, i) => (
                          <div key={i} className="text-xs text-gray-600">
                            <span className="font-semibold">{a.lineRef}</span> to {a.destination} · {a.minutesAway === 0 ? 'Now' : `${a.minutesAway}m`}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-300 italic">No upcoming arrivals</div>
                    )
                  })()}
                </div>
                {activeStop.routeIds.map(routeId => {
                  const route = routes.find(r => r.id === routeId)
                  if (!route) return null
                  return (
                    <RouteLine
                      key={routeId}
                      route={route}
                      vehicles={vehiclesByLine[routeId] || []}
                      nearbyStopPct={activeStop.pctByRoute[routeId]}
                      alertSeverity={alertOverrides[routeId] ?? (alertsByLine === null ? null : (alertsByLine[routeId] || 'ok'))}
                    />
                  )
                })}
                {selectedStop && !nearestStop && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setSelectedStop(null)}
                      className="bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs font-medium"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* All lines section */}
          <div className="p-6 space-y-6">
            {routes.map((route) => (
              <RouteLine key={route.id} route={route} vehicles={vehiclesByLine[route.id] || []} alertSeverity={alertOverrides[route.id] ?? (alertsByLine === null ? null : (alertsByLine[route.id] || 'ok'))} />
            ))}
          </div>

          <DevPanel
            locationOverride={locationOverride}
            onOverride={setLocationOverride}
            alertOverrides={alertOverrides}
            onAlertOverride={(routeId, severity) => setAlertOverrides(prev => {
              const next = { ...prev }
              if (severity === undefined) delete next[routeId]
              else next[routeId] = severity
              return next
            })}
            onGoLive={() => { setLocationOverride(null); setAlertOverrides({}) }}
          />
        </div>
      </div>
    </div>
  )
}
