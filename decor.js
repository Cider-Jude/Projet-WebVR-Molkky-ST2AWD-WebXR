/* ==========================================================================
    Décor : un jardin finlandais en été (le Mölkky est un jeu de pelouse finlandais)

    Tout est généré par le code (aucun modèle à télécharger) :
      - `ciel`          : dégradé bleu + soleil placé dans la direction de la lumière
      - `pelouse`       : sol tondu en bandes, assez grand pour que le bord se perde dans le brouillard
      - `vegetation`    : bouleaux, sapins, buissons, touffes d'herbe et fleurs
      - `collines`      : relief à l'horizon, estompé par le brouillard
      - `nuages`        : nuages qui dérivent lentement
      - `nappe-carreaux`: nappe de pique-nique

    Performances (VR) : chaque type d'objet répété est un seul InstancedMesh,
    donc un seul appel de dessin pour tous les arbres d'une même espèce, etc.
    Le décor n'a aucune physique : seules les quilles, le bâton et le sol en ont.
    ========================================================================== */

// Générateur pseudo-aléatoire à graine : le décor est le même à chaque chargement
function aleatoireGraine(graine) {
    return function () {
        graine = (graine + 0x6D2B79F5) | 0;
        var t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Couleur CSS -> vec3 (0..1) pour les shaders écrits à la main.
// Pas de THREE.Color ici : il convertirait la couleur en linéaire et le ciel paraîtrait trop sombre.
function couleurShader(hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Zone à laisser dégagée : couloir de lancer (jusque derrière les quilles) et abords du joueur
function dansZoneDeJeu(x, z, marge) {
    marge = marge || 0;
    var couloir = Math.abs(x) < 3 + marge && z < 2.5 + marge && z > -9 - marge;
    return couloir || x * x + z * z < 16;
}

// Fusionne plusieurs géométries en une seule.
// couleurs (facultatif) : une couleur par géométrie, écrite dans les sommets (material.vertexColors).
function fusionnerGeometries(geos, couleurs) {
    var pos = [], col = [];
    geos.forEach(function (g, i) {
        var p = (g.index ? g.toNonIndexed() : g).attributes.position.array;
        var c = new THREE.Color(couleurs ? couleurs[i] : '#FFFFFF');
        for (var k = 0; k < p.length; k += 3) {
            pos.push(p[k], p[k + 1], p[k + 2]);
            col.push(c.r, c.g, c.b);
        }
        g.dispose();
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
}

function textureCanvas(canvas, repetitionX, repetitionY) {
    var t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repetitionX || 1, repetitionY || 1);
    return t;
}

// Herbe tondue : une bande claire, une bande foncée, et des milliers de petits brins
function texturePelouse(claire, foncee) {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    var c = canvas.getContext('2d'), alea = aleatoireGraine(3);
    c.fillStyle = claire;
    c.fillRect(0, 0, 256, 512);
    c.fillStyle = foncee;
    c.fillRect(256, 0, 256, 512);
    for (var i = 0; i < 9000; i++) {
        c.fillStyle = alea() < 0.5 ? 'rgba(255,255,210,0.10)' : 'rgba(20,60,10,0.13)';
        c.fillRect(alea() * 512, alea() * 512, 1.5, 3 + alea() * 4);
    }
    return textureCanvas(canvas);
}

// Écorce de bouleau : blanche avec des traits noirs horizontaux
function textureEcorceBouleau() {
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    var c = canvas.getContext('2d'), alea = aleatoireGraine(7);
    c.fillStyle = '#EEECE4';
    c.fillRect(0, 0, 64, 256);
    c.fillStyle = '#2B2B2B';
    for (var i = 0; i < 45; i++) {
        c.fillRect(alea() * 64, alea() * 256, 4 + alea() * 18, 1 + alea() * 3);
    }
    return textureCanvas(canvas, 1, 3);
}


/* --------------------------------------------------------------------------
    Composant `ciel`
    Sphère géante peinte par un petit shader : dégradé zénith -> horizon,
    halo et disque du soleil dans la direction de la lumière `lumiere`.
    La couleur d'horizon doit être celle du brouillard de la scène.
   -------------------------------------------------------------------------- */
AFRAME.registerComponent('ciel', {
    schema: {
        lumiere: { type: 'selector' },        // lumière directionnelle du soleil
        zenith: { default: '#3E83CF' },
        horizon: { default: '#D6E9F5' },
        couleurSoleil: { default: '#FFF2CC' },
        rayon: { default: 400 }
    },

    init: function () {
        var d = this.data;
        this.posLumiere = new THREE.Vector3();
        this.posCible = new THREE.Vector3();

        this.materiau = new THREE.ShaderMaterial({
            uniforms: {
                zenith: { value: couleurShader(d.zenith) },
                horizon: { value: couleurShader(d.horizon) },
                couleurSoleil: { value: couleurShader(d.couleurSoleil) },
                directionSoleil: { value: new THREE.Vector3(-0.5, 0.65, 0.55).normalize() }
            },
            vertexShader: [
                'varying vec3 vDirection;',
                'void main() {',
                '    vDirection = position;',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 zenith;',
                'uniform vec3 horizon;',
                'uniform vec3 couleurSoleil;',
                'uniform vec3 directionSoleil;',
                'varying vec3 vDirection;',
                'void main() {',
                '    vec3 dir = normalize(vDirection);',
                '    vec3 couleur = mix(horizon, zenith, pow(max(dir.y, 0.0), 0.5));',
                '    float s = max(dot(dir, directionSoleil), 0.0);',
                '    couleur += couleurSoleil * pow(s, 10.0) * 0.25;',                          // halo
                '    couleur = mix(couleur, couleurSoleil, smoothstep(0.9993, 0.9996, s));',    // disque
                '    gl_FragColor = vec4(couleur, 1.0);',
                '}'
            ].join('\n'),
            side: THREE.BackSide,
            depthWrite: false
        });

        var sphere = new THREE.Mesh(new THREE.SphereGeometry(d.rayon, 32, 16), this.materiau);
        sphere.frustumCulled = false;
        this.el.setObject3D('mesh', sphere);
    },

    // Le soleil suit la lumière : si on la déplace, le disque se déplace aussi
    tick: function () {
        var lumiere = this.data.lumiere && this.data.lumiere.getObject3D('light');
        if (!lumiere || !lumiere.target) { return; }
        lumiere.getWorldPosition(this.posLumiere);
        lumiere.target.getWorldPosition(this.posCible);
        this.materiau.uniforms.directionSoleil.value
            .copy(this.posLumiere).sub(this.posCible).normalize();
    },

    remove: function () {
        this.el.getObject3D('mesh').geometry.dispose();
        this.materiau.dispose();
        this.el.removeObject3D('mesh');
    }
});


/* --------------------------------------------------------------------------
    Composant `pelouse` : disque de gazon tondu en bandes, centré sur le joueur.
    Visuel seulement : la collision du sol reste la boîte invisible du HTML.
   -------------------------------------------------------------------------- */
AFRAME.registerComponent('pelouse', {
    schema: {
        rayon: { default: 150 },
        largeurBande: { default: 1.5 },       // largeur d'une bande de tonte (m)
        couleurClaire: { default: '#8CC764' },
        couleurFoncee: { default: '#78B452' }
    },

    init: function () {
        var d = this.data;
        this.texture = texturePelouse(d.couleurClaire, d.couleurFoncee);
        var repetition = d.rayon / d.largeurBande;      // le motif contient deux bandes
        this.texture.repeat.set(repetition, repetition);
        this.texture.offset.x = 0.25;                   // une bande centrée sur l'axe de lancer (x = 0)
        var rendu = this.el.sceneEl.renderer;
        if (rendu) { this.texture.anisotropy = rendu.capabilities.getMaxAnisotropy(); }

        this.materiau = new THREE.MeshLambertMaterial({ map: this.texture });
        var sol = new THREE.Mesh(new THREE.CircleGeometry(d.rayon, 64), this.materiau);
        sol.rotation.x = -Math.PI / 2;
        sol.receiveShadow = true;
        this.el.setObject3D('mesh', sol);
    },

    remove: function () {
        this.el.getObject3D('mesh').geometry.dispose();
        this.materiau.dispose();
        this.texture.dispose();
        this.el.removeObject3D('mesh');
    }
});


/* --------------------------------------------------------------------------
    Composant `vegetation` : arbres, buissons, herbe et fleurs autour du terrain.
    Chaque espèce = un InstancedMesh ; la position, la taille et la teinte
    de chaque exemplaire sont tirées au hasard (avec graine), hors zone de jeu.
   -------------------------------------------------------------------------- */
AFRAME.registerComponent('vegetation', {
    schema: {
        graine: { default: 42 },
        bouleaux: { default: 24 },
        sapins: { default: 30 },
        buissons: { default: 26 },
        touffes: { default: 1800 },
        fleurs: { default: 450 }
    },

    init: function () {
        var d = this.data;
        this.alea = aleatoireGraine(d.graine);
        this.mesures = new THREE.Object3D();    // sert à calculer la matrice de chaque exemplaire
        this.groupe = new THREE.Group();
        this.ressources = [];                   // géométries, matériaux et textures à libérer

        this.planterBouleaux(d.bouleaux);
        this.planterSapins(d.sapins);
        this.planterBuissons(d.buissons);
        this.planterTouffes(d.touffes);
        this.planterFleurs(d.fleurs);

        this.el.setObject3D('vegetation', this.groupe);
    },

    // Point au hasard dans l'anneau [rMin, rMax] autour du joueur, hors de la zone de jeu
    tirerPosition: function (rMin, rMax, marge) {
        var x = rMax, z = rMax;
        for (var essai = 0; essai < 50; essai++) {
            var a = this.alea() * Math.PI * 2;
            var r = Math.sqrt(rMin * rMin + this.alea() * (rMax * rMax - rMin * rMin));   // répartition uniforme
            x = Math.cos(a) * r;
            z = Math.sin(a) * r;
            if (!dansZoneDeJeu(x, z, marge)) { break; }
        }
        return { x: x, z: z };
    },

    // Crée un InstancedMesh de `nb` exemplaires ; placer(i, mesures, couleur) règle chacun
    creerInstances: function (geometrie, materiau, nb, placer) {
        var mesh = new THREE.InstancedMesh(geometrie, materiau, nb);
        var couleur = new THREE.Color();
        for (var i = 0; i < nb; i++) {
            this.mesures.position.set(0, 0, 0);
            this.mesures.rotation.set(0, this.alea() * Math.PI * 2, 0);
            this.mesures.scale.set(1, 1, 1);
            couleur.set('#FFFFFF');
            placer.call(this, i, this.mesures, couleur);
            this.mesures.updateMatrix();
            mesh.setMatrixAt(i, this.mesures.matrix);
            mesh.setColorAt(i, couleur);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;             // les exemplaires sont tout autour du joueur
        this.groupe.add(mesh);
        this.ressources.push(geometrie, materiau);
        return mesh;
    },

    planterBouleaux: function (nb) {
        var arbres = [];
        for (var i = 0; i < nb; i++) {
            var p = this.tirerPosition(9, 32, 2);
            arbres.push({ x: p.x, z: p.z, h: 5 + this.alea() * 3 });
        }

        var tronc = new THREE.CylinderGeometry(0.09, 0.13, 1, 7).translate(0, 0.5, 0);   // base au sol, hauteur 1
        this.textureEcorce = textureEcorceBouleau();
        this.ressources.push(this.textureEcorce);
        this.creerInstances(tronc, new THREE.MeshLambertMaterial({ map: this.textureEcorce }), nb, function (i, m) {
            m.position.set(arbres[i].x, 0, arbres[i].z);
            m.scale.set(1, arbres[i].h, 1);
        });

        // deux masses de feuillage par arbre : une grosse au milieu, une petite au sommet
        var feuillage = new THREE.IcosahedronGeometry(1, 1);
        var matFeuillage = new THREE.MeshLambertMaterial({ flatShading: true });
        this.creerInstances(feuillage, matFeuillage, nb * 2, function (i, m, c) {
            var a = arbres[i >> 1], sommet = (i & 1) === 1;
            var largeur = (1.2 + this.alea() * 0.5) * (sommet ? 0.7 : 1);
            var decalage = sommet ? (this.alea() - 0.5) * 0.6 : 0;
            m.position.set(a.x + decalage, a.h * (sommet ? 0.9 : 0.68), a.z + decalage);
            m.scale.set(largeur, a.h * (sommet ? 0.2 : 0.3), largeur);
            c.setHSL(0.22 + this.alea() * 0.05, 0.55, 0.42 + this.alea() * 0.1);
        });
    },

    planterSapins: function (nb) {
        var sapin = fusionnerGeometries([
            new THREE.CylinderGeometry(0.12, 0.17, 1.4, 6).translate(0, 0.7, 0),
            new THREE.ConeGeometry(1.5, 2.2, 8).translate(0, 2.0, 0),
            new THREE.ConeGeometry(1.15, 1.9, 8).translate(0, 3.0, 0),
            new THREE.ConeGeometry(0.75, 1.6, 8).translate(0, 3.9, 0)
        ], ['#5B3A22', '#2E6A3E', '#33713F', '#3A7A46']);
        var materiau = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

        this.creerInstances(sapin, materiau, nb, function (i, m, c) {
            var p = this.tirerPosition(10, 38, 3);
            var taille = 0.9 + this.alea() * 0.8;
            m.position.set(p.x, 0, p.z);
            m.scale.set(taille, taille * (0.9 + this.alea() * 0.3), taille);
            var v = 0.85 + this.alea() * 0.25;              // légère variation de teinte
            c.setRGB(v, v, v);
        });
    },

    planterBuissons: function (nb) {
        var buisson = fusionnerGeometries([
            new THREE.IcosahedronGeometry(0.6, 0).translate(0, 0.35, 0),
            new THREE.IcosahedronGeometry(0.45, 0).translate(0.5, 0.25, 0.1),
            new THREE.IcosahedronGeometry(0.4, 0).translate(-0.45, 0.22, -0.15)
        ]);
        var materiau = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

        this.creerInstances(buisson, materiau, nb, function (i, m, c) {
            var p = this.tirerPosition(6, 22, 1.5);
            var taille = 0.8 + this.alea() * 0.8;
            m.position.set(p.x, 0, p.z);
            m.scale.set(taille, taille, taille);
            c.setHSL(0.26 + this.alea() * 0.05, 0.45, 0.3 + this.alea() * 0.1);
        });
    },

    // Herbe plus haute autour du terrain tondu : trois brins par touffe
    planterTouffes: function (nb) {
        var touffe = fusionnerGeometries([
            new THREE.ConeGeometry(0.025, 0.16, 3).rotateZ(0.25).translate(0.02, 0.07, 0),
            new THREE.ConeGeometry(0.025, 0.14, 3).rotateZ(-0.3).translate(-0.02, 0.06, 0.01),
            new THREE.ConeGeometry(0.025, 0.12, 3).rotateX(0.3).translate(0, 0.055, -0.02)
        ]);
        var materiau = new THREE.MeshLambertMaterial({ vertexColors: true });

        this.creerInstances(touffe, materiau, nb, function (i, m, c) {
            var p = this.tirerPosition(1.5, 25, 0);
            var taille = 0.7 + this.alea() * 0.8;
            m.position.set(p.x, 0, p.z);
            m.scale.set(taille, taille, taille);
            c.setHSL(0.24 + this.alea() * 0.05, 0.5, 0.36 + this.alea() * 0.12);
        });
    },

    // Fleurs des champs : tige verte + corolle colorée (la couleur de l'exemplaire teinte la corolle)
    planterFleurs: function (nb) {
        var fleur = fusionnerGeometries([
            new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4).translate(0, 0.035, 0),
            new THREE.IcosahedronGeometry(0.028, 0).translate(0, 0.075, 0)
        ], ['#4E8A2E', '#FFFFFF']);
        var materiau = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        var palette = ['#FFFFFF', '#FFFFFF', '#FFD93D', '#B48AE8', '#F59BBE'];   // marguerites plus fréquentes

        this.creerInstances(fleur, materiau, nb, function (i, m, c) {
            var p = this.tirerPosition(2, 22, 0.3);
            var taille = 0.8 + this.alea() * 0.6;
            m.position.set(p.x, 0, p.z);
            m.scale.set(taille, taille, taille);
            c.set(palette[Math.floor(this.alea() * palette.length)]);
        });
    },

    remove: function () {
        this.ressources.forEach(function (r) { r.dispose(); });
        this.el.removeObject3D('vegetation');
    }
});


/* --------------------------------------------------------------------------
    Composant `collines` : demi-sphères aplaties en anneau à l'horizon.
    Le brouillard de la scène les estompe (perspective atmosphérique).
   -------------------------------------------------------------------------- */
AFRAME.registerComponent('collines', {
    schema: {
        graine: { default: 9 },
        nombre: { default: 16 },
        distance: { default: 90 }
    },

    init: function () {
        var d = this.data, alea = aleatoireGraine(d.graine);
        this.geometrie = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
        this.materiau = new THREE.MeshLambertMaterial({ flatShading: true });
        var mesh = new THREE.InstancedMesh(this.geometrie, this.materiau, d.nombre);
        var m = new THREE.Object3D(), c = new THREE.Color();

        for (var i = 0; i < d.nombre; i++) {
            var a = (i + alea() * 0.6) / d.nombre * Math.PI * 2;
            var r = d.distance + (alea() - 0.5) * 30;
            var largeur = 18 + alea() * 22;
            m.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
            m.rotation.set(0, alea() * Math.PI, 0);
            m.scale.set(largeur, 5 + alea() * 9, largeur * 0.8);
            m.updateMatrix();
            mesh.setMatrixAt(i, m.matrix);
            mesh.setColorAt(i, c.setHSL(0.28 + alea() * 0.04, 0.3, 0.33 + alea() * 0.1));
        }
        mesh.frustumCulled = false;
        this.el.setObject3D('mesh', mesh);
    },

    remove: function () {
        this.geometrie.dispose();
        this.materiau.dispose();
        this.el.removeObject3D('mesh');
    }
});


/* --------------------------------------------------------------------------
    Composant `nuages` : amas de boules blanches qui tournent lentement
    autour du joueur. Pas de brouillard sur eux, sinon ils deviendraient bleus.
   -------------------------------------------------------------------------- */
AFRAME.registerComponent('nuages', {
    schema: {
        graine: { default: 5 },
        nombre: { default: 10 },
        vitesse: { default: 0.004 }            // rotation autour du joueur (rad/s)
    },

    init: function () {
        var d = this.data, alea = aleatoireGraine(d.graine);
        var boules = [];
        for (var b = 0; b < 6; b++) {
            var s = 0.7 + alea() * 0.8;
            boules.push(new THREE.IcosahedronGeometry(s, 1)
                .translate((alea() - 0.5) * 4, alea() * 0.6, (alea() - 0.5) * 1.6));
        }
        this.geometrie = fusionnerGeometries(boules);
        this.materiau = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            emissive: new THREE.Color('#9AA7B5'),  // dessous des nuages pas trop sombre
            fog: false
        });

        var mesh = new THREE.InstancedMesh(this.geometrie, this.materiau, d.nombre);
        var m = new THREE.Object3D(), c = new THREE.Color('#FFFFFF');
        for (var i = 0; i < d.nombre; i++) {
            var a = alea() * Math.PI * 2, r = 90 + alea() * 70;
            m.position.set(Math.cos(a) * r, 40 + alea() * 30, Math.sin(a) * r);
            m.rotation.set(0, alea() * Math.PI, 0);
            m.scale.set(5 + alea() * 4, 2.5 + alea() * 1.5, 4 + alea() * 3);
            m.updateMatrix();
            mesh.setMatrixAt(i, m.matrix);
            mesh.setColorAt(i, c);
        }
        mesh.frustumCulled = false;
        this.mesh = mesh;
        this.el.setObject3D('mesh', mesh);
    },

    tick: function (t, dt) {
        if (dt) { this.mesh.rotation.y += this.data.vitesse * dt / 1000; }
    },

    remove: function () {
        this.geometrie.dispose();
        this.materiau.dispose();
        this.el.removeObject3D('mesh');
    }
});


/* --------------------------------------------------------------------------
    Composant `nappe-carreaux` : nappe de pique-nique vichy posée au sol
   -------------------------------------------------------------------------- */
AFRAME.registerComponent('nappe-carreaux', {
    schema: {
        largeur: { default: 1.5 },
        profondeur: { default: 1.2 },
        couleur: { default: '#C8423B' },
        carreaux: { default: 10 }              // nombre de bandes sur la largeur
    },

    init: function () {
        var d = this.data;
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        var c = canvas.getContext('2d'), pas = 256 / d.carreaux;
        c.fillStyle = '#F7F2E8';
        c.fillRect(0, 0, 256, 256);
        c.fillStyle = d.couleur;
        c.globalAlpha = 0.55;                   // bandes croisées : les croisements sont plus foncés (vichy)
        for (var i = 0; i < d.carreaux; i += 2) {
            c.fillRect(i * pas, 0, pas, 256);
            c.fillRect(0, i * pas, 256, pas);
        }

        this.texture = textureCanvas(canvas);
        this.materiau = new THREE.MeshLambertMaterial({ map: this.texture });
        var nappe = new THREE.Mesh(new THREE.PlaneGeometry(d.largeur, d.profondeur), this.materiau);
        nappe.rotation.x = -Math.PI / 2;
        nappe.position.y = 0.006;               // juste au-dessus de la pelouse
        nappe.receiveShadow = true;
        this.el.setObject3D('mesh', nappe);
    },

    remove: function () {
        this.el.getObject3D('mesh').geometry.dispose();
        this.materiau.dispose();
        this.texture.dispose();
        this.el.removeObject3D('mesh');
    }
});
