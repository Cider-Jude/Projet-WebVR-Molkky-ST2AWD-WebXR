/*
    ===================== SONS DU JEU =====================

    Joue un son à chaque moment clé de la partie, en écoutant les
    événements que le jeu émet déjà sur la scène :

      - 'partie-demarree'  -> intro     (début d'une partie)
      - 'baton-pris'       -> prise     (le joueur récupère le bâton)
      - 'baton-lache'      -> lancer    (le joueur jette le bâton)
      - 'lancer-termine'   -> touche    (le lancer a fait tomber des quilles)
      - 'partie-terminee'  -> victoire  (50 points)  /  defaite (3 ratés)

    Les fichiers audio sont à déposer dans le dossier sons/ (voir LISEZMOI-SONS.md).
    Si un fichier manque, le jeu continue normalement : le son est simplement ignoré.
*/

var SONS = {
    intro:    { fichier: 'sons/intro.mp3',    volume: 0.6 },
    prise:    { fichier: 'sons/prise.mp3',    volume: 0.8 },
    lancer:   { fichier: 'sons/SWSH_Whoosh 6 (ID 1799)_LaSonotheque.fr.mp3',   volume: 0.8 },
    touche:   { fichier: 'sons/touche.mp3',   volume: 0.9 },
    victoire: { fichier: 'sons/victoire.mp3', volume: 0.9 },
    defaite:  { fichier: 'sons/defaite.mp3',  volume: 0.9 }
};

var GestionSons = (function () {
    var audios = {};

    // Pré-chargement de chaque son ; un fichier absent est désactivé sans faire planter le jeu
    Object.keys(SONS).forEach(function (nom) {
        var a = new Audio(SONS[nom].fichier);
        a.preload = 'auto';
        a.volume = SONS[nom].volume;
        a.addEventListener('error', function () {
            var code = a.error ? a.error.code : '?';
            var message = a.error ? a.error.message : '';
            console.warn('[sons] "' + nom + '" ignoré (code ' + code + ') ' + message + ' : ' + a.src);

            // Distingue "fichier absent" de "fichier illisible"
            fetch(a.src).then(function (r) {
                console.warn('[sons] ' + nom + ' : le serveur répond ' + r.status + ' (type ' + r.headers.get('content-type') + ')');
            }).catch(function () {
                console.warn('[sons] ' + nom + ' : impossible de joindre le serveur');
            });

            audios[nom] = null;
        });

        audios[nom] = a;
    });

    function jouer(nom) {
        var a = audios[nom];
        if (!a) { return; }
        a.currentTime = 0;
        var p = a.play();
        // Le navigateur bloque le son tant que le joueur n'a pas interagi avec la page : on ignore
        if (p && p.catch) { p.catch(function () {}); }
    }

    function arreter(nom) {
        var a = audios[nom];
        if (!a) { return; }
        a.pause();
        a.currentTime = 0;
    }

    return { jouer: jouer, arreter: arreter };
})();

(function () {
    var scene = document.querySelector('a-scene');


    scene.addEventListener('partie-demarree', function () {
        GestionSons.arreter('victoire');
        GestionSons.arreter('defaite');
        GestionSons.jouer('intro');
    });

    scene.addEventListener('baton-pris', function () { GestionSons.jouer('prise'); });
    scene.addEventListener('baton-lache', function () { GestionSons.jouer('lancer'); });

    scene.addEventListener('lancer-termine', function (e) {
        if (e.detail && e.detail.touche) { GestionSons.jouer('touche'); }
    });

    scene.addEventListener('partie-terminee', function (e) {
        GestionSons.arreter('intro');
        GestionSons.jouer(e.detail.gagne ? 'victoire' : 'defaite');
    });
})();