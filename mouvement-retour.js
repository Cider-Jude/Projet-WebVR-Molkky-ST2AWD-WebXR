// Deux composants A-Frame :
//
//  1) gestion-mouvement (à mettre sur le #rig)
//     - événement "activer-mouvement" -> débloque movement-controls,
//       cache le bouton d'activation et fait apparaître le bouton de retour
//     - événement "retour-origine"    -> téléporte le rig au point choisi (0 0 0 par défaut),
//       BLOQUE à nouveau le mouvement, cache le bouton de retour
//       et réaffiche le bouton d'activation (le joueur doit rappuyer dessus pour rebouger)
//
//  2) suivre-joueur (à mettre sur le bouton de retour)
//     - le bouton reste à côté du joueur (à gauche, à hauteur de poitrine) et se tourne vers lui.
//     - il doit être un enfant direct de <a-scene>, PAS du rig (sinon il bougerait deux fois).

AFRAME.registerComponent('gestion-mouvement', {
  schema: {
    boutonActiver: { type: 'string' },   // sélecteur CSS du bouton qui débloque le mouvement
    boutonRetour: { type: 'string' },    // sélecteur CSS du bouton qui suit le joueur
    evenementActiver: { default: 'activer-mouvement' },
    evenementRetour: { default: 'retour-origine' },
    point: { type: 'vec3', default: { x: 0, y: 0, z: 0 } }   // destination de la téléportation
  },

  init: function () {
    this.actif = false;   // true = le joueur peut bouger
    this.activer = this.activer.bind(this);
    this.retour = this.retour.bind(this);

    var scene = this.el.sceneEl;
    scene.addEventListener(this.data.evenementActiver, this.activer);
    scene.addEventListener(this.data.evenementRetour, this.retour);

    this.chrono = document.querySelector('#chrono').components.chronometre;
  },

  activer: function () {
    if (this.actif) { return; }
    this.actif = true;

    // Débloque le déplacement (movement-controls d'aframe-extras)
    this.el.setAttribute('movement-controls', 'enabled', true);

    var boutonActiver = document.querySelector(this.data.boutonActiver);
    if (boutonActiver) { boutonActiver.setAttribute('visible', false); }

    var boutonRetour = document.querySelector(this.data.boutonRetour);
    if (boutonRetour) {
      boutonRetour.setAttribute('visible', true);
      var suivi = boutonRetour.components['suivre-joueur'];
      if (suivi) { suivi.replacer(); }   // apparaît directement à côté du joueur
    }
    document.querySelector('#baton').setAttribute('baton', 'actif', false);
    this.chrono.arreter();
    this.el.emit('mouvement-active');
  },

  retour: function () {
    if (!this.actif) { return; }
    this.actif = false;

    // Téléportation au point de départ
    var p = this.data.point;
    this.el.object3D.position.set(p.x, p.y, p.z);

    // Le déplacement est bloqué à nouveau
    this.el.setAttribute('movement-controls', 'enabled', false);

    // Le bouton de retour disparaît, le bouton d'activation revient
    var boutonRetour = document.querySelector(this.data.boutonRetour);
    if (boutonRetour) { boutonRetour.setAttribute('visible', false); }

    var boutonActiver = document.querySelector(this.data.boutonActiver);
    if (boutonActiver) { boutonActiver.setAttribute('visible', true); }

    document.querySelector('#baton').setAttribute('baton', 'actif', true);
    this.el.emit('retour-effectue');
    if(chronoActif){
      this.chrono.demarrer();
    }
  },

  remove: function () {
    var scene = this.el.sceneEl;
    scene.removeEventListener(this.data.evenementActiver, this.activer);
    scene.removeEventListener(this.data.evenementRetour, this.retour);
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