/*
    ===================== SONS DU JEU =====================

    Joue un son à chaque moment clé de la partie, en écoutant les
    événements que le jeu émet déjà sur la scène :

      - 'partie-demarree'  -> intro     (début d'une partie)
      - 'baton-touche-quille' -> impact spatial (position du choc, volume selon vitesse et distance)
      - 'baton-pris'       -> prise     (le joueur récupère le bâton)
      - 'baton-lache'      -> lancer    (le joueur jette le bâton)
      - 'lancer-termine'   -> touche    (le lancer a fait tomber des quilles)
      - 'partie-terminee'  -> victoire  (50 points)  /  defaite (3 ratés)

    Les fichiers audio sont à déposer dans le dossier sons/ (voir LISEZMOI-SONS.md).
    Si un fichier manque, le jeu continue normalement : le son est simplement ignoré.
*/

var SONS = {
    intro:    { fichier: 'sons/intro.mp3',    volume: 0.6 },
    prise:    { fichier: 'sons/WOODImpt_Marteau de president 1 coup (ID 1588)_LaSonotheque.fr.mp3',    volume: 0.6 },
    lancer:   { fichier: 'sons/SWSH_Whoosh 6 (ID 1799)_LaSonotheque.fr.mp3',   volume: 0.8 },
    touche:   { fichier: 'sons/touche.mp3',   volume: 0.9 },
    impact:   { fichier: 'sons/WOODImpt_Marteau de president 1 coup (ID 1588)_LaSonotheque.fr.mp3', volume: 1 },
    victoire: { fichier: 'sons/victoire.mp3', volume: 0.9 },
    defaite:  { fichier: 'sons/defaite.mp3',  volume: 0.9 },
    ambiance:  { fichier: 'sons/ambiance.mp3',  volume: 0.9 },
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

    // Réglages du son d'impact bâton / quille
    var IMPACT = {
        vitesseMax: 6,        // m/s : à partir de cette vitesse, volume maximal
        volumeMin: 0.15,      // volume des chocs les plus faibles
        pitchMin: 0.9,        // variation de hauteur aléatoire (évite l'effet répétitif)
        pitchMax: 1.1,
        distanceReference: 1, // distance en mètres où le volume est celui configuré
        distanceMax: 20,      // distance maximale de propagation en mètres
        attenuation: 1        // intensité de la baisse de volume avec la distance
    };

    // Chaque impact a sa propre source 3D afin que les chocs rapprochés se superposent.
    function jouerImpact(vitesse, position) {
        var base = audios.impact;
        if (!base || !position) { return; }

        var force = Math.min(Math.max(vitesse / IMPACT.vitesseMax, 0), 1);
        var pitch = IMPACT.pitchMin + Math.random() * (IMPACT.pitchMax - IMPACT.pitchMin);
        var source = document.createElement('a-sound');
        source.setAttribute('position', {
            x: position.x,
            y: position.y,
            z: position.z
        });

        source.addEventListener('sound-loaded', function () {
            var component = source.components.sound;
            if (!component) {
                console.error('[sons] composant sound absent sur la source d’impact');
                return;
            }
            component.playSound(function (audio) {
                audio.setPlaybackRate(pitch);
            });
        }, { once: true });

        source.addEventListener('sound-ended', function () {
            if (source.parentNode) { source.parentNode.removeChild(source); }
        }, { once: true });

        source.setAttribute('sound', {
            src: 'url(' + SONS.impact.fichier + ')',
            autoplay: false,
            positional: true,
            distanceModel: 'inverse',
            refDistance: IMPACT.distanceReference,
            maxDistance: IMPACT.distanceMax,
            rolloffFactor: IMPACT.attenuation,
            volume: SONS.impact.volume * (IMPACT.volumeMin + (1 - IMPACT.volumeMin) * force)
        });
        document.querySelector('a-scene').appendChild(source);
    }

    function arreter(nom) {
        var a = audios[nom];
        if (!a) { return; }
        a.pause();
        a.currentTime = 0;
    }

    return { jouer: jouer, jouerImpact: jouerImpact, arreter: arreter };
})();

(function () {
    var scene = document.querySelector('a-scene');
    scene.addEventListener('load', function (){
        GestionSons.jouer('ambiance');
    });
    scene.addEventListener('baton-touche-quille', function (e) {
        GestionSons.jouerImpact(e.detail.vitesse, e.detail.position);
    });


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