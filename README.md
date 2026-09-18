# Pulse — cabinet médical en Algérie

Application de rendez-vous en français : page publique du médecin, réservation, suivi
privé du patient et tableau de bord du cabinet. Les tarifs sont affichés en **dinars
algériens (DA / DZD)** et les horaires utilisent **Africa/Algiers (UTC+1)**.

## Démarrer sur votre ordinateur

```sh
npm install
npm run dev
```

Ouvrez **http://localhost:3000** pour la page d’accueil et
**http://localhost:3000/dashboard** pour le cabinet.

Au premier démarrage, le terminal affiche le compte administrateur et son mot de passe
généré. L’adresse initiale est `admin@pulse.local`. Sur une installation existante, le
compte et son mot de passe sont conservés. Vous pouvez définir `ADMIN_EMAIL` et
`ADMIN_PASSWORD` avant le tout premier démarrage.

Les coordonnées, le portrait et les tarifs initiaux sont des éléments de présentation à
remplacer par ceux du cabinet. Les prestations d’exemple sont à 5 000 DA, 3 000 DA et 7
000 DA : il ne s’agit pas d’une conversion de dollars.

## Une arborescence volontairement simple

Les fichiers qui constituent l’application sont regroupés par responsabilité :

| Fichier         | Rôle                                                               |
| --------------- | ------------------------------------------------------------------ |
| `index.html`    | Document HTML, langue, titre et description du site.               |
| `src/main.jsx`  | Toutes les pages React, regroupées en composants commentés.        |
| `src/style.css` | Styles du cabinet, de la page publique et des écrans mobiles.      |
| `server.js`     | API, base SQLite, comptes, contrôles d’accès et notifications.     |
| `scheduling.js` | Règles de planning, libellés français, tarifs et exports d’agenda. |

Les autres fichiers servent au fonctionnement du projet :

- `package.json` et `package-lock.json` : dépendances et commandes npm.
- `tests/` : tests du moteur de planning, de l’API et du navigateur.
- `.devcontainer/` : deux fichiers pour le test en ligne avec GitHub Codespaces.
- `.env.example` : explications des variables de configuration, sans mot de passe.
- `.gitignore` et `.gitattributes` : fichiers exclus de Git et fins de ligne.

Les dossiers `node_modules/`, `dist/`, `data/` et `artifacts/` sont générés. Ils ne font
pas partie des sources à publier sur GitHub. `data/` contient les données privées : ne le
supprimez pas si vous souhaitez conserver les rendez-vous.

### Structure recommandée

```text
index.html          Entrée HTML
server.js           Serveur, API et persistance
scheduling.js       Règles métier partagées
src/                Interface React et styles
tests/              Tests unitaires, intégration et navigateur
.devcontainer/      Configuration Codespaces uniquement
data/               Données locales générées, à conserver mais jamais publier
dist/               Build généré, recréé par npm run build
artifacts/          Captures et résultats générés par les tests navigateur
```

Cette structure est volontairement courte : `server.js` et `scheduling.js` restent à la
racine afin que les commandes Node et les tests puissent les importer directement. Les
déplacer dans de nouveaux sous-dossiers ajouterait des chemins relatifs sans réduire le
nombre réel de fichiers.

## Retrouver le code d’une page

Dans `src/main.jsx`, recherchez le nom du composant :

- `Doctor` : nouvelle page d’accueil, prestations, horaires, contact et FAQ.
- `PublicHeader` : navigation publique et menu mobile.
- `Booking` : choix du créneau, coordonnées et confirmation.
- `Tracking` : suivi privé, Google Agenda et téléchargement `.ics`.
- `Dashboard` : file du jour, consultation en cours et actions rapides.
- `PatientForm` et `QueueForm` : formulaires d’ajout, de modification et de décalage.
- `CalendarPage` : vues jour, semaine et mois avec déplacement de rendez-vous.
- `SettingsPage` : informations du cabinet, horaires, pauses et jours fermés.
- `ServicesPage` : prestations, durées et tarifs en DA.
- `PatientsPage`, `NotificationsPage`, `AuditPage` : répertoire, messages et journal.
- `Auth` : connexion et inscription des patients.

Chaque partie est commentée en français. Les identifiants techniques, par exemple
`CONFIRMED` ou `scheduledStart`, restent stables en anglais ; les libellés affichés aux
utilisateurs sont français. Cela évite de casser les données enregistrées.

## Horaires et réservation

La semaine est présentée **du samedi au vendredi**. Les sept jours sont ouverts par défaut
de **08:00 à 17:00**. La pause déjeuner de **12:00 à 13:00** reste protégée. Les horaires,
les pauses et les congés sont modifiables dans **Horaires**.

Le serveur vérifie les créneaux, les durées, les fermetures et les conflits avant chaque
réservation. Les annulations et absences restent dans l’historique. Les horaires réservés,
estimés et réels sont distincts ; les timestamps sont conservés en UTC, avec le fuseau du
cabinet.

