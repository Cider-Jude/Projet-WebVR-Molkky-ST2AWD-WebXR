var scoreJeu = 0; //le score globale du jeu
var rates = 0; //Le nombre de coups ratés d'affilé
var lances = 0; //Le nombre de fois que le joueur a lancé le bâton

const chrono = document.querySelector('#chrono'); // le chronomètre
var chronoActif = false; // le chrono s'active dès que le joueur prend le bâton en main pour la première fois

var meilleurScore = 10; // Le meilleur score qu'il faudra connecter à un json
var meilleurTemps = "10:00:00"; //idem mais pour le temps

var termine = false;
var QUILLES = [];                 // registre partagé : toutes les quilles de la scène
var RELEVAGE = {
    seuilChute: 30,               // inclinaison (°) à partir de laquelle une quille est « tombée »
    marge: 0.01,                  // espace mini entre deux quilles relevées (m)
    demiTerrain: 14,              // au-delà, la quille revient à sa place d'origine (m)
    delaiMax: 5000,               // attente maximale de l'immobilité (ms)
    enCours: false,
    callbacks: []          // fonctions à prévenir quand le relevage est terminé
};

// Tombée = l'axe de la quille penche de plus de seuilChute degrés par rapport à la verticale
function quilleEstTombee(el) {
    var haut = new THREE.Vector3(0, 1, 0).applyQuaternion(el.object3D.quaternion);
    return haut.y < Math.cos(THREE.MathUtils.degToRad(RELEVAGE.seuilChute));
}

function quilleAuRepos(el) {
    var b = el.body;
    return !b || (b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.15);
}

// Évalue le tir qui vient d'avoir lieu et appelle callback({ touche, quilles })
//  - rien ne bouge et rien n'est tombé : tir raté, callback immédiat
//  - sinon : on attend l'immobilité, on relève, puis callback
function evaluerLancer(callback) {
    var concerne = QUILLES.some(function (q) {
        return quilleEstTombee(q.el) || !quilleAuRepos(q.el);
    });
    if (!concerne) { callback({ touche: false, quilles: [] }); return; }

    RELEVAGE.callbacks.push(callback);
    if (RELEVAGE.enCours) { return; }       // un relevage est déjà en attente : il préviendra aussi celui-ci
    RELEVAGE.enCours = true;

    var debut = Date.now(), calmes = 0;
    (function verifier() {
        var repos = QUILLES.every(function (q) { return quilleAuRepos(q.el); });
        calmes = repos ? calmes + 1 : 0;
        if (calmes >= 5 || Date.now() - debut > RELEVAGE.delaiMax) {
            var relevees = releverLesQuilles();
            RELEVAGE.enCours = false;
            var cbs = RELEVAGE.callbacks;
            RELEVAGE.callbacks = [];
            cbs.forEach(function (cb) {
                cb({ touche: relevees.length > 0, quilles: relevees });
            });
        } else {
            setTimeout(verifier, 100);
        }
    })();
}

function releverLesQuilles() {
    // 1) Où va chaque quille ? Debout : elle reste où elle est.
    //    Tombée : sous le bout biseauté (axe +Y local), en ne gardant que x et z.
    var pts = QUILLES.map(function (q) {
        var el = q.el, dim = el.getAttribute('geometry');
        var tombee = quilleEstTombee(el), x, z;
        if (tombee) {
            el.object3D.updateMatrixWorld(true);
            var bout = el.object3D.localToWorld(new THREE.Vector3(0, dim.height / 2, 0));
            x = bout.x; z = bout.z;
            // sortie du terrain : retour à la place d'origine
            if (Math.abs(x) > RELEVAGE.demiTerrain || Math.abs(z + 4) > RELEVAGE.demiTerrain) {
                x = q.posInit.x; z = q.posInit.z;
            }
        } else {
            x = el.object3D.position.x; z = el.object3D.position.z;
        }
        return { el: el, y: dim.height / 2, x: x, z: z, fixe: !tombee };
    });

    // 2) Anti-chevauchement : les quilles relevées sont écartées des voisines
    //    (les quilles restées debout ne bougent pas)
    var ecartMin = 2 * QUILLES[0].el.getAttribute('geometry').radius + RELEVAGE.marge;
    for (var it = 0; it < 80; it++) {
        var bouge = false;
        for (var i = 0; i < pts.length; i++) {
            for (var j = i + 1; j < pts.length; j++) {
                var A = pts[i], B = pts[j];
                if (A.fixe && B.fixe) { continue; }
                var dx = B.x - A.x, dz = B.z - A.z, d = Math.sqrt(dx * dx + dz * dz);
                if (d >= ecartMin) { continue; }
                var nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, rec = ecartMin - d;
                var pA = A.fixe ? 0 : (B.fixe ? 1 : 0.5), pB = 1 - pA;
                A.x -= nx * rec * pA; A.z -= nz * rec * pA;
                B.x += nx * rec * pB; B.z += nz * rec * pB;
                bouge = true;
            }
        }
        if (!bouge) { break; }
    }

    // 3) Téléportation : entité ET corps physique, debout, vitesses nulles
    var relevees = [];
    pts.forEach(function (p) {
        if (p.fixe) { return; }
        relevees.push(p.el);
        p.el.object3D.position.set(p.x, p.y, p.z);
        p.el.object3D.quaternion.set(0, 0, 0, 1);
        var b = p.el.body;
        if (b) {
            b.position.set(p.x, p.y, p.z);
            b.quaternion.set(0, 0, 0, 1);
            b.velocity.set(0, 0, 0);
            b.angularVelocity.set(0, 0, 0);
            b.aabbNeedsUpdate = true;
        }
    });

    // utile pour la suite (comptage des points)
    document.querySelector('a-scene').emit('quilles-relevees', { quilles: relevees });
    return relevees;
}

function replacerQuillesAuDepart() {
    QUILLES.forEach(function (q) {
        var el = q.el, y = el.getAttribute('geometry').height / 2;
        el.object3D.position.set(q.posInit.x, y, q.posInit.z);
        el.object3D.quaternion.set(0, 0, 0, 1);
        var b = el.body;
        if (b) {
            b.position.set(q.posInit.x, y, q.posInit.z);
            b.quaternion.set(0, 0, 0, 1);
            b.velocity.set(0, 0, 0);
            b.angularVelocity.set(0, 0, 0);
            b.aabbNeedsUpdate = true;
        }
    });
}

