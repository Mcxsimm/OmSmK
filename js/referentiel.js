/* ==========================================================================
   Référentiel métier SMAC — phases, opérations, cadences standard,
   check-list conducteur de travaux, bonnes pratiques intempéries.
   Source : outils Excellence Opérationnelle SMAC (BTE standard, simulateurs
   de cadences Étanchéité V10 / Façades V8, check-list CDT, GT#3 intempéries).
   ========================================================================== */

// deno-lint-ignore no-unused-vars
const REFERENTIEL = {
  heuresJourDefaut: 7.5,
  tauxHoraireDefaut: 32.5,

  // Phases chantier standard et opérations associées (BTE — Étape 0)
  metiers: {
    "Étanchéité": {
      "Installation / Appro": ["Installation", "Repli", "Approvisionnement", "Sécurités collectives"],
      "Dépose": ["Dépose de la protection", "Dépose du complexe"],
      "Pare-vapeur": ["Vernis", "Pare-vapeur", "Equerre PV"],
      "Hors d'eau": ["Isolant", "2ème isolant", "1ère couche (+ écran)", "Equerre de renfort", "EP", "Crosses", "Lanterneaux"],
      "2nd couche et relevés": ["2nd couche", "Joint dilatation", "Relevés non isolés", "Relevés isolés"],
      "Protection": ["Protection gravillons", "Dalles sur plots", "Protection lourde"],
      "Finitions": ["Solins", "Couvertines", "Garde-corps"],
      "Etanchéité provisoire": ["Etanchéité provisoire"],
      "Réserves": ["Levée de réserves"]
    },
    "Façade": {
      "Installation / Appro": ["Installation", "Repli", "Approvisionnement", "Sécurités collectives"],
      "Dépose": ["Dépose du bardage"],
      "Support": ["Plateaux / peau intérieure", "1ère ossature"],
      "Isolant et 2nd ossature": ["Isolant", "2ème isolant", "Pare-air / pare-pluie", "2nd ossature"],
      "Peau extérieure": ["Peau / bardage extérieur", "Encadrements", "Angles", "Bavettes"],
      "Finitions": ["Couvertines"],
      "Contre-bardage": ["Contre-bardage"],
      "Réserves": ["Levée de réserves"]
    }
  },

  // Cadences standard : h = heures par unité (h/m² ou h/mL). Cadence (u/j/homme) = heuresJour / h
  cadences: [
    // --- Étanchéité ---
    { m: "Étanchéité", phase: "Installation / Appro", op: "Sécurités collectives", s: "Tous", lib: "Potelets et filets garde-corps périphériques", h: 0.35, u: "mL" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose de la protection", s: "Tous", lib: "Gravillon", h: 0.1, u: "m²" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose de la protection", s: "Tous", lib: "Dalles sur plots (évacuées)", h: 1, u: "m²" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose de la protection", s: "Tous", lib: "Dalles sur plots (réutilisées)", h: 0.2, u: "m²" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose du complexe", s: "Tous", lib: "Multicouche indépendant sans pare-vapeur", h: 0.12, u: "m²" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose du complexe", s: "Tous", lib: "Multicouche en adhérence sans pare-vapeur", h: 0.15, u: "m²" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose du complexe", s: "Tous", lib: "Multicouche en adhérence incluant pare-vapeur", h: 0.42, u: "m²" },
    { m: "Étanchéité", phase: "Dépose", op: "Dépose du complexe", s: "Tous", lib: "Multicouche indépendant incluant pare-vapeur", h: 0.45, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Vernis", s: "Tous", lib: "Vernis (EIF - ANTAC)", h: 0.015, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Pare-vapeur", s: "Acier", lib: "VAP ou acoustique", h: 0.015, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Pare-vapeur", s: "Acier", lib: "VAP adhésif (forte hygro) - simple", h: 0.025, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Pare-vapeur", s: "Acier", lib: "VAP adhésif (forte hygro) - étanchéité à l'air", h: 0.07, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Pare-vapeur", s: "Béton", lib: "Hyrène 25/25 TS", h: 0.035, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Pare-vapeur", s: "Béton", lib: "Rollstick 31 Alpa", h: 0.035, u: "m²" },
    { m: "Étanchéité", phase: "Pare-vapeur", op: "Equerre PV", s: "Tous", lib: "Hyrène PY 35", h: 0.06, u: "mL" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Acier", lib: "PU ou PSE fixé mécaniquement", h: 0.03, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Acier", lib: "Laine de roche nue fix. méca. (< 160 mm) ou PU/PSE", h: 0.04, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Acier", lib: "Laine de roche nue fix. méca. (> 160 mm) ou PU/PSE", h: 0.07, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Acier", lib: "Laine de roche soudable fix. méca. (< 160 mm)", h: 0.05, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Acier", lib: "Laine de roche soudable fix. méca. (> 160 mm)", h: 0.08, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Tous", lib: "Verre cellulaire Foamglass collé par EAC", h: 0.1, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Béton", lib: "PU ou PSE posé libre", h: 0.025, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Béton", lib: "PU ou PSE collé", h: 0.04, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Béton", lib: "Laine de roche posée libre", h: 0.03, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Béton", lib: "Laine de roche collée", h: 0.05, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Béton", lib: "Verre cellulaire pente intégrée Foamglass (EAC)", h: 0.15, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Acier", lib: "TOPFIX FMP fixations mécaniques", h: 0.0375, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Béton", lib: "Autoprotégée - Hyrène SPOT adhésif", h: 0.035, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Béton", lib: "Autoprotégée - Hyrène TS I2 semi-indépendant", h: 0.03, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Béton", lib: "Protection lourde - Hyrène TS (CPV ou PY) indépendant", h: 0.0375, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Béton", lib: "Protection lourde - FORCE 4000 (avec bande de pontage)", h: 0.042, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Béton", lib: "Autoprotégée - Alpadecor semi-indépendant + thermécran", h: 0.0375, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "1ère couche (+ écran)", s: "Béton", lib: "Autoprotégée - Alpadecor adhérent + thermécran", h: 0.0375, u: "m²" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Equerre de renfort", s: "Tous", lib: "Hyrène PY 35", h: 0.06, u: "mL" },
    { m: "Étanchéité", phase: "Hors d'eau", op: "Isolant", s: "Acier", lib: "Bac acier moyen (pose du bac)", h: 0.025, u: "m²" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "2nd couche", s: "Acier", lib: "TOPAZ soudé (ardoisé)", h: 0.0375, u: "m²" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "2nd couche", s: "Béton", lib: "Autoprotégée - Hyrène 40 TS", h: 0.0375, u: "m²" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "2nd couche", s: "Béton", lib: "Protection lourde - Hyrène 25/25 TS", h: 0.035, u: "m²" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés isolés", s: "Tous", lib: "Isolation verticale acrotère béton ép. 80 mm ht 150 mm", h: 0.05, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés isolés", s: "Tous", lib: "Isolation verticale acrotère béton ép. 80 mm ht 500 mm", h: 0.07, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés non isolés", s: "Tous", lib: "Autoprotégée - ALUVER 50 TS - ht 0,15 m", h: 0.1, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés non isolés", s: "Tous", lib: "Autoprotégée - ALUVER 50 TS - ht 0,50 m", h: 0.12, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés non isolés", s: "Tous", lib: "ARMA ALU - ht 0,15 m", h: 0.08, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés non isolés", s: "Tous", lib: "ARMA ALU - ht 0,50 m", h: 0.09, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés non isolés", s: "Tous", lib: "Membrane PVC fixée en tête (bande de serrage ALU)", h: 0.06, u: "mL" },
    { m: "Étanchéité", phase: "2nd couche et relevés", op: "Relevés isolés", s: "Tous", lib: "Équerre de renfort Hyrène PY 35 (relevé isolé)", h: 0.06, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Solins", s: "Tous", lib: "Solin ALU brut avec joint comprimé", h: 0.14, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Solins", s: "Tous", lib: "Solin ALU brut porte dalle", h: 0.14, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Couvertine acier galvanisé (dév. 500 mm, bandeau 100 mm)", h: 0.2, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Couvertine zinc naturel / prépatiné (33 à 45 cm)", h: 0.4, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Rive Alu brut 50/100 (avec bande de pontage)", h: 0.22, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Costière 1 pli acier galva (ht 250 à 450 mm)", h: 0.04, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Costière 1 pli acier galva (ht 500 à 600 mm)", h: 0.06, u: "mL" },
    { m: "Étanchéité", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Costière voûtes filantes acier galva 20/10", h: 0.3, u: "mL" },
    { m: "Étanchéité", phase: "Protection", op: "Protection gravillons", s: "Béton", lib: "Gravillons", h: 0.04, u: "m²" },
    { m: "Étanchéité", phase: "Protection", op: "Dalles sur plots", s: "Béton", lib: "Dallettes sur plots", h: 1, u: "m²" },
    { m: "Étanchéité", phase: "Protection", op: "Protection lourde", s: "Béton", lib: "Grille caillebotis caniveau", h: 0.25, u: "mL" },
    // --- Façade ---
    { m: "Façade", phase: "Support", op: "Plateaux / peau intérieure", s: "Tous", lib: "Plateau horizontal sur charpente - fixation pistolet", h: 0.09, u: "m²" },
    { m: "Façade", phase: "Support", op: "Plateaux / peau intérieure", s: "Tous", lib: "Plateau horizontal sur charpente - perçage et vissage", h: 0.17, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Tous", lib: "Ossature verticale sur plateau", h: 0.06, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Tous", lib: "Ossature 45° sur plateau", h: 0.085, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Béton", lib: "Ossature sur béton - pattes", h: 0.12, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Béton", lib: "Ossature sur béton", h: 0.07, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Acier", lib: "Ossature sur acier", h: 0.09, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Parpaing", lib: "Ossature sur parpaing (fixation chimique)", h: 0.11, u: "m²" },
    { m: "Façade", phase: "Support", op: "1ère ossature", s: "Parpaing", lib: "Ossature sur parpaing (fixation chimique) - pattes", h: 0.18, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "Isolant", s: "Acier", lib: "Isolant sur acier - Rockbardage", h: 0.05, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "Isolant", s: "Béton", lib: "Isolant rigide sur béton - perçage et vissage", h: 0.11, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "Isolant", s: "Béton", lib: "Isolant souple sur béton - perçage et vissage", h: 0.05, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "Isolant", s: "Béton", lib: "Isolant rigide sur béton - fixation pistolet", h: 0.09, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "Isolant", s: "Béton", lib: "Isolant souple sur béton - fixation pistolet", h: 0.04, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "Pare-air / pare-pluie", s: "Tous", lib: "Pare-air / pare-pluie sur isolant - perçage et vissage", h: 0.2, u: "m²" },
    { m: "Façade", phase: "Isolant et 2nd ossature", op: "2nd ossature", s: "Tous", lib: "Ossature verticale ou horizontale - lisses métalliques", h: 0.055, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Cassettes (< 3 m²)", h: 0.45, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Cassettes (> 3 m²)", h: 0.55, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Clins (< 4 ml)", h: 0.25, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Clins (> 4 ml) - pose verticale", h: 0.32, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Clins (> 4 ml) - pose horizontale", h: 0.22, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Tôle nervurée (< 4 m²) - pose verticale", h: 0.11, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Tôle nervurée (> 4 m²) - pose verticale", h: 0.12, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Peau / bardage extérieur", s: "Tous", lib: "Tôle nervurée (~ 6 m²) - pose horizontale", h: 0.15, u: "m²" },
    { m: "Façade", phase: "Peau extérieure", op: "Encadrements", s: "Tous", lib: "Encadrement sur mesure pièce par pièce", h: 0.28, u: "mL" },
    { m: "Façade", phase: "Finitions", op: "Couvertines", s: "Tous", lib: "Finitions (couvertines, bavettes basses, sous-faces, angles)", h: 0.5, u: "mL" }
  ],

  // Check-list du conducteur de travaux — 6 temps forts, 20 points
  checklistCDT: [
    { section: "I. Transfert commercial", items: [
      "Participer à la réunion de transfert commercial et s'assurer que tous les axes d'échange principaux ont été couverts"
    ]},
    { section: "II. Préparation de travaux", items: [
      "Catégoriser ses achats et anticiper les cycles de commande longs (pièces d'usinage, aciers) ou courts (récurrents)",
      "Étudier l'environnement du chantier et ses impacts sur le plan de sécurité",
      "Planifier la mobilisation des ressources humaines et matérielles au moins 2 mois avant le début des travaux",
      "Construire le BTE objectivement en s'appuyant sur la structure standard SMAC et sur les cadences spécifiques du chantier",
      "Assurer le suivi et la validation des plans généraux et/ou de calepinage",
      "Contrôler que tous les éléments prioritaires sont présents dans les carnets de détails",
      "Présenter et valider le plan de réalisation avec la maîtrise d'œuvre (main d'œuvre, sécurité, levage, accessibilité, coactivité)"
    ]},
    { section: "III. Lancement de travaux", items: [
      "Effectuer une réunion / visite terrain de lancement avec le chef de chantier, 1 à 2 semaines avant démarrage",
      "Réaliser un PV de réception de support / état des lieux avec le chef de chantier, signé par le client"
    ]},
    { section: "IV. Pilotage de l'exécution", items: [
      "S'assurer de la réception des avenants au fil de l'eau et du traitement des OPR / réserves avant réception",
      "Contrôler la qualité de pose (bon geste, auto-contrôle, organisation) lors de chaque visite chantier",
      "Suivre l'avancement du chantier par phase ou opération à partir du fichier de suivi standard",
      "Mesurer au fil de l'eau les écarts BTE / réalisation (main d'œuvre, matériel…)",
      "Contrôler le pointage d'heures réalisé par l'équipe de réalisation",
      "Réaliser un « Circuit-Court » mensuel"
    ]},
    { section: "V. Gestion administrative et contractuelle", items: [
      "S'assurer du respect des modalités administratives du contrat (facturation, encaissements, litiges, garanties…)",
      "Garder la traçabilité des documents internes/externes selon la classification SMAC (archivage)"
    ]},
    { section: "VI. Retours d'expérience / Excellence", items: [
      "Collecter les retours d'expérience au fil de l'eau (clôture de chantier, réunions d'exploitation…)",
      "Valider le dossier de clôture administratif et économique avec le client et proposer un carnet d'entretien"
    ]}
  ],

  // Contrôle qualité fin de chantier (base générique, à adapter)
  qualiteFinChantier: [
    { section: "Ouvrage", items: [
      "Relevés et équerres conformes au carnet de détails (hauteurs, recouvrements)",
      "Évacuations EP et trop-pleins dégagés, crapaudines en place",
      "Finitions posées (solins, couvertines, bavettes) et fixations contrôlées",
      "Protection (gravillons / dalles) conforme et répartie",
      "Essai / PV de mise en eau réalisé et signé si requis",
      "Aucune dégradation de l'ouvrage par les autres corps d'état"
    ]},
    { section: "Chantier", items: [
      "Repli du matériel et des outils effectué",
      "Évacuation des déchets et matériaux résiduels",
      "Zone de travail restituée propre",
      "Sécurités collectives déposées ou transférées"
    ]},
    { section: "Documents", items: [
      "Photos de fin de chantier prises (vue générale + points singuliers)",
      "OPR traitées et réserves levées",
      "DOE / fiches techniques transmis",
      "PV de réception signé"
    ]}
  ],

  // Bonnes pratiques à vérifier avant de se déclarer en intempéries (GT#3)
  intemperies: [
    "Passer le vernis la veille sur un maximum de surface / mètres linéaires",
    "Identifier les zones / terrasses abritées ou moins exposées où continuer à travailler",
    "Temps masqué : assemblage vis et rondelles",
    "Temps masqué : prédécoupage de bandes d'équerres / relevés / rouleaux",
    "Approvisionner les matériaux pour les phases suivantes",
    "Prendre les cotes des pièces de finition à usiner",
    "Ordonner le chantier, ranger le camion",
    "Relire le carnet de détails (prochains points d'attention)",
    "Préparer les objectifs de réalisation des jours suivants",
    "Assister aux réunions de lancement des chantiers à venir"
  ],

  // Sécurité : thèmes de quart d'heure sécurité (causeries)
  themesSecurite: [
    "Travail en hauteur : garde-corps, harnais, lignes de vie",
    "Travaux par point chaud : chalumeau, permis de feu, extincteur",
    "Bouteilles de gaz : stockage, transport, détendeurs, flexibles",
    "Manutention manuelle et port de charges (rouleaux, isolant)",
    "Levage : grue, monte-matériaux, élingage, zone balisée",
    "Équipements de protection individuelle (EPI)",
    "Chutes de plain-pied : ordre, propreté, circulation",
    "Coactivité et interfaces avec les autres entreprises",
    "Intempéries : vent, chaleur, froid, surfaces glissantes",
    "Produits dangereux : primaires, colles, solvants (FDS)",
    "Risque électrique et outillage portatif",
    "Accès en toiture : échafaudage, échelle, trémies et lanterneaux",
    "Conduite à tenir en cas d'accident, alerte des secours",
    "Addictions, fatigue et vigilance"
  ],
  // Accueil sécurité d'un nouvel arrivant sur le chantier
  accueilSecurite: [
    "Présentation du chantier, des intervenants et du chef de chantier",
    "Consignes du PPSPS et du plan de prévention",
    "Zones à risques, accès, circulations et stockages",
    "EPI obligatoires remis et vérifiés (casque, harnais, chaussures, gants, lunettes)",
    "Protections collectives : garde-corps, lignes de vie, trémies",
    "Travaux par point chaud : permis de feu et extincteurs",
    "Conduite à tenir en cas d'accident, trousse de secours, numéros d'urgence",
    "Sauveteurs secouristes du travail présents sur le chantier",
    "Installations d'hygiène (base vie, sanitaires, eau)",
    "Habilitations et autorisations vérifiées (CACES, travail en hauteur)"
  ],
  // Visite sécurité : points de contrôle (conforme / non conforme / sans objet)
  visiteSecurite: [
    "Port des EPI par tous les compagnons",
    "Protections collectives en place (garde-corps, filets, lignes de vie)",
    "Trémies, lanterneaux et ouvertures protégés",
    "Accès en toiture sécurisé (échafaudage, escalier, échelle fixée)",
    "Extincteur à moins de 10 m du poste de chalumeau",
    "Bouteilles de gaz arrimées, debout, à l'abri du soleil",
    "Permis de feu établi et surveillance après travaux",
    "Zone de levage balisée, élingues en bon état",
    "Ordre et propreté, évacuation des déchets",
    "Stockage des matériaux stable et lesté (vent)",
    "Affichage obligatoire et numéros d'urgence",
    "Trousse de secours complète et accessible"
  ],
  // Permis de feu : mesures préalables
  permisFeu: [
    "Zone de travail reconnue, matériaux combustibles éloignés ou protégés",
    "Extincteur(s) adapté(s) à proximité immédiate",
    "Flexibles, détendeurs et chalumeaux contrôlés",
    "Bouteilles debout, arrimées, robinet fermé à chaque arrêt",
    "Isolants et pare-vapeur combustibles protégés de la flamme",
    "Exploitant / occupant informé (détection incendie neutralisée si nécessaire)"
  ],
  typesEvenement: ["Accident avec arrêt", "Accident sans arrêt", "Presqu'accident", "Situation dangereuse", "Premiers soins"],

  meteo: ["Beau", "Nuageux", "Pluie", "Vent fort", "Gel", "Neige", "Orage", "Canicule"]
};
