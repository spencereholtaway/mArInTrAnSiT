const routes = [
  { id: '17', name: 'Downtown San Rafael - Sausalito' },
  { id: '22', name: 'Downtown San Rafael - Marin City' },
  { id: '23', name: 'Canal - Fairfax Manor' },
  { id: '29', name: 'Downtown San Rafael - E. Corte Madera' },
  { id: '35', name: 'Canal - Northgate' },
  { id: '36', name: 'Canal - Marin City' },
  { id: '49', name: 'Downtown San Rafael - Novato San Marin' },
  { id: '57', name: 'Downtown San Rafael - Novato' },
  { id: '61', name: 'Sausalito - Bolinas' },
  { id: '68', name: 'Downtown San Rafael - Inverness' },
  { id: '71', name: 'Novato - Marin City' },
  { id: '219', name: 'Tiburon - Strawberry' },
  { id: '228', name: 'Downtown San Rafael - Fairfax Manor' },
  { id: '233', name: 'San Rafael (Downtown - Santa Venetia)' },
  { id: '245', name: 'San Rafael (Downtown - Smith Ranch Road)' },
  { id: '613', name: 'Paradise Cay - Redwood HS' },
  { id: '619', name: 'Tiburon - Redwood HS' },
  { id: '625', name: 'Lagunitas - Sir Francis Drake HS - San Anselmo Hub' },
  { id: '654', name: 'Olive - Novato Loop' },
]

function RouteCircle({ routeId, onClick }) {
  return (
    <button
      onClick={() => onClick(routeId)}
      className="w-9 h-9 rounded-full border-2 border-black bg-white flex items-center justify-center text-xs font-bold text-black shrink-0 hover:bg-black hover:text-white transition-colors cursor-pointer"
    >
      {routeId}
    </button>
  )
}

function RouteLine({ route, onCircleClick }) {
  return (
    <div className="flex items-center gap-0">
      <RouteCircle routeId={route.id} onClick={onCircleClick} />
      <div className="flex-1 h-0.5 bg-black" />
      <RouteCircle routeId={route.id} onClick={onCircleClick} />
    </div>
  )
}

export default function Home() {
  const handleCircleClick = (routeId) => {
    console.log('Clicked route:', routeId)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-800 py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 style={{ fontFamily: 'Quintessential', fontSize: '72px' }} className="text-white">
            mArInTrAnSiT
          </h1>
        </div>
      </div>

      <div className="px-6 md:px-12 lg:px-24 py-8 space-y-6">
        {routes.map((route) => (
          <RouteLine key={route.id} route={route} onCircleClick={handleCircleClick} />
        ))}
      </div>
    </div>
  )
}
