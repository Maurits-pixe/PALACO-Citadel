# Render + Auth0 aansluiting

Gekozen aansluiting: Render voor de website en server, Auth0 voor persoonlijke identificatie. Dit document is een installatiehandleiding; er zijn geen hosting- of Auth0-resources, accounts of uitnodigingen mee aangemaakt.

## 1. Hosting aansluiten

Installeer en verbind de beschikbare Render-integratie met het account dat deze website moet beheren. Controleer bestaande services voordat je iets aanmaakt. De [blueprint](../deployment/render.yaml) beschrijft één Node-service op het expliciet gekozen free compute-plan in Frankfurt, vanuit de actuele reviewbranch. Automatische deployments staan uit.

Gebruik de oorspronkelijke repository-root, de installatieopdracht en startopdracht uit de blueprint; GitHub Pages kan deze inlogserver niet uitvoeren. De website kan zonder OIDC-instellingen starten, maar persoonlijke toegang blijft dan gesloten. Neem de werkelijk toegewezen HTTPS-origin over zodra de service bestaat; verzin geen domein en voeg geen pad of afsluitende slash toe aan `PALACO_BASE_URL`.

## 2. Auth0 aansluiten

Maak in het gekozen Auth0-account een aparte tenant voor PALACO en een **Regular Web Application** genaamd **PALACO Ambassadeurs**. Gebruik Universal Login en een bewust gekozen accountverbinding. Leg instellingen vast voor deze app, zonder andere applicaties te wijzigen.

Stel voor de werkelijk toegewezen HTTPS-origin in:

- Allowed Callback URLs: `<origin>/callback`.
- Allowed Logout URLs: `<origin>/toegang.html` voor de door de provider ondersteunde logout-route.
- ID-token signing algorithm: RS256.
- Confidential authorization-code client: `client_secret_basic`, met PKCE.
- Exact issuer: het `issuer`-veld uit de tenant's HTTPS discovery-document, inclusief eventuele afsluitende slash.

Er worden uitsluitend `openid`-identificatieclaims gevraagd. De huidige portal meldt de lokale websitesessie af; Auth0-sessiebeheer blijft bij de provider. Gebruik geen publieke websitecode om een client secret te bewaren.

## 3. Privé-instellingen plaatsen

Vul uitsluitend in de private runtime-configuratie van de Render-service in:

| Instelling | Waarde |
| --- | --- |
| `OIDC_ISSUER_BASE_URL` | Exacte Auth0 discovery issuer |
| `OIDC_CLIENT_ID` | ID van PALACO Ambassadeurs |
| `OIDC_CLIENT_SECRET` | Geheim van die confidential client |
| `PALACO_BASE_URL` | Werkelijk toegewezen HTTPS-origin |
| `PALACO_SESSION_SECRET` | 32 willekeurige bytes, als 64 hex-tekens |
| `PALACO_MEMBERS_FILE` | `/etc/secrets/palaco-members.json` |

Maak daarnaast een Render secret file **palaco-members.json**, aanvankelijk met de inhoud van [members.example.json](members.example.json). Zet geen adres of identiteit in de blueprint, broncode, logs of GitHub. Het actuele persoonlijke bestand wordt niet door deze handleiding aangemaakt.

## 4. Eerste persoonlijke account koppelen

Voor zetel `PALACO-AMB-01` is een voorlopig contact in de besloten conversatie opgegeven. Maak of selecteer de betreffende Auth0-gebruiker in het private beheerscherm en controleer de identiteit en diens immutable `user_id`/ID-token `sub` tegen het gekozen issuer.

Een privé-record koppelt het gecontroleerde issuer/subject-paar aan de zetel met `status: enabled`. Een e-mailadres op zichzelf verleent geen zeteltoegang. Laat de elf overige zetels zonder enabled membership totdat hun personen en identiteit bekend zijn. Gebruik persoonlijke herstel- en verificatievoorzieningen van Auth0; verstuur geen uitnodiging vanuit deze uitvoering zonder afzonderlijke opdracht daarvoor.

Deze accountkoppeling is uitsluitend toegang tot de eigen read-only werkruimte. Zij benoemt niemand constitutioneel en activeert geen Government-, stem-, acceptance-, merge-, release- of uitvoeringsbevoegdheid.

## 5. Werkelijke aansluiting controleren

Publiceer de exacte geteste bronversie via het aangesloten hostingaccount. Controleer op de toegewezen HTTPS-origin: openbare pagina, persoonlijke login, callback naar de geselecteerde zetel, toegang tot alleen de eigen zetel, actuele intrekking en afmelding inclusief hergebruik van de oude cookie. Controleer herstel/verificatie bij de werkelijke provider.

De private registry mag alleen een gecontroleerde schrijver hebben. Het huidige sessiegeheugen ondersteunt één proces; herstart of free-plan idle suspension meldt iedereen af. Gebruik een duurzaam gedeeld sessiesysteem voordat je meerdere instanties inzet. Controleer de actuele accountquota en betalingsinstellingen voor gebruik.

Bronnen voor de aansluiting: [Render Node hosting](https://render.com/docs/web-services), [Render private instellingen](https://render.com/docs/configure-environment-variables), [Render blueprint](https://render.com/docs/blueprint-spec), [Auth0 Express aansluiting](https://auth0.com/docs/quickstart/webapp/express), [Auth0 applicatie-instellingen](https://auth0.com/docs/get-started/applications/application-settings).
