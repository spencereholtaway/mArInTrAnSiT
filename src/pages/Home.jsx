import { useState, useEffect, useRef } from 'react'
import { Smile, Info, TriangleAlert, CircleX, Loader, Moon, ChevronLeft } from 'lucide-react'
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

// Polling intervals
const VEHICLE_POLL_MS = 30000      // 30s — bus positions
const ARRIVAL_POLL_MS = 10000      // 10s — active stop + nearest 2 nearby
const NEARBY_SLOW_POLL_MS = 45000  // 45s — remaining nearby stops
const ROUTE_DETAIL_POLL_MS = 10000 // 10s — route view direction stops
const ALERTS_POLL_MS = 300000      // 5 min — service alerts

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

// Calculate countdown to next update
function getNextUpdateCountdown(date, pollInterval = VEHICLE_POLL_MS) {
  if (!date) return 'Loading...'
  const now = new Date()
  const elapsed = now - date
  const remaining = Math.max(0, pollInterval - elapsed)
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

// Determine alert status, including 'not_running' if no buses and no alerts
function getAlertStatus(routeId, alertOverrides, alertsByLine, vehiclesByLine) {
  const override = alertOverrides[routeId]
  if (override !== undefined) return override
  if (alertsByLine === null) return null
  const baseSeverity = alertsByLine[routeId] || 'ok'
  if (baseSeverity === 'ok' && (!vehiclesByLine[routeId] || vehiclesByLine[routeId].length === 0)) {
    return 'not_running'
  }
  return baseSeverity
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
  // severity: null=loading, undefined/no entry=ok, 'not_running'=no buses, 'info'/'normal'/'undefined'=info, 'slight'=warning, 'severe'=severe
  const [hovered, setHovered] = useState(false)
  let content, borderColor, label
  if (severity === null) {
    content = <Loader size={18} className="text-gray-400 animate-spin" />
    borderColor = 'border-gray-400'
    label = 'Checking for alerts…'
  } else if (severity === 'not_running') {
    content = <Moon size={18} className="text-blue-600" />
    borderColor = 'border-blue-600'
    label = 'Not running'
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
  const isAlert = severity && severity !== 'ok' && severity !== 'not_running'
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
        <a href="https://marintransit.org/alerts" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{circle}</a>
      ) : circle}
      {hovered && (
        <div className="absolute bottom-full right-0 mb-2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
          {label}{isAlert ? ' — click for details' : ''}
        </div>
      )}
    </div>
  )
}

// Map route percentage (0-100) to CSS left on the horizontal section only,
// leaving the curved ends (rounded-xl = 12px radius) clear for terminus stops.
function racetrackLeft(pct) {
  return `calc(12px + ${pct / 100} * (100% - 24px))`
}

// Map route percentage (0-100) to CSS top for the vertical racetrack.
function racetrackTop(pct) {
  return `calc(32px + ${pct / 100} * (100% - 64px))`
}

// Hook to dynamically adjust tooltip position to stay within viewport
function useSmartTooltipPosition(parentRef, isVisible, orientation = 'vertical') {
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!isVisible || !parentRef.current) {
      setPosition(null)
      return
    }

    // Measure the parent element to determine best position
    const parentRect = parentRef.current.getBoundingClientRect()

    if (orientation === 'vertical') {
      // For above/below tooltips
      // Calculate available space
      const spaceAbove = parentRect.top
      const spaceBelow = window.innerHeight - parentRect.bottom

      // Assume tooltip is ~30px tall + 6px gap
      const minSpace = 36

      // If not enough space below, position above
      if (spaceBelow < minSpace && spaceAbove >= minSpace) {
        setPosition('bottom') // position above
      } else {
        setPosition('top') // position below (default)
      }
    } else if (orientation === 'horizontal') {
      // For left/right tooltips
      // Calculate available space
      const spaceLeft = parentRect.left
      const spaceRight = window.innerWidth - parentRect.right

      // Assume tooltip is ~120px wide + 8px gap
      const minSpace = 128

      // If not enough space right, position left
      if (spaceRight < minSpace && spaceLeft >= minSpace) {
        setPosition('right') // position left
      } else {
        setPosition('left') // position right (default)
      }
    }
  }, [isVisible, parentRef, orientation])

  return position
}

