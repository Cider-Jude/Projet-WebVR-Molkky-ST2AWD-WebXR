# Mölkky VR — Projet WebXR (ST2AWD)

Jeu de **Mölkky en réalité virtuelle**, développé avec [A-Frame](https://aframe.io/) et jouable dans un navigateur, sur casque VR (WebXR) ou sur PC (souris + clavier). Aucune installation côté joueur : tout tourne dans la page.

> Projet de *Interface Development and Design* | ST2AWDD – WebXR — Majeure T2IA — 2026–2027

**Jouer en ligne :** <https://cider-jude.github.io/Projet-WebVR-Molkky-ST2AWD-WebXR/>

---

## Sommaire

1. [Principe du jeu](#principe-du-jeu)
2. [Niveaux](#niveaux)
3. [Commandes](#commandes)
4. [Fonctionnalités](#fonctionnalités)
5. [Lancer le projet en local](#lancer-le-projet-en-local)
6. [Structure du projet](#structure-du-projet)
7. [Architecture technique](#architecture-technique)
8. [Technologies](#technologies)
9. [Limites connues](#limites-connues)
10. [Crédits](#crédits)
11. [Équipe](#équipe)

---

## Principe du jeu

Le Mölkky est un jeu de lancer finlandais : on lance un bâton en bois (une « quille ») sur **12 quilles numérotées de 1 à 12**, disposées en quinconce. Ici, le joueur se tient derrière une ligne de lancer et attrape le bâton posé sur son socle avant de le jeter.

### Règles implémentées

- **Points d'un lancer** : si **une seule** quille tombe, le joueur marque **son numéro** ; si **plusieurs** quilles tombent, il marque **leur nombre**.
- **Objectif** : atteindre **exactement 50 points**.
- **Dépassement** : au-delà de 50, le score est ramené à **25**.
- **Défaite** : **3 lancers ratés consécutifs** (aucune quille tombée).
- **Quilles tombées** : une quille est considérée comme tombée si elle penche de plus de 30° ; elle est ensuite **relevée là où pointe son extrémité biseautée** (celle qui porte le numéro), en s'écartant si elle chevauche une voisine.
- **Après chaque lancer**, le bâton revient seul sur son socle.
- **Record** : une partie gagnée bat le record du niveau si elle compte **moins de lancers** ou, à égalité, un **temps plus court**. Un record est conservé **par niveau**.
- Le **chronomètre** démarre dès la première prise du bâton.

## Niveaux

Le niveau se choisit dans le menu de départ. Les distances sont mesurées depuis la ligne de lancer jusqu'à la première rangée de quilles.

| Niveau | Distance | Écart entre quilles | Restitution du sol | Aide à la visée et trace | Gravité des quilles |
|---|---|---|---|---|---|
| **Facile** | 3 m | 15 cm | 0,05 | oui | normale (×1) |
| **Normale** | 3,5 m | 5 cm | 0,05 | oui | normale (×1) |
| **Difficile** | 4 m | 1 cm | 0,1 (sol plus rebondissant) | non | réduite de moitié (×0,5) |

Les écarts sont mesurés **bord à bord** entre deux quilles voisines. Tous les réglages sont dans l'objet `NIVEAUX` de `Beta Test molky.js` : ajouter un niveau se résume à ajouter une entrée (et un bouton dans le menu du HTML).

## Commandes

### PC (souris + clavier)

| Action | Commande |
|---|---|
| Orienter la vue | Souris |
| Viser un bouton ou la quille | Curseur de la souris |
| Appuyer sur un bouton | Clic gauche |
| Prendre / lâcher le bâton | `G` |
| Lancer le bâton | Clic gauche ou `Espace` (bâton en main) |
| Se déplacer | `W A S D` ou flèches, **après** avoir activé le mouvement (voir ci-dessous) |

### Casque VR (WebXR)

| Action | Commande |
|---|---|
| Prendre le bâton | Approcher la main du bâton et serrer le **grip** |
| Lancer | **Relâcher le grip** en balançant le bras : le bâton part avec la vitesse de la main |
| Appuyer sur un bouton | Toucher la plaque avec la main et serrer le **grip** |
| Se déplacer | Joystick, **après** avoir activé le mouvement (voir ci-dessous) |

### Déplacement

Le joueur est volontairement **immobile** pendant la partie, pour jouer depuis la ligne de lancer :

- le bouton **« Activer le mouvement »** débloque le déplacement (le chronomètre est alors mis en pause et le bâton verrouillé) ;
- le bouton **« Retour au départ »**, qui suit le joueur, le téléporte à son point de départ, bloque à nouveau le déplacement et relance le chronomètre si la partie était commencée.

### Boutons en cours de partie

- **Recommencer** : relance une partie au même niveau.
- **Quitter** : retourne au menu.
- Les boutons sont **grisés et inactifs** entre la prise du bâton et la fin du lancer, pour éviter les appuis involontaires.

## Fonctionnalités

- **Physique réaliste** (cannon.js) : quilles avec corps cylindrique, bâton lancé à la vitesse de la main, sol absorbant (friction élevée, rebond réglable selon le niveau).
- **Quilles biseautées numérotées** : chaque quille est dessinée par le code avec son sommet coupé en biseau et son numéro sur la face inclinée.
- **Aide à la visée** (Facile et Normale) : pendant que le joueur tient le bâton, la **trajectoire prévue** s'affiche (en bleu, en orange quand une quille est sur le chemin, avec un anneau d'impact au sol). Une **trace du lancer précédent** (en blanc) permet de corriger son geste.
- **Tableau des scores** en 3D : score, dernier tir, ratés consécutifs, niveau et record, ainsi qu'un panneau d'information (« Raté ! », « retour à 25 », etc.). Les textes sont dessinés sur des canvas : aucune police ni requête réseau.
- **Menu et fin de partie** : menu de choix du niveau, puis écran de victoire ou de défaite avec le score final, le nombre de tirs, le temps et l'éventuel nouveau record.
- **Records persistants** : enregistrés dans le `localStorage` du navigateur, un par niveau (clé `monjeu-record-<niveau>`). Ils sont donc propres à chaque appareil et à chaque adresse (le record du PC n'est pas celui du casque).
- **Sons** : ambiance de jeu par événements (intro, prise du bâton, lancer, quilles touchées, victoire, défaite) et **son d'impact spatialisé** à la position du choc, dont le volume dépend de la vitesse et dont la hauteur varie légèrement. Un fichier audio manquant est simplement ignoré.
- **Décor** généré par le code, sans modèle à télécharger : jardin finlandais en été avec ciel dégradé et soleil, pelouse tondue en bandes, bouleaux, sapins, buissons, collines à l'horizon, nuages et nappe de pique-nique. Les éléments répétés sont des `InstancedMesh` pour rester fluide en VR, et le décor n'a aucune physique.

## Lancer le projet en local

Il n'y a **pas d'étape de compilation** ni de dépendance à installer : les librairies sont servies depuis le dossier `libs/`. Il faut en revanche un **serveur HTTP local** (ouvrir le fichier en double-cliquant ne suffit pas : chargement du modèle 3D et des sons).

```bash
# depuis la racine du projet
python -m http.server 8000
# ou
npx serve
```

Ouvrir ensuite <http://localhost:8000> et suivre le lien vers le jeu.

### Tester dans le casque

WebXR n'est disponible que dans un **contexte sécurisé** : `localhost` ou HTTPS. Une adresse `http://IP-du-PC:8000` ne permet donc pas d'entrer en VR. Deux solutions :

- jouer depuis la version en ligne (GitHub Pages, en HTTPS) ;
- brancher le casque en USB (débogage activé) et rediriger le port, par exemple avec `adb reverse tcp:8000 tcp:8000`, puis ouvrir `http://localhost:8000` dans le navigateur du casque.

Navigateur utilisé pour les tests en casque : Brave.

## Structure du projet

```
.
├── index.html               Page d'accueil : lien vers le jeu
├── Beta test molky.html     Scène A-Frame : menu, panneaux, quilles, sol, mobilier, rig et mains VR
├── Beta Test molky.js       Règles du jeu et composants principaux (voir ci-dessous)
├── mouvement-retour.js      Déplacement : activation, retour au départ, bouton qui suit le joueur
├── aide-visee.js            Trajectoire prévue et trace du lancer précédent
├── Records.js               Lecture et enregistrement des records (localStorage)
├── sons.js                  Gestion des sons, déclenchés par les événements du jeu
├── decor.js                 Décor procédural (ciel, pelouse, végétation, collines, nuages, nappe)
├── libs/                    A-Frame, aframe-extras, aframe-physics-system, super-hands (+ SOURCES.txt)
├── models/board_school/     Modèle 3D du tableau d'école (board.glb)
└── sons/                    Fichiers audio du jeu
```

Les scripts sont chargés à la fin de `Beta test molky.html`, dans cet ordre : `Beta Test molky.js`, `mouvement-retour.js`, `Records.js`, `sons.js`, `aide-visee.js`, `decor.js`. L'ordre compte : `mouvement-retour.js` et `aide-visee.js` utilisent des variables et fonctions du script principal (`etat`, `QUILLES`, `chronoActif`…).

## Architecture technique

### Composants A-Frame

| Fichier | Composant | Rôle |
|---|---|---|
| `Beta Test molky.js` | `baton` | Saisie par super-hands, suivi de la main, calcul de la vitesse de lancer, retour sur le socle, verrouillage (`actif`) |
| | `choc-baton` | Détecte les contacts bâton / quille et émet `baton-touche-quille` |
| | `quille` | Construit une quille (corps biseauté, numéro, collider cylindrique) et gère sa gravité |
| | `sol-absorbant` | Friction et restitution du sol (modifiables par niveau) |
| | `chronometre` | Chronomètre piloté par événements (`chrono-start`, `chrono-stop`, `chrono-reset`) |
| | `tableau-score` | Tableau des scores dessiné sur un canvas |
| | `panneau-texte` | Panneau de texte générique (menu, fin de partie, information, bandeau) |
| | `bouton-vr` | Bouton 3D utilisable à la main (collision + grip) ou à la souris |
| | `commandes-bureau` | Commandes clavier / souris pour tester sans casque |
| | `hauteur-yeux` | Hauteur de la caméra : 1,6 m sur écran, hauteur réelle du casque en VR |
| `mouvement-retour.js` | `gestion-mouvement` | Active / bloque le déplacement et téléporte au départ |
| | `suivre-joueur` | Garde un bouton à côté du joueur, tourné vers lui |
| `aide-visee.js` | `aide-visee`, `trace-lancer` | Aides au lancer des niveaux Facile et Normale |
| `decor.js` | `ciel`, `pelouse`, `vegetation`, `collines`, `nuages`, `nappe-carreaux` | Décor |

### Cycle d'un lancer

1. Le joueur prend le bâton (`baton-pris`) : le chronomètre démarre au premier lancer.
2. Il le lâche (`baton-lache`) avec la vitesse de sa main : le bâton devient un corps physique.
3. Après un court délai, le jeu attend que les quilles soient immobiles, détermine lesquelles sont tombées et les relève.
4. `lancer-termine` est émis avec la liste des quilles tombées : le score est mis à jour (`score-mis-a-jour`) et le bâton revient sur le socle (`baton-retour`).
5. Le jeu enchaîne sur le tir suivant, ou sur l'écran de fin (`partie-terminee`).

### Principaux événements

Tous sont émis sur `<a-scene>`.

| Événement | Émis quand |
|---|---|
| `niveau-facile`, `niveau-normale`, `niveau-difficile` | Un bouton du menu est pressé |
| `partie-demarree`, `partie-terminee` `{ gagne }` | Début et fin d'une partie |
| `partie-recommencer`, `partie-quitter` | Boutons de partie et de fin |
| `baton-pris`, `baton-lache`, `baton-retour` | Cycle du bâton |
| `baton-touche-quille` `{ quille, numero, vitesse, position }` | Le bâton touche une quille (utilisé pour le son) |
| `lancer-termine` `{ touche, quilles }` | Un lancer est évalué |
| `quilles-relevees` | Des quilles tombées ont été remises debout |
| `score-mis-a-jour` `{ total, dernier, rates, lances }` | Le score change |
| `aide-visee`, `trace-lancer` `{ active }` | Activation des aides selon le niveau |
| `activer-mouvement`, `retour-origine` | Boutons de déplacement |
| `menu-afficher`, `fin-afficher`, `info-afficher`, `entete-afficher` (et `-masquer`) | Affichage des panneaux de texte |

## Technologies

- [A-Frame](https://aframe.io/) (≥ 1.4) et WebXR
- [aframe-extras](https://github.com/c-frame/aframe-extras) : déplacement (`movement-controls`) et détection des mains (`sphere-collider`)
- [aframe-physics-system](https://github.com/c-frame/aframe-physics-system) : physique (cannon.js, pilote local)
- [super-hands](https://github.com/c-frame/aframe-super-hands-component) : survol et saisie à la main
- JavaScript sans framework ni compilation, `localStorage` pour les records, canvas 2D pour tous les textes en 3D

Les librairies sont embarquées dans `libs/` plutôt que chargées depuis un CDN : en VR, chaque requête externe ralentit le démarrage de la scène. L'origine de chaque fichier est indiquée dans `libs/SOURCES.txt`.

## Limites connues

- Le **collider des quilles est un cylindre droit** : le biseau est purement visuel.
- Une quille lancée très vite peut, en théorie, traverser une autre quille entre deux pas de physique ; la vitesse de lancer est donc plafonnée (`vitesseMax`).
- Les noms de fichiers du script principal et de la page contiennent des **espaces** (`Beta Test molky.js`, `Beta test molky.html`) ; ils sont à garder identiques entre le HTML et les fichiers.
- Les **records** sont locaux à chaque navigateur : aucun classement partagé.
- L'**ambiance sonore** (`ambiance.mp3`) est prévue mais désactivée dans `sons.js`.

## Crédits

- Certains sons proviennent de [LaSonotheque.fr](https://www.lasonotheque.fr/) (voir les noms de fichiers dans `sons/`) ; vérifier leurs conditions d'utilisation avant toute diffusion publique.
- Modèle 3D du tableau d'école (`models/board_school/board.glb`) : *source et licence à compléter*.

## Équipe

Croquette Antonin · Jude Aybalen · Guezo Merleau Durell · Tchoffo Manfouo Dovin Vilson