function UpdateScore(numeros){
    if (rates == 3){
        finDePartie(false);
    } 
    var points = 0
    for (let i = 0; i < numeros.length; i++){
        points+= numeros[i];
    }
    scoreJeu+=points
    if (scoreJeu > 50){
        scoreJeu = 25
        scene.emit('info-afficher', { lignes: ['Vous avez plus de 50 points,', 'retour à 25'] });
    }
    
    if (scoreJeu == 50){
        finDePartie(true); 
    }
    
    scene.emit('score-mis-a-jour', { total: scoreJeu, dernier: points, rates: rates, lances: lances });
}

var scene = document.querySelector('a-scene');

scene.addEventListener('loaded', function () {
    scene.emit('entete-afficher', { lignes: ['Niveau : Normale  |  Meilleur score : ' + meilleurScore + ' tirs | Meilleur temps : ' + meilleurTemps] });
});

function finDePartie(gagne) {
    termine = true;
    chrono.emit('chrono-stop');
    document.querySelector('#baton').setAttribute('baton', 'actif', false);
    scene.emit('info-masquer');
    scene.emit('fin-afficher', { lignes: gagne ?
        [{ texte: 'Vous avez gagné !', taille: 0.16, couleur: '#8EF0B0' },
         { texte: 'Nombre de tir : ' + lances, taille: 0.12 },
         { texte: 'Temps : ' + chrono.components.chronometre.getTemps(), taille: 0.12 }] :
        [{ texte: 'Vous avez raté 3 fois de suite, vous avez perdu la partie', taille: 0.1, couleur: '#FF8A8A' },
         { texte: 'Nombre de tir : ' + lances, taille: 0.12 },
         { texte: 'Temps : ' + chrono.components.chronometre.formater(chrono.components.chronometre.getTemps()), taille: 0.12 }]
    });
}

scene.addEventListener('lancer-termine', function (e) {
    var quilles = e.detail.quilles;   

    var numeros = quilles.map(function (el) {
        return el.components.quille.data.numero;
    });
    rates = e.detail.touche ? 0 : rates + 1;
    lances+=1;
    UpdateScore(numeros);
});

function recommencer() {
    total = 0; rates = 0; lances = 0; termine = false; chrono.emit('chrono-reset'); chronoActif = false;
    scene.emit('fin-masquer');
    scene.emit('info-masquer');
    replacerQuillesAuDepart();
    document.querySelector('#baton').setAttribute('baton', 'actif', true);
    scene.emit('score-mis-a-jour', { total: 0, dernier: null, rates: 0, lances:0 });
}

function quitter() {
    // à implémenter plus tard
    console.log('Quitter : pas encore implémenté');
}

scene.addEventListener('partie-recommencer', recommencer);
scene.addEventListener('partie-quitter', quitter);

// Contour arrondi (évite ctx.roundRect, absent des navigateurs un peu anciens)
function rectArrondi(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}


/* ==========================================================================
    Composant `sol absorbant`
    - modification du rebond et de la friction du sol pour rendre la simulation du lancée du bâton plus réaliste et moins frustrant
    ========================================================================== */
AFRAME.registerComponent('sol-absorbant', {
    schema: {
        friction: { default: 0.8 },       // 0 = glisse comme sur la glace, 1 = accroche fort
        restitution: { default: 0.05 }    // 0 = aucun rebond, 1 = rebond parfait
    },

    init: function () {
        this.appliquer = this.appliquer.bind(this);
        this.el.addEventListener('body-loaded', this.appliquer, { once: true });
    },

    appliquer: function () {
        var d = this.data;
        var sys = this.el.sceneEl.systems.physics;
        var s = sys.data;

        // matériau propre au sol + règles de contact avec le matériau des quilles
        sys.driver.addMaterial({ name: 'sol' });
        sys.driver.addContactMaterial('sol', 'defaultMaterial', {
            friction: d.friction,
            restitution: d.restitution,
            contactEquationStiffness: s.contactEquationStiffness,
            contactEquationRelaxation: s.contactEquationRelaxation,
            frictionEquationStiffness: s.frictionEquationStiffness,
            frictionEquationRegularization: s.frictionEquationRegularization
        });
        this.el.body.material = sys.driver.getMaterial('sol');
    }
});


/* ==========================================================================
    Composant `baton`
    - se fait saisir par super-hands (grab-start / grab-end)
    - s'accroche à la main pendant qu'il le tient
    - mesure la vitesse de la main et la transmet à la quille quand on la lâche
      => la quille part avec le mouvement du bras (lancer)
    ========================================================================== */

    
