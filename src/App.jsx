import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import LiveMap from './pages/LiveMap'
import StopInfo from './pages/StopInfo'
import ServiceAlerts from './pages/ServiceAlerts'
import RouteExplorer from './pages/RouteExplorer'

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-gray-50">
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/live-map" element={<LiveMap />} />
            <Route path="/stop-info" element={<StopInfo />} />
            <Route path="/alerts" element={<ServiceAlerts />} />
            <Route path="/routes" element={<RouteExplorer />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
