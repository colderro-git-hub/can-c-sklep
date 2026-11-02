// Linki do śledzenia przesyłek
export function trackingUrl(carrier: string | null | undefined, nr: string) {
  const c = (carrier || '').toLowerCase();
  const n = encodeURIComponent(nr);
  if (c.includes('dpd')) return `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${n}`;
  if (c.includes('inpost') || c.includes('paczkomat')) return `https://inpost.pl/sledzenie-przesylek?number=${n}`;
  if (c.includes('dhl')) return `https://www.dhl.com/pl-pl/home/sledzenie-przesylek.html?tracking-id=${n}`;
  if (c.includes('poczta') || c.includes('pocztex')) return `https://emonitoring.poczta-polska.pl/?numer=${n}`;
  if (c.includes('gls')) return `https://gls-group.com/PL/pl/sledzenie-paczek?match=${n}`;
  if (c.includes('ups')) return `https://www.ups.com/track?loc=pl_PL&tracknum=${n}`;
  if (c.includes('orlen')) return `https://www.orlenpaczka.pl/sledz-paczke/?numer=${n}`;
  return 'https://furgonetka.pl/zlokalizuj';
}

export const carrierLabel = (carrier: string | null | undefined) => {
  const c = (carrier || '').toLowerCase();
  if (c.includes('inpost')) return 'InPost';
  if (c.includes('dpd')) return 'DPD';
  if (c.includes('dhl')) return 'DHL';
  if (c.includes('poczta')) return 'Poczta Polska';
  if (c.includes('orlen')) return 'ORLEN Paczka';
  return carrier || 'kurier';
};
