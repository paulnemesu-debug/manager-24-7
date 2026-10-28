import { ALLERGEN_LABELS, type Allergen } from '@/constants/allergens';
import { translate, type Locale } from '@/i18n/translations';

export type HaccpLabelSize = '50x30' | '40x60';

type LabelInput = {
  title: string;
  allergens: readonly Allergen[];
  producedAt: Date;
  expiresAt: Date;
  size: HaccpLabelSize;
  locale: Locale;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

// Courier's Latin glyphs occupy 0.6 em. Reserve a full em for other glyphs,
// including fallback fonts; explicit lines never depend on browser word wrap.
function wrapLabelText(value: string, columns: number) {
  const characters = Array.from(value.normalize('NFC').replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  let line = '', cells = 0;
  const cellWidth = (character: string) => /^[\u0020-\u024f]$/.test(character) ? 1 : 2;
  for (const character of characters) {
    const width = cellWidth(character);
    if (cells + width > columns) {
      const lastSpace = line.lastIndexOf(' ');
      if (lastSpace > 0) {
        lines.push(line.slice(0, lastSpace)); line = line.slice(lastSpace + 1);
        cells = Array.from(line).reduce((sum, letter) => sum + cellWidth(letter), 0);
      } else { lines.push(line.trimEnd()); line = ''; cells = 0; }
    }
    if (!line && character === ' ') continue;
    line += character; cells += width;
  }
  if (line) lines.push(line);
  return lines;
}

/** A fixed-size label is printable only when every required line fits. */
export function buildHaccpLabelHtml(input: LabelInput) {
  const { size, locale } = input;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const failFit = () => new Error(locale === 'ro'
    ? `Conținutul nu încape integral pe eticheta ${size === '50x30' ? '50 × 30' : '40 × 60'} mm. ${size === '50x30' ? 'Alege formatul 40 × 60 mm sau folosește' : 'Folosește'} un titlu de rețetă mai scurt. Data expirării și alergenii trebuie să rămână complet vizibili.`
    : `The content does not fit on the ${size === '50x30' ? '50 × 30' : '40 × 60'} mm label. ${size === '50x30' ? 'Choose 40 × 60 mm or use' : 'Use'} a shorter recipe title. The expiry date and all allergens must remain fully visible.`);
  if (!input.title.trim()) throw failFit();
  if (![input.producedAt, input.expiresAt].every(date => Number.isFinite(date.getTime()))) {
    throw new Error(locale === 'ro' ? 'Verifică data, ora producției și termenul de valabilitate.' : 'Check the production date, time and shelf life.');
  }
  const [width, height] = size === '50x30' ? [50, 30] : [40, 60];
  // 1.5 mm page margins, 0.45 mm border and 1.6 mm padding on each side.
  const contentWidthPt = (width - 3 - .9 - 3.2) * 72 / 25.4;
  const contentHeightPt = (height - 3 - .9 - 3.2) * 72 / 25.4;
  const titleSize = size === '50x30' ? 9 : 10;
  const bodySize = size === '50x30' ? 6 : 7;
  const titleLineHeight = titleSize * 1.2;
  const bodyLineHeight = bodySize * 1.2;
  const columns = (fontSize: number) => Math.floor((contentWidthPt - 2) / (fontSize * .6));
  const title = wrapLabelText(input.title, columns(titleSize));
  // Leave the majority of each label available for dates and the full allergen declaration.
  if (title.length > (size === '50x30' ? 2 : 3)) throw failFit();
  const timestamp = (date: Date) => new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  const allergens = input.allergens.length
    ? input.allergens.map(allergen => ALLERGEN_LABELS[locale][allergen]).join(', ')
    : t('haccp.noneDeclared');
  const blocks = [
    wrapLabelText(`${t('haccp.produced')}: ${timestamp(input.producedAt)}`, columns(bodySize)),
    wrapLabelText(`${t('haccp.expires')}: ${timestamp(input.expiresAt)}`, columns(bodySize)),
    wrapLabelText(`${t('haccp.allergens')}: ${allergens}`, columns(bodySize)),
  ];
  const requiredHeightPt = 6 + 2 + title.length * titleLineHeight + 2
    + blocks.reduce((sum, lines) => sum + lines.length * bodyLineHeight, 0) + 4;
  if (requiredHeightPt > contentHeightPt - 2) throw failFit();
  const linesHtml = (lines: string[]) => lines.map(line => `<span>${escapeHtml(line)}</span>`).join('');
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
    @page { size: ${width}mm ${height}mm; margin: 1.5mm; }
    * { box-sizing: border-box; }
    html, body { width: ${width - 3}mm; margin: 0; padding: 0; }
    body { font-family: "Courier New", Courier, monospace; color: #031B33; }
    section { width: 100%; height: ${height - 3}mm; border: .45mm solid #062544; border-radius: 1.5mm; padding: 1.6mm; }
    span { display: block; white-space: pre; }
    .brand { font-size: 5pt; line-height: 6pt; color: #667482; }
    h1 { font-size: ${titleSize}pt; line-height: ${titleLineHeight}pt; font-weight: normal; margin: 2pt 0; }
    p { font-size: ${bodySize}pt; line-height: ${bodyLineHeight}pt; margin: 0; }
    .allergens { margin-top: 2pt; border-top: .5pt solid #D5A640; padding-top: 1.5pt; }
  </style></head><body><section><div class="brand">PARADIM · MANAGER 24/7</div>
  <h1>${linesHtml(title)}</h1><p>${linesHtml(blocks[0])}</p><p>${linesHtml(blocks[1])}</p><p class="allergens">${linesHtml(blocks[2])}</p>
  </section></body></html>`;
}
