import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import LiveMap from './pages/LiveMap'
import StopInfo from './pages/StopInfo'
import ServiceAlerts from './pages/ServiceAlerts'
import RouteExplorer from './pages/RouteExplorer'

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link to="/" className="text-2xl font-bold text-blue-600">
                🚌 Marin Transit
              </Link>
              <div className="hidden md:flex space-x-8">
                <Link to="/" className="text-gray-700 hover:text-blue-600">Home</Link>
                <Link to="/live-map" className="text-gray-700 hover:text-blue-600">Live Map</Link>
                <Link to="/stop-info" className="text-gray-700 hover:text-blue-600">Stop Info</Link>
                <Link to="/alerts" className="text-gray-700 hover:text-blue-600">Alerts</Link>
                <Link to="/routes" className="text-gray-700 hover:text-blue-600">Routes</Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Routes */}
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/live-map" element={<LiveMap />} />
            <Route path="/stop-info" element={<StopInfo />} />
            <Route path="/alerts" element={<ServiceAlerts />} />
            <Route path="/routes" element={<RouteExplorer />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-gray-800 text-white py-4">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p>Marin Transit Data Visualizations | Powered by 511.org</p>
          </div>
        </footer>
      </div>
    </Router>
  )
}

export default App
