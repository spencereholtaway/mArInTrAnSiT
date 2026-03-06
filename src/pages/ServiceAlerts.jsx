export default function ServiceAlerts() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Service Alerts</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Current service disruptions and alerts</p>
        <div className="mt-6 space-y-4">
          <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded">
            <p className="text-yellow-800">Alerts will appear here</p>
          </div>
        </div>
      </div>
    </div>
  )
}