AFRAME.registerComponent('baton', {
    schema: {
        masse: { default: 0.13 },          // masse de la quille (kg)
        facteurLancer: { default: 1 },     // multiplicateur de la vitesse de la main
        vitesseMax: { default: 15 },       // vitesse de lancer maximale (m/s)
        vitessePC: { default: 7 },         // vitesse de lancer au clic (test PC, m/s)

        delaiRetour: { default: 1500 },      // délai avant le retour sur le socle (ms)

        // Décalage de la quille par rapport à l'origine du rayon du contrôleur
        offsetPosition: {
            type: 'vec3',
            default: { x: 0, y: 0, z: 0 }
        },

        // Le cylindre a son axe long sur Y : on le couche de -90° autour de X
        // pour qu'il pointe vers l'avant (le long du laser) quand on le tient.
        offsetRotation: {
            type: 'vec3',
            default: { x: -90, y: 0, z: 0 }
        },

        // Test PC : la quille est tenue en bas à droite de l'écran,
        // penchée vers l'avant.
        offsetCamera: {
            type: 'vec3',
            default: { x: 0.15, y: -0.2, z: -0.5 }
        },

        rotationCamera: {
            type: 'vec3',
            default: { x: -30, y: 0, z: 0 }
        }, 
        actif: { default: true }    // false : le bâton ne peut plus être pris (fin de partie)
    },

    init: function () {
        this.porteur = null;
        this.vitesseImposee = null;
        this.historique = [];
        this.chrono = document.querySelector('#chrono').components.chronometre;

        var p = this.el.getAttribute('position');
        var r = this.el.getAttribute('rotation');
        this.posInit = { x: p.x, y: p.y, z: p.z };
        this.rotInit = { x: r.x, y: r.y, z: r.z };

        this.minuteur = null;
        this.retourner = this.retourner.bind(this);
        this.finDuDelai = this.finDuDelai.bind(this);

        this.quat = new THREE.Quaternion();
        this.posMonde = new THREE.Vector3();

        this.lancer = this.lancer.bind(this);

        this.el.addEventListener('grab-start', this.onPrise.bind(this));
        this.el.addEventListener('grab-end', this.onLache.bind(this));

        // Retour visuel quand la quille est visée
        this.el.addEventListener('hover-start', function () {
            this.el.setAttribute('material', 'emissive', '#2266AA');

            // Si le dessus possède son propre matériau,
            // on peut aussi lui donner un léger effet visuel.
            if (this.faceMaterial) {
                this.faceMaterial.emissive.set('#2266AA');
            }
        }.bind(this));

        this.el.addEventListener('hover-end', function () {
            this.el.setAttribute('material', 'emissive', '#000000');

            if (this.faceMaterial) {
                this.faceMaterial.emissive.set('#000000');
            }
        }.bind(this));
    },

    // Enregistre la position monde de la quille à chaque image tant qu'elle est tenue
    tick: function (time) {
        if (!this.porteur) {
            return;
        }

        this.el.object3D.getWorldPosition(this.posMonde);

        this.historique.push({
            t: time,
            p: this.posMonde.clone()
        });

        // On ne garde que ~100 ms d'historique :
        // c'est la vitesse juste avant le lâcher.
        while (
            this.historique.length > 1 &&
            time - this.historique[0].t > 100
        ) {
            this.historique.shift();
        }
    },

    quaternionDepuisDegres: function (r) {
        return new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                THREE.MathUtils.degToRad(r.x),
                THREE.MathUtils.degToRad(r.y),
                THREE.MathUtils.degToRad(r.z)
            )
        );
    },

    onPrise: function (evt) {
        if (!this.data.actif) { return; }     // pas de preventDefault : super-hands refuse la saisie
        // OBLIGATOIRE : sans preventDefault, super-hands considère que la saisie a été refusée et n'enverra jamais le grab-end correspondant.
        evt.preventDefault();

        if (this.porteur) {
            return;
        }

        if(!chronoActif){
            chronoActif = true;
            this.chrono.demarrer();
        }

        var main = evt.detail.hand;

        this.porteur = main;
        clearTimeout(this.minuteur);
        this.minuteur = null;
        this.historique = [];

        // Plus de physique tant que la quille est tenue
        this.el.removeAttribute('dynamic-body');

        // On accroche la quille à la main : elle suit le poignet.
        main.object3D.add(this.el.object3D);

        if (main.components.camera) {
            // Test sur PC
            this.el.object3D.position.copy(this.data.offsetCamera);

            this.el.object3D.quaternion.copy(
                this.quaternionDepuisDegres(this.data.rotationCamera)
            );
        } else {
            this.alignerSurLeRayon(main);

            // Réglage fin : on couche le cylindre le long du laser
            this.el.object3D.quaternion.multiply(
                this.quaternionDepuisDegres(this.data.offsetRotation)
            );
        }

        // Test PC : l'événement `lancer` déclenche le lâcher avec vitesse
        main.addEventListener('lancer', this.lancer);

        this.el.setAttribute('material', 'emissive', '#000000');

        this.el.sceneEl.emit('baton-pris');
    },

    /*
        Aligne l'axe -Z de la quille sur l'AXE DU LASER du contrôleur.
    */
    alignerSurLeRayon: function (main) {
        var ray = main.getAttribute('raycaster');

        var avant = new THREE.Vector3(0, 0, -1);
        var origine = new THREE.Vector3(0, 0, 0);

        if (ray) {
            var d = ray.direction;

            if (d && (d.x || d.y || d.z)) {
                avant.set(d.x, d.y, d.z).normalize();
            }

            if (ray.origin) {
                origine.set(
                    ray.origin.x,
                    ray.origin.y,
                    ray.origin.z
                );
            }
        }

        var q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, -1),
            avant
        );

        this.el.object3D.quaternion.copy(q);

        var o = this.data.offsetPosition;

        this.el.object3D.position
            .copy(origine)
            .add(
                new THREE.Vector3(o.x, o.y, o.z)
                    .applyQuaternion(q)
            );
    },

    // Vitesse de la main = déplacement / durée sur la fenêtre d'historique
    calculerVitesse: function () {
        var h = this.historique;

        if (h.length < 2) {
            return new THREE.Vector3();
        }

        var a = h[0];
        var b = h[h.length - 1];

        var dt = (b.t - a.t) / 1000;

        if (dt < 0.01) {
            return new THREE.Vector3();
        }

        var v = b.p
            .clone()
            .sub(a.p)
            .divideScalar(dt)
            .multiplyScalar(this.data.facteurLancer);

        if (v.length() > this.data.vitesseMax) {
            v.setLength(this.data.vitesseMax);
        }

        return v;
    },

    // Test PC : lancer vers l'avant de la caméra,
    // avec une petite cloche.
    lancer: function () {
        var main = this.porteur;

        if (!main) {
            return;
        }

        main.object3D.getWorldQuaternion(this.quat);

        var dir = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(this.quat);

        dir.y += 0.25;
        dir.normalize();

        this.vitesseImposee = dir.multiplyScalar(
            this.data.vitessePC
        );

        main.emit('prise-fin');
    },

    onLache: function (evt) {
        evt.preventDefault();

        if (!this.porteur) {
            return;
        }

        this.porteur.removeEventListener(
            'lancer',
            this.lancer
        );

        this.porteur = null;

        var vitesse = this.vitesseImposee || this.calculerVitesse();

        this.vitesseImposee = null;

        // On remet la quille dans la scène en conservant sa transformation monde
        var pos = new THREE.Vector3();
        var quat = new THREE.Quaternion();

        this.el.object3D.getWorldPosition(pos);
        this.el.object3D.getWorldQuaternion(quat);

        this.el.sceneEl.object3D.add(this.el.object3D);

        var euler = new THREE.Euler()
            .setFromQuaternion(quat);

        var deg = THREE.MathUtils.radToDeg;

        this.el.setAttribute('position', {
            x: pos.x,
            y: pos.y,
            z: pos.z
        });

        this.el.setAttribute('rotation', {
            x: deg(euler.x),
            y: deg(euler.y),
            z: deg(euler.z)
        });

        // La vitesse est appliquée une fois le corps physique créé.
        // Le léger délai évite que le moteur ne la réécrase
        // à l'initialisation du corps.
        var el = this.el;

        el.addEventListener('body-loaded', function () {
            setTimeout(function () {
                if (!el.body) {
                    return;
                }

                el.body.velocity.set(
                    vitesse.x,
                    vitesse.y,
                    vitesse.z
                );

                el.body.angularVelocity.set(0, 0, 0);
            }, 50);
        }, { once: true });

        this.el.setAttribute(
            'dynamic-body',
            'shape: cylinder; cylinderAxis: y; mass: ' +
            this.data.masse
        );

        this.el.sceneEl.emit('baton-lache');
        this.minuteur = setTimeout(this.finDuDelai, this.data.delaiRetour);
    },

    finDuDelai: function () {
        this.minuteur = null;
        if (this.porteur) { return; }           // reprise en main entre-temps : on ne fait rien

        var self = this;
        evaluerLancer(function (resultat) {
            self.retourner();                    // le bâton revient une fois le relevage terminé
            self.el.sceneEl.emit('lancer-termine', resultat);
        });
    },

    retourner: function () {
        this.minuteur = null;

        // si le joueur l'a reprise entre-temps, on ne fait rien
        if (this.porteur) { return; }

        // plus de physique : la quille repart de zéro sur le socle
        this.el.removeAttribute('dynamic-body');
        this.el.setAttribute('position', {
            x: this.posInit.x, y: this.posInit.y, z: this.posInit.z
        });
        this.el.setAttribute('rotation', {
            x: this.rotInit.x, y: this.rotInit.y, z: this.rotInit.z
        });

        this.el.sceneEl.emit('baton-retour');
    },

    remove: function () {
        clearTimeout(this.minuteur);
    }
});


