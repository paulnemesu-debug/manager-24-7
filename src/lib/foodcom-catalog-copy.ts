import type { FoodcomLocale } from '@/lib/foodcom-catalog';

const copy = {
  ro: {
    title: 'Catalog Food.com', subtitle: '522.517 rețete de referință · sursă în limba engleză',
    open: 'Explorează catalogul Food.com', local: 'Modelele locale rămân disponibile separat.',
    downloadTitle: 'Biblioteca completă, disponibilă offline',
    nativeSize: 'Descărcare: aproximativ 314 MB. Rezervă 800 MB pentru instalare; biblioteca ocupă aproximativ 366 MB după instalare.',
    webSize: 'Descărcare: aproximativ 153 MB. Rezervă 1 GB de spațiu în browser. Biblioteca este păstrată pe acest dispozitiv; ștergerea datelor browserului o elimină.',
    download: 'Descarcă biblioteca completă', resume: 'Descarcă / reia instalarea', pause: 'Pauză', ready: 'Biblioteca completă este disponibilă offline',
    remove: 'Elimină descărcarea', removeNote: 'Copiile salvate în Rețetele mele rămân păstrate.',
    downloading: 'Se descarcă', installing: 'Se instalează', verifying: 'Se verifică biblioteca',
    search: 'Caută după titlu sau categorie, în engleză', searchHint: 'Exemple: chicken, soup, dessert. Căutarea folosește începutul cuvintelor.',
    empty: 'Nicio rețetă pentru această căutare.', previous: 'Pagina anterioară', next: 'Pagina următoare', back: 'Înapoi', retry: 'Încearcă din nou',
    sourceWarning: 'Acesta este un catalog de referință. Setul de date nu include unitățile cantităților sau greutatea porției; lista ingredientelor poate fi incompletă. Verifică sursa înainte de utilizare.',
    mismatch: 'Cantitățile și ingredientele nu au același număr de elemente. Listele sunt păstrate separat; asocierea lor nu este cunoscută.',
    sourceServings: 'Porții în sursă', sourceYield: 'Randament în sursă', unknown: 'necunoscut',
    ingredients: 'Denumiri de ingrediente în sursă', quantities: 'Cantități originale, fără unități', quantitiesNote: 'Această listă nu atribuie cantități ingredientelor de mai sus.',
    instructions: 'Instrucțiuni originale', nutrition: 'Nutriție per porție în sursă', nutritionNote: 'Valori neverificate, păstrate ca referință. Greutatea porției lipsește; nu sunt valori per 100 g și nu se recalculează când editezi copia.',
    use: 'Creează o copie de completat', useNote: 'Completează cantitățile, unitățile, prețurile, alergenii și datele nutriționale ale ingredientelor. Valorile sursei rămân în note; editorul nu permite salvarea ingredientelor fără cantități pozitive.',
    noServings: 'Numărul de porții lipsește. Copia începe cu o porție provizorie; corecteaz-o în editor.',
    source: 'Deschide rețeta originală', licence: 'Kaggle v2 · CC0 declarat de autorul setului de date',
    missing: 'Această rețetă nu este disponibilă în biblioteca descărcată.',
    loading: 'Se încarcă', unavailable: 'Descărcarea nu este disponibilă momentan. Verifică internetul și încearcă din nou.',
    failed: 'Biblioteca nu a putut fi încărcată. Încearcă din nou.', space: 'Spațiul disponibil este insuficient. Eliberează spațiu și reia instalarea.',
    checksum: 'Fișierul descărcat nu a trecut verificarea. Reia descărcarea.', unsupported: 'Acest browser nu oferă stocarea sigură necesară. Folosește un browser actualizat sau aplicația mobilă.',
    notInstalled: 'Descarcă biblioteca completă înainte de a deschide rețeta.', busy: 'Biblioteca este folosită în altă fereastră. Închide acea fereastră și încearcă din nou.',
  },
  en: {
    title: 'Food.com catalogue', subtitle: '522,517 reference recipes · original English content',
    open: 'Explore the Food.com catalogue', local: 'The local templates remain available separately.',
    downloadTitle: 'The complete library, available offline',
    nativeSize: 'Download: about 314 MB. Allow 800 MB for installation; the library uses about 366 MB afterwards.',
    webSize: 'Download: about 153 MB. Allow 1 GB of browser storage. The library is kept on this device; clearing browser data removes it.',
    download: 'Download the complete library', resume: 'Download / resume installation', pause: 'Pause', ready: 'The complete library is available offline',
    remove: 'Remove downloaded library', removeNote: 'Copies saved in My recipes are kept.',
    downloading: 'Downloading', installing: 'Installing', verifying: 'Checking the library',
    search: 'Search recipe titles or categories in English', searchHint: 'Examples: chicken, soup, dessert. Search matches word beginnings.',
    empty: 'No recipes match this search.', previous: 'Previous page', next: 'Next page', back: 'Back', retry: 'Try again',
    sourceWarning: 'This is a reference catalogue. The dataset has no quantity units or serving weight; ingredient lists may be incomplete. Check the original source before use.',
    mismatch: 'Quantity and ingredient lists have different lengths. They are retained separately; their pairing is unknown.',
    sourceServings: 'Source servings', sourceYield: 'Source yield', unknown: 'unknown',
    ingredients: 'Source ingredient names', quantities: 'Original quantities, without units', quantitiesNote: 'This list does not assign amounts to the ingredient names above.',
    instructions: 'Original instructions', nutrition: 'Nutrition per source serving', nutritionNote: 'Unverified values retained for reference. Serving weight is absent; these are not values per 100 g and do not recalculate when you edit the copy.',
    use: 'Create a copy to complete', useNote: 'Enter ingredient quantities, units, prices, allergens and nutrition. Source values remain in notes; the editor prevents saving ingredients without positive quantities.',
    noServings: 'The number of servings is missing. The copy starts with one provisional serving; correct it in the editor.',
    source: 'Open the original recipe', licence: 'Kaggle v2 · CC0 declared by the dataset uploader',
    missing: 'This recipe is not available in the downloaded library.',
    loading: 'Loading', unavailable: 'The download is currently unavailable. Check your connection and try again.',
    failed: 'The library could not be loaded. Try again.', space: 'There is not enough storage. Free some space and resume installation.',
    checksum: 'The downloaded file did not pass verification. Download it again.', unsupported: 'This browser does not provide the required secure storage. Use an updated browser or the mobile app.',
    notInstalled: 'Download the complete library before opening this recipe.', busy: 'The library is in use in another window. Close that window and try again.',
  },
};
export function foodcomCopy(locale: FoodcomLocale) { return copy[locale]; }
export function foodcomError(error: unknown, locale: FoodcomLocale): string {
  const text = String(error instanceof Error ? error.message : error);
  const messages = copy[locale];
  if (/STORAGE_SPACE|QuotaExceeded/i.test(text)) return messages.space;
  if (/CHECKSUM|INVALID_MANIFEST|INVALID_RECIPE/.test(text)) return messages.checksum;
  if (/UNSUPPORTED/.test(text)) return messages.unsupported;
  if (/NOT_INSTALLED/.test(text)) return messages.notInstalled;
  if (/BUSY/.test(text)) return messages.busy;
  if (/DOWNLOAD_UNAVAILABLE|fetch|network|Failed to fetch/i.test(text)) return messages.unavailable;
  return messages.failed;
}
