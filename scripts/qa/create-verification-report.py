from pathlib import Path
import json
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether

PROJECT = Path(__file__).resolve().parents[2]
REPORT = json.loads((PROJECT / 'VERIFICARE-1.5.3.json').read_text())
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / 'output/pdf/manager24-7-v1.5.3-verificare.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
font_pairs = [
    (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
]
regular, bold = next((pair for pair in font_pairs if all(path.exists() for path in pair)), (None, None))
if regular is None:
    raise RuntimeError('Install DejaVu Sans or Arial before generating the report.')
pdfmetrics.registerFont(TTFont('QA', str(regular)))
pdfmetrics.registerFont(TTFont('QA-Bold', str(bold)))
NAVY, GOLD, TEAL = colors.HexColor('#062544'), colors.HexColor('#C29A3C'), colors.HexColor('#13756F')
MUTED, LINE, SOFT = colors.HexColor('#5D6B76'), colors.HexColor('#DDE4E8'), colors.HexColor('#F3F6F6')
WIDTH = 178 * mm
styles = {
    'body': ParagraphStyle('body', fontName='QA', fontSize=9.2, leading=12.8, textColor=NAVY, spaceAfter=5),
    'small': ParagraphStyle('small', fontName='QA', fontSize=8.1, leading=11.3, textColor=MUTED, spaceAfter=4),
    'cell': ParagraphStyle('cell', fontName='QA', fontSize=8.7, leading=12, textColor=NAVY),
    'headcell': ParagraphStyle('headcell', fontName='QA-Bold', fontSize=8, leading=11, textColor=colors.white),
    'h1': ParagraphStyle('h1', fontName='QA-Bold', fontSize=23, leading=28, textColor=NAVY, spaceAfter=10),
    'h2': ParagraphStyle('h2', fontName='QA-Bold', fontSize=15, leading=19, textColor=NAVY, spaceAfter=9),
    'h3': ParagraphStyle('h3', fontName='QA-Bold', fontSize=10, leading=14, textColor=TEAL, spaceBefore=8, spaceAfter=6),
}

def p(text, style='body'):
    return Paragraph(escape(str(text)).replace('\n', '<br/>'), styles[style])

def table(headers, rows, widths=None):
    data = [[p(item, 'headcell') for item in headers]] + [[p(item, 'cell') for item in row] for row in rows]
    t = Table(data, colWidths=widths or [41*mm, 22*mm, 115*mm], repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY), ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LINEBELOW', (0,0), (-1,0), 1, GOLD), ('LINEBELOW', (0,1), (-1,-1), .4, LINE),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, SOFT]),
    ]))
    return t

class PhotoTile(Flowable):
    def __init__(self, key, label):
        super().__init__(); self.key=key; self.label=label; self.width=85*mm; self.height=52*mm
    def draw(self):
        c=self.canv; w,h=self.width,41*mm; y=11*mm
        c.saveState(); clip=c.beginPath();clip.roundRect(0,y,w,h,3*mm);c.clipPath(clip,stroke=0)
        c.drawImage(str(PROJECT/f'assets/folders/{self.key}.jpg'),0,y-(w-h)/2,w,w,mask='auto')
        c.restoreState();c.setFont('QA-Bold',10);c.setFillColor(NAVY);c.drawString(1*mm,4*mm,self.label)

def photos(items):
    t=Table([[PhotoTile(*items[0]),PhotoTile(*items[1])],[PhotoTile(*items[2]),PhotoTile(*items[3])]], colWidths=[89*mm,89*mm])
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),3*mm)]))
    return t

def footer(c, doc):
    c.saveState();c.setStrokeColor(LINE);c.line(16*mm,17*mm,194*mm,17*mm)
    c.setFont('QA',7);c.setFillColor(MUTED);c.drawString(16*mm,12*mm,'MANAGER 24/7 by PARADIM | 1.5.3 / build 57 | 04.10.2026')
    c.drawRightString(194*mm,12*mm,str(doc.page));c.restoreState()

story=[]
def add(text,style='body'):story.append(p(text,style))
def page(title):story.append(PageBreak());add(title,'h2')

