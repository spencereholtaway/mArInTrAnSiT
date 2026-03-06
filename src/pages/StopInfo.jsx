import { useState } from 'react'

export default function StopInfo() {
  const [stopCode, setStopCode] = useState('')

  const handleSearch = (e) => {
    e.preventDefault()
    // API call will be implemented
    console.log('Searching for stop:', stopCode)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Stop Information</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <input
            type="text"
            placeholder="Enter stop code or name"
            value={stopCode}
            onChange={(e) => setStopCode(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Search
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Arrival information will appear here</p>
      </div>
    </div>
  )
}
