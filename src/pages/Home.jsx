const routes = [
  { id: '17', name: 'Downtown San Rafael - Sausalito', stops: ["Bridgeway & Caledonia Av","Bridgeway & Turney St","Bridgeway & Napa St","Bridgeway & Easterby St","Bridgeway & Nevada St","Bridgeway & Coloma St","Bridgeway & Gate 5 Rd","Drake Av & Donahue St","Drake Av & Buckelew St","Drake Av & Pacheco St","Drake Av & Donahue St","Shoreline Hwy & Pohono St","Almonte Blvd & Rosemont Ave","Almonte Blvd & Miller Ave","Miller Ave & Reed St","Miller Ave & Locust Ave","Miller Ave & Park Ave","E Blithedale Ave & Hill St","E Blithedale Ave & Walnut Ave","E Blithedale Ave & Elm Ave","E Blithedale Ave & Hilarita Ave","E Blithedale Ave & Nelson Ave","E Blithedale Ave & Roque Moraes Dr"] },
  { id: '22', name: 'Downtown San Rafael - Marin City', stops: ["4th St & Court St","4th St & C St","4th St & E St","4th St & Ida St","4th St & Greenfield Ave","4th St & Santa Margarita Ave","Red Hill Ave & Sequoia Dr","Sir Francis Drake Blvd & Ross Av","Sir Francis Drake Blvd & Bolinas Av","1125 Sir Francis Drake Blvd","College of Marin - Sir Francis Drake Blvd & Elm Av","College Ave & Kent Ave","Magnolia Ave & Frances Ave","Magnolia Ave & Skylark Dr","Magnolia Ave & Bon Air Rd","Magnolia Av & Madrone Av","Magnolia Av & Park Way","Redwood Av & Montecito Dr","Tamalpais Dr & Eastman Av","Tamalpais Dr & Meadowsweet Dr","Tiburon Blvd & Hwy 101 NB-Off Ramp","Reed Blvd & Redwood Hwy","Belvedere Dr & Redwood Hwy Frontage Rd","Redwood Hwy Frontage Rd & De Silva Island Dr"] },
  { id: '23', name: 'Canal - Fairfax Manor', stops: ["1525 Francisco Blvd E","Irene St & Francisco Blvd E","Kerner Blvd btwn 3140 & 3160","Kerner Blvd & Bahia Way","Kerner Blvd & Canal St","Canal St & Sonoma St","Canal St & Novato St","Francisco Blvd E & Bay St","3rd St & Grand Ave","4th St & Court St","4th St & C St","4th St & E St","4th St & Ida St","4th St & Greenfield Ave","4th St & Santa Margarita Ave","Red Hill Ave & Sequoia Dr","Sir Francis Drake Blvd & Madrone Ave","Sir Francis Drake Blvd & Sunnyhills Dr","Sir Francis Drake Blvd & San Francisco Blvd","Sir Francis Drake Blvd & Aspen Ct","Sir Francis Drake Blvd & Broadmoor Ave","Sir Francis Drake Blvd & Butterfield Rd","Sir Francis Drake Blvd & Willow Ave","Sir Francis Drake Blvd & Marinda Dr","Sir Francis Drake Blvd & Oak Tree Ln","Sir Francis Drake Blvd & Oak Manor Dr","Sir Francis Drake Blvd At Drake Manor Apts","Sir Francis Drake Blvd & Alhambra Circle"] },
  { id: '29', name: 'Downtown San Rafael - E. Corte Madera', stops: ["Paradise Dr & Prince Royal Dr","Paradise Dr & Seawolf Passage","Paradise Dr & Harbor Dr","Paradise Dr & US 101 Overpass","Madera Blvd & Monona Dr","Tamal Vista Blvd & Sandpiper Circle","Tamal Vista Blvd & Fifer Av","Lucky Dr & Riviera Circle","Doherty Dr & Hall Middle School","Doherty Dr & Larkspur Plaza Dr","Bon Air Rd & Magnolia Ave","Bon Air Rd & MHMC Emergency Entrance Rd","Sir Francis Drake Blvd & Bon Air Rd","Sir Francis Drake Blvd & El Portal Dr","Sir Francis Drake Blvd & La Cuesta Dr","Larkspur Landing Cir & Lincoln Village Cir","600 Larkspur Landing Circle"] },
  { id: '35', name: 'Canal - Northgate', stops: ["Kerner Blvd & Bahia Way","Kerner Blvd & Canal St","Canal St & Sonoma St","Canal St & Novato St","Francisco Blvd E & Bay St","3rd St & Grand Ave","Lincoln Ave & Mission Ave","Lincoln Ave & Paloma Ave","Lincoln Ave & Linden Ln","Lincoln Ave & Grand Ave","N San Pedro Rd & Merrydale Rd","Civic Center Dr & N San Pedro Rd","Nova Albion Way & Arias St","Nova Albion Way & Montecillo Rd","Freitas Pkwy & Northgate Dr"] },
  { id: '36', name: 'Canal - Marin City', stops: ["Kerner Blvd & Bahia Way","Kerner Blvd & Canal St","Canal St & Sonoma St","Canal St & Novato St","Francisco Blvd E & Bay St","3rd St & Grand Ave","Tiburon Blvd & Hwy 101 NB-Off Ramp","Reed Blvd & Redwood Hwy","Belvedere Dr & Redwood Hwy Frontage Rd","Redwood Hwy Frontage Rd & Hwy 101 SB Ramps"] },
  { id: '49', name: 'Downtown San Rafael - Novato San Marin', stops: ["San Marin Dr & Redwood Blvd","San Marin Dr & East Campus Dr","San Marin Dr & Simmons Ln","San Marin Dr & Sereno Way","San Marin Dr & San Andreas Dr","San Marin Dr & San Ramon Way","Novato Blvd & Eucalyptus Av","Novato Blvd & Oliva Dr","Novato Blvd & Wilson Ct","Novato Blvd & Mcclay Rd","Novato Blvd & Grant Av","Seventh St & Novato Blvd","Seventh St & Grant Av","Grant Av & Fifth St","Grant Av & Second St","Diablo Av & George St","S Novato Blvd & Diablo Ave","S Novato Blvd & Joan Av","S Novato Blvd & Rowland Blvd","S Novato Blvd & Midway Blvd","S Novato Blvd & Stone Dr","S Novato Blvd & Redwood Blvd","Nave Dr & Roblar Dr","Hamilton Pkwy At Marin Airporter","Hamilton Pkwy & Aberdeen Rd","Hamilton Pkwy & Chapel Hill Rd","Hamilton Main Gate Rd & Martin Dr","Nave Dr & Bolling Dr","Alameda Del Prado At Nave Dr","Marinwood Bus Pad Hwy 101 @ Miller Creek Rd","Civic Center Dr & N San Pedro Rd","Merrydale Rd & N San Pedro Rd"] },
  { id: '57', name: 'Downtown San Rafael - Novato', stops: ["Union St & Mission Av","Mission Av & Mary St","Grand Av & Belle Av","Grand Av & Jewell St","Grand Av & Mountain View Av","Grand Av & Linden Ln","Lincoln Ave & Linden Ln","Lincoln Ave & Grand Ave","Lincoln Ave & Wilson Ct","Los Ranchitos Rd & Ranch Rd","Los Ranchitos Rd & Circle Rd","Los Ranchitos Rd & Golden Hinde Blvd","Los Ranchitos Rd & Northgate Dr","Las Gallinas Ave & Northgate Dr","Nova Albion Way & Arias St","Manuel T Freitas Pkwy & Montecillo Rd","Manuel T Freitas Pkwy & Del Ganado Rd","Manuel T Freitas Pkwy & Las Pavadas Av","Las Gallinas Av & Oleander Dr","Las Gallinas Av & Las Colindas Rd","Las Gallinas Av & Montevideo Way","Las Gallinas Av & Skyview Terrace","Las Gallinas Av & Santiago Way","Las Gallinas Av & Ellen Dr","Las Gallinas Av & Elvia Ct","Miller Creek Rd & Las Gallinas Av","Alameda Del Prado & Los Robles Rd","Alameda Del Prado & Posada Del Sol","Alameda Del Prado & Calle Arboleda","Alameda Del Prado & Alameda De La Loma","Ignacio Blvd & Alameda Del Prado","Ignacio Blvd At Pacheco Plaza","Ignacio Blvd & Entrada Dr","Ignacio Blvd & Palmer Dr","Ignacio Blvd & Fairway Dr","Ignacio Blvd & Country Club Dr","Ignacio Blvd & Laurelwood Dr","Ignacio Blvd & Turner Dr","Ignacio Blvd & Sunset Pkwy","Ignacio Blvd & Indian Hills Dr","Sunset Pkwy & Merrit Dr","Sunset Pkwy & Midway Blvd","Sunset Pkwy & Denlyn St","Sunset Pkwy & Cambridge St","Rowland Blvd & S Novato Blvd","Rowland Blvd & Redwood Blvd","Rowland Blvd  & Rowland Way","236 Vintage Way","124 Vintage Way","Rowland Blvd & Rowland Way","Rowland Blvd & Redwood Blvd","S Novato Blvd & Rowland Blvd","S Novato Blvd & Arthur St","S Novato Blvd & Lauren Av","S Novato Blvd & Diablo Ave","Diablo Av & George St","Redwood Blvd & Rush Creek Place"] },
  { id: '61', name: 'Sausalito - Bolinas', stops: ["Bridgeway & Caledonia Av","Bridgeway & Turney St","Bridgeway & Napa St","Bridgeway & Easterby St","Bridgeway & Nevada St","Bridgeway & Coloma St","Bridgeway & Gate 5 Rd","Shoreline Hwy & Pohono St","Tam Junction-Shoreline Hwy & Almonte Blvd","Almonte Blvd & Rosemont Ave","Almonte Blvd & Miller Ave","Miller Ave & Camino Alto","Almonte Blvd & Miller Ave","Almonte Blvd & Rosemont Ave","Shoreline Hwy & Almonte Blvd","Shoreline Hwy & Laurel Way","Shoreline Hwy & Pine Hill Rd","Panoramic Hwy & Sequoia Valley Rd","Panoramic Hwy & Bayview Dr","Panoramic Hwy & Ridge Av","Panoramic Hwy & Park Av","895 Panoramic Hwy Bootjack Parking Lot","Audubon Canyon Ranch"] },
  { id: '68', name: 'Downtown San Rafael - Inverness', stops: ["4th St & Court St","4th St & C St","4th St & E St","4th St & Ida St","4th St & Greenfield Ave","4th St & Santa Margarita Ave","Red Hill Ave & Sequoia Dr","Sir Francis Drake Blvd & Madrone Ave","Sir Francis Drake Blvd & Sunnyhills Dr","Sir Francis Drake Blvd & San Francisco Blvd","Sir Francis Drake Blvd & Aspen Ct","Sir Francis Drake Blvd & Broadmoor Ave","Sir Francis Drake Blvd & Butterfield Rd","Sir Francis Drake Blvd & Willow Ave","Sir Francis Drake Blvd & Marinda Dr","Sir Francis Drake Blvd & Oak Tree Ln","Sir Francis Drake Blvd & Oak Manor Dr","Sir Francis Drake Blvd At Drake Manor Apts","Sir Francis Drake Blvd & Alhambra Circle","San Geronimo Valley Dr & Creamery Rd"] },
  { id: '71', name: 'Novato - Marin City', stops: ["Hwy 101 @ Seminary Dr Bus Pad","Hwy 101 @ Tiburon Wye Bus Pad","Hwy 101 @ Lucky Dr Bus Pad","Hwy 101 @ N San Pedro Rd Bus Pad","Hwy 101 @ Terra Linda Bus Pad NB","Marinwood Bus Pad Hwy 101 @ Saint Vincent's Dr","Hwy 101 @ Alameda Del Prado Bus Pad","Hwy 101 @ Rowland Blvd Bus Pad","Hwy 101 @ DeLong Ave Bus Pad","DeLong Ave & Reichert Ave"] },
  { id: '219', name: 'Tiburon - Strawberry', stops: ["Belvedere Dr & Redwood Hwy Frontage Rd","Tiburon Blvd & N Knoll Rd","Tiburon Blvd & Strawberry Dr","Tiburon Blvd & Greenwood Cove Rd","Tiburon Blvd & Cecilia Way","Tiburon Blvd & Greenwood Beach Rd","Tiburon Blvd & Pine Terrace","Tiburon Blvd & Rock Hill Dr","Tiburon Blvd & Gilmartin Dr","Tiburon Blvd & San Rafael Av","Tiburon Blvd & Neds Way","Tiburon Blvd & Lyford Dr","Tiburon Blvd & Mar West St","Tiburon Blvd & Beach Rd"] },
  { id: '228', name: 'Downtown San Rafael - Fairfax Manor', stops: ["Larkspur Landing Cir & Lincoln Village Cir","600 Larkspur Landing Circle","Sir Francis Drake Blvd & La Cuesta Dr","Via Casitas & El Portal Dr","630 S Eliseo Dr","1220 S Eliseo Dr","Bon Air Rd & MHMC Emergency Entrance Rd","Sir Francis Drake Blvd & Bon Air Rd","Sir Francis Drake Blvd & Wolfe Grade","Sir Francis Drake Blvd & Laurel Grove Ave","Sir Francis Drake Blvd & Oak Ave","Sir Francis Drake Blvd & Ash Ave","Sir Francis Drake Blvd & Ross Terrace","Sir Francis Drake Blvd & Bolinas Rd","Sir Francis Drake Blvd & Barber Av","Sir Francis Drake Blvd & Madrone Ave","Sir Francis Drake Blvd & Sunnyhills Dr","Sir Francis Drake Blvd & San Francisco Blvd","Sir Francis Drake Blvd & Aspen Ct","Sir Francis Drake Blvd & Broadmoor Ave","Sir Francis Drake Blvd & Butterfield Rd","Sir Francis Drake Blvd & Willow Ave","Sir Francis Drake Blvd & Marinda Dr","Sir Francis Drake Blvd & Oak Tree Ln","Sir Francis Drake Blvd & Oak Manor Dr","Sir Francis Drake Blvd At Drake Manor Apts","Sir Francis Drake Blvd & Alhambra Circle"] },
  { id: '233', name: 'San Rafael (Downtown - Santa Venetia)', stops: ["Adrian Way & Rosal Way","La Pasada Way & N San Pedro Rd","N San Pedro Rd & Mabry Way","N San Pedro Rd & Meadow Dr","N San Pedro Rd & Schmidt Ln","N San Pedro Rd & Meriam Dr","N San Pedro Rd & Roosevelt Av","N San Pedro Rd & Jefferson Av","Civic Center Dr & N San Pedro Rd","N San Pedro Rd & Merrydale Rd","Lincoln Ave & Wilson Ct","Lincoln Ave & Grand Ave","Grand Av & Linden Ln","Grand Av & Mountain View Av","Grand Av & Jewell St","Grand Av & Belle Av","Mission Av & Mary St","Union St & Fourth St","3rd St & Grand Ave"] },
  { id: '245', name: 'San Rafael (Downtown - Smith Ranch Road)', stops: ["Smith Ranch Rd At Cinemark","Las Gallinas Av & Cedar Hill Dr","Las Gallinas Av & Maple Hill Dr","Las Gallinas Av & Park Ridge Av","Las Gallinas Av & Las Colindas Rd","Las Gallinas Av & Holly Dr","Manuel T Freitas Pkwy & Las Gallinas Av","Manuel T Freitas Pkwy & Las Pavadas Av","Manuel T Freitas Pkwy & Del Ganado Rd","Montecillo Rd At Kaiser Hospital Lot C","Nova Albion Way & Montecillo Rd","Nova Albion Way & Arias St","Hwy 101 @ N San Pedro Rd Bus Pad"] },
  { id: '613', name: 'Paradise Cay - Redwood HS', stops: ["Redwood High & Doherty Dr","Doherty Dr & Larkspur Plaza Dr","Magnolia Av & Ward St","Magnolia Av & Madrone Av","Magnolia Av & Park Way","Redwood Av & Montecito Dr","Tamalpais Dr & Eastman Av","33 San Clemente Dr","Paradise Dr & Madera Del Presidio Av","Paradise Dr & El Camino Dr","Paradise Dr & Golden Hinde Passage","Paradise Dr & Uplands Circle","Paradise Dr & Robin Dr","Paradise Dr & Ranch Rd"] },
  { id: '619', name: 'Tiburon - Redwood HS', stops: ["Tiburon Blvd & Beach Rd","Tiburon Blvd & Mar West St","Tiburon Blvd & Lyford Dr","Tiburon Blvd & Neds Way","Tiburon Blvd & San Rafael Av","Tiburon Blvd & Gilmartin Dr","Tiburon Blvd & Rock Hill Dr","Tiburon Blvd & Avenida Miraflores","Tiburon Blvd & Jefferson Dr","Tiburon Blvd & Reed Ranch Rd","Tiburon Blvd & Cecilia Way","Tiburon Blvd & Blackfield Dr","Tiburon Blvd & Bay Vista Dr","Tiburon Blvd & N Knoll Rd","Tamal Vista Blvd & Fifer Av","Lucky Dr & Riviera Circle"] },
  { id: '625', name: 'Lagunitas - Sir Francis Drake HS - San Anselmo Hub', stops: ["Sir Francis Drake Blvd & Madrone Ave","Sir Francis Drake Blvd & Sunnyhills Dr","Sir Francis Drake Blvd & San Francisco Blvd","Sir Francis Drake Blvd & Broadmoor Ave","Sir Francis Drake Blvd & Butterfield Rd","Sir Francis Drake Blvd & Willow Ave","Sir Francis Drake Blvd & Marinda Dr","Sir Francis Drake Blvd & Oak Tree Ln","Sir Francis Drake Blvd & Oak Manor Dr","Sir Francis Drake Blvd At Drake Manor Apts","Sir Francis Drake Blvd & Alhambra Circle","San Geronimo Valley Dr & Creamery Rd"] },
  { id: '654', name: 'Olive - Novato Loop', stops: ["Grant Av & Second St","Grant Av & Fifth St","Seventh St & Grant Av","Seventh St & Novato Blvd","Novato Blvd & Seventh St","Novato Blvd & Grant Av","Novato Blvd & Mcclay Rd","Novato Blvd & Wilson Ct","Novato Blvd & Oliva Dr","Novato Blvd & Eucalyptus Av","San Marin Dr & San Ramon Way","San Marin Dr & Sereno Way","San Marin Dr & Simmons Ln","San Marin Dr & Somerset Dr","San Marin Dr & Santolina Dr","San Marin Dr & Redwood Blvd","Olive Av & Kenwood Ct"] },
]

function RouteCircle({ routeId }) {
  return (
    <div className="w-9 h-9 rounded-full border-2 border-black bg-white flex items-center justify-center text-xs font-bold text-black shrink-0">
      {routeId}
    </div>
  )
}

function StopTick({ index, total }) {
  const pct = total === 1 ? 50 : (index / (total - 1)) * 100
  return (
    <div
      className="absolute w-px h-4 bg-black"
      style={{
        left: `${pct}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    />
  )
}

function RouteLine({ route }) {
  return (
    <div className="flex items-center gap-3">
      <RouteCircle routeId={route.id} />
      <div className="flex-1 relative h-8">
        {/* The horizontal line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-black" />
        {/* Stop ticks */}
        {route.stops.map((stop, i) => (
          <StopTick key={`${route.id}-${i}`} index={i} total={route.stops.length} />
        ))}
      </div>
      <RouteCircle routeId={route.id} />
    </div>
  )
}

export default function Home() {
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
          <RouteLine key={route.id} route={route} />
        ))}
      </div>
    </div>
  )
}