add('Raport de verificare','h1')
add('MANAGER 24/7 by PARADIM - versiunea 1.5.3 / Android 57','h3')
add('4 octombrie 2026. Scop: verificarea funcțiilor, foldere cu fotografii, grile compacte și favorite HACCP.')
story.append(table(['Teste automate','Scenarii pe componente','Rezultat'],[['336 în 56 fișiere','26 scenarii React','Zero eșecuri; TypeScript și lint trecute']], [58*mm,60*mm,60*mm]))
story.append(Spacer(1,4*mm))
add('Rețete: cele patru foldere','h3')
story.append(photos([('recipes','Rețete'),('mine','Rețetele mele'),('ingredients','Ingrediente'),('exports','Exporturi și alergeni')]))
add('Fotografiile de mai sus sunt activele incluse în aplicație; această planșă nu este o captură a ecranului Android. Cardurile aplicației sunt în grilă 2 x 2 și folosesc spațiul disponibil.','small')
add('Corecții găsite prin simulare','h3')
add('Exportul Excel HR nu se genera din cauza celulelor unite suprapuse în total. Scanarea în browser folosea citire nativă de fișiere. Pozele rețetelor puteau rămâne în fișiere temporare. Exporturile puteau anunța succes când partajarea lipsea. Aceste cazuri au fost corectate și retestate.')
add('APK pentru test. Codul nativ este păstrat din pachetul anterior. Simulările cu adaptoare nu confirmă funcționarea pe telefon, livrarea OTP, plățile sau scanarea AI reală.','small')

page('Cont și acces')
story.append(photos([('account','Contul meu'),('subscription','Abonament'),('security','Siguranță și date'),('about','Despre aplicație')]))
add('Patru foldere în grilă 2 x 2. Abonamentul are propriul folder; profilul, siguranța și informațiile aplicației sunt separate.','small')
story.append(table(['Flux','Stare','Ce s-a verificat / limita'],[
('Înregistrare / email','Simulat','Email invalid, normalizare, o singură cerere și deschiderea intrării OTP. Nu s-a trimis un email real.'),
('Cod OTP','Simulat','Cod invalid/expirat, reîncercare, limită de retrimitere și revenire prin ruta principală după confirmare.'),
('Demo / acces / abonament','Simulat','Expirare, cache separat pe cont, acces și canal direct versus Play. Achiziția și restaurarea reale rămân neconfirmate.'),
('Locații și echipă','Parțial','Logica de validare, filtre și recuperare este testată. Invitațiile și lucrul real între conturi nu au fost executate.'),
('Preferințe și limbă','Parțial','Formatări RO/EN și configurația existente trec testele. Selectarea interactivă și persistența pe telefon nu sunt confirmate.'),
('Export / ieșire / ștergere','Parțial','Export JSON testat. Ștergerea contului și ieșirea unei sesiuni reale nu au fost executate în această verificare.'),
]))

page('Rețete, ingrediente și producție')
story.append(table(['Flux','Stare','Ce s-a verificat / limita'],[
('Deschiderea folderelor','Simulat','Pagini separate; stare păstrată; buton Înapoi; revenire în Rețetele mele după salvare.'),
('Grila pe ecran','Simulat','320x568, 360x640, 390x844 și 768x1024. La font 1,8x se activează derularea. Layout-ul vizual Android este neconfirmat.'),
('Schițe de rețete','Simulat','Autosalvare, redeschidere, păstrare la conflict și confirmarea comparației cu versiunea de pe server.'),
('Calcul rețete / bulk','Simulat','Costuri, pierderi, porții, semipreparate, alergeni, nutriție și gramaj. Datele de intrare rămân responsabilitatea operatorului.'),
('Poze din cameră / galerie','Simulat','Refuz permisiune, anulare, optimizare, URI persistent, recuperare și eliminare explicită. Camera/galeria fizică nu sunt testate.'),
('Poze în cloud','Simulat + server','Bucket privat și politici verificate. Upload înainte de salvare; atașare cu versiune; la eșec se păstrează ID-ul confirmat și schița.'),
('Ingrediente / prețuri','Simulat','Unități și decimale, potriviri, prețuri, oferte și recuperare. XLSX real cu catalog după o foaie de parametri.'),
('Planificare / cumpărături','Simulat','Caută și adaugă preparatul; fără listă integrală inițială; schimbarea porțiilor actualizează lista; eliminarea preparatului o recalculează.'),
('Consum și facturi','Simulat','CSV/Excel, normalizare scanare, rânduri incomplete și confirmarea potrivirilor. Nu s-au modificat facturi reale.'),
('e-Factura','Local','Import XML UBL și respingerea XML nesigur sunt testate. Conectarea live ANAF/SPV nu este implementată.'),
('Inventar / stoc / furnizori','Simulat','Praguri, reaprovizionare, comenzi grupate, inventar și variație teoretic-real. Sincronizarea folosește adaptoare în teste.'),
('Etichete / partajare','Parțial','Generarea datelor este acoperită de testele sursei. Imprimanta, WhatsApp și dialogurile native nu au fost verificate.'),
]))

