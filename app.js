const form = document.querySelector('#goal-form');
const input = document.querySelector('#goal');
const output = document.querySelector('#goal-output');
const languageSwitch = document.querySelector('.language-switch');
const installBtn = document.querySelector('#install-btn');
const controlButtons = document.querySelectorAll('.control-btn');
const industryStatus = document.querySelector('#industry-status');
const citadelStatus = document.querySelector('#citadel-status');
const syncBtn = document.querySelector('#sync-btn');
const syncOutput = document.querySelector('#sync-output');
const compassBackTopBtn = document.querySelector('#compass-back-top');

const translations = {
  en: {
    eyebrow: 'GO · Scheppen · Create',
    subtitle: 'The first executable UI foundation for desktop, tablet, and mobile.',
    visionTitle: 'Vision',
    visionBody: 'PALACO means “palace” in Esperanto: a shared digital place to build, create, and bring ideas to life.',
    launchTitle: 'Launch Pad',
    goalLabel: 'What will you create today?',
    goalPlaceholder: 'Type your first PALACO goal',
    goButton: 'GO',
    installButton: 'Install app',
    readinessTitle: 'Platform readiness',
    readinessOne: 'Responsive layout for computer, tablet, and mobile.',
    readinessTwo: 'Installable web app foundation (PWA).',
    readinessThree: 'Ready for domain + HTTPS deployment.',
    masterTitle: 'MA5TER Dashboard Control Room',
    masterSubtitle: 'Central command for PALACO Industry and PALACO internal operations.',
    industryTitle: 'PALACO Industry',
    industryBody: 'Monitor and activate industrial production mode.',
    internalTitle: 'PALACO Internal',
    internalBody: 'Manage internal Citadel operation mode.',
    statusLabel: 'Status',
    statusActive: 'Active',
    statusStandby: 'Standby',
    activate: 'Activate',
    deactivate: 'Deactivate',
    syncNow: 'Sync now',
    lastSync: 'Last sync:',
    githubTitle: 'GitHub hubs',
    githubSubtitle: 'Direct access to PALACO, PALACO Industrie, and PALACO Genesis on GitHub.',
    githubPalacoTitle: 'PALACO',
    githubPalacoBody: 'Open the PALACO main repository.',
    githubIndustryTitle: 'PALACO Industrie',
    githubIndustryBody: 'Open the PALACO industry repository.',
    githubGenesisTitle: 'PALACO Genesis',
    githubGenesisBody: 'Open the PALACO genesis repository.',
    rioTitle: 'RIO Platform Ascension',
    rioSubtitle: 'RIO evolves from chat interface to PALACO conversation and communication platform.',
    rioPillarOneTitle: 'Surface-independent conversation',
    rioPillarOneA: 'One conversation identity across mobile, web, Citadel, ELIXER, and desktop.',
    rioPillarOneB: 'Conversation belongs to PALACO context, not to one device.',
    rioPillarOneC: 'Cross-surface continuity remains active through sync and reconnect states.',
    rioPillarTwoTitle: 'Presence with boundaries',
    rioPillarTwoA: 'Presence means reachable, never automatic authority.',
    rioPillarTwoB: 'Online ≠ authorized; constitutional gates remain separate.',
    rioPillarTwoC: 'RIO connects communication while PALACO protects authority boundaries.',
    rioPillarThreeTitle: 'Provenance-aware communication',
    rioPillarThreeA: 'Messages preserve identity, context, origin, time, and traceability.',
    rioPillarThreeB: 'WATERMERK and HOLOGRAM support authenticity and lineage visibility.',
    rioPillarThreeC: 'Complexity is hidden when irrelevant and revealed when material.',
    rioLaw: 'Canonical law: RIO may connect communication; RIO shall not create authority.',
    footer: 'PALACO · Build conditions. Make it count.',
    goalSet: 'PALACO objective set:',
    latestGoal: 'Latest objective:',
    compassTitle: 'PALACO 2040 Compass',
    compassSubtitle: 'Understand first. Act with proof.',
    whereAmI: 'Where am I?',
    whatAmISeeing: 'What am I seeing?',
    whatCanIDoNow: 'What can I do now?',
    safeReturn: 'Safe return',
    actionsNowTitle: 'Actions now',
    constitutionDashboardTitle: 'Constitution dashboard',
    constitutionDashboardIntro: 'Rules translated to what they mean for your current choices.',
    constitutionRuleLabel: 'Rule',
    constitutionImpactLabel: 'Impact now',
    constitutionRuleOne: 'No authority without proof.',
    constitutionImpactOne: 'You can inspect, but cannot confirm actions missing evidence.',
    constitutionRuleTwo: 'Understand before action.',
    constitutionImpactTwo: 'Each action shows consequence preview before confirmation.',
    constitutionRuleThree: 'Authority stays bounded.',
    constitutionImpactThree: 'Roles are explicit: holder, steward, and system boundaries stay separate.',
    primaryAction: 'Primary action',
    secondaryAction: 'Secondary action',
    tertiaryAction: 'Tertiary action',
    requiresAuthority: 'Requires authority',
    consequenceTitle: 'Consequence preview',
    consequenceBeforeConfirm: 'Read consequence before confirm.',
    riskLevel: 'Risk level',
    confirmAction: 'Confirm action',
    proofStripTitle: 'Proof status',
    proofDashboardTitle: 'Proof dashboard',
    proofDashboardIntro: 'Per action: see status, proof chain, and traceability chain in one view.',
    proofAvailable: 'Proof available',
    proofInReview: 'Proof in review',
    proofMissing: 'Proof missing',
    actionStatusLabel: 'Status',
    proofChainLabel: 'Proof chain',
    traceabilityChainLabel: 'Traceability chain',
    openProofChain: 'Direct proof chain',
    traceabilityTitle: 'Traceability',
    openSourceChain: 'Open source chain',
    authorityTitle: 'Authority boundaries',
    authorityIntro: 'Who may do what, why, and under which boundaries.',
    authorityWhoLabel: 'Who',
    authorityWhatLabel: 'What',
    authorityWhyLabel: 'Why',
    authorityBoundaryLabel: 'Boundary',
    authorityConditionLabel: 'Conditions',
    authorityWhoHolder: 'Holder',
    authorityWhatHolder: 'Can execute own approved actions',
    authorityWhyHolder: 'Identity-bound ownership',
    authorityBoundaryHolder: 'Only within granted scope',
    authorityConditionHolder: 'Valid proof + active session',
    authorityWhoSteward: 'Steward',
    authorityWhatSteward: 'Can review and co-authorize sensitive actions',
    authorityWhySteward: 'Governance and duty of care',
    authorityBoundarySteward: 'Cannot impersonate holder authority',
    authorityConditionSteward: 'Review trail + dual confirmation',
    authorityWhoSystem: 'System',
    authorityWhatSystem: 'Can validate, log, and enforce policy gates',
    authorityWhySystem: 'Constitutional integrity',
    authorityBoundarySystem: 'No creation of human authority',
    authorityConditionSystem: 'Policy match + verifiable evidence',
    youCan: 'You can',
    reviewRequired: 'Review required',
    notAllowed: 'Not allowed',
    identityTitle: 'Identity & session',
    identityDashboardIntro: 'Identity, session, verification, and ownership in one overview.',
    activeIdentity: 'Active identity',
    sessionState: 'Session state',
    verificationStatusLabel: 'Verification',
    verificationVerified: 'Verified',
    sessionAgeLabel: 'Session age',
    sessionAgeNow: 'Current',
    sessionBoundaryLabel: 'Session boundary',
    sessionBoundaryBounded: 'Bounded by policy gates',
    ownershipLabel: 'Ownership',
    ownershipScopePrivate: 'Private scope',
    ownedByMe: 'Owned by me',
    participationDashboardTitle: 'Participation dashboard',
    participationDashboardIntro: 'Flowcard: preview → authorization → review → revocation.',
    participationStepPreview: 'Preview',
    participationStepPreviewBody: 'See impact and boundaries before giving authority.',
    participationStepAuthorize: 'Authorization',
    participationStepAuthorizeBody: 'Grant bounded permission with explicit conditions.',
    participationStepReview: 'Review',
    participationStepReviewBody: 'Inspect proof, traceability, and policy alignment.',
    participationStepRevoke: 'Revocation',
    participationStepRevokeBody: 'Withdraw authority when boundaries are broken.',
    governanceDashboardTitle: 'Governance dashboard',
    governanceDashboardIntro: 'Active policies, deviations, and review moments without score-magic.',
    activePoliciesTitle: 'Active policies',
    activePolicyOne: 'Proof required before authority confirmation.',
    activePolicyTwo: 'Bounded authorization with explicit scope.',
    activePolicyThree: 'Traceability required for governance actions.',
    deviationsTitle: 'Deviations',
    deviationOne: 'Secondary action pending review evidence.',
    deviationTwo: 'One open traceability gap awaiting steward follow-up.',
    reviewMomentsTitle: 'Review moments',
    reviewMomentOne: 'Policy review window: every 24h.',
    reviewMomentTwo: 'Deviation checkpoint: before final confirmation.',
    reviewMomentThree: 'Revocation audit: on every authority withdrawal.',
    noScoreMagicNote: 'No single trust score: governance is shown as explicit facts and review states.',
    citadelHealthTitle: 'Citadel Health dashboard',
    citadelHealthIntro: 'Operational health and semantic risks with explanation per signal.',
    healthStatusLabel: 'Status',
    healthStatusStable: 'Stable',
    healthStatusWatch: 'Watch',
    healthStatusClear: 'Clear',
    healthSignalOpsTitle: 'Operational continuity',
    healthSignalOpsBody: 'Core services respond within expected bounds and sync checkpoints are current.',
    healthSignalSemanticsTitle: 'Semantic coherence',
    healthSignalSemanticsBody: 'One context label mismatch detected; review keeps meaning aligned across actions.',
    healthSignalGovernanceTitle: 'Governance signal clarity',
    healthSignalGovernanceBody: 'Policy and authority indicators remain explicit, with no hidden score-magic.',
    rioConversationDashboardTitle: 'RIO Conversation dashboard',
    rioConversationDashboardIntro: 'Conversations as access to actions, with context and consequence panel.',
    rioConversationAccessTitle: 'Conversation access to actions',
    rioConversationOneTitle: 'Steward review room',
    rioConversationOneAction: 'Opens policy exception review action.',
    rioConversationTwoTitle: 'Holder execution room',
    rioConversationTwoAction: 'Opens bounded execution action after proof check.',
    rioConversationThreeTitle: 'Ops sync room',
    rioConversationThreeAction: 'Opens service continuity action with traceability logging.',
    rioContextPanelTitle: 'Context panel',
    rioContextPanelBody: 'Shows active identities, relevant policy scope, and latest proof references before action selection.',
    rioConsequencePanelTitle: 'Consequence panel',
    rioConsequencePanelBody: 'Shows expected system impact, governance follow-up, and revocation path before confirmation.',
    elixerDashboardTitle: 'ELIXER dashboard',
    elixerDashboardIntro: 'Available apps and capabilities per context, with clear choice impact.',
    elixerCapabilityLabel: 'Capabilities',
    elixerImpactLabel: 'Choice impact',
    elixerContextHolderTitle: 'Holder context',
    elixerContextHolderCapabilities: 'Identity wallet, proof viewer, bounded execution.',
    elixerContextHolderImpact: 'Execution starts only inside approved scope and writes traceability evidence.',
    elixerContextStewardTitle: 'Steward context',
    elixerContextStewardCapabilities: 'Review workspace, dual-confirmation gate, revocation tools.',
    elixerContextStewardImpact: 'Approval or rejection updates governance state and opens mandatory follow-up logs.',
    elixerContextOpsTitle: 'Operations context',
    elixerContextOpsCapabilities: 'Continuity monitor, policy alignment checks, incident replay.',
    elixerContextOpsImpact: 'Operational choices can trigger policy review windows and resilience actions.',
    navigationCompassTitle: 'Navigation compass',
    currentLayer: 'Current layer',
    backToStart: 'Back to start',
    commandLayerTitle: 'Command layer',
    commandPlaceholder: 'Type natural command…',
    commandHint: 'Context first, action second.',
    adaptiveDepthTitle: 'Adaptive depth',
    beginnerMode: 'Beginner mode',
    expertMode: 'Expert mode',
    showMoreDetail: 'Show more detail',
    showLessDetail: 'Show less detail',
    policyGuardTitle: 'Policy guardrail',
    policyGuardRule: 'Context → Action → Consequence → Confirmation',
    statusContext: 'Context ready',
    statusAction: 'Action selected',
    statusConsequence: 'Consequence shown',
    statusConfirmation: 'Waiting confirmation',
    twoMinuteCheckTitle: '2-minute clarity check',
    twoMinuteCheckPass: 'Passed: understandable in under 2 minutes.',
    riskLevelMedium: 'Medium',
    sessionLive: 'Live',
    layerUnderstand: 'Understand',
    flowContext: 'Context',
    flowAction: 'Action',
    flowProof: 'Proof',
    flowTraceability: 'Traceability'
  },
  nl: {
    eyebrow: 'GO · Scheppen · Creëren',
    subtitle: 'De eerste uitvoerbare UI-basis voor desktop, tablet en mobiel.',
    visionTitle: 'Visie',
    visionBody: 'PALACO betekent “paleis” in Esperanto: een gedeelde digitale plek om te bouwen, te creëren en ideeën tot leven te brengen.',
    launchTitle: 'Startplatform',
    goalLabel: 'Wat ga jij vandaag creëren?',
    goalPlaceholder: 'Typ je eerste PALACO-doel',
    goButton: 'GO',
    installButton: 'Installeer app',
    readinessTitle: 'Platformgereedheid',
    readinessOne: 'Responsive lay-out voor computer, tablet en mobiel.',
    readinessTwo: 'Installeerbare webapp-basis (PWA).',
    readinessThree: 'Klaar voor domein + HTTPS uitrol.',
    masterTitle: 'MA5TER Dashboard Controlekamer',
    masterSubtitle: 'Centraal commando voor PALACO Industrie en PALACO interne operaties.',
    industryTitle: 'PALACO Industrie',
    industryBody: 'Monitor en activeer industriële productiemodus.',
    internalTitle: 'PALACO Intern',
    internalBody: 'Beheer interne Citadel-operatiemodus.',
    statusLabel: 'Status',
    statusActive: 'Actief',
    statusStandby: 'Stand-by',
    activate: 'Activeren',
    deactivate: 'Deactiveren',
    syncNow: 'Nu synchroniseren',
    lastSync: 'Laatste sync:',
    githubTitle: 'GitHub hubs',
    githubSubtitle: 'Directe toegang tot PALACO, PALACO Industrie en PALACO Genesis op GitHub.',
    githubPalacoTitle: 'PALACO',
    githubPalacoBody: 'Open de hoofdrepository van PALACO.',
    githubIndustryTitle: 'PALACO Industrie',
    githubIndustryBody: 'Open de industriële repository van PALACO.',
    githubGenesisTitle: 'PALACO Genesis',
    githubGenesisBody: 'Open de genesis-repository van PALACO.',
    rioTitle: 'RIO Platform Ascension',
    rioSubtitle: 'RIO groeit van chat-interface naar PALACO conversatie- en communicatieplatform.',
    rioPillarOneTitle: 'Surface-onafhankelijke conversatie',
    rioPillarOneA: 'Eén conversatie-identiteit over mobiel, web, Citadel, ELIXER en desktop.',
    rioPillarOneB: 'De conversatie hoort bij PALACO-context, niet bij één apparaat.',
    rioPillarOneC: 'Cross-surface continuïteit blijft bestaan via sync- en reconnect-staten.',
    rioPillarTwoTitle: 'Presence met grenzen',
    rioPillarTwoA: 'Presence betekent bereikbaar, nooit automatische authority.',
    rioPillarTwoB: 'Online ≠ bevoegd; constitutionele poorten blijven gescheiden.',
    rioPillarTwoC: 'RIO verbindt communicatie terwijl PALACO de authority-grenzen bewaakt.',
    rioPillarThreeTitle: 'Provenance-bewuste communicatie',
    rioPillarThreeA: 'Berichten behouden identiteit, context, herkomst, tijd en traceerbaarheid.',
    rioPillarThreeB: 'WATERMERK en HOLOGRAM ondersteunen authenticiteit en lineage-zichtbaarheid.',
    rioPillarThreeC: 'Complexiteit wordt verborgen wanneer irrelevant en getoond wanneer materieel.',
    rioLaw: 'Canonieke wet: RIO mag communicatie verbinden; RIO mag geen authority creëren.',
    footer: 'PALACO · Bouw de voorwaarden. Maak het groots.',
    goalSet: 'PALACO-doel gezet:',
    latestGoal: 'Laatste doel:',
    compassTitle: 'PALACO 2040 Kompas',
    compassSubtitle: 'Eerst begrijpen. Dan handelen met bewijs.',
    whereAmI: 'Waar ben ik?',
    whatAmISeeing: 'Wat zie ik?',
    whatCanIDoNow: 'Wat kan ik nu doen?',
    safeReturn: 'Veilige terugkeer',
    actionsNowTitle: 'Acties nu',
    constitutionDashboardTitle: 'Constitution-dashboard',
    constitutionDashboardIntro: 'Regels vertaald naar wat ze betekenen voor je huidige keuzes.',
    constitutionRuleLabel: 'Regel',
    constitutionImpactLabel: 'Impact nu',
    constitutionRuleOne: 'Geen authority zonder bewijs.',
    constitutionImpactOne: 'Je kunt bekijken, maar geen acties bevestigen zonder bewijs.',
    constitutionRuleTwo: 'Eerst begrijpen, dan handelen.',
    constitutionImpactTwo: 'Elke actie toont eerst de consequentie voordat je bevestigt.',
    constitutionRuleThree: 'Authority blijft begrensd.',
    constitutionImpactThree: 'Rollen blijven expliciet: houder, steward en systeemgrenzen blijven gescheiden.',
    primaryAction: 'Primaire actie',
    secondaryAction: 'Secundaire actie',
    tertiaryAction: 'Tertiaire actie',
    requiresAuthority: 'Vereist authority',
    consequenceTitle: 'Consequentie-overzicht',
    consequenceBeforeConfirm: 'Lees consequentie vóór bevestigen.',
    riskLevel: 'Risiconiveau',
    confirmAction: 'Bevestig actie',
    proofStripTitle: 'Bewijsstatus',
    proofDashboardTitle: 'Bewijsdashboard',
    proofDashboardIntro: 'Per actie: zie status, proof-keten en traceability-keten in één overzicht.',
    proofAvailable: 'Bewijs beschikbaar',
    proofInReview: 'Bewijs in review',
    proofMissing: 'Bewijs ontbreekt',
    actionStatusLabel: 'Status',
    proofChainLabel: 'Proof-keten',
    traceabilityChainLabel: 'Traceability-keten',
    openProofChain: 'Directe proof-keten',
    traceabilityTitle: 'Traceerbaarheid',
    openSourceChain: 'Open bronketen',
    authorityTitle: 'Authority-grenzen',
    authorityIntro: 'Wie mag wat, waarom, en binnen welke grenzen.',
    authorityWhoLabel: 'Wie',
    authorityWhatLabel: 'Wat',
    authorityWhyLabel: 'Waarom',
    authorityBoundaryLabel: 'Grens',
    authorityConditionLabel: 'Voorwaarden',
    authorityWhoHolder: 'Houder',
    authorityWhatHolder: 'Mag eigen goedgekeurde acties uitvoeren',
    authorityWhyHolder: 'Identiteitsgebonden eigenaarschap',
    authorityBoundaryHolder: 'Alleen binnen toegekende scope',
    authorityConditionHolder: 'Geldig bewijs + actieve sessie',
    authorityWhoSteward: 'Steward',
    authorityWhatSteward: 'Mag gevoelige acties reviewen en mede-autoriseren',
    authorityWhySteward: 'Governance en zorgplicht',
    authorityBoundarySteward: 'Mag houder-authority niet imiteren',
    authorityConditionSteward: 'Reviewspoor + dubbele bevestiging',
    authorityWhoSystem: 'Systeem',
    authorityWhatSystem: 'Mag valideren, loggen en policy-poorten afdwingen',
    authorityWhySystem: 'Constitutionele integriteit',
    authorityBoundarySystem: 'Mag geen menselijke authority creëren',
    authorityConditionSystem: 'Policy-match + verifieerbaar bewijs',
    youCan: 'Jij mag',
    reviewRequired: 'Review vereist',
    notAllowed: 'Niet toegestaan',
    identityTitle: 'Identiteit & sessie',
    identityDashboardIntro: 'Identiteit, sessie, verificatie en eigenaarschap in één overzicht.',
    activeIdentity: 'Actieve identiteit',
    sessionState: 'Sessiestatus',
    verificationStatusLabel: 'Verificatie',
    verificationVerified: 'Geverifieerd',
    sessionAgeLabel: 'Sessie-leeftijd',
    sessionAgeNow: 'Huidig',
    sessionBoundaryLabel: 'Sessiegrens',
    sessionBoundaryBounded: 'Begrensd door policy-poorten',
    ownershipLabel: 'Eigenaarschap',
    ownershipScopePrivate: 'Privé-scope',
    ownedByMe: 'Van mij',
    participationDashboardTitle: 'Participatie-dashboard',
    participationDashboardIntro: 'Flowkaart: preview → autorisatie → review → revocatie.',
    participationStepPreview: 'Preview',
    participationStepPreviewBody: 'Zie impact en grenzen vóór je authority afgeeft.',
    participationStepAuthorize: 'Autorisatie',
    participationStepAuthorizeBody: 'Geef begrensde toestemming met expliciete voorwaarden.',
    participationStepReview: 'Review',
    participationStepReviewBody: 'Controleer bewijs, traceability en policy-alignment.',
    participationStepRevoke: 'Revocatie',
    participationStepRevokeBody: 'Trek authority in wanneer grenzen worden gebroken.',
    governanceDashboardTitle: 'Governance-dashboard',
    governanceDashboardIntro: 'Actieve policies, afwijkingen en reviewmomenten zonder score-magic.',
    activePoliciesTitle: 'Actieve policies',
    activePolicyOne: 'Bewijs is verplicht vóór authority-bevestiging.',
    activePolicyTwo: 'Begrensde autorisatie met expliciete scope.',
    activePolicyThree: 'Traceability is verplicht voor governance-acties.',
    deviationsTitle: 'Afwijkingen',
    deviationOne: 'Secundaire actie wacht op review-bewijs.',
    deviationTwo: 'Eén open traceability-gap wacht op steward-opvolging.',
    reviewMomentsTitle: 'Reviewmomenten',
    reviewMomentOne: 'Policy-reviewvenster: elke 24 uur.',
    reviewMomentTwo: 'Afwijkingscheckpoint: vóór finale bevestiging.',
    reviewMomentThree: 'Revocatie-audit: bij elke authority-intrekking.',
    noScoreMagicNote: 'Geen enkele trust-score: governance wordt getoond als expliciete feiten en reviewstaten.',
    citadelHealthTitle: 'Citadel Health-dashboard',
    citadelHealthIntro: 'Operationele gezondheid en semantische risico’s met uitleg per signaal.',
    healthStatusLabel: 'Status',
    healthStatusStable: 'Stabiel',
    healthStatusWatch: 'Waakzaam',
    healthStatusClear: 'Helder',
    healthSignalOpsTitle: 'Operationele continuïteit',
    healthSignalOpsBody: 'Kernservices reageren binnen verwachte grenzen en sync-checkpoints zijn actueel.',
    healthSignalSemanticsTitle: 'Semantische coherentie',
    healthSignalSemanticsBody: 'Eén contextlabel-afwijking gedetecteerd; review houdt betekenis uitgelijnd over acties.',
    healthSignalGovernanceTitle: 'Governance-signaalhelderheid',
    healthSignalGovernanceBody: 'Policy- en authority-indicatoren blijven expliciet, zonder verborgen score-magic.',
    rioConversationDashboardTitle: 'RIO Conversatie-dashboard',
    rioConversationDashboardIntro: 'Gesprekken als toegang tot acties, met context- en consequentie-paneel.',
    rioConversationAccessTitle: 'Gespreks-toegang tot acties',
    rioConversationOneTitle: 'Steward-reviewruimte',
    rioConversationOneAction: 'Opent actie voor policy-uitzonderingsreview.',
    rioConversationTwoTitle: 'Houder-uitvoeringsruimte',
    rioConversationTwoAction: 'Opent begrensde uitvoeractie na proof-check.',
    rioConversationThreeTitle: 'Ops-syncruimte',
    rioConversationThreeAction: 'Opent service-continuïteitsactie met traceability-logging.',
    rioContextPanelTitle: 'Contextpaneel',
    rioContextPanelBody: 'Toont actieve identiteiten, relevante policy-scope en laatste proof-referenties vóór actiekeuze.',
    rioConsequencePanelTitle: 'Consequentiepaneel',
    rioConsequencePanelBody: 'Toont verwachte systeemimpact, governance-opvolging en revocatiepad vóór bevestiging.',
    elixerDashboardTitle: 'ELIXER-dashboard',
    elixerDashboardIntro: 'Beschikbare apps en capabilities per context, met heldere keuze-impact.',
    elixerCapabilityLabel: 'Capabilities',
    elixerImpactLabel: 'Keuze-impact',
    elixerContextHolderTitle: 'Houdercontext',
    elixerContextHolderCapabilities: 'Identity wallet, proof viewer, begrensde uitvoering.',
    elixerContextHolderImpact: 'Uitvoering start alleen binnen goedgekeurde scope en schrijft traceability-bewijs.',
    elixerContextStewardTitle: 'Stewardcontext',
    elixerContextStewardCapabilities: 'Review-werkruimte, dual-confirmation gate, revocatie-tools.',
    elixerContextStewardImpact: 'Goedkeuring of afwijzing werkt governance-status bij en opent verplichte opvolglogs.',
    elixerContextOpsTitle: 'Operations-context',
    elixerContextOpsCapabilities: 'Continuïteitsmonitor, policy-alignment checks, incident replay.',
    elixerContextOpsImpact: 'Operationele keuzes kunnen policy-reviewvensters en resilience-acties activeren.',
    navigationCompassTitle: 'Navigatiekompas',
    currentLayer: 'Huidige laag',
    backToStart: 'Terug naar start',
    commandLayerTitle: 'Command-laag',
    commandPlaceholder: 'Typ natuurlijke opdracht…',
    commandHint: 'Eerst context, daarna actie.',
    adaptiveDepthTitle: 'Adaptieve diepte',
    beginnerMode: 'Beginner-modus',
    expertMode: 'Expert-modus',
    showMoreDetail: 'Toon meer detail',
    showLessDetail: 'Toon minder detail',
    policyGuardTitle: 'Policy-guardrail',
    policyGuardRule: 'Context → Actie → Consequentie → Bevestiging',
    statusContext: 'Context gereed',
    statusAction: 'Actie geselecteerd',
    statusConsequence: 'Consequentie getoond',
    statusConfirmation: 'Wacht op bevestiging',
    twoMinuteCheckTitle: '2-minuten duidelijkheidscheck',
    twoMinuteCheckPass: 'Geslaagd: begrijpelijk binnen 2 minuten.',
    riskLevelMedium: 'Midden',
    sessionLive: 'Live',
    layerUnderstand: 'Begrijpen',
    flowContext: 'Context',
    flowAction: 'Actie',
    flowProof: 'Bewijs',
    flowTraceability: 'Traceability'
  },
  eo: {
    eyebrow: 'GO · Krei · Estigi',
    subtitle: 'La unua plenumebla UI-bazo por komputilo, tablojdo kaj poŝtelefono.',
    visionTitle: 'Vizio',
    visionBody: 'PALACO signifas “palaco” en Esperanto: komuna cifereca loko por konstrui, krei kaj vivigi ideojn.',
    launchTitle: 'Lanĉejo',
    goalLabel: 'Kion vi kreos hodiaŭ?',
    goalPlaceholder: 'Tajpu vian unuan PALACO-celon',
    goButton: 'GO',
    installButton: 'Instalu apon',
    readinessTitle: 'Platforma preteco',
    readinessOne: 'Respondema aranĝo por komputilo, tablojdo kaj poŝtelefono.',
    readinessTwo: 'Instalebla ret-apo bazo (PWA).',
    readinessThree: 'Preta por domajno + HTTPS publikigo.',
    masterTitle: 'MA5TER Panela Kontrolĉambro',
    masterSubtitle: 'Centra komando por PALACO-Industrio kaj internaj PALACO-operacioj.',
    industryTitle: 'PALACO Industrio',
    industryBody: 'Monitoru kaj aktivigu industrian produktadan reĝimon.',
    internalTitle: 'PALACO Interna',
    internalBody: 'Administru internan Citadel-operacian reĝimon.',
    statusLabel: 'Stato',
    statusActive: 'Aktiva',
    statusStandby: 'Atenda',
    activate: 'Aktivigi',
    deactivate: 'Malaktivigi',
    syncNow: 'Sinkronigi nun',
    lastSync: 'Lasta sinkronigo:',
    githubTitle: 'GitHub nodoj',
    githubSubtitle: 'Rekta aliro al PALACO, PALACO Industrie kaj PALACO Genesis en GitHub.',
    githubPalacoTitle: 'PALACO',
    githubPalacoBody: 'Malfermu la ĉefan deponejon de PALACO.',
    githubIndustryTitle: 'PALACO Industrie',
    githubIndustryBody: 'Malfermu la industrian deponejon de PALACO.',
    githubGenesisTitle: 'PALACO Genesis',
    githubGenesisBody: 'Malfermu la genesis-deponejon de PALACO.',
    rioTitle: 'RIO Platform Ascension',
    rioSubtitle: 'RIO evoluas de babila interfaco al konversacia kaj komunikada platformo de PALACO.',
    rioPillarOneTitle: 'Surfaco-sendependa konversacio',
    rioPillarOneA: 'Unu konversacia identeco tra poŝtelefono, reto, Citadel, ELIXER kaj labortablo.',
    rioPillarOneB: 'La konversacio apartenas al PALACO-kunteksto, ne al unu aparato.',
    rioPillarOneC: 'Trans-surfaca kontinueco restas aktiva per sinkronigo kaj rekonekto-statoj.',
    rioPillarTwoTitle: 'Ĉeesto kun limoj',
    rioPillarTwoA: 'Ĉeesto signifas atingebla, neniam aŭtomata aŭtoritato.',
    rioPillarTwoB: 'Rete ≠ rajtigita; konstituciaj pordegoj restas apartaj.',
    rioPillarTwoC: 'RIO ligas komunikadon dum PALACO protektas aŭtoritatajn limojn.',
    rioPillarThreeTitle: 'Provenienco-konscia komunikado',
    rioPillarThreeA: 'Mesaĝoj konservas identecon, kuntekston, originon, tempon kaj spureblecon.',
    rioPillarThreeB: 'WATERMERK kaj HOLOGRAM subtenas aŭtentikecon kaj videblecon de devenlinio.',
    rioPillarThreeC: 'Komplekseco kaŝiĝas kiam negrava kaj montriĝas kiam materia.',
    rioLaw: 'Kanona leĝo: RIO rajtas ligi komunikadon; RIO ne rajtas krei aŭtoritaton.',
    footer: 'PALACO · Konstruu la kondiĉojn. Faru ĝin grava.',
    goalSet: 'PALACO-celo agordita:',
    latestGoal: 'Plej lasta celo:',
    compassTitle: 'PALACO 2040 Kompaso',
    compassSubtitle: 'Unue komprenu. Poste agu kun pruvo.',
    whereAmI: 'Kie mi estas?',
    whatAmISeeing: 'Kion mi vidas?',
    whatCanIDoNow: 'Kion mi povas fari nun?',
    safeReturn: 'Sekura reveno',
    actionsNowTitle: 'Agoj nun',
    constitutionDashboardTitle: 'Konstitucia panelo',
    constitutionDashboardIntro: 'Reguloj tradukitaj al tio, kion ili signifas por viaj nunaj elektoj.',
    constitutionRuleLabel: 'Regulo',
    constitutionImpactLabel: 'Nuna efiko',
    constitutionRuleOne: 'Neniu aŭtoritato sen pruvo.',
    constitutionImpactOne: 'Vi povas inspekti, sed ne konfirmi agojn sen pruvo.',
    constitutionRuleTwo: 'Komprenu antaŭ ago.',
    constitutionImpactTwo: 'Ĉiu ago montras konsekvencon antaŭ konfirmo.',
    constitutionRuleThree: 'Aŭtoritato restas limigita.',
    constitutionImpactThree: 'Roloj estas klaraj: portanto, steward kaj sistemaj limoj restas apartaj.',
    primaryAction: 'Ĉefa ago',
    secondaryAction: 'Dua ago',
    tertiaryAction: 'Tria ago',
    requiresAuthority: 'Postulas aŭtoritaton',
    consequenceTitle: 'Sekva efiko',
    consequenceBeforeConfirm: 'Legu efikon antaŭ konfirmo.',
    riskLevel: 'Riska nivelo',
    confirmAction: 'Konfirmu agon',
    proofStripTitle: 'Pruva stato',
    proofDashboardTitle: 'Pruva panelo',
    proofDashboardIntro: 'Por ĉiu ago: vidu staton, pruvĉenon kaj spureblecan ĉenon en unu vido.',
    proofAvailable: 'Pruvo disponebla',
    proofInReview: 'Pruvo en revizio',
    proofMissing: 'Pruvo mankas',
    actionStatusLabel: 'Stato',
    proofChainLabel: 'Pruvĉeno',
    traceabilityChainLabel: 'Spurebleca ĉeno',
    openProofChain: 'Rekta pruvĉeno',
    traceabilityTitle: 'Spurebleco',
    openSourceChain: 'Malferma font-ĉeno',
    authorityTitle: 'Aŭtoritataj limoj',
    authorityIntro: 'Kiu rajtas kion, kial, kaj sub kiuj limoj.',
    authorityWhoLabel: 'Kiu',
    authorityWhatLabel: 'Kio',
    authorityWhyLabel: 'Kial',
    authorityBoundaryLabel: 'Limo',
    authorityConditionLabel: 'Kondiĉoj',
    authorityWhoHolder: 'Portanto',
    authorityWhatHolder: 'Rajtas plenumi proprajn aprobitajn agojn',
    authorityWhyHolder: 'Identec-ligita posedeco',
    authorityBoundaryHolder: 'Nur ene de donita amplekso',
    authorityConditionHolder: 'Valida pruvo + aktiva sesio',
    authorityWhoSteward: 'Steward',
    authorityWhatSteward: 'Rajtas revizii kaj kun-aŭtorizi sentemajn agojn',
    authorityWhySteward: 'Gvidado kaj zorgodevo',
    authorityBoundarySteward: 'Ne rajtas imiti aŭtoritaton de portanto',
    authorityConditionSteward: 'Revizia spuro + duobla konfirmo',
    authorityWhoSystem: 'Sistemo',
    authorityWhatSystem: 'Rajtas validigi, registri kaj devigi politikajn pordojn',
    authorityWhySystem: 'Konstitucia integreco',
    authorityBoundarySystem: 'Neniu kreado de homa aŭtoritato',
    authorityConditionSystem: 'Politika kongruo + kontrolebla pruvo',
    youCan: 'Vi rajtas',
    reviewRequired: 'Revizio bezonata',
    notAllowed: 'Ne permesite',
    identityTitle: 'Identeco kaj sesio',
    identityDashboardIntro: 'Identeco, sesio, konfirmo kaj posedeco en unu superrigardo.',
    activeIdentity: 'Aktiva identeco',
    sessionState: 'Sesia stato',
    verificationStatusLabel: 'Konfirmo',
    verificationVerified: 'Konfirmita',
    sessionAgeLabel: 'Sesia aĝo',
    sessionAgeNow: 'Nuna',
    sessionBoundaryLabel: 'Sesia limo',
    sessionBoundaryBounded: 'Limigita de politikaj pordoj',
    ownershipLabel: 'Posedeco',
    ownershipScopePrivate: 'Privata amplekso',
    ownedByMe: 'Mia',
    participationDashboardTitle: 'Partoprena panelo',
    participationDashboardIntro: 'Flukarto: antaŭvido → aŭtorizo → revizio → nuligo.',
    participationStepPreview: 'Antaŭvido',
    participationStepPreviewBody: 'Vidu efikon kaj limojn antaŭ doni aŭtoritaton.',
    participationStepAuthorize: 'Aŭtorizo',
    participationStepAuthorizeBody: 'Doni limigitan permeson kun klaraj kondiĉoj.',
    participationStepReview: 'Revizio',
    participationStepReviewBody: 'Kontrolu pruvon, spureblecon kaj politikan kongruon.',
    participationStepRevoke: 'Nuligo',
    participationStepRevokeBody: 'Retiru aŭtoritaton kiam limoj estas rompitaj.',
    governanceDashboardTitle: 'Governanca panelo',
    governanceDashboardIntro: 'Aktivaj politikoj, devioj kaj reviziaj momentoj sen poentara magio.',
    activePoliciesTitle: 'Aktivaj politikoj',
    activePolicyOne: 'Pruvo bezonata antaŭ aŭtoritata konfirmo.',
    activePolicyTwo: 'Limigita aŭtorizo kun klara amplekso.',
    activePolicyThree: 'Spurebleco bezonata por governancaj agoj.',
    deviationsTitle: 'Devioj',
    deviationOne: 'Dua ago atendas revizian pruvon.',
    deviationTwo: 'Unu malfermita spurebleca breĉo atendas steward-sekvadon.',
    reviewMomentsTitle: 'Reviziaj momentoj',
    reviewMomentOne: 'Politika revizio: ĉiun 24h.',
    reviewMomentTwo: 'Devia kontrolpunkto: antaŭ fina konfirmo.',
    reviewMomentThree: 'Nuliga aŭdito: ĉe ĉiu aŭtoritata retiro.',
    noScoreMagicNote: 'Neniu unuopa fido-poentaro: governanco montriĝas kiel klaraj faktoj kaj reviziaj statoj.',
    citadelHealthTitle: 'Citadel Health-panelo',
    citadelHealthIntro: 'Funkcia sano kaj semantikaj riskoj kun klarigo por ĉiu signalo.',
    healthStatusLabel: 'Stato',
    healthStatusStable: 'Stabila',
    healthStatusWatch: 'Atento',
    healthStatusClear: 'Klara',
    healthSignalOpsTitle: 'Funkcia kontinueco',
    healthSignalOpsBody: 'Ĉefaj servoj respondas ene de atenditaj limoj kaj sinkronigaj kontrolpunktoj estas aktualaj.',
    healthSignalSemanticsTitle: 'Semantika kohereco',
    healthSignalSemanticsBody: 'Unu kunteksta etiked-malkongruo trovita; revizio tenas signifon vicigita tra agoj.',
    healthSignalGovernanceTitle: 'Governanca signala klareco',
    healthSignalGovernanceBody: 'Politikaj kaj aŭtoritataj indikiloj restas klaraj, sen kaŝita poentara magio.',
    rioConversationDashboardTitle: 'RIO Konversacia panelo',
    rioConversationDashboardIntro: 'Konversacioj kiel aliro al agoj, kun kunteksta kaj konsekvenca panelo.',
    rioConversationAccessTitle: 'Konversacia aliro al agoj',
    rioConversationOneTitle: 'Steward-revizia ĉambro',
    rioConversationOneAction: 'Malfermas agon por revizio de politika escepto.',
    rioConversationTwoTitle: 'Portanta plenum-ĉambro',
    rioConversationTwoAction: 'Malfermas limigitan plenum-agon post pruva kontrolo.',
    rioConversationThreeTitle: 'Ops-sinkrona ĉambro',
    rioConversationThreeAction: 'Malfermas servokontinuecan agon kun spurebleca registrado.',
    rioContextPanelTitle: 'Kunteksta panelo',
    rioContextPanelBody: 'Montras aktivajn identecojn, gravan politikan amplekson, kaj plej lastajn pruvajn referencojn antaŭ ago-elekto.',
    rioConsequencePanelTitle: 'Konsekvenca panelo',
    rioConsequencePanelBody: 'Montras atendatan sisteman efikon, governancan sekvadon, kaj nuligan vojon antaŭ konfirmo.',
    elixerDashboardTitle: 'ELIXER-panelo',
    elixerDashboardIntro: 'Disponeblaj aplikaĵoj kaj kapabloj laŭ kunteksto, kun klara elekta efiko.',
    elixerCapabilityLabel: 'Kapabloj',
    elixerImpactLabel: 'Elekta efiko',
    elixerContextHolderTitle: 'Portanta kunteksto',
    elixerContextHolderCapabilities: 'Identeca monujo, pruv-speguilo, limigita plenumo.',
    elixerContextHolderImpact: 'Plenumo komenciĝas nur ene de aprobita amplekso kaj skribas spureblecan pruvon.',
    elixerContextStewardTitle: 'Steward-kunteksto',
    elixerContextStewardCapabilities: 'Revizia laborspaco, duobla-konfirma pordo, nuligaj iloj.',
    elixerContextStewardImpact: 'Aprobo aŭ malaprobo ĝisdatigas governancan staton kaj malfermas devigajn sekvajn protokolojn.',
    elixerContextOpsTitle: 'Operacia kunteksto',
    elixerContextOpsCapabilities: 'Kontinueca monitoro, politik-kongruaj kontroloj, incidenta reludo.',
    elixerContextOpsImpact: 'Operaciaj elektoj povas ekigi politikajn revizifenestrojn kaj rezistecajn agojn.',
    navigationCompassTitle: 'Navigada kompaso',
    currentLayer: 'Nuna tavolo',
    backToStart: 'Reen al komenco',
    commandLayerTitle: 'Komanda tavolo',
    commandPlaceholder: 'Tajpu naturan komandon…',
    commandHint: 'Unue kunteksto, poste ago.',
    adaptiveDepthTitle: 'Adapta profundo',
    beginnerMode: 'Komencanta reĝimo',
    expertMode: 'Sperta reĝimo',
    showMoreDetail: 'Montru pli da detaloj',
    showLessDetail: 'Montru malpli da detaloj',
    policyGuardTitle: 'Politika gvidrelo',
    policyGuardRule: 'Kunteksto → Ago → Efiko → Konfirmo',
    statusContext: 'Kunteksto preta',
    statusAction: 'Ago elektita',
    statusConsequence: 'Efiko montrita',
    statusConfirmation: 'Atendas konfirmon',
    twoMinuteCheckTitle: '2-minuta klareco-kontrolo',
    twoMinuteCheckPass: 'Sukcesis: komprenebla ene de 2 minutoj.',
    riskLevelMedium: 'Meza',
    sessionLive: 'Viva',
    layerUnderstand: 'Kompreni',
    flowContext: 'Kunteksto',
    flowAction: 'Ago',
    flowProof: 'Pruvo',
    flowTraceability: 'Spurebleco'
  }
};

