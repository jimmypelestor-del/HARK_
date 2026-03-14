export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  // Forex Factory fournit un feed JSON/XML public hebdomadaire
  const today = new Date().toISOString().slice(0, 10); // "2026-03-14"

  const sources = [
    // Feed JSON officiel Forex Factory (semaine courante)
    `https://nfs.faireconomy.media/ff_calendar_thisweek.json`,
    `https://nfs.faireconomy.media/ff_calendar_nextweek.json`,
  ];

  for (const url of sources) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const raw = await r.json();
      if (!Array.isArray(raw) || !raw.length) continue;

      // Filtrer : aujourd'hui + impact medium/high
      const events = raw
        .filter(e => {
          const d = (e.date || '').slice(0, 10);
          const imp = (e.impact || '').toLowerCase();
          return d === today && (imp === 'high' || imp === 'medium');
        })
        .map(e => ({
          time:     e.date ? new Date(e.date).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Paris' }) : '—',
          currency: e.currency || '',
          title:    e.title || '',
          impact:   (e.impact || '').toLowerCase(),
          forecast: e.forecast || '',
          previous: e.previous || '',
          actual:   e.actual   || '',
        }))
        .sort((a, b) => a.time.localeCompare(b.time));

      if (!events.length) {
        // Retourner quand même les événements du jour même si 0 medium/high
        const all = raw.filter(e => (e.date||'').slice(0,10) === today);
        return res.status(200).json({ events: all.slice(0,10), date: today, total: all.length });
      }

      return res.status(200).json({ events, date: today, total: events.length });

    } catch {}
  }

  return res.status(500).json({ error: 'Feed Forex Factory indisponible' });
}