/* ==========================================================================
    Composant `commandes-bureau`

    Test sans casque :
    G prend / lâche la quille,
    clic ou Espace la lance.
    ========================================================================== */

AFRAME.registerComponent('commandes-bureau', {
    init: function () {
        var el = this.el;
        var tient = false;

        // L'état "je tiens la quille" suit ce qui se passe réellement
        el.sceneEl.addEventListener('baton-pris', function () {
            tient = true;
        });

        el.sceneEl.addEventListener('baton-lache', function () {
            tient = false;
        });

        window.addEventListener('keydown', function (e) {
            if (e.code === 'KeyG') {
                el.emit(
                    tient ? 'prise-fin' : 'prise-debut'
                );

            } else if (e.code === 'Space') {
                e.preventDefault();

                if (tient) {
                    el.emit('lancer');
                }
            }
        });

        function brancherClic() {
            el.sceneEl.canvas.addEventListener(
                'mousedown',
                function (e) {
                    if (e.button === 0 && tient) {
                        el.emit('lancer');
                    }
                }
            );
        }

        if (el.sceneEl.hasLoaded) {
            brancherClic();
        } else {
            el.sceneEl.addEventListener(
                'loaded',
                brancherClic
            );
        }
    }
});

// Composant A-Frame : chronomètre démarré / arrêté par des événements.
//
// Utilisation :
//   <a-text id="affichage" value="00:00.000" position="0 1.6 -2"></a-text>
//   <a-entity chronometre="affichage: #affichage"></a-entity>
//
// Démarrer :  el.emit('chrono-start')
// Arrêter  :  el.emit('chrono-stop')
// Remettre à zéro : el.emit('chrono-reset')

AFRAME.registerComponent('chronometre', {
  schema: {
    // Noms des événements qui pilotent le chronomètre
    startEvent: { type: 'string', default: 'chrono-start' },
    stopEvent: { type: 'string', default: 'chrono-stop' },
    resetEvent: { type: 'string', default: 'chrono-reset' },
    // Entité (a-text) où afficher le temps (facultatif)
    affichage: { type: 'selector' },
    // Entité qui écoute les événements (par défaut : l'entité elle-même)
    ecoute: { type: 'selector' }
  },

  init: function () {
    this.enMarche = false;
    this.debut = 0;       // instant de démarrage (ms)
    this.cumule = 0;      // temps accumulé lors des arrêts précédents (ms)

    this.demarrer = this.demarrer.bind(this);
    this.arreter = this.arreter.bind(this);
    this.reinitialiser = this.reinitialiser.bind(this);

    this.cible = this.data.ecoute || this.el;
    this.cible.addEventListener(this.data.startEvent, this.demarrer);
    this.cible.addEventListener(this.data.stopEvent, this.arreter);
    this.cible.addEventListener(this.data.resetEvent, this.reinitialiser);

    this.afficher(0);
  },

  demarrer: function () {
    if (this.enMarche) return;
    this.enMarche = true;
    this.debut = performance.now();
    this.el.emit('chrono-started');
  },

  arreter: function () {
    if (!this.enMarche) return;
    this.enMarche = false;
    this.cumule += performance.now() - this.debut;
    this.afficher(this.cumule);
    // Le temps final (en ms) est disponible dans event.detail.temps
    this.el.emit('chrono-stopped', { temps: this.cumule });
  },

  reinitialiser: function () {
    this.enMarche = false;
    this.cumule = 0;
    this.afficher(0);
  },

  // Temps actuel en ms (utilisable depuis un autre script)
  getTemps: function () {
    return this.enMarche
      ? this.cumule + (performance.now() - this.debut)
      : this.cumule;
  },

  tick: function () {
    if (this.enMarche) this.afficher(this.getTemps());
  },

  afficher: function (ms) {
    if (!this.data.affichage) return;
    this.data.affichage.setAttribute('value', this.formater(ms));
  },

  formater: function (ms) {
    const minutes = Math.floor(ms / 60000);
    const secondes = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    return (
      String(minutes).padStart(2, '0') + ':' +
      String(secondes).padStart(2, '0') + '.' +
      String(millis).padStart(3, '0')
    );
  },

  remove: function () {
    this.cible.removeEventListener(this.data.startEvent, this.demarrer);
    this.cible.removeEventListener(this.data.stopEvent, this.arreter);
    this.cible.removeEventListener(this.data.resetEvent, this.reinitialiser);
  }
});




