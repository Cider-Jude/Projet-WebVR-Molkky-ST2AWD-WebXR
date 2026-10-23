// Deux composants A-Frame :
//
//  1) gestion-mouvement (à mettre sur le #rig)
//     - le joueur peut se déplacer dès le départ (movement-controls d'aframe-extras)
//     - anti-triche : le bâton ne se prend que depuis la ZONE DE LANCER (derrière la planche) ;
//       hors de la zone, le bâton est désactivé et le bouton de retour apparaît à côté du joueur
//     - pendant qu'il tient le bâton, le déplacement est bloqué (impossible d'avancer vers les quilles)
//     - événement "retour-origine" -> téléporte le joueur au point de départ
//
//  2) suivre-joueur (à mettre sur le bouton de retour)
//     - le bouton reste à côté du joueur (à gauche, à hauteur de poitrine) et se tourne vers lui.
//     - il doit être un enfant direct de <a-scene>, PAS du rig (sinon il bougerait deux fois).

AFRAME.registerComponent('gestion-mouvement', {
  schema: {
    boutonRetour: { type: 'string' },    // sélecteur CSS du bouton qui suit le joueur
    camera: { type: 'string', default: '#camera' },
    evenementRetour: { default: 'retour-origine' },
    point: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },   // destination de la téléportation

    // Zone de lancer, mesurée sur la position de la tête, par rapport à la planche (LIGNE_LANCER) :
    // un peu de marge devant la planche pour pouvoir se pencher vers le socle du bâton
    demiLargeurZone: { default: 1.2 },
    margeDevantLigne: { default: 0.3 },
    profondeurZone: { default: 1.5 }
  },

  init: function () {
    this.dansZone = null;                // inconnu : la première image règle boutons et bâton
    this.posTete = new THREE.Vector3();
    this.camEl = null;
    this.batonEl = null;

    this.retour = this.retour.bind(this);
    this.bloquer = function () { this.el.setAttribute('movement-controls', 'enabled', false); }.bind(this);
    this.debloquer = function () { this.el.setAttribute('movement-controls', 'enabled', true); }.bind(this);

    var scene = this.el.sceneEl;
    scene.addEventListener(this.data.evenementRetour, this.retour);
    scene.addEventListener('baton-pris', this.bloquer);
    scene.addEventListener('baton-lache', this.debloquer);
  },

  tick: function () {
    if (!this.camEl) { this.camEl = document.querySelector(this.data.camera); }
    if (!this.batonEl) { this.batonEl = document.querySelector('#baton'); }
    if (!this.camEl || !this.batonEl) { return; }

    var d = this.data, p = this.posTete;
    this.camEl.object3D.getWorldPosition(p);
    var dansZone = Math.abs(p.x) <= d.demiLargeurZone &&
                   p.z >= LIGNE_LANCER - d.margeDevantLigne &&
                   p.z <= LIGNE_LANCER + d.profondeurZone;

    // Le bâton ne se prend que pendant une partie, depuis la zone de lancer
    var actif = etat === 'partie' && dansZone;
    if (this.batonEl.getAttribute('baton').actif !== actif) {
      this.batonEl.setAttribute('baton', 'actif', actif);
    }

    if (dansZone === this.dansZone) { return; }
    var premiereImage = this.dansZone === null;
    this.dansZone = dansZone;

    // Hors de la zone : le bouton de retour apparaît à côté du joueur
    var boutonRetour = document.querySelector(d.boutonRetour);
    if (boutonRetour) {
      boutonRetour.setAttribute('visible', !dansZone);
      var suivi = boutonRetour.components['suivre-joueur'];
      if (!dansZone && suivi) { suivi.replacer(); }
    }
    if (!dansZone && !premiereImage && etat === 'partie') {
      this.el.sceneEl.emit('info-afficher', { lignes: ['Hors de la zone de lancer :', 'reviens derrière la planche pour lancer'] });
    }
  },

  retour: function () {
    // On place le rig pour que la TÊTE arrive au point de départ
    // (en VR, le joueur n'est pas forcément au centre de son espace de jeu)
    var p = this.data.point;
    var tete = this.camEl ? this.camEl.object3D.position : { x: 0, z: 0 };
    this.el.object3D.position.set(p.x - tete.x, p.y, p.z - tete.z);
    this.el.emit('retour-effectue');
  },

  remove: function () {
    var scene = this.el.sceneEl;
    scene.removeEventListener(this.data.evenementRetour, this.retour);
    scene.removeEventListener('baton-pris', this.bloquer);
    scene.removeEventListener('baton-lache', this.debloquer);
  }
});


AFRAME.registerComponent('suivre-joueur', {
  schema: {
    camera: { type: 'string', default: '#camera' },                      // la caméra du joueur
    decalage: { type: 'vec3', default: { x: -0.4, y: -0.3, z: -0.5 } },  // par rapport à la tête : gauche / bas / devant
    delai: { default: 150 }                                              // ms ; plus grand = suit plus mollement
  },

  init: function () {
    this.posCam = new THREE.Vector3();
    this.quatCam = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.cible = new THREE.Vector3();
    this.axeY = new THREE.Vector3(0, 1, 0);
    this.camEl = null;
    this.saut = true;   // true = se place d'un coup (sans glisser) au prochain tick
  },

  replacer: function () { this.saut = true; },

  tick: function (temps, dt) {
    var objet = this.el.object3D;
    if (!objet.visible) { return; }
    
    if (!this.camEl) { this.camEl = document.querySelector(this.data.camera); }
    if (!this.camEl) { return; }

    var cam = this.camEl.object3D;
    cam.getWorldPosition(this.posCam);
    cam.getWorldQuaternion(this.quatCam);
    var lacet = this.euler.setFromQuaternion(this.quatCam, 'YXZ').y;   // direction du regard (horizontale)

    var d = this.data.decalage;
    this.cible.set(d.x, d.y, d.z).applyAxisAngle(this.axeY, lacet).add(this.posCam);

    if (this.saut) {
      objet.position.copy(this.cible);
      this.saut = false;
    } else {
      var k = 1 - Math.exp(-dt / Math.max(1, this.data.delai));
      objet.position.lerp(this.cible, k);
    }

    // Le bouton (un plan) se tourne vers le joueur
    objet.rotation.y = Math.atan2(this.posCam.x - objet.position.x, this.posCam.z - objet.position.z);
  }
});