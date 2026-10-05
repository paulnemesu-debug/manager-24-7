# Manager 24/7 0.1.2

- Autentificare în aplicație cu OTP e-mail de exact 6 cifre, fără redirecționare web.
- Selector de limbă Română / English afișat pe ecranul de autentificare.
- Ecran de autentificare compact și derulabil, adaptat telefoanelor cu ecrane mici.
- Validare strictă a codului OTP, stare de încărcare și limitare pentru retrimitere.
- Conturile de administrare se validează exclusiv din datele serverului.
- Build Android stabilizat pentru workerul EAS standard: maximum două procese
  Gradle, compilator Kotlin în același proces și doar arhitecturile telefoanelor
  fizice (`arm64-v8a`, `armeabi-v7a`). APK-ul nu este destinat emulatorului x86.

Configurația Supabase trebuie să folosească în șabloanele de autentificare variabila
`{{ .Token }}` și un furnizor SMTP propriu. Un șablon cu `{{ .ConfirmationURL }}`
continuă să trimită magic link indiferent de codul aplicației.