/* ==========================================================================
    Composant `quille`

    IMPORTANT :

    - Le collider physique reste celui du HTML d'origine.
    - Le mesh visible est transformé APRÈS le chargement du collider.
    - Le corps visible est raccourci visuellement.
    - Son sommet est réellement coupé en biseau.
    - Le dessus incliné possède sa propre texture avec le numéro.
    - Le dessus incliné est volontairement NON CIBLABLE par le raycaster.

    Cela permet :
        physique stable  = collider d'origine
        affichage        = quille raccourcie + dessus incliné
        interaction      = seules les parois sont visables/ciblables
    ========================================================================== */

AFRAME.registerComponent('quille', {
    schema: {
        numero: {
            type: 'int',
            default: 0
        },

        // Angle du biseau
        biseau: {
            default: 30
        },

        couleurFace: {
            default: '#F2E2C0'
        },

        couleurChiffre: {
            default: '#030100'
        }
    },

    init: function () {
        this.mesh = null;
        this.face = null;
        this.faceMaterial = null;

        this.surMesh = this.surMesh.bind(this);
        this.construireSiPossible = this.construireSiPossible.bind(this);

        /*
         * On attend que le mesh visuel ET le body physique existent.
         */
        var mesh = this.el.getObject3D('mesh');

        if (mesh) {
            this.mesh = mesh;
        } else {
            this.el.addEventListener(
                'object3dset',
                this.surMesh
            );
        }

        this.el.addEventListener(
            'body-loaded',
            this.construireSiPossible
        );

        // Seules les cibles sont relevées (pas la quille de lancer)
        if (this.el.classList.contains('quille')) {
            var p = this.el.getAttribute('position');
            this.posInit = { x: p.x, z: p.z };      // pour le retour si la quille sort du terrain
            QUILLES.push(this);
        }

        // Petit filet de sécurité pour les cas où le body
        // est déjà présent au moment de l'initialisation.
        setTimeout(this.construireSiPossible, 0);
    },

    

    surMesh: function (evt) {
        if (
            evt.detail.type === 'mesh' &&
            !this.mesh
        ) {
            this.mesh = evt.detail.object;

            this.construireSiPossible();
        }
    },

    construireSiPossible: function () {
        if (!this.mesh) {
            return;
        }

        /*
         * Ne surtout pas modifier le mesh tant que le body physique
         * n'est pas chargé.
         */
        if (this.el.hasAttribute('dynamic-body') && !this.el.body) return;
        

        // Évite de reconstruire plusieurs fois le visuel
        if (this.visuelConstruit) {
            return;
        }

        this.visuelConstruit = true;

        this.construire(this.mesh);
    },

    construire: function (mesh) {
        var d = this.data;

        var dim = this.el.getAttribute('geometry');

        if (!dim) {
            return;
        }

        var r = Number(dim.radius) || 0.03;
        var h = Number(dim.height) || 0.15;

        var segments = Number(dim.segmentsRadial) || 16;

        var angle = THREE.MathUtils.degToRad(d.biseau);

        /*
         * Différence de hauteur entre les deux bords du biseau.
         *
         * Pour Ø 6 cm et 30° :
         * chute ≈ 3,46 cm
         *
         * La hauteur MOYENNE de la quille diminue donc de la moitié,
         * soit ≈ 1,73 cm.
         */
        var chute = 2 * r * Math.tan(angle);


        /*
         * Le HTML original place la quille à y = h/2.
         *
         * On garde donc le bas visuel exactement au même niveau
         * que le bas physique.
         */
        var yBas = -h / 2;

        var yHautMoyen = h / 2;

        /*
         * ==================================================================
         * 1) CYLINDRE VISUEL RACCOURCI
         * ==================================================================
         *
         * On reconstruit une géométrie avec seulement :
         *
         *   - un anneau inférieur
         *   - un anneau supérieur
         *
         * L'anneau supérieur suit directement le biseau.
         *
         * Donc plus aucun "anneau intermédiaire" ne peut créer
         * la cuvette/rebord de l'ancienne méthode.
         */

        var positions = [];
        var indices = [];
        var uvs = [];

        var i;

        // Anneau inférieur + anneau supérieur
        for (i = 0; i < segments; i++) {
            var theta = (i / segments) * Math.PI * 2;

            var x = r * Math.cos(theta);
            var z = r * Math.sin(theta);

            /*
             * Formule du plan incliné :
             *
             * côté -X = plus haut
             * côté +X = plus bas
             */
            var yHaut = yHautMoyen - chute * (z + r) / (2 * r); 

            // Sommet inférieur
            positions.push(x, yBas, z);

            // Sommet supérieur
            positions.push(x, yHaut, z);

            // UV latérales
            uvs.push(
                i / segments, 0
            );

            uvs.push(
                i / segments, 1
            );
        }

        // Centre inférieur pour fermer la base
        var indexCentreBas = positions.length / 3;

        positions.push(
            0,
            yBas,
            0
        );

        /*
         * Faces latérales
         */
        for (i = 0; i < segments; i++) {
            var suivant = (i + 1) % segments;

            var basA = i * 2;
            var hautA = i * 2 + 1;

            var basB = suivant * 2;
            var hautB = suivant * 2 + 1;

            indices.push(basA, hautA, basB);     
            indices.push(basB, hautA, hautB);    
        }

        /*
         * Base inférieure
         */
        for (i = 0; i < segments; i++) {
            var suivantBase = (i + 1) % segments;

            indices.push(indexCentreBas, i * 2, suivantBase * 2);
        }

        var geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
                positions,
                3
            )
        );

        geometry.setAttribute(
            'uv',
            new THREE.Float32BufferAttribute(
                uvs,
                2
            )
        );

        geometry.setIndex(indices);

        geometry.computeVertexNormals();

        /*
         * IMPORTANT :
         * on conserve exactement le matériau existant du cylindre.
         */
        var ancienMaterial = mesh.material;

        /*
         * Remplacement du mesh visuel.
         *
         * Le body physique ayant déjà été créé, cela ne change PAS
         * le collider existant.
         */
        mesh.geometry = geometry;

        /*
         * L'ancienne géométrie A-Frame n'est désormais plus utilisée
         * par le mesh visible.
         */
        if (
            mesh.userData &&
            mesh.userData.ancienneGeometrie
        ) {
            mesh.userData.ancienneGeometrie.dispose();
        }

        /*
         * ==================================================================
         * 2) DESSUS INCLINÉ VISUEL
         * ==================================================================
         *
         * Ce disque correspond exactement au plan incliné.
         */

        var topPositions = [];
        var topIndices = [];
        var topUvs = [];

        /*
         * Centre du dessus
         */
        topPositions.push(0, yHautMoyen - chute / 2, 0);

        topUvs.push(
            0.5,
            0.5
        );

        /*
         * Anneau du dessus
         */
        for (i = 0; i < segments; i++) {
            var t = (i / segments) * Math.PI * 2;

            var tx = r * Math.cos(t);
            var tz = r * Math.sin(t);

            var ty = yHautMoyen - chute * (tz + r) / (2 * r);

            topPositions.push(
                tx,
                ty,
                tz
            );

            /*
             * Coordonnées UV :
             * on projette directement le disque dans le plan X/Z.
             */
            topUvs.push(
                0.5 + tx / (2 * r),
                0.5 - tz / (2 * r)
            );
        }

        /*
         * Triangles du dessus.
         *
         * Ordre inversé par rapport à la base pour avoir une normale
         * dirigée vers l'extérieur / vers le haut.
         */
        for (i = 0; i < segments; i++) {
            var nextTop = (i + 1) % segments;

            topIndices.push(
                0,
                nextTop + 1,
                i + 1
            );
        }

        var topGeometry = new THREE.BufferGeometry();

        topGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
                topPositions,
                3
            )
        );

        topGeometry.setAttribute(
            'uv',
            new THREE.Float32BufferAttribute(
                topUvs,
                2
            )
        );

        topGeometry.setIndex(topIndices);

        topGeometry.computeVertexNormals();

        /*
         * ==================================================================
         * 3) TEXTURE DU NUMÉRO
         * ==================================================================
         *
         * Le numéro est volontairement plus petit.
         *
         * Avant :
         *   font = 76 px
         *
         * Maintenant :
         *   font = 52 px
         *
         * Le cercle est également réduit.
         */

        var canvas = document.createElement('canvas');

        canvas.width = 256;
        canvas.height = 256;

        var c = canvas.getContext('2d');

        /*
         * Fond
         */
        c.fillStyle = d.couleurFace;
        c.fillRect(
            0,
            0,
            256,
            256
        );

        /*
         * Cercle plus petit
         */
        c.strokeStyle = d.couleurChiffre;
        c.lineWidth = 7;

        c.beginPath();

        c.arc(
            128,
            128,
            94,
            0,
            Math.PI * 2
        );

        c.stroke();

        /*
         * Numéro plus petit
         */
        c.fillStyle = d.couleurChiffre;
        c.font = 'bold 200px sans-serif';

        c.textAlign = 'center';
        c.textBaseline = 'middle';

        c.fillText(
            String(d.numero),
            128,
            138
        );

        var texture = new THREE.CanvasTexture(canvas);

        if (THREE.SRGBColorSpace) {
            texture.colorSpace = THREE.SRGBColorSpace;
        } else {
            texture.encoding = THREE.sRGBEncoding;
        }

        texture.needsUpdate = true;

        /*
         * Matériau du dessus.
         */
        var topMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.8,
            metalness: 0,
            side: THREE.FrontSide
        });

        this.faceMaterial = topMaterial;

        /*
         * Mesh du dessus.
         */
        var topMesh = new THREE.Mesh(
            topGeometry,
            topMaterial
        );

        /*
         * Décalage infime suivant la normale pour éviter
         * toute possibilité de z-fighting sur le bord.
         */
        var normale = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle)).normalize();

        topMesh.position.addScaledVector(
            normale,
            0.0002
        );

        /*
         * IMPORTANT :
         *
         * On désactive explicitement le raycast de ce mesh.
         *
         * Le joueur voit le dessus et le numéro,
         * mais le laser ne peut PAS sélectionner cette surface.
         *
         * La quille reste donc ciblable uniquement par ses parois.
         */
        topMesh.raycast = function () {
            // volontairement vide
        };

        /*
         * Stockage pour le nettoyage ultérieur.
         */
        this.face = topMesh;

        /*
         * On ajoute le dessus au mesh principal.
         */
        mesh.add(topMesh);

        /*
         * On garde la géométrie/texture dans userData
         * pour pouvoir les nettoyer proprement.
         */
        mesh.userData.topGeometry = topGeometry;
        mesh.userData.topTexture = texture;
        mesh.userData.topMaterial = topMaterial;
    },

    remove: function () {
        this.el.removeEventListener(
            'object3dset',
            this.surMesh
        );

        var k = QUILLES.indexOf(this);
        if (k >= 0) { QUILLES.splice(k, 1); }

        this.el.removeEventListener(
            'body-loaded',
            this.construireSiPossible
        );

        if (this.face) {
            if (this.face.parent) {
                this.face.parent.remove(this.face);
            }

            if (this.face.geometry) {
                this.face.geometry.dispose();
            }

            if (this.face.material) {
                if (this.face.material.map) {
                    this.face.material.map.dispose();
                }

                this.face.material.dispose();
            }

            this.face = null;
        }

        this.faceMaterial = null;
        this.mesh = null;
    }
});

