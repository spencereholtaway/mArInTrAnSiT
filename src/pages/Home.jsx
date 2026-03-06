export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Marin Transit Data Visualizations</h1>
      <p className="text-lg text-gray-600 mb-8">
        Explore real-time transit data and service information for Marin Transit.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
          <h2 className="text-xl font-bold mb-2">📍 Live Route Map</h2>
          <p className="text-gray-600">See buses moving in real-time on an interactive map</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
          <h2 className="text-xl font-bold mb-2">🛑 Stop Information</h2>
          <p className="text-gray-600">Search for a stop and see next arrivals</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
          <h2 className="text-xl font-bold mb-2">⚠️ Service Alerts</h2>
          <p className="text-gray-600">View current service disruptions and alerts</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
          <h2 className="text-xl font-bold mb-2">🗺️ Route Explorer</h2>
          <p className="text-gray-600">Browse all routes and view schedules</p>
        </div>
      </div>
    </div>
  )
}
