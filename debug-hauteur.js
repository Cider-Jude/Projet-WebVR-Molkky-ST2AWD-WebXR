// Composant de diagnostic : affiche dans le casque la hauteur réelle de la caméra.
// À mettre sur l'entité caméra : <a-entity id="camera" camera look-controls debug-hauteur> ... </a-entity>
// À retirer une fois le problème réglé.

AFRAME.registerComponent('debug-hauteur', {
  schema: {
    rig: { type: 'string', default: '#rig' }   // sélecteur CSS du rig
  },

  init: function () {
    this.texte = document.createElement('a-text');
    this.texte.setAttribute('position', '0 0.15 -1');
    this.texte.setAttribute('width', 1.4);
    this.texte.setAttribute('align', 'center');
    this.texte.setAttribute('color', '#FFFF00');
    this.el.appendChild(this.texte);

    this.pos = new THREE.Vector3();
    this.rigEl = null;
    this.dernier = 0;
  },

  tick: function (temps) {
    if (temps - this.dernier < 250) { return; }   // 4 mises à jour par seconde
    this.dernier = temps;

    if (!this.rigEl) { this.rigEl = document.querySelector(this.data.rig); }

    var scene = this.el.sceneEl;
    var webxr = scene.systems && scene.systems.webxr;
    var espace = (webxr && webxr.sessionReferenceSpaceType) || 'inconnu';

    this.el.object3D.getWorldPosition(this.pos);

    this.texte.setAttribute('value', [
      'mode VR : ' + scene.is('vr-mode'),
      'espace de reference : ' + espace,
      'camera, y dans le monde : ' + this.pos.y.toFixed(2),
      'camera, y locale (dans le rig) : ' + this.el.object3D.position.y.toFixed(2),
      'rig, y : ' + (this.rigEl ? this.rigEl.object3D.position.y.toFixed(2) : '?')
    ].join('\n'));
  }
});
