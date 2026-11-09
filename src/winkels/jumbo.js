// Jumbo: de aanbiedingenpagina bevat de acties van deze week én (vanaf het weekend) die van volgende week.
import { aanbieding, isoDatum, nuxtData, parsePrijs, parseVoorActie } from '../lib.js';

export const naam = 'jumbo';
export const url = 'https://www.jumbo.com/aanbiedingen/nu';

export function parse(html) {
  const data = nuxtData(html);
  const runtimes = data?.data?.nuTab?.activeTab?.runtimes;
  if (!Array.isArray(runtimes)) throw new Error('Jumbo: runtimes niet gevonden (pagina-opbouw veranderd?)');

  const gezien = new Set();
  const resultaat = [];

  for (const runtime of runtimes) {
    for (const sectie of runtime.sections ?? []) {
      const groepen = [
        { categorie: null, promoties: sectie.promotions ?? [] }, // uitgelichte acties zonder vaste categorie
        ...(sectie.categories ?? []).map((c) => ({ categorie: c.title, promoties: c.promotions ?? [] })),
      ];
      for (const { categorie, promoties } of groepen) {
        for (const p of promoties) {
          if (!p || p.hidden || p.active === false) continue;
          const sleutel = `${p.id}|${p.start?.iso}`;
          if (gezien.has(sleutel)) continue;
          gezien.add(sleutel);

          const tags = (p.tags ?? []).map((t) => t.text).filter(Boolean);
          const alleenTag = tags.find((t) => /^alleen (online|in de winkel|in de slijterij)/i.test(t));
          const alleen = alleenTag ? (/online/i.test(alleenTag) ? 'online' : /slijterij/i.test(alleenTag) ? 'slijterij' : 'winkel') : null;
          const actie = tags.filter((t) => t !== alleenTag).join(' · ') || null;
          const voor = parseVoorActie(actie);
          resultaat.push(
            aanbieding({
              winkel: naam,
              id: p.id,
              titel: p.title,
              omschrijving: p.subtitle,
              actie,
              actieprijs: voor ? voor.prijs : /^\s*(nu\s*)?€?\s*\d+[,.]\d{2}\s*$/i.test(actie ?? '') ? parsePrijs(actie) : null,
              aantal: voor?.aantal,
              alleen,
              geldig_van: isoDatum(p.start?.iso),
              geldig_tot: isoDatum(p.end?.iso),
              categorie,
              url: p.url ? new URL(p.url, 'https://www.jumbo.com').href : null,
              afbeelding: p.image ?? null,
            }),
          );
        }
      }
    }
  }
  return resultaat;
}
