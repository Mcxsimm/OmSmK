# OmSmK
Le logiciel de suivi de chantier - pour les pros - dédiés à l'excellence opérationnelle

Application web (PWA) de pilotage de gros chantiers d'**étanchéité** et de **façade**, construite sur la méthode
Excellence Opérationnelle SMAC : BTE standard, cadences cibles, suivi hebdomadaire par phase, check-list du conducteur de travaux.
Elle fonctionne **hors-ligne** sur smartphone, tablette ou PC, sans serveur ni compte.

## Interface
Pas de longue liste de menus : cinq **espaces** dans la barre du haut (Accueil, Chantier, Terrain, Coordination, Gestion).
Chaque espace s'ouvre sur une page de **tuiles interactives** (chiffre clé, état, action rapide) et propose ses pages en onglets.
Bouton **+** de création rapide (pointage, photo, action, réserve, quart d'heure sécurité, compte rendu…), **recherche** de tout
(pages, chantiers, actions, intervenants, compagnons) avec Ctrl+K, sélecteur de chantier, barre du bas sur mobile,
thème clair / sombre, graphiques interactifs (courbe d'avancement réel vs prévu, écarts d'heures par phase), vue portefeuille
multi-chantiers et rapport PDF mis en page. Palette des graphiques validée pour les daltoniens ; l'identité des séries n'est
jamais portée par la couleur seule (légende, pointillés, étiquettes directes).

## Fonctionnalités

| Onglet | Contenu |
|---|---|
| 🏠 **Ma journée** | Page d'accueil du conducteur de travaux, tous chantiers confondus : actions en retard et à échéance (saisie rapide), agenda des 7 prochains jours (réunions, jalons, livraisons, démarrages de phases, levées de réserves), points d'attention de tous les chantiers classés par gravité, tableau des chantiers (avancement, impact projeté, délai, actions, réserves, dernier pointage). |
| 📊 **Tableau de bord** | Courbe d'avancement réel vs prévu, écarts par phase, activité récente, avancement pondéré, heures budgétées / pointées, écart d'heures à date et projeté (h et €), indice de productivité, avancement terrain, réserves, intempéries, alertes automatiques (dérives, réserves en retard, semaine non saisie). |
| 🕒 **Pointage journalier** | Équipe du chantier (chef, compagnons, intérimaires), pointage de chaque compagnon chaque jour : statut (présent, intempéries, congés, maladie, formation, absent), heures **ventilées par phase du BTE** (plusieurs phases possibles), heures d'intempéries, panier. « Tous présents » et « Reprendre la veille » en un geste. Budget d'heures par phase (pointé / budget / % réalisé / reste). Relevé d'heures hebdomadaire PDF à signer, export Excel. Les heures pointées **alimentent automatiquement le suivi hebdo**, les écarts et la main d'œuvre réelle. |
| ✅ **Terrain** | Saisie par zone (terrasse, façade, support, niveau…) : cochage des tâches horodaté avec le nom de l'opérateur, observations, « tout cocher », travaux non prévus, vue **matrice** zones × tâches, scan de **QR code** et étiquettes QR imprimables, récap du jour à copier dans WhatsApp / mail. |
| 🗓️ **Planning** | Gantt par phase du BTE : planning généré automatiquement (heures ÷ effectif, jours ouvrés, phases successives ou chevauchées) puis ajustable, avancement réel du suivi, activité réelle du pointage, **fin projetée au rythme constaté** et glissement en jours, fin contractuelle, jalons, planning PDF. |
| 📈 **Suivi hebdo** | Saisie hebdomadaire du % cumulé par ouvrage / phase ; heures reprises du pointage journalier, avec une colonne d'ajout manuel (ou saisie des heures à la semaine sans pointage), avec les mêmes formules que l'onglet « Étape 2 - Objectifs et suivi » du BTE SMAC. Le % peut être calculé à partir des quantités. Historique des semaines. |
| 🧮 **BTE** | Opérations par complexe / ouvrage et phase : métré, cadence (u/j/homme), heures, budget MO, devis, écarts. Bibliothèque des **cadences standard** (simulateurs Étanchéité V10 et Façades V8) avec coefficient chantier. Durée indicative selon la taille de l'équipe. |
| 📒 **Journal & photos** | Effectif, météo, heures, travaux et événements ; **photos** prises depuis le téléphone (compressées, disponibles hors-ligne, partagées avec l'équipe), rattachées aux entrées de journal et aux réserves, galerie par jour. Déclaration d'**intempérie** avec la liste des bonnes pratiques à vérifier avant de s'arrêter. |
| 🛡️ **Qualité** | Réserves / OPR (origine, responsable, échéance, levée), **check-list CDT** (20 points, 6 temps forts) et contrôle qualité de fin de chantier. |
| 🦺 **Sécurité** | Quarts d'heure sécurité avec **feuille d'émargement PDF signée à l'écran**, accueils sécurité des nouveaux arrivants, visites sécurité (non-conformités → actions correctives), **permis de feu** avec surveillance 2 h après travaux, registre des accidents et presqu'accidents, jours sans accident. |
| ✅ **Plan d'actions** | Toutes les actions du chantier (réunions, sécurité, relances) avec responsable, échéance, retard ; saisie rapide. |
| 📄 **Rapport mensuel** | PDF d'avancement pour le maître d'œuvre : chiffres clés, avancement du mois par phase, Gantt et délai, effectifs pointés, intempéries, faits marquants du journal, sécurité, qualité, facturation, points en attente, photos du mois, commentaire du conducteur. |
| ✍️ **Signatures et PV** | Signature au doigt ou au stylet : émargement des quarts d'heure, accueils sécurité, permis de feu ; **PV de réception** (sans / avec réserves / différée, délai de levée) et **PV de levée des réserves** signés par le maître d'ouvrage, le maître d'œuvre et l'entreprise, en PDF. |
| 📅 **Agenda et rappels** | Ajout à l'agenda du téléphone (fichier .ics) des réunions, échéances d'actions, jalons, livraisons et démarrages de phases, avec rappels intégrés ; notifications sur l'appareil (actions échues, réunion du jour, permis de feu à surveiller, pointage manquant le soir). |
| 🤝 **Réunions & CR** | Compte rendu de réunion pré-rempli (participants, sujets du CR précédent, avancement, planning, réserves), actions décidées, suivi des actions en cours, prochaine réunion ; **PDF diffusé** par partage ou e-mail aux participants. |
| 📇 **Annuaire** | Intervenants du chantier par rôle (MOA, MOE, bureau de contrôle, CSPS, entreprises, fournisseurs) : appel et e-mail en un geste, convocation aux réunions. |
| 💶 **Synthèse financière** | Chiffre d'affaires (marché + avenants), facturé et encaissé, déboursé par poste (main d'œuvre, matériaux, sous-traitance, matériel, divers) : budget BTE / réel ou engagé / fin d'affaire, marge prévue vs marge fin d'affaire, courbe facturation vs dépenses, alerte de retard de facturation. |
| 🧾 **Situations mensuelles** | Décomposition du marché (DPGF, import CSV / Excel) et avenants ; situation de travaux mensuelle par poste (% cumulé, montant du mois, retenue de garantie, compte prorata, TVA), circuit brouillon → transmise MOE → validée → facturée → payée, PDF à transmettre au maître d'œuvre. |
| 🛒 **Commandes & achats** | Commandes fournisseurs avec lignes (catalogue matériaux importé du BTE), statut jusqu'à la livraison et la facture, retards de livraison, engagé vs budget achats, bon de commande PDF. |
| 💼 **Portefeuille** | Tous les chantiers avec avancement, écarts, impact projeté et réserves ; totaux consolidés. |
| ⚙️ **Paramètres** | Fiche chantier, synchronisation en ligne (équipes, partage), imports, exports Excel / PDF, sauvegarde et restauration JSON, démo. |

### Calculs financiers
- Situation : cumul = % cumulé × montant du poste ; montant du mois = cumul − cumul de la situation précédente ; retenue de garantie et compte prorata sur le HT du mois, puis TVA
- Fin d'affaire : main d'œuvre = budget − impact projeté du suivi hebdomadaire ; achats = le plus élevé entre budget et engagé ; marge = CA − déboursé
- L'en-tête des documents (raison sociale, adresse, SIRET) se règle dans Paramètres → Entreprise

### Calculs (identiques au fichier de suivi standard SMAC)
- Heures budgétées d'une opération = métré ÷ cadence × heures par jour (ou heures au forfait)
- Écart d'heures à date = heures budgétées × % réalisé − heures pointées (positif = gain)
- Impact € = écart d'heures × taux horaire de l'équipe
- Écart projeté = écart d'heures ÷ % réalisé (le total est calculé comme écart total ÷ avancement global)

- Heures pointées d'une semaine et d'une phase = somme des pointages journaliers (compagnons présents) + heures saisies manuellement dans le suivi ; les heures non ventilées ou hors BTE comptent dans la main d'œuvre réelle, pas dans l'avancement

- Planning : durée d'une phase = heures budgétées ÷ (effectif × heures par jour), en jours ouvrés ; une phase est en retard si son % réalisé est inférieur de plus de 10 points au % attendu à date (linéaire entre ses dates) ou si sa fin est dépassée ; fin projetée = début réel + jours écoulés ÷ % réalisé

Contrôlé sur le cas pratique CIGV : 133,5 h budgétées, +1,86 h / +55,75 € à date, +4,36 h / +130,90 € projetés.

## Imports
- **BTE standard SMAC (.xlsx)** : informations chantier (onglet Synthèse), opérations (onglet *1a Main d'œuvre*) et saisies hebdomadaires déjà faites (onglet *Étape 2 - Objectifs et suivi*).
- **Liste terrain (.csv / .xlsx)** : colonnes `Chantier;Zone;Lot;Tache;Fait;Observation` (« Support » est accepté à la place de « Zone »). Voir `exemples/terrain_exemple.csv`.
- **Sauvegarde (.json)** produite par l'application.

## Utilisation
- **En ligne** : publier le dossier sur GitHub Pages (Settings → Pages → branche) et ouvrir l'URL sur le téléphone, puis « Ajouter à l'écran d'accueil ».
- **En local** : `python3 -m http.server` dans le dossier, puis ouvrir http://localhost:8000.
- Les QR codes de zone contiennent l'URL de l'application avec `?c=<chantier>&z=<zone>` : le scan ouvre directement la saisie de la zone.

## Données et synchronisation en ligne
Les données sont d'abord stockées **sur l'appareil** (localStorage) : l'application fonctionne sans réseau.

La **synchronisation en ligne** (onglet ⚙️ Chantiers & données → ☁️ Synchronisation en ligne) permet de travailler à plusieurs :
1. chaque personne se connecte avec son **adresse e-mail** (lien ou code reçu par e-mail, sans mot de passe) ;
2. un conducteur crée une **équipe** et y **invite** les personnes par e-mail (rôle membre ou administrateur) ;
3. il **partage** un chantier avec l'équipe : BTE, suivi hebdo, tâches terrain, journal, réserves et check-lists sont alors visibles et modifiables par tous les membres, mis à jour en direct ;
4. hors-ligne, les saisies restent sur l'appareil et partent au retour du réseau. Si deux personnes modifient le même élément, la modification la plus récente l'emporte.

Les chantiers non partagés restent uniquement sur l'appareil. Hébergement : projet Supabase (base PostgreSQL), accès protégé par des règles RLS
(un utilisateur ne voit que les équipes dont il est membre). Schéma : `supabase/migrations/`.
Les photos sont conservées dans IndexedDB sur l'appareil ; celles des chantiers partagés sont déposées dans le stockage privé `omsmk-photos` (un dossier par équipe, accessible aux seuls membres).

### Réglages Supabase à faire une fois (tableau de bord Supabase)
- **Authentication → URL Configuration** : *Site URL* = l'adresse publique de l'application (ex. `https://mcxsimm.github.io/OmSmK/`), à ajouter aussi dans *Redirect URLs*.
- **Authentication → Email Templates → Magic Link** : ajouter `{{ .Token }}` dans le message pour recevoir aussi un **code à 6 chiffres** (pratique quand l'application est installée sur l'écran d'accueil).
- L'envoi d'e-mails intégré à Supabase est limité à quelques messages par heure : pour une équipe, configurer un SMTP (Authentication → SMTP Settings).

## Tests
```
deno lint
deno test -A
```
Les tests vérifient les calculs (contrôlés sur le BTE du cas CIGV), l'import CSV et la logique de synchronisation (conflits, suppressions, hors-ligne).

## Structure
```
index.html            Application (shell)
css/app.css           Styles
js/referentiel.js     Référentiel métier : phases, opérations, cadences, check-lists, intempéries
js/calculs.js         Calculs métier purs (BTE, suivi, terrain, CSV)
js/synchro.js         Synchronisation en ligne (Supabase)
js/config.js          Adresse et clé publique du projet Supabase
js/ui.js              Briques d'interface : formats, icônes, notifications, boîtes de dialogue
js/graphiques.js      Graphiques SVG (courbe d'avancement, écarts par phase)
js/app.js             État, vues et actions
js/finances.js        Synthèse financière, situations mensuelles, commandes
js/pointage.js        Pointage journalier des compagnons, budget d'heures, relevé hebdomadaire
js/planning.js        Planning d'exécution (Gantt), jalons, planning PDF
js/coordination.js    Annuaire, plan d'actions, réunions et comptes rendus PDF
js/securite.js        Quarts d'heure sécurité, accueils, visites, permis de feu, accidents
js/photos.js          Photos (IndexedDB hors-ligne + stockage Supabase de l'équipe)
js/cockpit.js         « Ma journée » : actions, agenda et alertes de tous les chantiers
js/navigation.js      Espaces et tuiles, menu, création rapide, recherche (Ctrl+K)
js/signature.js       Signature à l'écran (doigt, stylet, souris) et insertion dans les PDF
js/pv.js              PV de réception et de levée des réserves
js/rapports.js        Rapport mensuel d'avancement pour le maître d'œuvre
js/agenda.js          Agenda du téléphone (.ics) et notifications de rappel
js/donnees.js         Imports, exports Excel, rapport PDF, situation, bon de commande et relevé d'heures PDF, QR codes
js/demarrage.js       Événements et démarrage
js/icones.js          Icônes Lucide (sous-ensemble)
js/demo.js            Données de démonstration (cas pratique CIGV)
sw.js                 Service worker (hors-ligne)
vendor/               SheetJS (Apache-2.0), jsPDF + AutoTable (MIT), qrcodejs (MIT), supabase-js (MIT), police Inter (OFL)
supabase/migrations/  Schéma de la base en ligne
tests/                Tests automatisés (Deno)
exemples/             Fichier d'exemple d'import terrain
```
