export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  try {
    const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();

    if (!Array.isArray(raw) || !raw.length) throw new Error('empty feed');

    // Debug : voir le format de date du premier événement
    const sample = raw.slice(0, 3);
    const today = new Date().toISOString().slice(0, 10);
    const allDates = [...new Set(raw.map(e => (e.date||'').slice(0,10)))];

    // Filtrer aujourd'hui + impact medium/high
    const events = raw
      .filter(e => {
        const d = (e.date || '').slice(0, 10);
        const imp = (e.impact || '').toLowerCase();
        return d === today && (imp === 'high' || imp === 'medium');
      })
      .map(e => ({
        time:     formatTime(e.date),
        currency: e.currency || '',
        title:    e.title || '',
        impact:   (e.impact || '').toLowerCase(),
        forecast: e.forecast || '',
        previous: e.previous || '',
        actual:   e.actual   || '',
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    return res.status(200).json({
      events,
      date: today,
      total: events.length,
      debug: { sample, allDates, today },
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'
    });
  } catch { return '—'; }
}
