import { useState, useEffect } from 'react'
import routeData from '../data/routeData.json'

const API_KEY = import.meta.env.VITE_MARIN_TRANSIT_API_KEY
const VEHICLE_URL = import.meta.env.DEV
  ? `/api/VehicleMonitoring?api_key=${API_KEY}&agency=MA&Format=json`
  : `/api/vehicle-monitoring`

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

function BusDot({ position, delay, movingRight }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ left: `${position}%`, top: '50%', transform: 'translateX(-50%) translateY(-50%)', zIndex: 10 }}
    >
      <div
        className="animate-bounce absolute text-2xl"
        style={{ animationDelay: `${delay}s` }}
      >
        🚌
      </div>
      {/* Chevron pointing in direction of travel */}
      <div
        className="absolute text-red-500 font-bold text-lg"
        style={{
          transform: movingRight ? 'translateX(12px) scaleX(1)' : 'translateX(-12px) scaleX(-1)',
          opacity: 0.7,
        }}
      >
        ›
      </div>
    </div>
  )
}

function RouteLine({ route, vehicles }) {
  const routeInfo = routeData[route.id]
  return (
    <div className="flex items-center gap-3">
      <RouteCircle routeId={route.id} />
      <div className="flex-1 relative h-8">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-black" />
        {route.stops.map((stop, i) => {
          const pct = route.totalDist > 0
            ? (stop.dist / route.totalDist) * 100
            : (i / (route.stops.length - 1)) * 100
          return <StopTick key={`${route.id}-${i}`} pct={pct} />
        })}
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Floating header bar */}
      <div className="flex justify-center pt-6 px-4 relative z-20">
        <div className="bg-gradient-to-r from-lime-400 to-green-700 rounded-full px-8 py-4 shadow-lg flex items-center justify-between gap-8 min-w-max">
          <h1 style={{ fontFamily: 'Quintessential', fontSize: '48px' }} className="text-white m-0">
            Marin Transit
          </h1>
          <div className="text-white text-xs opacity-90 whitespace-nowrap">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : 'Loading...'}
          </div>
        </div>
      </div>

      <div className="px-6 md:px-12 lg:px-24 py-8 space-y-6">
        {routes.map((route) => (
          <RouteLine key={route.id} route={route} vehicles={vehiclesByLine[route.id] || []} />
        ))}
      </div>
    </div>
  )
}
