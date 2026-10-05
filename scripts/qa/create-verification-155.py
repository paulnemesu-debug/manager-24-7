"""Render the current 1.5.5 verification JSON as a reviewable PDF."""
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[2]
REPORT = json.loads((ROOT / 'VERIFICARE-1.5.5.json').read_text())
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'output/pdf/manager24-7-v1.5.5-verificare.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
FONT = Path('/usr/share/fonts/truetype/dejavu')
pdfmetrics.registerFont(TTFont('DejaVu', str(FONT/'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuBold', str(FONT/'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('DejaVu', normal='DejaVu', bold='DejaVuBold')
NAVY = colors.HexColor('#062544')
GOLD = colors.HexColor('#DCA919')
TEAL = colors.HexColor('#0B6A68')
LINE = colors.HexColor('#DDE4E7')
WIDTH = A4[0] - 84
styles = {
    'title': ParagraphStyle('title', fontName='DejaVuBold', fontSize=25, leading=32, textColor=NAVY, spaceAfter=12),
    'h': ParagraphStyle('h', fontName='DejaVuBold', fontSize=15, leading=20, textColor=NAVY, spaceBefore=12, spaceAfter=8),
    'body': ParagraphStyle('body', fontName='DejaVu', fontSize=10, leading=15, textColor=NAVY, spaceAfter=8),
    'small': ParagraphStyle('small', fontName='DejaVu', fontSize=8.5, leading=12, textColor=NAVY, spaceAfter=6),
    'cell': ParagraphStyle('cell', fontName='DejaVu', fontSize=8.8, leading=12.6, textColor=NAVY),
    'white': ParagraphStyle('white', fontName='DejaVuBold', fontSize=8.8, leading=12, textColor=colors.white),
    'metric': ParagraphStyle('metric', fontName='DejaVuBold', fontSize=20, leading=25, textColor=NAVY, alignment=TA_CENTER),
    'label': ParagraphStyle('label', fontName='DejaVu', fontSize=9, leading=13, textColor=TEAL, alignment=TA_CENTER),
}
story = []


def p(text, style='body'):
    return Paragraph(text, styles[style])


def add(text, style='body'):
    story.append(p(text, style))


def table(headers, rows, widths):
    data = [[p(escape(x), 'white') for x in headers]]
    data += [[p(escape(str(x)), 'cell') for x in row] for row in rows]
    result = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    result.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#F3F7F6'), colors.white]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 2, GOLD),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
    ]))
    story.append(result)
    story.append(Spacer(1, 10))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(2)
    canvas.line(42, A4[1]-43, A4[0]-42, A4[1]-43)
    canvas.setFont('DejaVuBold', 9)
    canvas.setFillColor(NAVY)
    canvas.drawString(42, A4[1]-31, 'MANAGER 24/7  |  PARADIM')
    canvas.setFont('DejaVu', 8)
    canvas.drawString(42, 27, 'Verificare 1.5.5  |  4 octombrie 2026  |  © PARADIM Operations SRL')
    canvas.drawRightString(A4[0]-42, 27, str(doc.page))
    canvas.restoreState()


apk = REPORT['android_apk']
apk_label = 'Build complet' if apk['full_gradle_build'] else ('Build nereușit' if apk['status']=='build_failed' else 'Build în lucru')
add('Verificare funcțională<br/>Versiunea 1.5.5', 'title')
add('Rezultatele implementării și ale simulărilor. Android versionCode 59; iOS build 30. Probele pe telefon fizic sunt separate de testele cu adaptoare.')
metric = Table([
    [p('376 / 376', 'metric'), p('47 / 47', 'metric')],
    [p('teste automate trecute', 'label'), p('scenarii pe componente trecute', 'label')],
    [p('160 / 479', 'metric'), p(apk_label, 'metric')],
    [p('modele cu toate cele 9 valori numerice', 'label'), p('starea compilării Android', 'label')],
], colWidths=[WIDTH/2]*2)
metric.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#F4E6B9')),
    ('BOX',(0,0),(-1,-1),0.7,GOLD),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
story.append(metric)
add('Plusul adus în această versiune', 'h')
for text in [
    '<b>Nutriție gratuită offline:</b> 83 denumiri exacte adăugate și 12 aliasuri generice marcate ca estimări. Acoperirea completă numeric crește de la 110 la 160 modele.',
    '<b>Simulator pe ingredient:</b> gramaj, preț și furnizor alternativ, fără modificarea rețetei salvate.',
    '<b>Factură confirmată:</b> selecție explicită, preț și produs corectabile, apoi învățarea potrivirii cu furnizorul, inclusiv după reconectare.',
    '<b>Meniu și prețuri:</b> alerte pentru depășirea țintei, efectul semipreparatelor și maximum trei acțiuni bazate pe vânzări și marjă.',
    '<b>Stabilitate:</b> integrare Sentry și plugin Expo pentru păstrarea pornirii opace, temei light, camerei și configurației de semnare.',
]: add(text)
add('Limitele pentru lansare', 'h')
add('OTP real, plata, camera, uploadul fotografiei, PDF-ul nativ și partajarea nu au fost probate pe telefon. Sentry este dezactivat până la configurarea DSN-ului. Achizițiile native Google Play sunt dezactivate în sursa curentă. Auditul păstrează 33 vulnerabilități: 21 high, 12 moderate, 0 critical.', 'small')

story.append(PageBreak())
add('Funcțiile aplicației', 'title')
table(['Flux', 'Probă executată', 'Probă rămasă'], [
    ['Înregistrare și OTP', 'Email valid/invalid, cooldown, cod expirat și rutare după succes cu serviciu simulat.', 'Livrare OTP și sesiune live pe telefon.'],
    ['Foldere cu fotografii', 'Patru imagini distincte; grilă 2×2 la patru dimensiuni; fonturi mari; înapoi Android și stare păstrată.', 'Aspect și interacțiune pe telefoane reale.'],
    ['Rețete și schițe', 'Salvare, redeschidere, recuperare, conflict și revenire în Rețetele mele.', 'Recitire și sincronizare într-un cont QA live.'],
    ['Bibliotecă, bulk, planificare', 'Modele, scalare, calcule și listă de cumpărături prin teste automate.', 'Fluxul tactil complet pe telefon.'],
    ['Fotografii de rețetă', 'Refuz/anulare, păstrare în schiță după redeschidere și eliminare explicită.', 'Cameră/galerie reală și upload autentificat.'],
    ['HACCP și favorite', 'Favorite pe cont, căutare cu diacritice, eșec de stocare și acces la toate formularele.', 'Notificări și completări pe dispozitiv.'],
    ['HR, P&L, producție', 'Calcule, documente și exporturi din suita automată.', 'Înregistrări operaționale QA live.'],
    ['Excel și PDF', 'XLSX real scris și redeschis; HTML și conținut PDF generate de aplicație.', 'PDF nativ și partajare/deschidere pe Android.'],
    ['Cont și abonament', 'Izolarea datelor și rutele în cod/teste; checkout web pentru distribuție directă.', 'Tranzacție și acces recitit. Google Play nativ este dezactivat.'],
], [101, 211, WIDTH-312])
add('376 de teste în 61 fișiere; 47 scenarii pe componente. Adaptoarele pentru autentificare, cameră, stocare și cloud simulează interfețele externe. Nu reprezintă confirmarea unui dispozitiv fizic.', 'small')
add('TypeScript și lint au trecut. Exportul Android Hermes cu source maps a trecut. Verificarea Expo folosește metadatele SDK locale; modul offline nu verifică actualizări noi pe server.', 'small')

story.append(PageBreak())
add('Fluxuri comerciale și nutriție', 'title')
table(['Flux', 'Ce s-a verificat', 'Limită'], [
    ['Scanare', 'Două cereri live fără autentificare sau cu token invalid: ambele respinse cu 401.', 'Nu s-a făcut OCR pe un document real.'],
    ['Import factură', 'Confirmare obligatorie, modificare invalidând confirmarea, preț negativ, monedă străină și duplicate.', 'Precizia OCR și importul în faze separate nu sunt certificate.'],
    ['Potriviri furnizor', 'METRO/Selgros, asociere manuală și editări locale păstrate peste copia cloud veche.', 'Recitire QA live cu facturi reale.'],
    ['Alerte și simulator', 'Gramaj/preț/furnizor, semipreparate, țintă depășită și efect net al lotului. Rețeta salvată rămâne intactă.', 'Istoricul cloud există; istoricul offline nu a fost extins.'],
    ['Menu engineering', 'Vânzări lipsă/zero, marjă, top trei acțiuni, import Porții și deschiderea simulatorului.', 'Impact aritmetic pentru perioada introdusă, fără prognoză.'],
], [95, 230, WIDTH-325])
add('Nutriție automată fără abonament de date', 'h')
table(['Indicator', 'Anterior', '1.5.5'], [
    ['Modele cu toate cele 9 valori', '110 / 479', '160 / 479'],
    ['Rânduri asociate automat', '3.505 / 4.102', '3.704 / 4.102'],
    ['Rânduri complete și convertibile', '3.402 / 4.102', '3.600 / 4.102'],
    ['Denumiri exacte', '855', '938'],
    ['Denumiri generice orientative', '0', '12'],
], [WIDTH-200, 100, 100])
add('ANSES-Ciqual 2025: 3.484 alimente, nouă componente, licența Etalab 2.0. Costul licenței bazei și al calculului local este 0. Sursa: https://doi.org/10.57745/RDMHWY', 'small')
add('Smântâna, oul melanj, sosul de roșii și vinul alb pot primi valori generice neconfirmate. Eticheta produsului real are prioritate. Borșul proaspăt, conversiile fără masă/densitate și nutrienții necunoscuți rămân de completat. Acoperirea numerică nu este o certificare a preciziei.', 'small')

story.append(PageBreak())
add('Build și probele live rămase', 'title')
if apk['full_gradle_build']:
    add('<b>APK 1.5.5 / build 59 generat prin Gradle.</b> Pachet arm64 pentru test, 47,36 MB; semnătură v2, CRC ZIP și aliniere ZIP/ELF la 16 KB verificate. Folosește cheia publică Android Debug, cu același certificat ca APK-ul 1.5.4. Instalarea și folosirea pe telefon nu au fost probate.')
elif apk['status']=='build_failed':
    add('<b>APK nou negenerat.</b> Buildul Gradle complet s-a oprit: '+escape(apk.get('failure_reason','rezolvarea dependențelor native nu s-a încheiat.')))
else:
    add('<b>Build Android în lucru.</b> Acest exemplar este o previzualizare a raportului și va fi actualizat după încheierea compilării.')
add('Java 17, Gradle 9.3.1, SDK și Build Tools 36, NDK 27.1.12297006. Codul nativ Sentry Java/NDK și bundle-ul actual au fost verificate în noul APK. Inventarul ADB nu conține telefoane. Nu s-a compilat un binar iOS.', 'small')
add('Sentry', 'h')
add('SDK-ul React Native 7.11.0 este integrat; fără EXPO_PUBLIC_SENTRY_DSN rămâne oprit. Configurarea și încărcarea source maps cer proiectul Sentry și tokenul privat în mediul de build. Pe un build de test, verifică atât o excepție JavaScript, cât și un crash nativ, urmate de redeschidere și confirmarea evenimentului în Sentry. Capturarea crashurilor anterioare inițializării JavaScript nu este demonstrată.')
add('Ce trebuie probat pe două-trei telefoane', 'h')
for text in [
    '<b>1. Intrare și persistență:</b> instalare, pornire la rece, OTP real, reluare după repornire și cont QA separat.',
    '<b>2. Cameră și documente:</b> refuz/acordare permisiuni, fotografie salvată și recitită, PDF/foto METRO, Selgros și distribuitor local, corectare și confirmare.',
    '<b>3. Operațiuni:</b> actualizare de preț și alertă, simulator fără salvare, Excel/PDF cu partajare, editare offline și reconectare, favorit HACCP și notificare.',
    '<b>4. Abonament și crash:</b> checkout și recitirea accesului; eveniment Sentry primit cu release 1.5.5+59 și distribuție Android 59. Google Play nativ cere întâi implementarea adaptorului.',
]: add(text)
add('Servicii și dependențe', 'h')
add('Scannerul publicat este ACTIVE v3, verify_jwt=true; codul verifică utilizatorul, accesul profesional și cota atomică. Nu au fost modificate servicii sau migrări în producție. Modelul Anthropic efectiv din secretul de deploy nu a fost verificat.', 'small')
add('Expo 57.0.26 și React Native 0.86.3. Audit: 33 vulnerabilități, predominant în lanțul de build; fără analiză completă de exploatabilitate. Nu s-au forțat schimbări incompatibile pentru reducerea raportului.', 'small')
add('Evidență în sursă: VERIFICARE-1.5.5.json, RELEASE-1.5.5.md, SENTRY-SETUP.md, qa-results/validation-1.5.5 și rapoartele scenariilor. Plata reală și ștergerea unui cont de producție nu au fost executate.', 'small')

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=42, leftMargin=42,
    topMargin=65, bottomMargin=47, title='MANAGER 24/7 - verificare 1.5.5',
    author='PARADIM Operations SRL', pageCompression=1)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(str(OUTPUT))