Lors de la première mise à jour d’une ancienne installation, une migration adapte les
paramètres à l’Algérie, les horaires et les anciennes prestations d’exemple. Les patients
et leurs rendez-vous sont conservés. Une copie de l’ancienne base est créée dans
`data/clinic.before-algeria.sqlite` avant cette migration.

## Google Agenda et autres agendas

Sur la confirmation du patient :

1. **Ajouter à Google Agenda** ouvre un événement prérempli avec le médecin, la date,
   l’horaire réservé et l’adresse du cabinet.
2. Le patient choisit son compte Google puis clique sur **Enregistrer**.
3. **Télécharger le fichier .ics** permet d’utiliser un autre agenda, comme Apple Agenda
   ou Outlook.

Aucun accès au compte Google n’est demandé par Pulse. Le motif médical, le téléphone,
l’e-mail du patient et le jeton du lien privé ne sont pas transmis dans l’export.

**Il s’agit d’un ajout à l’agenda, pas d’une synchronisation automatique.** Si le cabinet
décale un rendez-vous, le nouvel horaire est visible sur le suivi privé en temps réel.
L’événement déjà enregistré dans Google doit être modifié par le patient. Une
synchronisation automatique nécessiterait un projet Google Cloud, des identifiants OAuth
et le consentement du patient.

## Vérifier et garder le code lisible

```sh
npm test
npm run build
npm run format
npm run format:check
npm run test:browser
```

- `test` vérifie le moteur de planning, les conflits, les accès privés, les notifications,
  la configuration algérienne et les exports d’agenda.
- `build` crée la version optimisée dans `dist/`.
- `format` remet les sources sur plusieurs lignes avec une indentation régulière.
- `format:check` contrôle le formatage sans modifier les fichiers.
- `test:browser` teste la réservation et le tableau de bord dans Chrome, avec une base
  temporaire indépendante. Les captures sont enregistrées dans `artifacts/`.

Les fichiers de `dist/` sont automatiquement compressés pour le chargement en ligne.
**Modifiez les sources lisibles, jamais les fichiers compilés de `dist/`.** Un runtime
Node 22 local au projet permet d’utiliser les commandes npm sur cet ordinateur sans
remplacer son ancienne version système de Node.

## Tester en ligne avec GitHub Codespaces

Une fois le projet envoyé sur GitHub, choisissez **Code → Codespaces → Create codespace on
main**. La configuration installe les dépendances, compile le site et démarre le serveur
automatiquement.

Ouvrez le port **3000** dans l’onglet **Ports**. Les identifiants de la nouvelle
installation figurent dans `data/codespace-server.log`. Ne publiez jamais ce fichier. Pour
partager le site de test, choisissez **Port Visibility → Public**. Le lien externe utilise
HTTPS ; laissez le protocole interne du port sur HTTP.

Le site reste accessible pendant que le Codespace fonctionne. Les données restent dans le
Codespace lors d’un arrêt/reprise, mais sa suppression les efface. Utilisez des patients
fictifs pour ces essais. L’utilisation de Codespaces dépend du quota et de la facturation
du compte GitHub. GitHub Pages seul ne peut pas exécuter cette application, car elle
possède un serveur et une base de données.

Après une modification, lancez `npm run build`, arrêtez puis rouvrez le Codespace pour
redémarrer le serveur avec la nouvelle version.

## Données, notifications et déploiement

- Base SQLite dans `data/clinic.sqlite`, sauvegardée après chaque transaction. Une seule
  instance du serveur doit écrire dans cette base.
- Mots de passe hachés avec scrypt, sessions privées et autorisations côté serveur.
- Liens de suivi privés : un compte patient non vérifié ne donne pas accès aux rendez-vous
  d’une autre personne, même avec une adresse e-mail identique.
- Socket.IO actualise le suivi et le tableau de bord sans exposer d’informations
  personnelles dans les événements diffusés.
- Les rappels en ligne sont disponibles. Pour les e-mails, configurez `EMAIL_WEBHOOK` et
  éventuellement `EMAIL_WEBHOOK_TOKEN`. L’adaptateur reçoit `{id, to, subject, text}` et
  doit éviter les doubles envois en utilisant `id`. Pour prévenir automatiquement un
  patient par SMS quand son rendez-vous avance, configurez aussi `SMS_WEBHOOK` et,
  éventuellement, `SMS_WEBHOOK_TOKEN`. Cet adaptateur reçoit
  `{id, to, message, appointmentId, kind}`. Il doit utiliser `id` pour éviter les doubles
  envois. Pulse ne contient pas de clé Twilio ou WhatsApp : le webhook peut être un petit
  service qui appelle le fournisseur choisi par le cabinet.
- Pour un hébergement durable : Node 22, `npm run build`, `NODE_ENV=production`,
  `npm start`, HTTPS, stockage persistant et sauvegardes de la base.

Cette version gère un seul cabinet. La gestion de plusieurs médecins, les SMS, WhatsApp,
la récupération de mot de passe et la synchronisation Google OAuth ne sont pas
implémentés. Aucun dossier médical complet n’est collecté.
