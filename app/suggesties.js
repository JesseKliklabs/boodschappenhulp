// Suggesties tijdens het typen ("curry" → currysaus, curryketchup) en typefouten herkennen
// ("kipfilte" → bedoelde je kipfilet?). De woordenlijst komt uit de namen van alle producten.
import { woorden, isOnbelangrijk, varianten } from './zoeken.js';

/**
 * Woordenboek uit productnamen: elk woord met in hoeveel producten het voorkomt.
 * `namen` mag strings of al gesplitste woordlijsten bevatten.
 */
export function maakWoordenboek(namen, { minimaal = 2 } = {}) {
  const telling = new Map();
  const paren = new Map(); // "halfvolle" → { melk: 120, ... }: welke woorden volgen elkaar op
  const bruikbaar = (w) => w.length >= 3 && !/d/.test(w) && !isOnbelangrijk(w);
  for (const naam of namen) {
    const rij = Array.isArray(naam) ? naam : woorden(naam);
    for (let i = 1; i < rij.length; i++) {
      if (!bruikbaar(rij[i - 1]) || !bruikbaar(rij[i])) continue;
      if (!paren.has(rij[i - 1])) paren.set(rij[i - 1], new Map());
      const volgend = paren.get(rij[i - 1]);
      volgend.set(rij[i], (volgend.get(rij[i]) ?? 0) + 1);
    }
    const ws = new Set(rij);
    for (const w of ws) {
      if (w.length < 3 || /\d/.test(w) || isOnbelangrijk(w)) continue;
      telling.set(w, (telling.get(w) ?? 0) + 1);
    }
  }
  const lijst = [...telling].filter(([, n]) => n >= minimaal).map(([woord, aantal]) => ({ woord, aantal }));
  lijst.sort((a, b) => b.aantal - a.aantal);
  return { lijst, aantal: new Map(lijst.map((x) => [x.woord, x.aantal])), paren };
}

/**
 * Afstand tussen twee woorden: hoeveel letters je moet toevoegen, weghalen, vervangen of omwisselen.
 * Stopt vroeg zodra het meer dan `max` wordt (dan maakt het niet meer uit hoeveel).
 */
export function afstand(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorige2 = null;
  let vorige = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const rij = [i];
    let kleinste = i;
    for (let j = 1; j <= b.length; j++) {
      const kost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(vorige[j] + 1, rij[j - 1] + 1, vorige[j - 1] + kost);
      if (vorige2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, vorige2[j - 2] + 1);
      rij.push(d);
      kleinste = Math.min(kleinste, d);
    }
    if (kleinste > max) return max + 1;
    vorige2 = vorige;
    vorige = rij;
  }
  return vorige[b.length];
}

const toegestaan = (lengte) => (lengte <= 4 ? 1 : 2); // korte woorden: maar één foutje

/** Het meest waarschijnlijke bedoelde woord, of null als het woord al bestaat of niets in de buurt komt. */
export function bedoelde(boek, woord) {
  const w = woorden(woord).join('');
  if (w.length < 3 || boek.aantal.has(w)) return null;
  const max = toegestaan(w.length);
  let beste = null;
  for (const { woord: kandidaat, aantal } of boek.lijst) {
    const d = afstand(w, kandidaat, max);
    // Twee fouten mag, maar niet door twee letters te veel of te weinig ("wcpapier" is geen "papier").
    if (d > max || (d === 2 && Math.abs(w.length - kandidaat.length) > 1)) continue;
    // kleinste afstand wint; bij gelijke afstand het woord dat het vaakst voorkomt (lijst staat al zo gesorteerd)
    if (!beste || d < beste.d) beste = { woord: kandidaat, d, aantal };
    if (d === 1) break; // de lijst loopt van vaak naar zelden, dus dit is de beste met één foutje
  }
  return beste?.woord ?? null;
}