translations.es = {
  ...translations.en,
  eyebrow: 'GO · Crear · Construir',
  subtitle: 'La primera base de interfaz ejecutable para escritorio, tablet y móvil.',
  compassTitle: 'Brújula PALACO 2040',
  compassSubtitle: 'Primero entender. Después actuar con prueba.',
  safeReturn: 'Regreso seguro',
  commandLayerTitle: 'Capa de comandos',
  backToStart: 'Volver al inicio',
  riskLevelMedium: 'Medio',
  sessionLive: 'Activo',
  layerUnderstand: 'Entender'
};

translations.fr = {
  ...translations.en,
  eyebrow: 'GO · Créer · Construire',
  subtitle: 'La première base UI exécutable pour ordinateur, tablette et mobile.',
  compassTitle: 'Boussole PALACO 2040',
  compassSubtitle: 'Comprendre d’abord. Agir avec preuve.',
  safeReturn: 'Retour sûr',
  commandLayerTitle: 'Couche de commande',
  backToStart: 'Retour au départ',
  riskLevelMedium: 'Moyen',
  sessionLive: 'Actif',
  layerUnderstand: 'Comprendre'
};

translations.zh = {
  ...translations.en,
  eyebrow: 'GO · 创建 · 构建',
  subtitle: '适用于桌面、平板和移动设备的首个可执行 UI 基础。',
  compassTitle: 'PALACO 2040 指南针',
  compassSubtitle: '先理解，再基于证据行动。',
  safeReturn: '安全返回',
  commandLayerTitle: '指令层',
  backToStart: '返回起点',
  riskLevelMedium: '中',
  sessionLive: '在线',
  layerUnderstand: '理解'
};

