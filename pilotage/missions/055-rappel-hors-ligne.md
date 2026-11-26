# Mission 055 — Rappel « préparer le hors ligne »

> Fiche rédigée par Claude (orchestrateur) le 26 novembre 2026, sur décision de Pascal du même jour (spec § 11 n° 6 :
> « oui, texte à valider »). **Statut : proposée, à valider par Pascal (porte n° 2).** Une mission = une phrase = une
> branche = une PR.

## Mission

**En une phrase :** Avant le terrain, le plugin rappelle à l'agent de préparer la zone du jour pour le hors-ligne (afficher la
zone pour garder les fonds IGN en mémoire, faire le cache ONF de cette zone), par un texte court que Pascal valide avant tout
code, pour qu'il ne découvre pas en forêt une carte vide.

**Redite par l'agent :** _à compléter par l'agent avant d'agir — s'il n'y arrive pas, il s'arrête._

## Deux temps

1. **Proposition, aucune ligne de plugin** : le dev propose à Pascal (par l'orchestrateur) **le texte** (une ou deux phrases,
   lisibles au soleil), **le moment** où il s'affiche (exemples à comparer : à l'ouverture du projet quand le réseau est là ; dans
   le panneau Vision en permanence, sous le bouton du cache ; seulement si le cache ONF est absent ou vieux de plus de N jours) et
   **ce qui est prouvé** dans les sources de QField v4.3.8 (le plugin sait-il savoir si le réseau est là ? sinon, écrire « non
   prouvé »). Rien ne s'affiche sans l'accord de Pascal sur le texte et le moment.
2. **Réalisation**, après accord : tests rouges d'abord, aucun test affaibli ; texte rangé avec les textes validés et relu dans
   la fiche par un test.

## L'Homme

- **Agent :** `dev`, puis `relecteur`. Modèle : sonnet.
- **Ce qui ne lui est pas demandé :** télécharger lui-même les tuiles IGN (le cache des fonds est celui de QField) ; changer le
  cache ONF.

## Harnais

- **Peut :** `plugin/vision-logique.mjs`, `plugin/Vision.qml`, `plugin/Panneau.qml`, tests.
- **Ne doit pas :** afficher un texte non validé ; bloquer l'agent (un rappel, jamais une fenêtre à fermer de force, gants) ;
  toucher à `main` ; modifier brief, spec ou ADR (il signale l'écart).
- **Sources :** spec § 1, § 3.4 (fonds en XYZ, cache de QField), § 3.6 (cache ONF) ; critère 5 de la recette (§ 6).

## Terrain

- **Échantillon que Pascal vérifiera :** sur le Samsung, le rappel s'affiche au moment choisi, se lit au soleil, ne gêne pas ;
  hors réseau, il ne promet rien de faux.

## Qui veille, qui tranche

- **Relecteur :** `relecteur`, puis Pascal. Critère d'arrêt : 3 allers-retours.
- **Qui tranche :** Pascal (texte, moment, PR).

## Comment saura-t-on que ça marche ?

L'agent qui part en forêt après avoir vu le rappel trouve, hors réseau, les fonds et le cache ONF de sa zone.
