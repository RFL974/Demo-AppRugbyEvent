/**
 * ============================================================================
 *  CONFIG — réglages partagés par toutes les pages du frontend
 * ============================================================================
 *
 *  ⚠️ COPIE « DÉMO RACING » (DR) — CE FICHIER EST LE SEUL ADAPTÉ POUR LA DÉMO.
 *
 *  Cette copie du frontend est destinée à l'environnement de DÉMONSTRATION
 *  « Démo Racing », qui possède son PROPRE classeur et son PROPRE backend
 *  Apps Script. Elle ne doit JAMAIS parler au backend principal du tournoi.
 *
 *  C'est le SEUL endroit où l'on écrit l'URL du backend (la Web App Apps Script).
 *  Si un jour cette URL change, on ne modifie QUE ce fichier, et toutes les pages
 *  restent à jour automatiquement.
 * ============================================================================
 */

/**
 * URL de la Web App Google Apps Script (elle se termine par "/exec").
 *
 *  ⭐ ICI : le déploiement « Version 1 » du backend de la DÉMO RACING.
 *  Backend DR dédié à cette démonstration.
 *
 *  ⚠️ IMPORTANT : pour garder CETTE MÊME URL quand on modifie le code backend,
 *  il faut redéployer via  Déployer → Gérer les déploiements → (crayon) Modifier
 *  → Version : "Nouvelle version" → Déployer.
 *  Créer un "Nouveau déploiement" génèrerait une URL DIFFÉRENTE (à éviter).
 */
const API_URL = "https://script.google.com/macros/s/AKfycbwMS0paW3sLB041XpaGzl8uBgbeleFmRHR6vF2iNwsoNU7GMQoFbwlUQIW6o1bchKzctQ/exec";

/**
 * URL du RELAIS CDN (Cloudflare Worker) — cache "edge" qui encaisse des milliers de
 * spectateurs sans saturer Apps Script. UNIQUEMENT pour la LECTURE de la page publique.
 *
 *  ⛔ POUR LA DÉMO RACING : LAISSER VIDE (""). Le relais du tournoi principal, s'il
 *  existe un jour, sert le classeur PRINCIPAL : y brancher la démo la ferait lire
 *  les données du vrai tournoi. Vide = la page publique lit directement le backend DR
 *  ci-dessus, ce qui est le comportement voulu ici.
 */
const SNAPSHOT_URL = "";