translations.ru = {
  ...translations.en,
  eyebrow: 'GO · Создавать · Строить',
  subtitle: 'Первая исполняемая UI-основа для десктопа, планшета и мобильных устройств.',
  compassTitle: 'Компас PALACO 2040',
  compassSubtitle: 'Сначала понять. Затем действовать с доказательством.',
  safeReturn: 'Безопасный возврат',
  commandLayerTitle: 'Командный слой',
  backToStart: 'Назад к началу',
  riskLevelMedium: 'Средний',
  sessionLive: 'Активна',
  layerUnderstand: 'Понимание'
};

translations.ar = {
  ...translations.en,
  eyebrow: 'انطلق · أنشئ · ابنِ',
  subtitle: 'أول أساس واجهة قابل للتنفيذ لسطح المكتب والجهاز اللوحي والهاتف.',
  compassTitle: 'بوصلة PALACO 2040',
  compassSubtitle: 'افهم أولًا، ثم تصرّف بالدليل.',
  safeReturn: 'عودة آمنة',
  commandLayerTitle: 'طبقة الأوامر',
  backToStart: 'العودة إلى البداية',
  riskLevelMedium: 'متوسط',
  sessionLive: 'نشط',
  layerUnderstand: 'فهم'
};

translations.atl = {
  ...translations.en,
  eyebrow: 'GO · Zhara · Kora',
  subtitle: 'The first executable UI foundation for all PALACO surfaces in Atlantis mode.',
  compassTitle: 'PALACO 2040 Star Compass',
  compassSubtitle: 'Attune first. Then act with proof.',
  safeReturn: 'Return to origin',
  commandLayerTitle: 'Signal layer',
  backToStart: 'Back to origin',
  riskLevelMedium: 'Tide-mid',
  sessionLive: 'Flowing',
  layerUnderstand: 'Attunement'
};

