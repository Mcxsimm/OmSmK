# OmSmK
Le logiciel de suivi de chantier - pour les pros - dédiés à l'excellence opérationnelle

Application web (PWA) de pilotage de gros chantiers d'**étanchéité** et de **façade**, construite sur la méthode
Excellence Opérationnelle SMAC : BTE standard, cadences cibles, suivi hebdomadaire par phase, check-list du conducteur de travaux.
Elle fonctionne **hors-ligne** sur smartphone, tablette ou PC, sans serveur ni compte.

## Fonctionnalités

| Onglet | Contenu |
|---|---|
| 📊 **Tableau de bord** | Avancement pondéré, heures budgétées / pointées, écart d'heures à date et projeté (h et €), indice de productivité, avancement terrain, réserves, intempéries, alertes automatiques (dérives, réserves en retard, semaine non saisie). |
| ✅ **Terrain** | Saisie par zone (terrasse, façade, support, niveau…) : cochage des tâches horodaté avec le nom de l'opérateur, observations, « tout cocher », travaux non prévus, vue **matrice** zones × tâches, scan de **QR code** et étiquettes QR imprimables, récap du jour à copier dans WhatsApp / mail. |
| 📈 **Suivi hebdo** | Saisie hebdomadaire du % cumulé et des heures pointées par ouvrage / phase, avec les mêmes formules que l'onglet « Étape 2 - Objectifs et suivi » du BTE SMAC. Le % peut être calculé à partir des quantités. Historique des semaines. |
| 🧮 **BTE** | Opérations par complexe / ouvrage et phase : métré, cadence (u/j/homme), heures, budget MO, devis, écarts. Bibliothèque des **cadences standard** (simulateurs Étanchéité V10 et Façades V8) avec coefficient chantier. Durée indicative selon la taille de l'équipe. |
| 📒 **Journal** | Effectif, météo, heures, travaux et événements. Déclaration d'**intempérie** avec la liste des bonnes pratiques à vérifier avant de s'arrêter. |
| 🛡️ **Qualité** | Réserves / OPR (origine, responsable, échéance, levée), **check-list CDT** (20 points, 6 temps forts) et contrôle qualité de fin de chantier. |
| ⚙️ **Chantiers & données** | Fiche chantier, imports, exports Excel / PDF, sauvegarde et restauration JSON, démo. |

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

## Données
Toutes les données sont stockées **sur l'appareil** (localStorage du navigateur). Exportez régulièrement une sauvegarde JSON.
Pour partager un chantier entre plusieurs appareils, il faut pour l'instant passer par la sauvegarde JSON. La synchronisation multi-utilisateurs
(par exemple avec Supabase) est la prochaine étape envisagée.

## Structure
```
index.html            Application (shell)
css/app.css           Styles
js/referentiel.js     Référentiel métier : phases, opérations, cadences, check-lists, intempéries
js/app.js             Logique, vues, calculs, imports / exports
js/demo.js            Données de démonstration (cas pratique CIGV)
sw.js                 Service worker (hors-ligne)
vendor/               SheetJS (Apache-2.0), jsPDF + AutoTable (MIT), qrcodejs (MIT)
exemples/             Fichier d'exemple d'import terrain
```
