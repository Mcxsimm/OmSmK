# OmSmK
Le logiciel de suivi de chantier - pour les pros - dédiés à l'excellence opérationnelle

Application web (PWA) de pilotage de gros chantiers d'**étanchéité** et de **façade**, construite sur la méthode
Excellence Opérationnelle SMAC : BTE standard, cadences cibles, suivi hebdomadaire par phase, check-list du conducteur de travaux.
Elle fonctionne **hors-ligne** sur smartphone, tablette ou PC, sans serveur ni compte.

## Interface
Navigation latérale (pilotage, terrain, organisation), sélecteur de chantier avec recherche, navigation basse sur mobile,
thème clair / sombre, graphiques interactifs (courbe d'avancement réel vs prévu, écarts d'heures par phase), vue portefeuille
multi-chantiers et rapport PDF mis en page. Palette des graphiques validée pour les daltoniens ; l'identité des séries n'est
jamais portée par la couleur seule (légende, pointillés, étiquettes directes).

## Fonctionnalités

| Onglet | Contenu |
|---|---|
| 📊 **Tableau de bord** | Courbe d'avancement réel vs prévu, écarts par phase, activité récente, avancement pondéré, heures budgétées / pointées, écart d'heures à date et projeté (h et €), indice de productivité, avancement terrain, réserves, intempéries, alertes automatiques (dérives, réserves en retard, semaine non saisie). |
| ✅ **Terrain** | Saisie par zone (terrasse, façade, support, niveau…) : cochage des tâches horodaté avec le nom de l'opérateur, observations, « tout cocher », travaux non prévus, vue **matrice** zones × tâches, scan de **QR code** et étiquettes QR imprimables, récap du jour à copier dans WhatsApp / mail. |
| 📈 **Suivi hebdo** | Saisie hebdomadaire du % cumulé et des heures pointées par ouvrage / phase, avec les mêmes formules que l'onglet « Étape 2 - Objectifs et suivi » du BTE SMAC. Le % peut être calculé à partir des quantités. Historique des semaines. |
| 🧮 **BTE** | Opérations par complexe / ouvrage et phase : métré, cadence (u/j/homme), heures, budget MO, devis, écarts. Bibliothèque des **cadences standard** (simulateurs Étanchéité V10 et Façades V8) avec coefficient chantier. Durée indicative selon la taille de l'équipe. |
| 📒 **Journal** | Effectif, météo, heures, travaux et événements. Déclaration d'**intempérie** avec la liste des bonnes pratiques à vérifier avant de s'arrêter. |
| 🛡️ **Qualité** | Réserves / OPR (origine, responsable, échéance, levée), **check-list CDT** (20 points, 6 temps forts) et contrôle qualité de fin de chantier. |
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
js/donnees.js         Imports, exports Excel, rapport PDF, situation et bon de commande PDF, QR codes
js/demarrage.js       Événements et démarrage
js/icones.js          Icônes Lucide (sous-ensemble)
js/demo.js            Données de démonstration (cas pratique CIGV)
sw.js                 Service worker (hors-ligne)
vendor/               SheetJS (Apache-2.0), jsPDF + AutoTable (MIT), qrcodejs (MIT), supabase-js (MIT), police Inter (OFL)
supabase/migrations/  Schéma de la base en ligne
tests/                Tests automatisés (Deno)
exemples/             Fichier d'exemple d'import terrain
```