const defaultLanguage = 'en';
const languageConfig = {
  en: { label: 'EN', locale: 'en-US', dir: 'ltr' },
  nl: { label: 'NL', locale: 'nl-NL', dir: 'ltr' },
  eo: { label: 'EO', locale: 'eo', dir: 'ltr' },
  es: { label: 'ES', locale: 'es-ES', dir: 'ltr' },
  fr: { label: 'FR', locale: 'fr-FR', dir: 'ltr' },
  zh: { label: 'ZH', locale: 'zh-CN', dir: 'ltr' },
  ru: { label: 'RU', locale: 'ru-RU', dir: 'ltr' },
  ar: { label: 'AR', locale: 'ar', dir: 'rtl' },
  atl: { label: 'ATL', locale: 'en-US', dir: 'ltr' }
};

const availableLanguages = Object.keys(translations);
let languageButtons = [];
let currentLanguage = localStorage.getItem('palaco-language') || defaultLanguage;
const controlState = JSON.parse(localStorage.getItem('palaco-control-state') || '{"industry":false,"citadel":false}');

const saveControlState = () => {
  localStorage.setItem('palaco-control-state', JSON.stringify(controlState));
};

const isSupportedLanguage = (lang) => availableLanguages.includes(lang);

const getLanguageMeta = (lang) => ({
  label: lang.toUpperCase(),
  locale: lang,
  dir: 'ltr',
  ...languageConfig[lang]
});

