import { useState, useEffect } from 'react'
import routeData from '../data/routeData.json'

const API_KEY = import.meta.env.VITE_MARIN_TRANSIT_API_KEY
const VEHICLE_URL = import.meta.env.DEV
  ? `/api/VehicleMonitoring?api_key=${API_KEY}&agency=MA&Format=json`
  : `/api/vehicle-monitoring`

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

  // Use the bus's direction shape if available, else display direction
  const busDir = dirRef && routeInfo.directions[dirRef] ? dirRef : displayDir
  const shape = routeInfo.directions[busDir]
  if (!shape || !shape.points.length) return null

  const snapDist = snapToShape(busLat, busLng, shape.points)
  let pct = (snapDist / shape.totalDist) * 100

  // If bus is going in the opposite direction from display, invert
  if (busDir !== displayDir) {
    pct = 100 - pct
  }

  // movingRight = traveling left-to-right on the display line
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

// Build routes array from GTFS data
const routes = Object.entries(routeData).map(([id, data]) => {
  const dirs = Object.keys(data.directions)
  const displayDir = dirs[0]
  const dirData = data.directions[displayDir]
  return {
    id,
    name: data.name,
    stops: dirData.stops,
    totalDist: dirData.totalDist,
  }
})

function RouteCircle({ routeId }) {
  return (
    <div className="w-9 h-9 rounded-full border-2 border-black bg-white flex items-center justify-center text-xs font-bold text-black shrink-0">
      {routeId}
    </div>
  )
}

