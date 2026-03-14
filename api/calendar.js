export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Prochain jour ouvré si week-end
  const day = now.getUTCDay(); // 0=dim, 6=sam
  const offset = day === 6 ? 2 : day === 0 ? 1 : 0;
  const targetDate = new Date(now);
  targetDate.setUTCDate(targetDate.getUTCDate() + offset);
  const target = targetDate.toISOString().slice(0, 10);

  const urls = [
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
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

  // Chercher d'abord aujourd'hui, sinon le prochain jour ouvré
  for (const dateToUse of [today, target]) {
    const events = allEvents
      .filter(e => {
        const d = (e.date || '').slice(0, 10);
        const imp = (e.impact || '').toLowerCase();
        return d === dateToUse && (imp === 'high' || imp === 'medium');
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

    if (events.length) {
      const label = dateToUse === today ? 'Aujourd\'hui' : 'Lundi prochain';
      return res.status(200).json({ events, date: dateToUse, label, total: events.length });
    }
  }

  // Aucun événement trouvé — weekend sans données
  return res.status(200).json({ events: [], date: target, label: 'Aucun événement', total: 0 });
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'
    });
  } catch { return '—'; }
}
