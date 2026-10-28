# RIO VisitCard en NOVA: samengevoegde previewbron

Deze map bevat de tien publieke bestanden van
`Maurits-pixe/PALACO-Citadel`, branch `render/rio-preview-temporary`, exact
commit `efda74f0b8f2e91bd694c770564d29ca669ab846`. Dit is de vastgelegde bron
voor de tijdelijke Render-preview, niet een nieuwe identiteit of chatdienst.

`source-record.json` bewaart de oorspronkelijke bytegroottes en SHA-256-hashes.
De tien oorspronkelijke publieke bestanden zijn vóór het kopiëren tegen die
hashes gecontroleerd. De aanvullende bronrecords van `package.json` en tests
zijn alleen herkomstbewijs: deze bestanden zijn niet als publieke bestanden
overgenomen. README en bronrecord horen niet in de publieke uitvoer.
De overgenomen tekstbestanden zijn daarna expliciet naar LF-regelafbrekingen
genormaliseerd. De oorspronkelijke hashwaarden blijven bij de originele
bronbytes horen, inclusief hun oorspronkelijke CRLF-regelafbrekingen; de
genormaliseerde bestanden zijn inhoudelijk gelijk behoudens de onderstaande
bewuste wijzigingen. Bronhashes worden niet voorgesteld als uitvoerhashes.

Oorspronkelijke `chat-preview.mjs`, `rio-engine-web.mjs`, `engine.mjs`,
manifest en beide pictogrammen blijven ongewijzigd. `index.html`,
`styles.css`, `app.js` en `sw.js` zijn aangepast; `integration.mjs` is toegevoegd.
De bestaande Engine-, chat-, bron- en BRI9ADE-inhoud blijft behouden.

De oorspronkelijke externe fotoplaceholder is vervangen door een fictief
landschap, lokaal getekend met CSS-kleurvlakken. Er is geen foto gedownload.
Alle zeven talen, alternatieve tekst, onderwerpmetadata en chatbron noemen
het een lokaal getekend beeld, niet een echte foto of locatiebewijs. De
interne sleutel `photo` blijft alleen voor bestaande bediening behouden;
het onderwerp heeft type `ILLUSTRATION`, status `DESIGN_ONLY` en lokale
herkomst `rio-local-css-landscape-v1`. Andere onderwerpen zijn ongewijzigd.

Het nieuwe NOVA-paneel gebruikt de bestaande mascotte op
`/rio/reception/nova.png` en linkt expliciet naar `/rio/reception/` en `/rio/`.
De uitleg in zeven talen beschrijft de gekozen telefoon-OF-e-mailregel via
P.P. en eigen persoons-ID. Het netwerk verleent geen identiteit. De lokale
previewchat en Engine-oefening worden niet naar een andere route overgedragen.
De uitbreiding registreert of bevestigt niets en gebruikt geen API of opslag.

De root-serviceworker heeft een eigen cachefamilie `palaco-rio-shell-` en
precies twaalf publieke shell-URL's, inclusief het vaste NOVA-beeld. Alleen GET op dezelfde oorsprong zonder
query wordt afgehandeld, via de eigen cache. Installatie haalt de shell
opnieuw op zonder cookies; een mislukte installatie verwijdert alleen de
eigen nieuwe cache. Activatie verwijdert uitsluitend oudere caches uit de
eigen familie. Een update wacht op sluiting van oude gecontroleerde pagina's;
er is geen `skipWaiting` of `clients.claim`. De `/rio/`-app,
API's, accounts en downloads zijn geen onderdeel van deze root-cache.

De root-shell en `/rio/`-app behouden afzonderlijke manifesten en caches.
Een statische publicatie sluit geen NOVA- of telefoonproefserver aan en
activeert geen account, P.P.-registratie, persoonsverificatie of echte chat.
Publicatie, gekozen host, API-bestemming en terugval worden buiten deze
assetmap afzonderlijk vastgelegd.