AFRAME.registerComponent('tableau-score', {
    schema: {
        largeur: { default: 1.2 },        // taille du plan (m)
        hauteur: { default: 0.6 },
        fond: { default: '' },           // a mettre '#1F3A2E', vide: 'transparent' si on veut l'afficher sans le tableau
        couleur: { default: '#F4F4F0' }   // couleur de la "craie"
    },

    init: function () {
        var d = this.data;
        this.etat = { total: 0, dernier: null, rates: 0, lances: 0 };

        // Le canvas est la "feuille" sur laquelle on écrit ; la texture en est la copie envoyée au GPU
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = Math.round(1024 * d.hauteur / d.largeur);
        this.texture = new THREE.CanvasTexture(this.canvas);
        if (THREE.SRGBColorSpace) { this.texture.colorSpace = THREE.SRGBColorSpace; }
        else { this.texture.encoding = THREE.sRGBEncoding; }
        var rendu = this.el.sceneEl.renderer;
        if (rendu) { this.texture.anisotropy = rendu.capabilities.getMaxAnisotropy(); }

        var plan = new THREE.Mesh(
            new THREE.PlaneGeometry(d.largeur, d.hauteur),
            new THREE.MeshBasicMaterial({ map: this.texture, transparent: true })
        );
        this.el.setObject3D('tableau', plan);

        // Le plan se met à jour uniquement quand le score change (pas à chaque image)
        this.maj = this.maj.bind(this);
        this.el.sceneEl.addEventListener('score-mis-a-jour', this.maj);

        this.dessiner();
    },

    maj: function (e) {
        Object.assign(this.etat, e.detail);   // { total, dernier, rates }
        this.dessiner();
    },

    dessiner: function () {
        var d = this.data, e = this.etat;
        var c = this.canvas.getContext('2d');
        var W = this.canvas.width, H = this.canvas.height;
        var police = '"Segoe Print", "Comic Sans MS", cursive, sans-serif';   // polices du système

        c.clearRect(0, 0, W, H);
        if (d.fond) { c.fillStyle = d.fond; c.fillRect(0, 0, W, H); }

        c.fillStyle = d.couleur;
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        c.font = 'bold ' + Math.round(H * 0.10) + 'px ' + police;
        c.fillText('SCORE', W / 2, H * 0.10);

        c.font = 'bold ' + Math.round(H * 0.38) + 'px ' + police;
        c.fillText(String(e.total), W / 2, H * 0.44);

        c.font = Math.round(H * 0.11) + 'px ' + police;
        c.fillText('Dernier tir : ' + (e.dernier === null ? '-' : '+' + e.dernier), W / 2, H * 0.66);
        c.fillText('Ratés : ' + e.rates + ' / 3', W / 2, H * 0.8);
        c.fillText('Nombre de tir : ' + e.lances , W / 2, H *0.94);

        this.texture.needsUpdate = true;      // indispensable après chaque redessin
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('score-mis-a-jour', this.maj);
        var plan = this.el.getObject3D('tableau');
        if (plan) {
            plan.geometry.dispose();
            plan.material.dispose();
            this.el.removeObject3D('tableau');
        }
        this.texture.dispose();
    }
});

