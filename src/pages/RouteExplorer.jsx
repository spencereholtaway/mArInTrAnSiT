export default function RouteExplorer() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Route Explorer</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Browse all Marin Transit routes and schedules</p>
        <div className="mt-6 space-y-3">
          <div className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer">
            <p className="font-semibold">Route information will load here</p>
          </div>
        </div>
      </div>
    </div>
  )
}
