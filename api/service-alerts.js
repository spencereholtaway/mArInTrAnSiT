export default async function handler(req, res) {
  const apiKey = process.env.MARIN_TRANSIT_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  try {
    const response = await fetch(
      `http://api.511.org/transit/SituationExchange?api_key=${apiKey}&agency=MA&Format=json`
    )

    let text = await response.text()
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    res.status(200).send(text)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch service alerts' })
  }
}
