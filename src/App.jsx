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
      <a
        href="https://www.buymeacoffee.com/holtaway"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: 'calc(1rem + env(safe-area-inset-bottom))',
          right: '1rem',
          zIndex: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: '#FFDD00',
          color: '#000000',
          fontFamily: 'Poppins, sans-serif',
          fontWeight: 600,
          fontSize: '0.875rem',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: '2px solid #000000',
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>☕</span>
        Buy me a coffee?
      </a>
    </Router>
  )
}

export default App