AFRAME.registerComponent('panneau-texte', {
    schema: {
        nom: { default: '' },            // nomme les événements : <nom>-afficher et <nom>-masquer
        largeur: { default: 1.2 },       // taille du plan (m)
        hauteur: { default: 0.3 },
        taille: { default: 0.2 },        // taille du texte, en fraction de la hauteur du panneau
        fond: { default: '' },           // vide = transparent ; ex : rgba(20,30,28,0.9)
        couleur: { default: '#F4F4F0' },
        affiche: { default: true },      // visible dès le départ ?
        duree: { default: 0 },           // ms avant disparition automatique (0 = reste affiché)
        devantJoueur: { default: 0.00 }     // > 0 : apparaît à cette distance (m) devant le joueur
    },

    init: function () {
        var d = this.data;
        this.lignes = [];
        this.minuteur = null;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = Math.max(64, Math.round(1024 * d.hauteur / d.largeur));
        this.texture = new THREE.CanvasTexture(this.canvas);
        if (THREE.SRGBColorSpace) { this.texture.colorSpace = THREE.SRGBColorSpace; }
        else { this.texture.encoding = THREE.sRGBEncoding; }
        var rendu = this.el.sceneEl.renderer;
        if (rendu) { this.texture.anisotropy = rendu.capabilities.getMaxAnisotropy(); }

        this.materiau = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
        var plan = new THREE.Mesh(new THREE.PlaneGeometry(d.largeur, d.hauteur), this.materiau);
        this.el.setObject3D('panneau', plan);
        this.el.setAttribute('visible', d.affiche);

        this.afficher = this.afficher.bind(this);
        this.masquer = this.masquer.bind(this);
        this.surAfficher = function (e) {
            var det = e.detail || {};
            this.afficher(det.lignes, det.duree);
        }.bind(this);

        if (d.nom) {
            this.el.sceneEl.addEventListener(d.nom + '-afficher', this.surAfficher);
            this.el.sceneEl.addEventListener(d.nom + '-masquer', this.masquer);
        }
    },

    // lignes : tableau de chaînes ou d'objets { texte, taille, couleur, gras }
    afficher: function (lignes, duree) {
        if (lignes) { this.lignes = lignes; this.dessiner(); }
        if (this.data.devantJoueur > 0) { this.placerDevantJoueur(); }
        this.el.setAttribute('visible', true);

        clearTimeout(this.minuteur);
        var ms = duree !== undefined ? duree : this.data.duree;
        if (ms > 0) { this.minuteur = setTimeout(this.masquer, ms); }
    },

    masquer: function () {
        clearTimeout(this.minuteur);
        this.el.setAttribute('visible', false);
    },

    // Place le panneau devant le joueur, à hauteur d'yeux, tourné vers lui
    placerDevantJoueur: function () {
        var cam = this.el.sceneEl.camera;
        if (!cam) { return; }
        var pos = new THREE.Vector3(), dir = new THREE.Vector3();
        cam.getWorldPosition(pos);
        cam.getWorldDirection(dir);
        dir.y = 0;                                       // on ignore l'inclinaison de la tête
        if (dir.lengthSq() < 1e-4) { dir.set(0, 0, -1); }
        dir.normalize();

        this.el.object3D.position.set(
            pos.x + dir.x * this.data.devantJoueur,
            pos.y,
            pos.z + dir.z * this.data.devantJoueur
        );
        this.el.object3D.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);   // la face du plan regarde le joueur
    },

    // Découpe en lignes visuelles (retour à la ligne automatique) et réduit le texte s'il ne tient pas
    mettreEnPage: function (c, W, H) {
        var d = this.data;
        var police = '"Segoe Print", "Comic Sans MS", cursive, sans-serif';
        var echelle = 1, items, total;

        for (var essai = 0; essai < 12; essai++) {
            items = []; total = 0;
            this.lignes.forEach(function (l) {
                if (typeof l === 'string') { l = { texte: l }; }
                var px = Math.round(H * (l.taille || d.taille) * echelle);
                c.font = (l.gras === false ? '' : 'bold ') + px + 'px ' + police;

                var segments = [], courante = '';
                String(l.texte).split(' ').forEach(function (mot) {
                    var test = courante ? courante + ' ' + mot : mot;
                    if (courante && c.measureText(test).width > W * 0.92) {
                        segments.push(courante);
                        courante = mot;
                    } else {
                        courante = test;
                    }
                });
                if (courante) { segments.push(courante); }

                segments.forEach(function (s) {
                    items.push({ texte: s, police: c.font, couleur: l.couleur || d.couleur, h: px * 1.2 });
                    total += px * 1.2;
                });
            });
            if (total <= H * 0.9) { break; }
            echelle *= 0.9;
        }
        return { items: items, total: total };
    },

    dessiner: function () {
        var d = this.data;
        var c = this.canvas.getContext('2d');
        var W = this.canvas.width, H = this.canvas.height;

        c.clearRect(0, 0, W, H);
        if (d.fond) {
            c.fillStyle = d.fond;
            c.fillRect(0, 0, W, H);
            c.strokeStyle = d.couleur;
            c.lineWidth = 6;
            c.strokeRect(3, 3, W - 6, H - 6);
        }

        c.textAlign = 'center';
        c.textBaseline = 'middle';
        var page = this.mettreEnPage(c, W, H);
        var y = (H - page.total) / 2;
        page.items.forEach(function (it) {
            c.font = it.police;
            c.fillStyle = it.couleur;
            c.fillText(it.texte, W / 2, y + it.h / 2);
            y += it.h;
        });

        this.texture.needsUpdate = true;
    },

    remove: function () {
        clearTimeout(this.minuteur);
        var d = this.data;
        if (d.nom) {
            this.el.sceneEl.removeEventListener(d.nom + '-afficher', this.surAfficher);
            this.el.sceneEl.removeEventListener(d.nom + '-masquer', this.masquer);
        }
        var plan = this.el.getObject3D('panneau');
        if (plan) {
            plan.geometry.dispose();
            this.el.removeObject3D('panneau');
        }
        this.materiau.dispose();
        this.texture.dispose();
    }
});


