export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const SB = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';
  const target = 'https://www.forexfactory.com/calendar';

  try {
    const r = await fetch(
      `https://app.scrapingbee.com/api/v1/?api_key=${SB}&url=${encodeURIComponent(target)}&render_js=true&wait=4000&block_ads=true`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (!r.ok) throw new Error('SB ' + r.status);
    const html = await r.text();

    const events = [];
    // Forex Factory : chaque event dans <tr class="calendar__row ...">
    const rows = [...html.matchAll(/<tr[^>]*calendar__row[^>]*>([\s\S]*?)<\/tr>/gi)];

    for (const row of rows) {
      const inner = row[1];

      // Impact : chercher les classes "high" ou "medium"
      const impactMatch = inner.match(/calendar__impact-title[^>]*>([^<]+)</i)
                       || inner.match(/impact--(high|medium|low)/i)
                       || inner.match(/(High|Medium|Low) Impact/i);
      if (!impactMatch) continue;
      const impactRaw = (impactMatch[1] || impactMatch[0]).toLowerCase();
      const impact = impactRaw.includes('high') ? 'high'
                   : impactRaw.includes('medium') ? 'medium' : 'low';
      if (impact === 'low') continue;

      // Heure
      const timeMatch = inner.match(/calendar__time[^>]*>([^<]*)</i);
      const time = timeMatch ? timeMatch[1].replace(/\s+/g,' ').trim() : '';

      // Devise
      const currMatch = inner.match(/calendar__currency[^>]*>([^<]+)</i);
      const currency = currMatch ? currMatch[1].trim() : '';

      // Titre événement
      const titleMatch = inner.match(/calendar__event-title[^>]*>([^<]+)</i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Actual / Forecast / Previous
      const actualMatch  = inner.match(/calendar__actual[^>]*>([^<]*)</i);
      const forecastMatch = inner.match(/calendar__forecast[^>]*>([^<]*)</i);
      const previousMatch = inner.match(/calendar__previous[^>]*>([^<]*)</i);

      const actual   = actualMatch   ? actualMatch[1].trim()   : '';
      const forecast = forecastMatch ? forecastMatch[1].trim() : '';
      const previous = previousMatch ? previousMatch[1].trim() : '';

      if (!title) continue;

      events.push({ time, currency, title, impact, actual, forecast, previous });
    }

    if (!events.length) {
      return res.status(200).json({
        debug: true,
        htmlLength: html.length,
        sample: html.slice(2000, 4000),
      });
    }

    return res.status(200).json({ events, date: new Date().toISOString().slice(0,10) });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
