/* ==========================================================================
    Composant `aide-visee` (assistance visuelle du niveau Facile)

    Tant que le joueur tient le bâton, on affiche la trajectoire qu'il suivrait
    s'il était lâché maintenant :
      - une ligne de points (parabole sous la gravité de la scène)
      - un anneau au sol à l'endroit de l'impact prévu
      - la première quille sur la trajectoire passe en surbrillance,
        et l'arc change de couleur

    PC : la vitesse est celle du lancer au clic / Espace (prévision exacte).
    VR : la vitesse est celle de la main ; l'arc apparaît pendant le
         balancement du bras (au-delà de vitesseMin).

    Activé / désactivé par l'événement `aide-visee` { active } émis par
    appliquerNiveau() (voir Beta Test molky.js).

    À mettre sur une entité enfant direct de <a-scene>, en 0 0 0 : les points
    sont écrits directement en coordonnées monde.
    ========================================================================== */

AFRAME.registerComponent('aide-visee', {
    schema: {
        actif: { default: false },
        baton: { type: 'selector', default: '#baton' },
        pasTemps: { default: 1 / 300 },        // pas de la simulation (s) : fin pour ne pas « sauter » une quille
        dureeMax: { default: 2 },              // durée de vol simulée au maximum (s)
        espacement: { default: 0.08 },         // distance entre deux points affichés (m)
        taillePoint: { default: 0.025 },       // diamètre d'un point (m)
        vitesseMin: { default: 1 },            // VR : en dessous, la main ne lance pas vraiment, on n'affiche rien (m/s)
        margeContact: { default: 0.05 },       // le bâton touche une quille si son centre passe à moins de rayon + marge
        dureeApresLancer: { default: 1200 },   // l'arc reste figé après le lâcher pour comparer avec le vrai vol (ms)
        couleur: { default: '#2266AA' },
        couleurTouche: { default: '#FF7A1A' }  // une quille est sur la trajectoire
    },

    init: function () {
        var d = this.data;
        this.MAX_POINTS = 120;

        // Les points de l'arc : un seul buffer réutilisé à chaque image
        this.positions = new Float32Array(this.MAX_POINTS * 3);
        var geoPoints = new THREE.BufferGeometry();
        geoPoints.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.texturePoint = this.textureRonde();
        this.matPoints = new THREE.PointsMaterial({
            color: d.couleur,
            size: d.taillePoint,
            map: this.texturePoint,
            alphaTest: 0.5
        });
        this.points = new THREE.Points(geoPoints, this.matPoints);
        this.points.frustumCulled = false;     // la géométrie change sans cesse, sa boîte englobante n'est jamais à jour

        // L'anneau d'impact, posé à plat sur le sol
        this.matAnneau = new THREE.MeshBasicMaterial({
            color: d.couleur,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        this.anneau = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.065, 32), this.matAnneau);
        this.anneau.rotation.x = -Math.PI / 2;

        this.groupe = new THREE.Group();
        this.groupe.add(this.points);
        this.groupe.add(this.anneau);
        this.groupe.visible = false;
        this.el.setObject3D('aide', this.groupe);

        var physique = this.el.sceneEl.systems.physics;
        this.gravite = new THREE.Vector3(0, physique ? physique.data.gravity : -9.8, 0);
        this.depart = new THREE.Vector3();
        this.p = new THREE.Vector3();
        this.precedent = new THREE.Vector3();
        this.quilleVisee = null;
        this.finGel = 0;

        this.surAide = function (e) {
            this.el.setAttribute('aide-visee', 'actif', !!(e.detail && e.detail.active));
        }.bind(this);
        this.surLache = function () {
            this.finGel = performance.now() + this.data.dureeApresLancer;
        }.bind(this);
        this.el.sceneEl.addEventListener('aide-visee', this.surAide);
        this.el.sceneEl.addEventListener('baton-lache', this.surLache);
    },

    update: function () {
        if (!this.data.actif) { this.masquer(); }
    },

    tick: function () {
        var baton = this.data.baton && this.data.baton.components.baton;
        if (!this.data.actif || !baton) { return; }

        if (baton.porteur) {
            var vitesse = baton.vitesseSiLache();
            if (vitesse.length() < this.data.vitesseMin) { this.masquer(); return; }
            this.data.baton.object3D.getWorldPosition(this.depart);
            this.calculer(this.depart, vitesse);
            this.groupe.visible = true;
        } else if (performance.now() > this.finGel) {
            this.masquer();
        }
        // sinon : on vient de lâcher, l'arc reste figé quelques instants
    },

    // Vol sans frottement de l'air : p(t) = p0 + v0.t + g.t²/2,
    // jusqu'au sol ou jusqu'à la première quille touchée.
    calculer: function (depart, vitesse) {
        var d = this.data, p = this.p;
        var cibles = this.quillesDebout();
        var nb = 0, parcouru = 0, quille = null;

        this.ecrirePoint(nb++, depart);
        this.precedent.copy(depart);

        for (var t = d.pasTemps; t <= d.dureeMax; t += d.pasTemps) {
            p.copy(depart)
                .addScaledVector(vitesse, t)
                .addScaledVector(this.gravite, 0.5 * t * t);

            if (p.y <= 0) { p.y = 0; break; }
            quille = this.quilleTouchee(p, cibles);
            if (quille) { break; }

            // un point affiché tous les `espacement` mètres : pointillés réguliers quelle que soit la vitesse
            parcouru += p.distanceTo(this.precedent);
            this.precedent.copy(p);
            if (parcouru >= d.espacement && nb < this.MAX_POINTS - 1) {
                this.ecrirePoint(nb++, p);
                parcouru = 0;
            }
        }
        this.ecrirePoint(nb++, p);             // dernier point : l'impact

        var geo = this.points.geometry;
        geo.setDrawRange(0, nb);
        geo.attributes.position.needsUpdate = true;

        this.anneau.position.set(p.x, 0.003, p.z);
        this.changerQuilleVisee(quille);

        var couleur = quille ? d.couleurTouche : d.couleur;
        this.matPoints.color.set(couleur);
        this.matAnneau.color.set(couleur);
    },

    ecrirePoint: function (i, v) {
        this.positions[i * 3] = v.x;
        this.positions[i * 3 + 1] = v.y;
        this.positions[i * 3 + 2] = v.z;
    },

    // Position et taille des quilles, lues une seule fois par image
    quillesDebout: function () {
        return QUILLES.map(function (q) {
            var dim = q.el.getAttribute('geometry');
            var pos = q.el.object3D.position;
            return { el: q.el, x: pos.x, z: pos.z, hauteur: dim.height, rayon: dim.radius };
        });
    },

    // Première quille dont le corps serait frôlé par le centre du bâton au point p
    quilleTouchee: function (p, cibles) {
        var marge = this.data.margeContact;
        for (var i = 0; i < cibles.length; i++) {
            var c = cibles[i];
            if (p.y > c.hauteur + marge) { continue; }
            var dx = p.x - c.x, dz = p.z - c.z, r = c.rayon + marge;
            if (dx * dx + dz * dz <= r * r) { return c.el; }
        }
        return null;
    },

    // Surbrillance de la quille visée (même principe que le survol du bâton)
    changerQuilleVisee: function (el) {
        if (el === this.quilleVisee) { return; }
        if (this.quilleVisee) {
            this.quilleVisee.setAttribute('material', 'emissive', '#000000');
        }
        if (el) {
            el.setAttribute('material', { emissive: this.data.couleurTouche, emissiveIntensity: 0.5 });
        }
        this.quilleVisee = el;
    },

    masquer: function () {
        if (!this.groupe) { return; }
        this.groupe.visible = false;
        this.changerQuilleVisee(null);
    },

    // Petite texture ronde : sans elle, les points s'affichent en carrés
    textureRonde: function () {
        var canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        var c = canvas.getContext('2d');
        c.fillStyle = '#FFFFFF';
        c.beginPath();
        c.arc(32, 32, 28, 0, Math.PI * 2);
        c.fill();
        return new THREE.CanvasTexture(canvas);
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('aide-visee', this.surAide);
        this.el.sceneEl.removeEventListener('baton-lache', this.surLache);
        this.changerQuilleVisee(null);
        this.points.geometry.dispose();
        this.anneau.geometry.dispose();
        this.matPoints.dispose();
        this.matAnneau.dispose();
        this.texturePoint.dispose();
        this.el.removeObject3D('aide');
    }
});