function StopTick({ left, top: topProp, stopName, onTop }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const parentRef = useRef(null)
  // topProp takes precedence; otherwise derive from onTop
  const isTop = onTop === true
  const isBottom = onTop === false
  const resolvedTop = topProp !== undefined ? topProp : (isTop ? '1px' : isBottom ? 'calc(100% - 1px)' : '50%')

  // Determine default position (above for top ticks, below for bottom ticks)
  const adjustedPos = useSmartTooltipPosition(parentRef, showTooltip, 'vertical')

  const tooltipStyle = {
    left: '50%',
    transform: 'translateX(-50%)',
    ...(adjustedPos === 'bottom' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
  }

  return (
    <div
      ref={parentRef}
      className="absolute cursor-pointer"
      style={{
        left,
        top: resolvedTop,
        width: '9px',
        height: '9px',
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
          className="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap"
          style={{...tooltipStyle, zIndex: 9999}}
        >
          {stopName}
        </div>
      )}
    </div>
  )
}

function NearbyStopMarker({ left }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left,
        top: '-1px',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
      }}
    >
      <div className="absolute w-5 h-5 rounded-full bg-blue-400 animate-ping" />
      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow relative" />
    </div>
  )
}

function BusDot({ left, delay, movingRight, lineRef, destination, nextStop, nextArrivalTime }) {
  const [hovered, setHovered] = useState(false)
  const parentRef = useRef(null)
  let nextMins = null
  if (nextArrivalTime) {
    const m = Math.round((new Date(nextArrivalTime) - new Date()) / 60000)
    nextMins = m <= 0 ? 'Now' : `${m}m`
  }
  const trackTop = movingRight ? '-1px' : 'calc(100% + 1px)'

  // Determine position (above for top-track buses, below for bottom-track by default)
  const adjustedPos = useSmartTooltipPosition(parentRef, hovered, 'vertical')

  return (
    <div
      ref={parentRef}
      className="absolute flex items-center justify-center cursor-pointer"
      style={{ left, top: trackTop, width: '48px', height: '48px', transform: 'translate(-50%, -50%)', zIndex: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 whitespace-nowrap space-y-0.5 pointer-events-none"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            ...(adjustedPos === 'bottom' ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
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

// --- Vertical racetrack components ---

function VerticalStopTick({ top, side, stopName, leftOverride }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const parentRef = useRef(null)

  const posStyle = side === 'left'
    ? { top, left: '1px', transform: 'translate(-50%, -50%)' }
    : side === 'right'
    ? { top, right: '1px', transform: 'translate(50%, -50%)' }
    : { top, left: leftOverride ?? '50%', transform: 'translate(-50%, -50%)' } // 'center' for terminus ends

  // Determine position based on available space
  const adjustedPos = useSmartTooltipPosition(parentRef, showTooltip, 'horizontal')

  const tooltipStyle = {
    top: '50%',
    transform: 'translateY(-50%)',
    ...(adjustedPos === 'right' ? { right: 'calc(100% + 8px)' } : { left: 'calc(100% + 8px)' }),
  }

  return (
    <div
      ref={parentRef}
      className="absolute cursor-pointer"
      style={{
        ...posStyle,
        width: '9px',
        height: '9px',
        backgroundColor: 'white',
        border: '2px solid #374151',
        borderRadius: '50%',
        zIndex: 3,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {showTooltip && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap"
          style={{...tooltipStyle, zIndex: 9999}}
        >
          {stopName}
        </div>
      )}
    </div>
  )
}

function VerticalYourStopMarker({ top, stopName }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const parentRef = useRef(null)
  const adjustedPos = useSmartTooltipPosition(parentRef, showTooltip, 'horizontal')
  const tooltipStyle = {
    top: '50%',
    transform: 'translateY(-50%)',
    ...(adjustedPos === 'right' ? { right: 'calc(100% + 8px)' } : { left: 'calc(100% + 8px)' }),
  }
  return (
    <div
      ref={parentRef}
      className="absolute flex items-center justify-center cursor-pointer"
      style={{ top, left: '1px', transform: 'translate(-50%, -50%)', zIndex: 5 }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="absolute w-5 h-5 rounded-full bg-blue-400 animate-ping" />
      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow relative" />
      {showTooltip && stopName && (
        <div className="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap" style={{ ...tooltipStyle, zIndex: 9999 }}>
          {stopName}
        </div>
      )}
    </div>
  )
}

function VerticalNearestStopMarker({ top, side, stopName }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const parentRef = useRef(null)
  const adjustedPos = useSmartTooltipPosition(parentRef, showTooltip, 'horizontal')
  const tooltipStyle = {
    top: '50%',
    transform: 'translateY(-50%)',
    ...(adjustedPos === 'right' ? { right: 'calc(100% + 8px)' } : { left: 'calc(100% + 8px)' }),
  }
  const posStyle = side === 'left'
    ? { top, left: '1px', transform: 'translate(-50%, -50%)' }
    : { top, right: '1px', transform: 'translate(50%, -50%)' }
  return (
    <div
      ref={parentRef}
      className="absolute flex items-center justify-center cursor-pointer"
      style={{ ...posStyle, zIndex: 5 }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="absolute w-5 h-5 rounded-full bg-blue-400 animate-ping" />
      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow relative" />
      {showTooltip && stopName && (
        <div className="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap" style={{ ...tooltipStyle, zIndex: 9999 }}>
          {stopName}
        </div>
      )}
    </div>
  )
}

function VerticalBusDot({ top, movingDown, delay, lineRef, destination, nextStop, nextArrivalTime }) {
  const [hovered, setHovered] = useState(false)
  const parentRef = useRef(null)
  let nextMins = null
  if (nextArrivalTime) {
    const m = Math.round((new Date(nextArrivalTime) - new Date()) / 60000)
    nextMins = m <= 0 ? 'Now' : `${m}m`
  }
  // Outbound (movingDown) → left track; return → right track
  const trackLeft = movingDown ? '-1px' : 'calc(100% + 1px)'

  // Determine position based on available space
  const adjustedPos = useSmartTooltipPosition(parentRef, hovered, 'horizontal')

  return (
    <div
      ref={parentRef}
      className="absolute flex items-center justify-center cursor-pointer"
      style={{ top, left: trackLeft, width: '48px', height: '48px', transform: 'translate(-50%, -50%)', zIndex: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 whitespace-nowrap space-y-0.5 pointer-events-none"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 9999,
            ...(adjustedPos === 'left' ? { left: 'calc(100% + 4px)' } : { right: 'calc(100% + 4px)' }),
          }}
        >
          <div className="font-bold">{lineRef} → {destination}</div>
          {nextStop && <div className="text-gray-300">Next: {nextStop}{nextMins ? ` · ${nextMins}` : ''}</div>}
        </div>
      )}
      <div className="absolute w-8 h-8 rounded-full animate-ping bg-lime-400" style={{ animationDelay: `${delay * 1.5}s` }} />
      {/* Chevron above/below indicating direction */}
      <div className="absolute" style={{ [movingDown ? 'bottom' : 'top']: '2px' }}>
        <div className="animate-bounce text-red-500 font-bold text-xl leading-none" style={{ animationDelay: `${delay}s`, opacity: 0.7 }}>
          {movingDown ? '↓' : '↑'}
        </div>
      </div>
      <div className="animate-bounce absolute" style={{ animationDelay: `${delay}s` }}>
        <div className="text-2xl">🚌</div>
      </div>
    </div>
  )
}

function VerticalRacetrack({ route, vehicles, routeInfo, showBuses, yourStopPct, yourStopName, outboundInfo, returnInfo }) {
  const isCircular = route.firstStop.trim() === route.lastStop.trim()
  const dirs = Object.keys(routeInfo.directions)
  const displayStops = routeInfo.directions[dirs[0]].stops
  const topTerminalName = displayStops[0]?.name || ''
  const bottomTerminalName = displayStops[displayStops.length - 1]?.name || ''

  // Deduplicate terminus candidates from both tracks by ID and name,
  // split into top-cap (pct ≤ 50) and bottom-cap (pct > 50).
  const seenIds = new Set()
  const seenNamesTop = new Set()
  const seenNamesBot = new Set()
  const topTermini = []
  const botTermini = []
  const candidates = [
    route.topStops[0],
    route.topStops[route.topStops.length - 1],
    route.bottomStops[0],
    route.bottomStops[route.bottomStops.length - 1],
  ]
  for (const s of candidates) {
    if (!s || seenIds.has(s.id)) continue
    const isBot = s.pct > 50
    const names = isBot ? seenNamesBot : seenNamesTop
    if (names.has(s.name)) continue
    seenIds.add(s.id)
    names.add(s.name)
    if (isBot) botTermini.push(s)
    else topTermini.push(s)
  }

  const terminusIds = new Set([...topTermini, ...botTermini].map(s => s.id))
  const leftStops = route.topStops.filter(s => !terminusIds.has(s.id))
  const rightStops = route.bottomStops.filter(s => !terminusIds.has(s.id))

  // Distribute multiple terminus ticks horizontally across the cap
  const distribHoriz = (n, i) => `${((i + 1) / (n + 1)) * 100}%`

  return (
    <div style={{ width: 'min(calc(100vw - 96px), 480px)', height: 'calc(100vh - 140px)', position: 'relative' }}>
      {/* Pill border */}
      <div className="absolute inset-0 border-2 border-gray-700 rounded-[32px]" />

      {/* Terminus labels inside the pill ends */}
      <div className="absolute inset-0 flex flex-col items-center justify-between pointer-events-none" style={{ paddingTop: '10px', paddingBottom: '10px' }}>
        <span className="text-gray-500 text-center leading-tight font-medium" style={{ fontSize: '11px', maxWidth: '70%', wordBreak: 'break-word' }}>
          {topTermini[0]?.name}
        </span>
        {!isCircular && (
          <span className="text-gray-500 text-center leading-tight font-medium" style={{ fontSize: '11px', maxWidth: '70%', wordBreak: 'break-word' }}>
            {botTermini[0]?.name}
          </span>
        )}
      </div>

      {/* Terminus ticks — centered horizontally in top/bottom caps */}
      {topTermini.map((s, i) => (
        <VerticalStopTick key={`tt-${s.id}`} top="1px" side="center" leftOverride={distribHoriz(topTermini.length, i)} stopName={s.name} />
      ))}
      {!isCircular && botTermini.map((s, i) => (
        <VerticalStopTick key={`bt-${s.id}`} top="calc(100% - 1px)" side="center" leftOverride={distribHoriz(botTermini.length, i)} stopName={s.name} />
      ))}

      {/* Left side stops (display/outbound direction) */}
      {leftStops.map(stop => (
        <VerticalStopTick key={`left-${stop.id}`} top={racetrackTop(stop.pct)} side="left" stopName={stop.name} />
      ))}

      {/* Right side stops (return direction) */}
      {rightStops.map(stop => (
        <VerticalStopTick key={`right-${stop.id}`} top={racetrackTop(stop.pct)} side="right" stopName={stop.name} />
      ))}

      {/* Your stop marker — only shown when no per-direction markers available */}
      {yourStopPct != null && !outboundInfo && !returnInfo && (
        <VerticalYourStopMarker top={racetrackTop(yourStopPct)} stopName={yourStopName} />
      )}

      {/* Nearest stop markers — one per direction */}
      {outboundInfo?.pct != null && (
        <VerticalNearestStopMarker top={racetrackTop(outboundInfo.pct)} side="left" stopName={outboundInfo.stop?.name} />
      )}
      {returnInfo?.pct != null && (
        <VerticalNearestStopMarker top={racetrackTop(returnInfo.pct)} side="right" stopName={returnInfo.stop?.name} />
      )}

      {/* Nearest stops info — centered in racetrack interior */}
      {(outboundInfo || returnInfo) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          style={{ padding: '70px 28px', pointerEvents: 'none' }}
        >
          <div className="mb-4">
            <div style={{ pointerEvents: 'auto' }} className="flex items-center justify-center mb-2">
              <RouteCircle routeId={route.id} />
            </div>
            <div className="text-gray-700 text-sm font-medium leading-tight">{route.name}</div>
          </div>
          <div className="text-sm font-semibold text-blue-800 mb-3">Nearest stops to you</div>

          {returnInfo?.stop && (
            <div className="mb-4">
              <div className="text-gray-700 text-sm font-medium leading-tight">To {topTerminalName}</div>
              <div className="text-gray-400 mt-0.5" style={{ fontSize: '11px' }}>{returnInfo.stop.name}</div>
              <div className="flex items-center justify-center gap-2 mt-1" style={{ pointerEvents: 'auto' }}>
                <span className="text-gray-500 text-xs">
                  {returnInfo.arrivals.length > 0
                    ? (returnInfo.arrivals[0].minutesAway === 0 ? 'Now' : `${returnInfo.arrivals[0].minutesAway} min`)
                    : '—'}
                </span>
                <a
                  href={`https://maps.apple.com/?daddr=${returnInfo.stop.lat},${returnInfo.stop.lng}&dirflg=w`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 text-xs"
                >↗</a>
              </div>
            </div>
          )}

          {outboundInfo?.stop && (
            <div>
              <div className="text-gray-700 text-sm font-medium leading-tight">To {bottomTerminalName}</div>
              <div className="text-gray-400 mt-0.5" style={{ fontSize: '11px' }}>{outboundInfo.stop.name}</div>
              <div className="flex items-center justify-center gap-2 mt-1" style={{ pointerEvents: 'auto' }}>
                <span className="text-gray-500 text-xs">
                  {outboundInfo.arrivals.length > 0
                    ? (outboundInfo.arrivals[0].minutesAway === 0 ? 'Now' : `${outboundInfo.arrivals[0].minutesAway} min`)
                    : '—'}
                </span>
                <a
                  href={`https://maps.apple.com/?daddr=${outboundInfo.stop.lat},${outboundInfo.stop.lng}&dirflg=w`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 text-xs"
                >↗</a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bus dots */}
      {showBuses && vehicles.map((vehicle, i) => {
        const pos = getBusPosition(vehicle, routeInfo)
        if (!pos) return null
        const journey = vehicle.MonitoredVehicleJourney
        const ref = journey?.VehicleRef || String(i)
        const delay = (ref.charCodeAt(ref.length - 1) % 8) * 0.1
        const destination = journey?.DestinationName?.value || journey?.DestinationName || ''
        const nextStop = journey?.MonitoredCall?.StopPointName || ''
        const nextArrivalTime = journey?.MonitoredCall?.ExpectedArrivalTime || journey?.MonitoredCall?.AimedArrivalTime || ''
        return (
          <VerticalBusDot
            key={ref}
            top={racetrackTop(pos.pct)}
            movingDown={pos.movingRight}
            delay={delay}
            lineRef={route.id}
            destination={destination}
            nextStop={nextStop}
            nextArrivalTime={nextArrivalTime}
          />
        )
      })}
    </div>
  )
}

function RouteLine({ route, vehicles, nearbyStopPct, alertSeverity, showBuses, onClick }) {
  const routeInfo = routeData[route.id]
  return (
    // Align circles (36px) to vertical center of the 56px pill → mt-[10px]
    <div className={`flex gap-3${onClick ? ' cursor-pointer' : ''}`} onClick={onClick}>
      <div className="mt-[10px] shrink-0"><RouteCircle routeId={route.id} /></div>

      <div className="flex-1 min-w-0">
        {/* Racetrack: rounded rectangle with two tracks inside */}
        <div className="relative" style={{ height: '56px' }}>
          {/* Racetrack border — this IS the track */}
          <div className="absolute inset-0 border-2 border-gray-700 rounded-xl" />

          {/* Terminus labels inside the racetrack, vertically centered */}
          <div className="absolute inset-0 flex items-center pointer-events-none" style={{ justifyContent: route.firstStop.trim() === route.lastStop.trim() ? 'center' : 'space-between', paddingLeft: route.firstStop.trim() === route.lastStop.trim() ? 0 : '12px', paddingRight: route.firstStop.trim() === route.lastStop.trim() ? 0 : '12px' }}>
            {route.firstStop.trim() === route.lastStop.trim() ? (
              // Same terminus: show once, centered
              <span className="text-gray-500 truncate leading-tight" style={{ fontSize: '9px', maxWidth: '60%' }}>{route.firstStop}</span>
            ) : (
              // Different terminals: show both on edges
              <>
                <span className="text-gray-500 truncate leading-tight" style={{ fontSize: '9px', maxWidth: '40%' }}>{route.firstStop}</span>
                <span className="text-gray-500 text-right truncate leading-tight" style={{ fontSize: '9px', maxWidth: '40%' }}>{route.lastStop}</span>
              </>
            )}
          </div>

          {/* Stop ticks — terminus stops on curved ends, others on horizontal sections */}
          {(() => {
            const isCircular = route.firstStop.trim() === route.lastStop.trim()
            const topStops = isCircular ? route.topStops.slice(0, -1) : route.topStops
            const bottomStops = isCircular ? route.bottomStops.slice(1, -1) : route.bottomStops
            const topStopIds = new Set(topStops.map(s => s.id))

            // Collect unique terminus candidates from both tracks.
            // Use pct to determine which end: ≤50 → left, >50 → right.
            // Deduplicate by both ID and name (in case different stops have the same location).
            const leftTermini = []
            const rightTermini = []
            const seenIds = new Set()
            const seenNames = { left: new Set(), right: new Set() }

            const terminusCandidates = [
              route.topStops[0],
              route.topStops[route.topStops.length - 1],
              route.bottomStops[0],
              route.bottomStops[route.bottomStops.length - 1],
            ]

            for (const stop of terminusCandidates) {
              if (!stop || seenIds.has(stop.id)) continue
              const end = stop.pct <= 50 ? 'left' : 'right'
              if (seenNames[end].has(stop.name)) continue // Skip if we already have this name at this end
              seenIds.add(stop.id)
              seenNames[end].add(stop.name)
              const entry = { id: stop.id, name: stop.name, pct: stop.pct, fromTop: topStopIds.has(stop.id) }
              if (end === 'left') leftTermini.push(entry)
              else rightTermini.push(entry)
            }

            // Sort each group: top-track stops first (higher on screen)
            leftTermini.sort((a, b) => (a.fromTop ? 0 : 1) - (b.fromTop ? 0 : 1))
            rightTermini.sort((a, b) => (a.fromTop ? 0 : 1) - (b.fromTop ? 0 : 1))

            // Vertical distribution: evenly space N stops → (1/(N+1), 2/(N+1), …)
            const distributeVertically = (stops) =>
              stops.map((_, i) => `${((i + 1) / (stops.length + 1)) * 100}%`)

            const leftTops  = distributeVertically(leftTermini)
            const rightTops = distributeVertically(rightTermini)

            const terminusIdSet = new Set([...leftTermini, ...rightTermini].map(s => s.id))

            const elements = []

            leftTermini.forEach((stop, i) => elements.push(
              <StopTick key={`tl-${stop.id}`} left="1px" top={leftTops[i]} stopName={stop.name} />
            ))
            rightTermini.forEach((stop, i) => elements.push(
              <StopTick key={`tr-${stop.id}`} left="calc(100% - 1px)" top={rightTops[i]} stopName={stop.name} />
            ))

            topStops.forEach(stop => {
              if (terminusIdSet.has(stop.id)) return
              elements.push(<StopTick key={`top-${stop.id}`} left={racetrackLeft(stop.pct)} stopName={stop.name} onTop={true} />)
            })
            bottomStops.forEach(stop => {
              if (terminusIdSet.has(stop.id)) return
              elements.push(<StopTick key={`bot-${stop.id}`} left={racetrackLeft(stop.pct)} stopName={stop.name} onTop={false} />)
            })

            return elements
          })()}

          {/* Nearby stop location marker (on top/display track) */}
          {nearbyStopPct !== undefined && <NearbyStopMarker left={racetrackLeft(nearbyStopPct)} />}

          {/* Vehicle dots — mapped to horizontal section */}
          {showBuses && vehicles.map((vehicle, i) => {
            const pos = getBusPosition(vehicle, routeInfo)
            if (pos === null) return null
            const journey = vehicle.MonitoredVehicleJourney
            const ref = journey?.VehicleRef || String(i)
            const delay = (ref.charCodeAt(ref.length - 1) % 8) * 0.1
            const destination = journey?.DestinationName?.value || journey?.DestinationName || ''
            const nextStop = journey?.MonitoredCall?.StopPointName || ''
            const nextArrivalTime = journey?.MonitoredCall?.ExpectedArrivalTime || journey?.MonitoredCall?.AimedArrivalTime || ''
            return (
              <BusDot key={ref} left={racetrackLeft(pos.pct)} delay={delay} movingRight={pos.movingRight}
                lineRef={route.id} destination={destination} nextStop={nextStop} nextArrivalTime={nextArrivalTime} />
            )
          })}
        </div>

      </div>

      <div className="mt-[10px] shrink-0"><AlertCircle severity={alertSeverity} /></div>
    </div>
  )
}

function RouteDetailView({ route, vehicles, alertSeverity, showBuses, onBack, yourStopPct, yourStopName, userLocation }) {
  const routeInfo = routeData[route.id]
  const [nearestByDir, setNearestByDir] = useState({ outbound: null, return: null })
  const [arrivalsByDir, setArrivalsByDir] = useState({ outbound: [], return: [] })

  // Find nearest stop per direction whenever user location changes
  useEffect(() => {
    if (!userLocation) {
      setNearestByDir({ outbound: null, return: null })
      return
    }
    const dirs = Object.keys(routeInfo.directions)
    const findNearest = (stops) => {
      let best = null, bestDist = Infinity
      for (const s of stops) {
        if (s.lat == null || s.lng == null) continue
        const d = haversineMeters(userLocation.lat, userLocation.lng, s.lat, s.lng)
        if (d < bestDist) { bestDist = d; best = s }
      }
      return best
    }
    setNearestByDir({
      outbound: findNearest(routeInfo.directions[dirs[0]].stops),
      return: dirs[1] ? findNearest(routeInfo.directions[dirs[1]]?.stops || []) : null,
    })
  }, [userLocation, route.id])

  // Fetch stop monitoring arrivals for each direction's nearest stop
  useEffect(() => {
    if (!nearestByDir.outbound && !nearestByDir.return) {
      setArrivalsByDir({ outbound: [], return: [] })
      return
    }
    const fetchForDir = async (stop, key) => {
      if (!stop) return
      try {
        const res = await fetch(STOP_MONITORING_URL(stop.id))
        const text = await res.text()
        const data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
        const arrivals = parseArrivals(data).filter(a => a.lineRef === route.id)
        setArrivalsByDir(prev => ({ ...prev, [key]: arrivals }))
      } catch (err) {
        console.error(`Arrivals fetch failed for stop ${stop?.id}:`, err)
      }
    }
    fetchForDir(nearestByDir.outbound, 'outbound')
    setTimeout(() => fetchForDir(nearestByDir.return, 'return'), 200)
    const interval = setInterval(() => {
      fetchForDir(nearestByDir.outbound, 'outbound')
      setTimeout(() => fetchForDir(nearestByDir.return, 'return'), 200)
    }, ROUTE_DETAIL_POLL_MS)
    return () => clearInterval(interval)
  }, [nearestByDir, route.id])

  // Compute pct positions for markers on the racetrack
  const dirs = Object.keys(routeInfo.directions)
  const displayData = routeInfo.directions[dirs[0]]
  let outboundInfo = null
  if (nearestByDir.outbound) {
    const pct = displayData.totalDist > 0
      ? (nearestByDir.outbound.dist / displayData.totalDist) * 100
      : 0
    outboundInfo = { stop: nearestByDir.outbound, pct: Math.min(100, Math.max(0, pct)), arrivals: arrivalsByDir.outbound }
  }
  let returnInfo = null
  if (nearestByDir.return && dirs[1] && displayData.points?.length) {
    const snapDist = snapToShape(nearestByDir.return.lat, nearestByDir.return.lng, displayData.points)
    const pct = displayData.totalDist > 0 ? (snapDist / displayData.totalDist) * 100 : 0
    returnInfo = { stop: nearestByDir.return, pct: Math.min(100, Math.max(0, pct)), arrivals: arrivalsByDir.return }
  }

  let alertLabel
  if (alertSeverity === null) alertLabel = 'Checking for alerts…'
  else if (alertSeverity === 'not_running') alertLabel = 'Not running'
  else if (alertSeverity === 'severe') alertLabel = 'Severe disruption'
  else if (alertSeverity === 'slight') alertLabel = 'Service alert'
  else if (alertSeverity && alertSeverity !== 'ok') alertLabel = 'Service advisory'
  else alertLabel = 'No alerts'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-green-700 to-lime-400 rounded-b-lg shadow-lg">
        <div className="px-4 py-2 flex items-center gap-3">
          <button onClick={onBack} className="text-white p-1 -ml-1 rounded hover:bg-white/20">
            <ChevronLeft size={24} />
          </button>
          <RouteCircle routeId={route.id} />
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-base leading-tight truncate">{route.name}</div>
            <div className="text-green-100 text-xs">{alertLabel}</div>
          </div>
          <AlertCircle severity={alertSeverity} />
        </div>
      </div>

      {/* Vertical racetrack — centered in remaining viewport */}
      <div className="flex-1 flex items-center justify-center py-6">
        <VerticalRacetrack
          route={route}
          vehicles={vehicles}
          routeInfo={routeInfo}
          showBuses={showBuses}
          yourStopPct={yourStopPct}
          yourStopName={yourStopName}
          outboundInfo={outboundInfo}
          returnInfo={returnInfo}
        />
      </div>
    </div>
  )
}

const ALERT_OPTIONS = [
  { value: 'ok',     label: 'No alerts' },
  { value: 'info',   label: 'Advisory' },
  { value: 'slight', label: 'Alert' },
  { value: 'severe', label: 'Severe' },
]

function DevPanel({ locationOverride, onOverride, alertOverrides, onAlertOverride, onGoLive, showBuses, onShowBusesChange }) {
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
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showBuses}
            onChange={(e) => onShowBusesChange(e.target.checked)}
            className="w-4 h-4"
          />
          Display buses?
        </label>
      </div>

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
  const [showBuses, setShowBuses] = useState(true)
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [lastArrivalFetch, setLastArrivalFetch] = useState(null)
  const retryPendingRef = useRef({})

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
    const interval = setInterval(fetchVehicles, VEHICLE_POLL_MS)
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
    const interval = setInterval(fetchAlerts, ALERTS_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  // Update countdown display every second
  // Use faster arrival cycle when arrivals are being fetched, otherwise vehicle cycle
  useEffect(() => {
    const hasArrivals = !!(nearestStop || selectedStop) || !!selectedRouteId
    const countdownDate = hasArrivals ? (lastArrivalFetch || lastUpdated) : lastUpdated
    const pollMs = hasArrivals ? ARRIVAL_POLL_MS : VEHICLE_POLL_MS
    const timer = setInterval(() => {
      setRelativeTime(getNextUpdateCountdown(countdownDate, pollMs))
    }, 1000)
    return () => clearInterval(timer)
  }, [lastUpdated, lastArrivalFetch, nearestStop, selectedStop, selectedRouteId])

  // Fetch arrivals for a single stop with retry-on-empty logic
  async function fetchArrivalForStop(stopId) {
    try {
      const res = await fetch(STOP_MONITORING_URL(stopId))
      const text = await res.text()
      const data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
      const arrivals = parseArrivals(data)
      setLastArrivalFetch(new Date())

      if (arrivals.length === 0 && !retryPendingRef.current[stopId]) {
        // Empty result — check if we previously had arrivals (transient failure)
        setArrivalsByStop(prev => {
          if (prev[stopId]?.length > 0) {
            // Had arrivals before, schedule single retry
            retryPendingRef.current[stopId] = true
            setTimeout(async () => {
              try {
                const retryRes = await fetch(STOP_MONITORING_URL(stopId))
                const retryText = await retryRes.text()
                const retryData = JSON.parse(retryText.charCodeAt(0) === 0xFEFF ? retryText.slice(1) : retryText)
                const retryArrivals = parseArrivals(retryData)
                setArrivalsByStop(p => ({ ...p, [stopId]: retryArrivals }))
              } catch (e) {
                console.error(`Retry failed for stop ${stopId}:`, e)
                setArrivalsByStop(p => ({ ...p, [stopId]: [] }))
              }
              retryPendingRef.current[stopId] = false
            }, 5000)
            return prev // Keep old data while retrying
          }
          return { ...prev, [stopId]: arrivals }
        })
      } else {
        retryPendingRef.current[stopId] = false
        setArrivalsByStop(prev => ({ ...prev, [stopId]: arrivals }))
      }
    } catch (err) {
      console.error(`Failed to fetch arrivals for stop ${stopId}:`, err)
      setArrivalsByStop(prev => ({ ...prev, [stopId]: [] }))
    }
  }

  // Fetch arrivals for multiple stops sequentially
  async function fetchArrivalsForStops(stopIds) {
    for (const stopId of stopIds) {
      await fetchArrivalForStop(stopId)
      if (stopIds.length > 1) await new Promise(r => setTimeout(r, 150))
    }
  }

  // Active stop arrivals (10s) — only on home screen
  useEffect(() => {
    if (selectedRouteId) return // Skip when in route detail view
    const activeStop = nearestStop ?? selectedStop
    if (!activeStop) return
    fetchArrivalForStop(activeStop.stopId)
    const interval = setInterval(() => fetchArrivalForStop(activeStop.stopId), ARRIVAL_POLL_MS)
    return () => clearInterval(interval)
  }, [nearestStop, selectedStop, selectedRouteId])

  // Nearest 2 nearby stops (10s) — only on home screen, only when no active stop
  useEffect(() => {
    if (selectedRouteId) return
    if (nearestStop || selectedStop) return // Active stop takes over
    const fastStops = nearbyStops.slice(0, 2)
    if (fastStops.length === 0) return
    const stopIds = fastStops.map(s => s.stopId)
    fetchArrivalsForStops(stopIds)
    const interval = setInterval(() => fetchArrivalsForStops(stopIds), ARRIVAL_POLL_MS)
    return () => clearInterval(interval)
  }, [nearbyStops, nearestStop, selectedStop, selectedRouteId])

  // Remaining nearby stops (45s) — only on home screen, only when no active stop
  useEffect(() => {
    if (selectedRouteId) return
    if (nearestStop || selectedStop) return
    const slowStops = nearbyStops.slice(2)
    if (slowStops.length === 0) return
    const stopIds = slowStops.map(s => s.stopId)
    fetchArrivalsForStops(stopIds)
    const interval = setInterval(() => fetchArrivalsForStops(stopIds), NEARBY_SLOW_POLL_MS)
    return () => clearInterval(interval)
  }, [nearbyStops, nearestStop, selectedStop, selectedRouteId])

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

  // Route detail view
  if (selectedRouteId) {
    const selectedRoute = routes.find(r => r.id === selectedRouteId)
    if (selectedRoute) {
      const activeStop = nearestStop ?? selectedStop
      const yourStopPct = activeStop?.pctByRoute?.[selectedRouteId]
      const yourStopName = activeStop?.stopName
      return (
        <RouteDetailView
          route={selectedRoute}
          vehicles={vehiclesByLine[selectedRouteId] || []}
          alertSeverity={getAlertStatus(selectedRouteId, alertOverrides, alertsByLine, vehiclesByLine)}
          showBuses={showBuses}
          onBack={() => setSelectedRouteId(null)}
          yourStopPct={yourStopPct}
          yourStopName={yourStopName}
          userLocation={locationOverride ?? deviceLocation}
        />
      )
    }
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
                      alertSeverity={getAlertStatus(routeId, alertOverrides, alertsByLine, vehiclesByLine)}
                      showBuses={showBuses}
                      onClick={() => setSelectedRouteId(routeId)}
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

          {/* All lines section — separate running from not running */}
          {(() => {
            const runningRoutes = routes.filter(route => getAlertStatus(route.id, alertOverrides, alertsByLine, vehiclesByLine) !== 'not_running')
            const notRunningRoutes = routes.filter(route => getAlertStatus(route.id, alertOverrides, alertsByLine, vehiclesByLine) === 'not_running')

            return (
              <>
                {/* Running routes */}
                {runningRoutes.length > 0 && (
                  <div>
                    {notRunningRoutes.length > 0 && (
                      <div className="text-sm font-semibold text-blue-800 mb-2 px-6 md:px-0">Routes still running</div>
                    )}
                    <div className="p-6 space-y-12">
                      {runningRoutes.map((route) => (
                        <RouteLine
                          key={route.id}
                          route={route}
                          vehicles={vehiclesByLine[route.id] || []}
                          alertSeverity={getAlertStatus(route.id, alertOverrides, alertsByLine, vehiclesByLine)}
                          showBuses={showBuses}
                          onClick={() => setSelectedRouteId(route.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Not running routes */}
                {notRunningRoutes.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-blue-800 mb-2 px-6 md:px-0">Routes not currently running</div>
                    <div className="p-6 space-y-12">
                      {notRunningRoutes.map((route) => (
                        <RouteLine
                          key={route.id}
                          route={route}
                          vehicles={vehiclesByLine[route.id] || []}
                          alertSeverity={getAlertStatus(route.id, alertOverrides, alertsByLine, vehiclesByLine)}
                          showBuses={showBuses}
                          onClick={() => setSelectedRouteId(route.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

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
            showBuses={showBuses}
            onShowBusesChange={setShowBuses}
          />
        </div>
      </div>
    </div>
  )
}