page('HACCP, analiză și recuperarea datelor')
add('HACCP este organizat în Azi, Formulare și Înregistrări. Înregistrările au patru foldere: arhivă/export, pregătire/setări, calendar de autocontrol și risipă/redistribuire.','body')
story.append(table(['Flux','Stare','Ce s-a verificat / limita'],[
('Toate formularele HACCP','Simulat','19 din 19 sunt accesibile prin paginare. Căutare după nume/cod, categorie, fără rezultate și diacritice.'),
('Formulare favorite','Simulat','Steaua nu deschide formularul; selecția se păstrează după redeschidere, separat pe cont. Eșecul stocării păstrează selecția anterioară.'),
('Domeniul favoritelor','Local','Favorite pe acest dispozitiv, incluse în JSON. Nu se sincronizează automat între două telefoane.'),
('Rutina Azi','Simulat','Sarcini, temperaturi, acțiuni corective, locații și echipamente. Nicio măsurătoare sau semnătură reală nu a fost inventată.'),
('Schițe și confirmare','Simulat','Precompletarea este schiță; exportul elimină temperaturile și semnăturile neconfirmate.'),
('Arhivă / PDF control','Simulat','Filtru după luna logică, locație, 19 formulare HTML și pachet de control. Randarea native Print nu este confirmată.'),
('Calendar / reamintiri','Simulat','Import Excel real, dată/oră păstrate, evenimente și recuperare. Permisiunile și livrarea notificărilor native rămân neconfirmate.'),
('Risipă / redistribuire','Simulat','Validări, plan, transferuri, stare, filtre și cele trei exporturi. Nu s-au depus documente la autorități.'),
('HR / pontaj','Simulat','O înregistrare pe angajat/zi, ture peste miezul nopții, salarii active, recuperare și ștergeri în așteptare.'),
('P&L / Profit Health','Simulat','Rezultate, marje, costuri, lipsa datelor și ordinea acțiunilor prioritare pentru luna selectată.'),
('Sincronizare offline','Simulat','Cozi, operații concurente, remapare ID, conflicte și schițe recuperabile. Pierderea răspunsului unei inserări înainte de confirmare nu este validată live.'),
('Raportare erori','Simulat','Erori JS/React, reluare și eliminarea informațiilor sensibile. Crash-urile native Android nu sunt acoperite.'),
]))