AFRAME.registerComponent('bouton-vr', {
    schema: {
        libelle: { default: 'Bouton' },
        evenement: { default: '' },              // événement émis sur la scène quand on appuie
        largeur: { default: 0.5 },               // taille du bouton (m)
        hauteur: { default: 0.18 },
        couleur: { default: '#2F6F4F' },
        couleurSurvol: { default: '#3FA56F' },
        couleurTexte: { default: '#FFFFFF' }
    },

    init: function () {
        var d = this.data;
        this.survol = false;
        this.enfonce = false;
        this.dernierAppui = 0;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = Math.max(64, Math.round(512 * d.hauteur / d.largeur));
        this.texture = new THREE.CanvasTexture(this.canvas);
        if (THREE.SRGBColorSpace) { this.texture.colorSpace = THREE.SRGBColorSpace; }
        else { this.texture.encoding = THREE.sRGBEncoding; }
        var rendu = this.el.sceneEl.renderer;
        if (rendu) { this.texture.anisotropy = rendu.capabilities.getMaxAnisotropy(); }

        this.materiau = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
        var plan = new THREE.Mesh(new THREE.PlaneGeometry(d.largeur, d.hauteur), this.materiau);              
        this.el.setObject3D('mesh', plan);

        this.surSurvol = function (evt) {
            if (!this.estVisible()) { return; }
            evt.preventDefault();               // survol accepté, seulement si visible (remplace hoverable)
            this.survol = true; this.dessiner();
        }.bind(this);
        this.surFinSurvol = function () { this.survol = false; this.dessiner(); }.bind(this);
        this.surClic = function () { this.appuyer(); }.bind(this);           // souris (PC)
        this.surPrise = function (evt) {                                     // grip en VR, touche G sur PC
            if (!this.estVisible()) { return; }
            evt.preventDefault();                                            // saisie acceptée
            this.appuyer();
        }.bind(this);

        this.el.addEventListener('hover-start', this.surSurvol);
        this.el.addEventListener('hover-end', this.surFinSurvol);
        this.el.addEventListener('click', this.surClic);
        this.el.addEventListener('grab-start', this.surPrise);
        this.surLache = function (evt) { evt.preventDefault(); };   // libère la main, sinon super-hands la croit encore occupée
        this.el.addEventListener('grab-end', this.surLache);

        this.dessiner();
    },

    // Visible seulement si l'entité ET tous ses parents le sont (le panneau de fin est caché au départ)
    estVisible: function () {
        var o = this.el.object3D;
        while (o) {
            if (!o.visible) { return false; }
            o = o.parent;
        }
        return true;
    },

    appuyer: function () {
        if (!this.estVisible()) { return; }
        var maintenant = Date.now();
        if (maintenant - this.dernierAppui < 600) { return; }   // anti double déclenchement
        this.dernierAppui = maintenant;

        this.survol = false;
        this.enfonce = true;
        this.dessiner();
        setTimeout(function () { this.enfonce = false; this.dessiner(); }.bind(this), 150);

        if (this.data.evenement) { this.el.sceneEl.emit(this.data.evenement); }
    },

    dessiner: function () {
        var d = this.data;
        var c = this.canvas.getContext('2d');
        var W = this.canvas.width, H = this.canvas.height;
        var police = '"Segoe UI", Arial, sans-serif';

        c.clearRect(0, 0, W, H);
        rectArrondi(c, 4, 4, W - 8, H - 8, H * 0.3);
        // enfoncé : couleurs inversées ; survolé : couleur plus claire
        c.fillStyle = this.enfonce ? d.couleurTexte : (this.survol ? d.couleurSurvol : d.couleur);
        c.fill();
        c.lineWidth = 8;
        c.strokeStyle = this.survol || this.enfonce ? d.couleurTexte : 'rgba(255,255,255,0.35)';
        c.stroke();

        // le libellé est réduit s'il ne tient pas dans le bouton
        var px = Math.round(H * 0.45);
        c.font = 'bold ' + px + 'px ' + police;
        while (c.measureText(d.libelle).width > W * 0.86 && px > 10) {
            px -= 2;
            c.font = 'bold ' + px + 'px ' + police;
        }
        c.fillStyle = this.enfonce ? d.couleur : d.couleurTexte;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(d.libelle, W / 2, H / 2 + px * 0.04);

        this.texture.needsUpdate = true;
    },

    remove: function () {
        this.el.removeEventListener('hover-start', this.surSurvol);
        this.el.removeEventListener('hover-end', this.surFinSurvol);
        this.el.removeEventListener('click', this.surClic);
        this.el.removeEventListener('grab-start', this.surPrise);
        this.el.removeEventListener('grab-end', this.surLache);
        var plan = this.el.getObject3D('bouton');
        if (plan) {
            plan.geometry.dispose();
            this.el.removeObject3D('bouton');
        }
        this.materiau.dispose();
        this.texture.dispose();

        var plan = this.el.getObject3D('mesh');
        if (plan) {
            plan.geometry.dispose();
            this.el.removeObject3D('mesh');
        }
    }
});