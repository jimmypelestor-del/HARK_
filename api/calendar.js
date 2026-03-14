export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const today = new Date().toISOString().slice(0, 10);

  // Toujours fetcher les 3 feeds : thisweek + nextweek + lastweek
  // Couvre tous les cas (lundi matin, vendredi soir, week-end)
  const urls = [
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
    'https://nfs.faireconomy.media/ff_calendar_lastweek.json',
  ];

  let allEvents = [];
  await Promise.allSettled(
    urls.map(url =>
      fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      })
      .then(r => r.ok ? r.json() : [])
      .then(raw => { if (Array.isArray(raw)) allEvents = allEvents.concat(raw); })
      .catch(() => {})
    )
  );

  if (!allEvents.length) return res.status(500).json({ error: 'Feed indisponible' });

  const events = allEvents
    .filter(e => {
      const d = (e.date || '').slice(0, 10);
      const imp = (e.impact || '').toLowerCase();
      return d === today && (imp === 'high' || imp === 'medium');
    })
    .map(e => ({
      time:     formatTime(e.date),
      currency: e.country || e.currency || '',
      title:    e.title || '',
      impact:   (e.impact || '').toLowerCase(),
      forecast: e.forecast || '',
      previous: e.previous || '',
      actual:   e.actual   || '',
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return res.status(200).json({ events, date: today, total: events.length });
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'
    });
  } catch { return '—'; }
}