const getTranslation = (lang, key) => {
  if (translations[lang]?.[key] !== undefined) return translations[lang][key];
  if (translations[defaultLanguage]?.[key] !== undefined) return translations[defaultLanguage][key];
  return '';
};

const validateTranslations = () => {
  const requiredKeys = Object.keys(translations[defaultLanguage] || {});
  availableLanguages.forEach((lang) => {
    const missingKeys = requiredKeys.filter((key) => translations[lang]?.[key] === undefined);
    if (missingKeys.length) {
      console.warn(`[i18n] Missing ${missingKeys.length} key(s) for "${lang}": ${missingKeys.join(', ')}`);
    }
  });
};

const renderLanguageButtons = () => {
  if (!languageSwitch) return;
  languageSwitch.innerHTML = '';

  const fragment = document.createDocumentFragment();
  availableLanguages.forEach((lang) => {
    const button = document.createElement('button');
    const meta = getLanguageMeta(lang);
    button.type = 'button';
    button.className = 'lang-btn';
    button.dataset.lang = lang;
    button.textContent = meta.label;
    button.addEventListener('click', () => setLanguage(lang));
    fragment.appendChild(button);
  });

  languageSwitch.appendChild(fragment);
  languageButtons = Array.from(languageSwitch.querySelectorAll('.lang-btn'));
};

