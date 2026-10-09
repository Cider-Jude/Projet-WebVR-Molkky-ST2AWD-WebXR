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

        delaiRetour: { default: 3000 },      // délai avant le retour sur le socle (ms)

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
        }
    },

    init: function () {
        this.porteur = null;
        this.vitesseImposee = null;
        this.historique = [];

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
        // OBLIGATOIRE : sans preventDefault, super-hands considère que la saisie
        // a été refusée et n'enverra jamais le grab-end correspondant.
        evt.preventDefault();

        if (this.porteur) {
            return;
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
         *
         * C'est très important :
         * on ne touche pas à la géométrie avant que le collider
         * ait été créé, afin de ne pas perturber la physique.
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