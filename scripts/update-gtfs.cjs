#!/usr/bin/env node
/**
 * Downloads the GTFS feed from 511.org for Marin Transit (MA)
 * and generates src/data/routeData.json with:
 * - Shape polylines per route/direction (for GPS snapping)
 * - Stop coordinates and distances along route
 * - Direction mappings (GTFS direction_id → API DirectionRef)
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const API_KEY = process.env.MARIN_TRANSIT_API_KEY || '5a5aeae5-0b2c-43b1-83a3-ddca59f5e54c'
const GTFS_URL = `http://api.511.org/transit/datafeeds?api_key=${API_KEY}&operator_id=MA`
const TMP_DIR = path.join(require('os').tmpdir(), 'marin_gtfs_update')
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'routeData.json')

const ROUTE_IDS = ['17','22','23','29','35','36','49','57','61','68','71','219','228','233','245','613','619','625','654']

// Every Nth shape point to keep (reduces file size while maintaining accuracy)
const SAMPLE_RATE = 5

function parseCSV(filepath) {
  const text = fs.readFileSync(filepath, 'utf-8')
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',')
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim() })
    return obj
  })
}

function download() {
  console.log('Downloading GTFS feed...')
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const zipPath = path.join(TMP_DIR, 'gtfs.zip')
  execSync(`curl --compressed -s -o "${zipPath}" "${GTFS_URL}"`)
  execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}"`, { stdio: 'pipe' })
  console.log('Downloaded and extracted.')
}

function processData() {
  console.log('Processing GTFS data...')

  const routes = parseCSV(path.join(TMP_DIR, 'routes.txt'))
  const trips = parseCSV(path.join(TMP_DIR, 'trips.txt'))
  const directions = parseCSV(path.join(TMP_DIR, 'directions.txt'))
  const stopsRaw = parseCSV(path.join(TMP_DIR, 'stops.txt'))
  const stopTimes = parseCSV(path.join(TMP_DIR, 'stop_times.txt'))

  // Parse shapes.txt manually for performance (100K+ lines)
  console.log('Parsing shapes.txt...')
  const shapesText = fs.readFileSync(path.join(TMP_DIR, 'shapes.txt'), 'utf-8')
  const shapeLines = shapesText.trim().split('\n')
  const shapesByIdRaw = {}
  for (let i = 1; i < shapeLines.length; i++) {
    const parts = shapeLines[i].split(',')
    const id = parts[0]
    if (!shapesByIdRaw[id]) shapesByIdRaw[id] = []
    shapesByIdRaw[id].push({
      seq: Number(parts[3]),
      lat: Number(parts[2]),
      lng: Number(parts[1]),
      dist: Number(parts[4])
    })
  }
  // Sort each shape by sequence
  for (const id in shapesByIdRaw) {
    shapesByIdRaw[id].sort((a, b) => a.seq - b.seq)
  }

  // Build stop lookup: stop_id → { name, lat, lng }
  const stopLookup = {}
  for (const s of stopsRaw) {
    stopLookup[s.stop_id] = { name: s.stop_name, lat: Number(s.stop_lat), lng: Number(s.stop_lon) }
  }

  // Build direction mapping: route_id → { direction_id → directionLetter }
  // API uses first letter: "North" → "N", "South" → "S", etc.
  const dirMap = {}
  for (const d of directions) {
    if (!dirMap[d.route_id]) dirMap[d.route_id] = {}
    dirMap[d.route_id][d.direction_id] = d.direction.charAt(0).toUpperCase()
  }

  // Group trips by route
  const tripsByRoute = {}
  for (const t of trips) {
    if (!tripsByRoute[t.route_id]) tripsByRoute[t.route_id] = []
    tripsByRoute[t.route_id].push(t)
  }

  // Group stop_times by trip_id
  const stopTimesByTrip = {}
  for (const st of stopTimes) {
    if (!stopTimesByTrip[st.trip_id]) stopTimesByTrip[st.trip_id] = []
    stopTimesByTrip[st.trip_id].push(st)
  }

  const routeData = {}

  for (const routeId of ROUTE_IDS) {
    const routeTrips = tripsByRoute[routeId] || []
    const routeInfo = routes.find(r => r.route_id === routeId)

    // Group trips by direction, count shapes
    const byDir = {}
    for (const t of routeTrips) {
      const dir = t.direction_id
      if (!byDir[dir]) byDir[dir] = {}
      byDir[dir][t.shape_id] = (byDir[dir][t.shape_id] || 0) + 1
    }

    const dirData = {}

    for (const [dirId, shapeCounts] of Object.entries(byDir)) {
      // Pick most common shape
      const bestShapeId = Object.entries(shapeCounts)
        .sort((a, b) => b[1] - a[1])[0][0]

      const shapePoints = shapesByIdRaw[bestShapeId]
      if (!shapePoints || shapePoints.length === 0) continue

      const totalDist = shapePoints[shapePoints.length - 1].dist

      // Sample shape points for smaller file size
      const sampled = shapePoints.filter((_, i) =>
        i % SAMPLE_RATE === 0 || i === shapePoints.length - 1
      )

      // Find a trip using this shape to get stop sequence
      const sampleTrip = routeTrips.find(t => t.shape_id === bestShapeId)
      let stopsForDir = []
      if (sampleTrip) {
        const sts = (stopTimesByTrip[sampleTrip.trip_id] || [])
          .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
        stopsForDir = sts.map(st => {
          const stop = stopLookup[st.stop_id] || { name: st.stop_id, lat: 0, lng: 0 }
          return {
            id: st.stop_id,
            name: stop.name,
            lat: stop.lat,
            lng: stop.lng,
            dist: Number(st.shape_dist_traveled)
          }
        })
      }

      const apiDir = dirMap[routeId]?.[dirId] || dirId
      dirData[apiDir] = {
        shapeId: bestShapeId,
        totalDist,
        // Store as compact arrays: [lat, lng, dist]
        points: sampled.map(p => [
          Math.round(p.lat * 1e6) / 1e6,
          Math.round(p.lng * 1e6) / 1e6,
          Math.round(p.dist * 1e4) / 1e4
        ]),
        stops: stopsForDir
      }
    }

    routeData[routeId] = {
      name: routeInfo?.route_long_name || '',
      directions: dirData
    }
  }

  // Write output
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(routeData))
  const sizeMB = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2)
  console.log(`Written ${OUT_FILE} (${sizeMB} MB)`)
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
}

try {
  download()
  processData()
  cleanup()
  console.log('Done!')
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
}
