/**
 * ============================================================================
 *  DIALOG — fenêtres de dialogue "maison" (remplacent confirm / prompt / alert)
 * ============================================================================
 *  Pourquoi ? Les popups natifs du navigateur (confirm/prompt/alert) sont
 *  fiables mais peu jolis et hors charte. Ce module fournit trois fonctions
 *  équivalentes, aux couleurs du site, toutes basées sur des Promesses :
 *
 *    await dialogConfirmer(message, options?)  -> true si "Confirmer", false sinon
 *    await dialogAlerter(message, options?)    -> se ferme sur "OK"
 *    await dialogDemander(message, defaut?, o?) -> texte saisi, ou null si annulé
 *
 *  Chargé sur toutes les pages AVANT api.js (car api.js s'en sert pour la clé).
 *  Auto-suffisant : il injecte son propre CSS, donc il fonctionne quelle que
 *  soit la feuille de style de la page.
 *
 *  Clavier : Entrée = valider, Échap = annuler. Clic sur le fond = annuler.
 * ============================================================================
 */
(function () {
  'use strict';

  var STYLE_ID = 'dialog-r92-style';

  /* Injecte la feuille de style du module (une seule fois). */
  function injecterStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.dlg-overlay{position:fixed;inset:0;background:rgba(3,16,36,.72);',
        'display:flex;align-items:center;justify-content:center;padding:16px;',
        'z-index:9999;animation:dlgFond .12s ease;}',
      '@keyframes dlgFond{from{opacity:0}to{opacity:1}}',
      '.dlg-carte{background:linear-gradient(160deg,#0B2138,#031024);color:#F2F6FB;',
        'border:1px solid rgba(184,216,248,.25);border-radius:12px;',
        'padding:18px 18px 16px;max-width:420px;width:100%;',
        'box-shadow:0 12px 40px rgba(0,0,0,.5);',
        "font-family:'Barlow',system-ui,sans-serif;animation:dlgPop .14s ease;}",
      '@keyframes dlgPop{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}',
      '.dlg-msg{white-space:pre-line;line-height:1.5;margin-bottom:14px;font-size:1rem;}',
      '.dlg-input{width:100%;background:rgba(11,33,56,.8);color:#F2F6FB;',
        'border:1px solid rgba(184,216,248,.35);border-radius:8px;padding:10px 12px;',
        "font-family:'Barlow',sans-serif;font-size:1.05rem;margin-bottom:14px;box-sizing:border-box;}",
      '.dlg-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}',
      '.dlg-btn{cursor:pointer;border:none;border-radius:8px;padding:9px 16px;',
        "font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;",
        'letter-spacing:.5px;font-weight:600;font-size:1rem;}',
      '.dlg-ok{background:#2E8FE0;color:#fff;}',
      '.dlg-ok:hover{background:#2477bd;}',
      '.dlg-ok.dlg-danger{background:#c0392b;}',
      '.dlg-ok.dlg-danger:hover{background:#a93226;}',
      '.dlg-annuler{background:rgba(255,255,255,.08);color:#B8D8F8;',
        'border:1px solid rgba(184,216,248,.3);}',
      '.dlg-annuler:hover{background:rgba(255,255,255,.14);}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  /**
   * Cœur du module : construit un overlay + une carte, gère clavier/clic, et
   * résout la Promesse avec la valeur de sortie.
   * @param {Object} opts
   *   type        'confirmer' | 'alerter' | 'demander'
   *   message     texte principal (les \n sont respectés)
   *   defaut      (demander) valeur pré-remplie
   *   placeholder (demander) indication dans le champ
   *   ok/annuler  libellés des boutons
   *   danger      bouton OK en rouge (action destructive)
   * @return {Promise} bool (confirmer) | undefined (alerter) | string|null (demander)
   */
  function ouvrir(opts) {
    injecterStyle();
    return new Promise(function (resoudre) {
      // Valeur renvoyée quand on annule (Échap / Annuler / clic sur le fond).
      var valeurAnnule = (opts.type === 'demander') ? null
                       : (opts.type === 'confirmer') ? false : undefined;

      var overlay = document.createElement('div');
      overlay.className = 'dlg-overlay';

      var carte = document.createElement('div');
      carte.className = 'dlg-carte';
      carte.setAttribute('role', 'dialog');
      carte.setAttribute('aria-modal', 'true');

      var msg = document.createElement('div');
      msg.className = 'dlg-msg';
      msg.textContent = opts.message;
      carte.appendChild(msg);

      var input = null;
      if (opts.type === 'demander') {
        input = document.createElement('input');
        input.className = 'dlg-input';
        input.type = 'text';
        input.autocomplete = 'off';
        input.value = (opts.defaut != null) ? String(opts.defaut) : '';
        if (opts.placeholder) input.placeholder = opts.placeholder;
        carte.appendChild(input);
      }

      var actions = document.createElement('div');
      actions.className = 'dlg-actions';

      function fermer(valeur) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resoudre(valeur);
      }

      // Bouton Annuler (absent pour un simple message "alerter").
      if (opts.type !== 'alerter') {
        var btnAnnuler = document.createElement('button');
        btnAnnuler.type = 'button';
        btnAnnuler.className = 'dlg-btn dlg-annuler';
        btnAnnuler.textContent = opts.annuler || 'Annuler';
        btnAnnuler.addEventListener('click', function () { fermer(valeurAnnule); });
        actions.appendChild(btnAnnuler);
      }

      // Bouton de validation.
      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'dlg-btn dlg-ok' + (opts.danger ? ' dlg-danger' : '');
      btnOk.textContent = opts.ok || 'OK';
      btnOk.addEventListener('click', function () {
        if (opts.type === 'demander')      fermer(input.value);
        else if (opts.type === 'confirmer') fermer(true);
        else                                fermer();
      });
      actions.appendChild(btnOk);

      carte.appendChild(actions);
      overlay.appendChild(carte);

      // Clic sur le fond (hors carte) = annuler.
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) fermer(valeurAnnule);
      });

      // Clavier : Entrée valide, Échap annule.
      function onKey(e) {
        if (e.key === 'Escape')     { e.preventDefault(); fermer(valeurAnnule); }
        else if (e.key === 'Enter') { e.preventDefault(); btnOk.click(); }
      }
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(overlay);
      if (input) { input.focus(); input.select(); } else { btnOk.focus(); }
    });
  }

  /** Demande une confirmation. Renvoie true (Confirmer) / false (Annuler ou fermé). */
  window.dialogConfirmer = function (message, o) {
    o = o || {};
    return ouvrir({
      type: 'confirmer', message: message,
      ok: o.ok || 'Confirmer', annuler: o.annuler || 'Annuler', danger: o.danger
    });
  };

  /** Affiche un message. Renvoie une Promesse résolue quand on ferme. */
  window.dialogAlerter = function (message, o) {
    o = o || {};
    return ouvrir({ type: 'alerter', message: message, ok: o.ok || 'OK' });
  };

  /** Demande une saisie. Renvoie le texte, ou null si annulé. */
  window.dialogDemander = function (message, defaut, o) {
    o = o || {};
    return ouvrir({
      type: 'demander', message: message, defaut: defaut, placeholder: o.placeholder,
      ok: o.ok || 'Valider', annuler: o.annuler || 'Annuler'
    });
  };
})();
