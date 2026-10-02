/* ==========================================================================
    Composant `baton`
    - se fait saisir par super-hands (grab-start / grab-end)
    - s'accroche à la main pendant qu'elle le tient
    - mesure la vitesse de la main et la transmet à la quille quand on la lâche
      => la quille part avec le mouvement du bras (lancer)
    ========================================================================== */
AFRAME.registerComponent('baton', {
    schema: {
        masse: { default: 0.12 },          // masse de la quille (kg)
        facteurLancer: { default: 1 },     // multiplicateur de la vitesse de la main
        vitesseMax: { default: 15 },       // vitesse de lancer maximale (m/s)
        vitessePC: { default: 7 },         // vitesse de lancer au clic (test PC, m/s)
        // Décalage de la quille par rapport à l'origine du rayon du contrôleur
        offsetPosition: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
        // Le cylindre a son axe long sur Y : on le couche de -90° autour de X
        // pour qu'il pointe vers l'avant (le long du laser) quand on le tient.
        offsetRotation: { type: 'vec3', default: { x: -90, y: 0, z: 0 } },
        // Test PC : la quille est tenue en bas à droite de l'écran, penchée vers l'avant
        offsetCamera: { type: 'vec3', default: { x: 0.15, y: -0.2, z: -0.5 } },
        rotationCamera: { type: 'vec3', default: { x: -30, y: 0, z: 0 } }
    },

    init: function () {
        this.porteur = null;
        this.vitesseImposee = null;   // renseignée seulement pour un lancer au clic (PC)
        this.historique = [];         // dernières positions monde, pour calculer la vitesse

        this.quat = new THREE.Quaternion();
        this.posMonde = new THREE.Vector3();

        this.lancer = this.lancer.bind(this);

        this.el.addEventListener('grab-start', this.onPrise.bind(this));
        this.el.addEventListener('grab-end', this.onLache.bind(this));

        // Retour visuel quand la quille est visée
        this.el.addEventListener('hover-start', function () {
            this.el.setAttribute('material', 'emissive', '#2266AA');
        }.bind(this));
        this.el.addEventListener('hover-end', function () {
            this.el.setAttribute('material', 'emissive', '#000000');
        }.bind(this));
    },

    // Enregistre la position monde de la quille à chaque image tant qu'elle est tenue
    tick: function (time) {
        if (!this.porteur) { return; }
        this.el.object3D.getWorldPosition(this.posMonde);
        this.historique.push({ t: time, p: this.posMonde.clone() });
        // on ne garde que ~100 ms d'historique : c'est la vitesse "juste avant le lâcher"
        while (this.historique.length > 1 && time - this.historique[0].t > 100) {
            this.historique.shift();
        }
    },

    quaternionDepuisDegres: function (r) {
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad(r.x),
            THREE.MathUtils.degToRad(r.y),
            THREE.MathUtils.degToRad(r.z)
        ));
    },

    onPrise: function (evt) {
        // OBLIGATOIRE : sans preventDefault, super-hands considère que la saisie
        // a été refusée et n'enverra jamais le grab-end correspondant.
        evt.preventDefault();
        if (this.porteur) { return; }

        var main = evt.detail.hand;
        this.porteur = main;
        this.historique = [];

        // Plus de physique tant que la quille est tenue
        this.el.removeAttribute('dynamic-body');

        // On accroche la quille à la main : elle suit le poignet.
        main.object3D.add(this.el.object3D);

        if (main.components.camera) {
            // Test sur PC
            this.el.object3D.position.copy(this.data.offsetCamera);
            this.el.object3D.quaternion.copy(this.quaternionDepuisDegres(this.data.rotationCamera));
        } else {
            this.alignerSurLeRayon(main);
            // Réglage fin : on couche le cylindre le long du laser
            this.el.object3D.quaternion.multiply(this.quaternionDepuisDegres(this.data.offsetRotation));
        }

        // Test PC : l'événement `lancer` (clic / Espace) déclenche le lâcher avec vitesse
        main.addEventListener('lancer', this.lancer);
        this.el.setAttribute('material', 'emissive', '#000000');
        this.el.sceneEl.emit('baton-pris');
    },

    /*
    Aligne l'axe -Z de la quille sur l'AXE DU LASER du contrôleur (A-Frame
    incline le rayon d'environ 40° sous l'axe -Z de la main pour qu'il parte
    dans l'axe de l'index). On lit donc origine et direction réelles du rayon.
    */
    alignerSurLeRayon: function (main) {
        var ray = main.getAttribute('raycaster');
        var avant = new THREE.Vector3(0, 0, -1);
        var origine = new THREE.Vector3(0, 0, 0);

        if (ray) {
            var d = ray.direction;
            if (d && (d.x || d.y || d.z)) { avant.set(d.x, d.y, d.z).normalize(); }
            if (ray.origin) { origine.set(ray.origin.x, ray.origin.y, ray.origin.z); }
        }

        var q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, -1), avant
        );
        this.el.object3D.quaternion.copy(q);

        var o = this.data.offsetPosition;
        this.el.object3D.position
            .copy(origine)
            .add(new THREE.Vector3(o.x, o.y, o.z).applyQuaternion(q));
    },

    // Vitesse de la main = déplacement / durée sur la fenêtre d'historique
    calculerVitesse: function () {
        var h = this.historique;
        if (h.length < 2) { return new THREE.Vector3(); }
        var a = h[0], b = h[h.length - 1];
        var dt = (b.t - a.t) / 1000;
        if (dt < 0.01) { return new THREE.Vector3(); }

        var v = b.p.clone().sub(a.p).divideScalar(dt).multiplyScalar(this.data.facteurLancer);
        if (v.length() > this.data.vitesseMax) { v.setLength(this.data.vitesseMax); }
        return v;
    },

    // Test PC : lancer vers l'avant de la caméra, avec une petite cloche
    lancer: function () {
        var main = this.porteur;
        if (!main) { return; }
        main.object3D.getWorldQuaternion(this.quat);
        var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
        dir.y += 0.25;
        dir.normalize();
        this.vitesseImposee = dir.multiplyScalar(this.data.vitessePC);
        main.emit('prise-fin');   // déclenche grab-end -> onLache
    },

    onLache: function (evt) {
        evt.preventDefault();
        if (!this.porteur) { return; }

        this.porteur.removeEventListener('lancer', this.lancer);
        this.porteur = null;

        var vitesse = this.vitesseImposee || this.calculerVitesse();
        this.vitesseImposee = null;

        // On remet la quille dans la scène en conservant sa transformation monde
        var pos = new THREE.Vector3();
        var quat = new THREE.Quaternion();
        this.el.object3D.getWorldPosition(pos);
        this.el.object3D.getWorldQuaternion(quat);

        this.el.sceneEl.object3D.add(this.el.object3D);

        var euler = new THREE.Euler().setFromQuaternion(quat);
        var deg = THREE.MathUtils.radToDeg;
        this.el.setAttribute('position', { x: pos.x, y: pos.y, z: pos.z });
        this.el.setAttribute('rotation', {
            x: deg(euler.x), y: deg(euler.y), z: deg(euler.z)
        });

        // La vitesse est appliquée une fois le corps physique créé. Le léger
        // délai évite que le moteur ne la réécrase à l'initialisation du corps.
        var el = this.el;
        el.addEventListener('body-loaded', function () {
            setTimeout(function () {
                if (!el.body) { return; }
                el.body.velocity.set(vitesse.x, vitesse.y, vitesse.z);
                el.body.angularVelocity.set(0, 0, 0);
            }, 50);
        }, { once: true });

        this.el.setAttribute('dynamic-body',
            'shape: cylinder; cylinderAxis: y; mass: ' + this.data.masse);

        this.el.sceneEl.emit('baton-lache');
    }
});

/* ==========================================================================
    Composant `commandes-bureau`
    Test sans casque : G prend / lâche la quille, clic ou Espace la lance.
    ========================================================================== */
AFRAME.registerComponent('commandes-bureau', {
    init: function () {
        var el = this.el;
        var tient = false;

        // L'état "je tiens la quille" suit ce qui se passe réellement
        el.sceneEl.addEventListener('baton-pris', function () { tient = true; });
        el.sceneEl.addEventListener('baton-lache', function () { tient = false; });

        window.addEventListener('keydown', function (e) {
            if (e.code === 'KeyG') {
                el.emit(tient ? 'prise-fin' : 'prise-debut');
            } else if (e.code === 'Space') {
                e.preventDefault();
                if (tient) { el.emit('lancer'); }
            }
        });

        function brancherClic () {
            el.sceneEl.canvas.addEventListener('mousedown', function (e) {
                if (e.button === 0 && tient) { el.emit('lancer'); }
            });
        }
        if (el.sceneEl.hasLoaded) { brancherClic(); }
        else { el.sceneEl.addEventListener('loaded', brancherClic); }
    }
});