/**
 * Suggesties voor wat iemand aan het typen is.
 * Geeft [{ woord, soort: 'begint' | 'bevat' | 'samen' | 'bedoeld' }], beste eerst.
 */
export function suggesties(boek, invoer, max = 6) {
  const delen = woorden(invoer);
  if (!delen.length) return [];
  const laatste = delen.at(-1);
  const uit = [];
  const zie = new Set();
  const voeg = (woord, soort) => {
    if (uit.length < max && !zie.has(woord)) {
      zie.add(woord);
      uit.push({ woord, soort });
    }
  };

  const volgers = (vorige, begin) =>
    [...(boek.paren.get(vorige) ?? [])].filter(([w]) => w.startsWith(begin)).sort((x, y) => y[1] - x[1]).map(([w]) => w);

  // Meer woorden: "curry saus" → currysaus, "wc papier" → toiletpapier, "halfvolle m" → halfvolle melk.
  if (delen.length > 1) {
    const samen = delen.join('');
    if (boek.aantal.has(samen)) voeg(samen, 'samen');
    for (const v of varianten(samen)) if (boek.aantal.has(v)) voeg(v, 'samen');
    for (const { woord } of boek.lijst) if (woord.startsWith(samen) && woord !== samen && uit.length < 2) voeg(woord, 'samen');
    const voorvoegsel = delen.slice(0, -1).join(' ') + ' ';
    // alleen woorden die in productnamen echt na het vorige woord komen
    for (const w of volgers(delen.at(-2), laatste)) voeg(voorvoegsel + w, 'begint');
    if (!uit.length && laatste.length >= 3) {
      const b = bedoelde(boek, laatste);
      if (b) voeg(voorvoegsel + b, 'bedoeld');
    }
    return uit;
  }
  if (laatste.length < 2) return uit;
  const voorvoegsel = '';

  // Precies het getypte woord bestaat? Dan die eerst. Is het een woord dat bijna altijd vóór iets staat
  // ("geraspte kaas", "griekse yoghurt"), dan ook de meest voorkomende combinaties.
  if (boek.aantal.has(laatste)) {
    voeg(laatste, 'begint');
    const daarna = boek.paren.get(laatste);
    const keerGevolgd = daarna ? [...daarna.values()].reduce((x, y) => x + y, 0) : 0;
    if (keerGevolgd >= 0.6 * boek.aantal.get(laatste))
      for (const w of volgers(laatste, '').slice(0, 3)) voeg(`${laatste} ${w}`, 'begint');
  }
  // Woorden die zo beginnen (curry → currysaus), op hoe vaak ze voorkomen.
  const begint = boek.lijst.filter(({ woord }) => woord.startsWith(laatste));
  for (const { woord } of begint) voeg(voorvoegsel + woord, 'begint');
  // Bestaat het woord niet en begint er ook niets zo? Dan is het waarschijnlijk een typefout: "brod" → brood.
  if (!begint.length && !boek.aantal.has(laatste) && laatste.length >= 3) {
    const b = bedoelde(boek, laatste);
    if (b) {
      voeg(voorvoegsel + b, 'bedoeld');
      for (const { woord } of boek.lijst) if (woord.startsWith(b) && uit.length < 3) voeg(voorvoegsel + woord, 'bedoeld');
    }
  }
  // Samenstellingen die zo eindigen, vanaf 4 letters (saus → knoflooksaus).
  if (laatste.length >= 4) for (const { woord } of boek.lijst) if (woord.endsWith(laatste) && woord !== laatste) voeg(voorvoegsel + woord, 'bevat');
  return uit;
}

/** Bedoelde-je voor een hele zoekterm ("pindakaaas met stukjes" → "pindakaas met stukjes"), of null. */
export function bedoeldeTerm(boek, term) {
  let veranderd = false;
  const nieuw = woorden(term).map((w) => {
    const b = bedoelde(boek, w);
    if (b) veranderd = true;
    return b ?? w;
  });
  return veranderd ? nieuw.join(' ') : null;
}
