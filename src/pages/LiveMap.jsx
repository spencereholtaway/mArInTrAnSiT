export default function LiveMap() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Live Route Map</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Interactive map showing real-time bus positions</p>
        <div className="mt-6 h-96 bg-gray-200 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">Map will be loaded here</p>
        </div>
      </div>
    </div>
  )
}