page('Exporturi și scanări')
add('Fișierele XLSX au fost generate de exportatorii aplicației și redeschise. Pentru PDF s-au executat exportatorii și s-a inspectat HTML-ul; tipărirea și partajarea native au adaptoare.','body')
story.append(table(['Export','Stare','Rezultat'],[
('Rețetă PDF / Excel','Simulat','Conținut, nume de fișier sigur și text escapate; XLSX real redeschis.'),
('Rețetar PDF / Excel','Simulat','Rețete multiple și workbook real redeschis; traseu de tipărire executat.'),
('Meniu alergeni PDF','Simulat','Generare și export; alergeni per preparat și ingrediente verificați în teste.'),
('Pontaj Excel','Real XLSX','Matrice și fișă individuală; intrare 08:15, ieșire 16:45 și total 8,5 ore în datele fictive QA.'),
('Pontaj PDF','Simulat','Matricea lunară de sinteză, angajat, perioadă și total ore. PDF-ul curent nu include foile individuale din Excel.'),
('HACCP individual / pachet','Simulat','19 formulare și dosar; schițele nu exportă măsurători neconfirmate.'),
('Risipă: trei PDF-uri','Simulat','Plan anual, raport redistribuire și dosar complet; nume și conținut generate.'),
('Cont JSON','Simulat','JSON valid în Android și download în web; acoperirea datelor este indicată. Fotografii ca referințe, fără binare.'),
('Partajare indisponibilă','Simulat','Toate cele 13 familii de export raportează eroare, fără succes fals.'),
('Scanare factură / consum','Simulat','Citire web/native, PDF/imagine, răspuns valid/invalid, autentificare, acces, limită zilnică și limită de frecvență.'),
('Limite pentru scanare','Verificat','Fotografie 8 MB după optimizare; PDF 18 MB; fotografie rețetă 5 MB. Se verifică dimensiunea reală a fișierului.'),
('Scanare AI reală','De testat','La ultima verificare anterioară lipsea cheia furnizorului. Nu s-a activat și nu s-a evaluat transcrierea unei facturi reale în această sesiune.'),
]))
add('Evidență reproductibilă','h3')
add('Sursa include qa-results/tests.json, rezultatele celor trei simulări React și exporturi cu date fictive. Comenzi: npm test, npm run typecheck, npm run lint, npm run qa:flows.','small')

page('Pachetul livrat și verificări rămase')
story.append(table(['Control tehnic','Stare','Rezultat'],[
('Android / versiune','Verificat','1.5.3, versionCode 57; pachet ro.paradim.professionalfoodcost.'),
('APK / Hermes','Verificat','ZIP fără erori; bytecode Hermes valid; semnături v2/v3 și aliniere 16 KB.'),
('Cod nativ / resurse','Păstrat','25 biblioteci native și 53 active identice cu baza; cheia de test coincide cu APK 1.5.2. Fără rebuild Gradle complet.'),
('Server: scanare','Verificat','Funcție versiunea 3 activă, verify_jwt=true. Acesta confirmă configurația, nu transcrierea AI reală.'),
('Server: fotografii','Verificat','Bucket privat, limită 5 MiB, patru politici. Atașarea atomică în RPC nu este activă.'),
('Migrare fotografii','Neaplicat','SQL pregătit în sursă; aplicarea a eșuat cu Invalid or expired requestState. Clientul utilizează atașarea compatibilă cu verificarea versiunii.'),
]))
add('SHA-256 al APK-ului','h3')
add(REPORT['apk_sha256'],'small')
add('Verificări necesare înainte de distribuția către clienți','h3')
for text in [
    '1. Build Gradle complet și instalare pe 2-3 telefoane, inclusiv pornire la rece și revenire din fundal. În acest mediu nu există Android Studio, SDK, adb, emulator sau acces la desktopul laptopului.',
    '2. Înregistrare reală: primire OTP, copiere cod, sesiune după repornire, ieșire și acces după expirarea abonamentului.',
    '3. Cameră și galerie reale: acceptare/refuz permisiune, anulare, fotografie mare, repornire, sincronizare, înlocuire și eliminare pe contul de test.',
    '4. Activare scanare AI și documente de test clare/neclare, PDF cu mai multe pagini, unități de ambalaj și verificarea sumelor. Până atunci, importul Excel/CSV/XML și introducerea manuală rămân disponibile.',
    '5. Deschidere și partajare PDF/Excel pe telefon, imprimare etichete, notificări la ora aleasă și grilele cu fonturi mărite.',
    '6. Achiziție și restaurare în mediul de test Google Play, lucru între două conturi/dispozitive și fluxul de ștergere pe un cont dedicat.'
]:add(text,'small')
add('Stare finală: modificările și verificarea automată sunt finalizate. Validarea completă pe dispozitiv și a serviciilor externe rămâne deschisă. Browserul disponibil a blocat previzualizarea locală; această versiune nu are o captură interactivă verificată.','body')

doc=SimpleDocTemplate(str(OUTPUT),pagesize=A4,rightMargin=16*mm,leftMargin=16*mm,topMargin=16*mm,bottomMargin=22*mm,
    title='MANAGER 24/7 - Raport de verificare 1.5.3',author='PARADIM / verificare tehnică',pageCompression=1)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(str(OUTPUT))