const getLocale = () => {
  return getLanguageMeta(currentLanguage).locale;
};

const updateSyncOutput = () => {
  const lastSync = localStorage.getItem('palaco-last-sync');
  if (!syncOutput) return;
  if (!lastSync) {
    syncOutput.textContent = '';
    return;
  }

  const formatter = new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  syncOutput.textContent = `${getTranslation(currentLanguage, 'lastSync')} ${formatter.format(new Date(lastSync))}`;
};

const updateControlUI = () => {
  if (industryStatus) {
    industryStatus.textContent = controlState.industry
      ? getTranslation(currentLanguage, 'statusActive')
      : getTranslation(currentLanguage, 'statusStandby');
  }

  if (citadelStatus) {
    citadelStatus.textContent = controlState.citadel
      ? getTranslation(currentLanguage, 'statusActive')
      : getTranslation(currentLanguage, 'statusStandby');
  }

  controlButtons.forEach((button) => {
    const target = button.dataset.controlTarget;
    const enabled = Boolean(controlState[target]);
    button.textContent = enabled ? getTranslation(currentLanguage, 'deactivate') : getTranslation(currentLanguage, 'activate');
    button.classList.toggle('is-active', enabled);
  });

  updateSyncOutput();
};

const setLanguage = (lang) => {
  if (!isSupportedLanguage(lang)) return;
  currentLanguage = lang;
  localStorage.setItem('palaco-language', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = getLanguageMeta(lang).dir;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = getTranslation(lang, key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', getTranslation(lang, key));
  });

  languageButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  const previousGoal = localStorage.getItem('palaco-goal');
  if (previousGoal && output) {
    output.textContent = `${getTranslation(lang, 'latestGoal')} ${previousGoal}`;
  }

  updateControlUI();
};

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const goal = input?.value.trim();
  if (!goal || !output) return;

  output.textContent = `${getTranslation(currentLanguage, 'goalSet')} ${goal}`;
  localStorage.setItem('palaco-goal', goal);
  form.reset();
});

controlButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.controlTarget;
    if (!target || !(target in controlState)) return;
    controlState[target] = !controlState[target];
    saveControlState();
    updateControlUI();
  });
});

syncBtn?.addEventListener('click', () => {
  localStorage.setItem('palaco-last-sync', new Date().toISOString());
  updateSyncOutput();
});

compassBackTopBtn?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

validateTranslations();
renderLanguageButtons();
setLanguage(isSupportedLanguage(currentLanguage) ? currentLanguage : defaultLanguage);
