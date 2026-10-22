# Sons du jeu

Créez un dossier `sons` à la racine du projet (à côté de `sons.js`) et déposez-y les fichiers audio, **avec exactement ces noms** (format MP3) :

| Fichier        | Quand il est joué                                         |
|----------------|-----------------------------------------------------------|
| `intro.mp3`    | Au début d'une partie (choix du niveau ou « Recommencer ») |
| `prise.mp3`    | Quand le joueur récupère le bâton                          |
| `lancer.mp3`   | Quand le joueur jette le bâton                             |
| `touche.mp3`   | Quand le lancer fait tomber au moins une quille            |
| `victoire.mp3` | Quand le joueur gagne (50 points)                          |
| `defaite.mp3`  | Quand le joueur perd (3 lancers ratés d'affilée)           |

Un fichier manquant n'empêche pas le jeu de fonctionner : le son correspondant est simplement ignoré
(un avertissement apparaît dans la console du navigateur).

Pour changer un nom de fichier ou un volume, modifiez l'objet `SONS` en haut de `sons.js`.