function StopTick({ pct }) {
  return (
    <div
      className="absolute w-px h-4 bg-black"
      style={{
        left: `${pct}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    />
  )
}

function NearbyStopMarker({ pct }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: `${pct}%`,
        top: 'calc(50% - 8px)',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
      }}
    >
      <div className="absolute w-5 h-5 rounded-full bg-blue-400 animate-ping" />
      <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow relative" />
    </div>
  )
}

function BusDot({ position, delay, movingRight }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ left: `${position}%`, top: '50%', transform: 'translateX(-50%) translateY(-50%)', zIndex: 10 }}
    >
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

function RouteLine({ route, vehicles, nearbyStopPct }) {
  const routeInfo = routeData[route.id]
  return (
    <div className="flex items-center gap-3">
      <RouteCircle routeId={route.id} />
      <div className="flex-1 relative h-10">
        <div className="absolute left-0 right-0 h-px bg-black" style={{ top: 'calc(50% + 8px)' }} />
        {route.stops.map((stop, i) => {
          const pct = route.totalDist > 0
            ? (stop.dist / route.totalDist) * 100
            : (i / (route.stops.length - 1)) * 100
          return <StopTick key={`${route.id}-${i}`} pct={pct} />
        })}
        {nearbyStopPct !== undefined && (
          <NearbyStopMarker pct={nearbyStopPct} />
        )}
        {vehicles.map((vehicle, i) => {
          const pos = getBusPosition(vehicle, routeInfo)
          if (pos === null) return null
          // Create staggered bounce delay from vehicle ref
          const ref = vehicle.MonitoredVehicleJourney?.VehicleRef || String(i)
          const delay = (ref.charCodeAt(ref.length - 1) % 8) * 0.1
          return <BusDot key={ref} position={pos.pct} delay={delay} movingRight={pos.movingRight} />
        })}
      </div>
      <RouteCircle routeId={route.id} />
    </div>
  )
}

export default function Home() {
  const [vehiclesByLine, setVehiclesByLine] = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)
  const [relativeTime, setRelativeTime] = useState('Loading...')
  const [deviceLocation, setDeviceLocation] = useState(null)
  const [nearestStop, setNearestStop] = useState(null)

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

  // Update countdown display every second
  useEffect(() => {
    const timer = setInterval(() => {
      setRelativeTime(getNextUpdateCountdown(lastUpdated))
    }, 1000)
    return () => clearInterval(timer)
  }, [lastUpdated])

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

  // Find nearest stop when device location changes
  useEffect(() => {
    if (!deviceLocation) return

    let bestStop = null
    let bestDist = Infinity

    for (const [routeId, data] of Object.entries(routeData)) {
      for (const dirData of Object.values(data.directions)) {
        for (const stop of dirData.stops) {
          const d = haversineMeters(deviceLocation.lat, deviceLocation.lng, stop.lat, stop.lng)
          if (d < bestDist) {
            bestDist = d
            bestStop = { stopId: stop.id, stopName: stop.name }
          }
        }
      }
    }

    if (!bestStop || bestDist > NEARBY_THRESHOLD_METERS) {
      setNearestStop(null)
      return
    }

    // Find all routes serving this stop and their pct on the display line
    const { stopId, stopName } = bestStop
    const pctByRoute = {}
    const routeIds = []

    for (const [routeId, data] of Object.entries(routeData)) {
      const dirs = Object.keys(data.directions)
      const displayDir = dirs[0]
      const displayDirData = data.directions[displayDir]

      // Check display direction first
      const stopInDisplay = displayDirData.stops.find(s => s.id === stopId)
      if (stopInDisplay) {
        pctByRoute[routeId] = (stopInDisplay.dist / displayDirData.totalDist) * 100
        routeIds.push(routeId)
        continue
      }

      // Check reverse directions
      for (const [dir, dirData] of Object.entries(data.directions)) {
        if (dir === displayDir) continue
        const stopInReverse = dirData.stops.find(s => s.id === stopId)
        if (stopInReverse) {
          pctByRoute[routeId] = 100 - (stopInReverse.dist / dirData.totalDist) * 100
          routeIds.push(routeId)
          break
        }
      }
    }

    setNearestStop({ stopId, stopName, distanceMeters: bestDist, routeIds, pctByRoute })
  }, [deviceLocation])

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-clip">
      {/* Mobile: full-width, pinned to top, rounded bottom corners */}
      <div className="sm:hidden sticky top-0 z-50 bg-gradient-to-r from-green-700 to-lime-400 rounded-b-lg shadow-lg">
        <div className="px-6 py-2 flex items-center justify-between">
          <h1 style={{ fontFamily: 'Quintessential', fontSize: '32px' }} className="text-white m-0">
            Marin Transit
          </h1>
          <div className="text-green-900 text-xs font-medium whitespace-nowrap">
            {relativeTime}
          </div>
        </div>
      </div>

      <div className="px-6 md:px-12 lg:px-24">
        {/* Tablet/Desktop: floating pill, extends 40px beyond circles on each side */}
        <div className="hidden sm:block sticky top-0 z-50 pt-4 pb-2 -mx-10 pointer-events-none">
          <div className="bg-gradient-to-r from-green-700 to-lime-400 rounded-full shadow-lg pointer-events-auto px-10 py-2 flex items-center justify-between">
            <h1 style={{ fontFamily: 'Quintessential', fontSize: '32px' }} className="text-white m-0">
              Marin Transit
            </h1>
            <div className="text-green-900 text-xs font-medium whitespace-nowrap">
              {relativeTime}
            </div>
          </div>
        </div>

        <div className="py-8 space-y-6">
          {/* Your stop panel */}
          {nearestStop && nearestStop.routeIds.length > 0 && (
            <div className="liquid-glass px-4 pt-3 pb-4 space-y-6">
              <div className="text-sm font-semibold text-blue-800">
                Your stop · {nearestStop.stopName}
              </div>
              {nearestStop.routeIds.map(routeId => {
                const route = routes.find(r => r.id === routeId)
                if (!route) return null
                return (
                  <RouteLine
                    key={routeId}
                    route={route}
                    vehicles={vehiclesByLine[routeId] || []}
                    nearbyStopPct={nearestStop.pctByRoute[routeId]}
                  />
                )
              })}
            </div>
          )}

          {routes.map((route) => (
            <RouteLine key={route.id} route={route} vehicles={vehiclesByLine[route.id] || []} />
          ))}
        </div>
      </div>
    </div>
  )
}
