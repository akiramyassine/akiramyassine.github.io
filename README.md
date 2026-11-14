# Yassine Akiram

Site statique Astro et TypeScript pour un fabricant de canapés et de lits sur mesure à Fès. Le français est à la racine, l’arabe sous `/ar/` avec affichage RTL et l’anglais sous `/en/`. Le catalogue et les réalisations ont leurs propres pages et fiches. Le site démarre sans fiches.

## Vérifier en local

Avec Node.js 24 et npm :

```sh
npm ci
npm test
npm run check
npm run build
npm run dev
```

`npm run preview` sert la dernière compilation. Le répertoire à déployer est `dist/`.

## GitHub Pages et DNS

1. Créer le dépôt GitHub, initialiser Git sur la branche `main` dans ce dossier, puis ajouter le dépôt comme distant. Publier les sources et `package-lock.json`. Le dépôt doit être admissible à GitHub Pages.
2. Dans **Settings → Pages**, sélectionner **GitHub Actions** comme source. Le workflow `pages.yml` vérifie les pull requests. Sur `main`, il vérifie puis déploie après un push ou un lancement manuel.
3. Dans Pages, renseigner `akiramyassine.gt.tc` comme domaine personnalisé. Auprès du gestionnaire DNS de `gt.tc`, créer le CNAME de ce sous-domaine vers `<propriétaire>.github.io`. Le gestionnaire doit permettre la création de cet enregistrement. Après validation DNS et émission du certificat, activer **Enforce HTTPS**.
4. Valider une première exécution Pages. Contrôler le domaine, `/ar/`, `/en/`, la carte et le lien WhatsApp sur téléphone. Le numéro WhatsApp est déduit du numéro marocain de la carte de visite. Confirmer qu’il est enregistré sur WhatsApp ou corriger `whatsapp` dans `content/business.json`.

[Déploiement Astro sur GitHub Pages](https://docs.astro.build/en/guides/deploy/github/) · [Domaine personnalisé et CNAME](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## Connecter Drive et l’IA

- Activer la Google Drive API dans un projet Google Cloud. Créer un compte de service et partager uniquement le dossier de photos avec son adresse, en lecture. Le pipeline parcourt ce dossier et ses sous-dossiers, indépendamment des noms. Yassine peut y déposer des images JPEG, PNG, WebP ou AVIF. Convertir les photos HEIC/HEIF en JPEG avant de les déposer. Les raccourcis Drive sont ignorés. La limite est de 30 Mio et 60 mégapixels par image.
- Dans **Settings → Secrets and variables → Actions**, définir les secrets `DRIVE_FOLDER_ID`, `DRIVE_SERVICE_ACCOUNT_JSON` (JSON du compte de service) et `OPENAI_API_KEY`. Définir la variable `OPENAI_VISION_MODEL` avec un modèle auquel ce projet OpenAI a accès et qui accepte images et Structured Outputs dans Responses. `SYNC_BATCH_SIZE` est facultative (6 par défaut, de 1 à 12).
- Quand la configuration est prête, définir `DRIVE_SYNC_ENABLED=true`. Le workflow Drive tourne à 03 h 25 UTC chaque jour ou à la demande. Les règles de la branche `main` doivent autoriser le push du workflow avec `GITHUB_TOKEN`. Si elles imposent des pull requests, effectuer la synchronisation localement et soumettre les changements dans une pull request.
- Pour lancer depuis Codex ou un terminal, injecter les mêmes secrets et variables dans l’environnement du processus, puis exécuter `npm run sync`. GPT Work ou Codex peut alors relire les descriptions et préparer les décisions de publication. L’exécution planifiée utilise l’API via les secrets du dépôt.

Seules les nouvelles images uniques sont transmises au modèle sous forme de vignettes. Déposer uniquement des photos dont l’usage est autorisé. Les brouillons textuels et empreintes sont visibles par les lecteurs du dépôt et dans le rapport Actions. Les originaux restent dans Drive et les WebP de brouillon restent dans le cache local du processus. Un dépôt public rend aussi public l’historique Git des fiches et images qui y ont été commitées.

[API Google Drive](https://developers.google.com/workspace/drive/api/guides/manage-downloads) · [Sorties structurées OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

## Regrouper et publier

1. Lancer la synchronisation après le dépôt. Consulter `revue-drive` suivi du numéro de tentative dans les artefacts du run ou `.sync-cache/v1/review.json` en local. Le rapport contient des empreintes SHA-256, des brouillons trilingues, les rejets et les rapprochements visuels. Pour identifier un original, calculer son SHA-256 (PowerShell : `Get-FileHash -Algorithm SHA256 <fichier>`, puis recopier en minuscules). Une ressemblance est une indication surtout utile pour les recadrages légers et variations proches. Vérifier visuellement les prises de vue différentes.
2. Dans `content/decisions.json`, ajouter à `groups` une entrée qui associe le SHA-256 de chaque photo secondaire au SHA-256 de la photo de référence. Une photo seule a sa propre empreinte de référence. Dans `publish`, associer cette référence à `catalogue` ou `portfolio`. Le choix appartient à la personne qui confirme que la photo représente bien un modèle ou une réalisation de Yassine. L’identifiant de la fiche découle de cette référence. Une photo non approuvée reste en brouillon.
3. Pour appliquer en ligne, transmettre le JSON complet dans le champ `decisions` du lancement manuel du workflow Drive. En local, modifier le fichier, relancer `npm run sync`, puis exécuter les vérifications avant de pousser les modifications ensemble. Vérifier l’orthographe et les détails visibles, et si nécessaire corriger la photo d’ancrage dans `content/manifest.json` avant de régénérer les fiches localement. `content/items/` contient les fichiers générés.
4. Retirer une entrée de `publish` pour dépublier la fiche lors de la synchronisation suivante. Une photo retirée de Drive sort de la galerie si aucun doublon actif ne subsiste. Si une galerie perd sa photo de référence mais conserve des vues associées, son URL reste stable et la description provient de la première vue restante. Une galerie sans photo active est retirée.

## Fonctionnement et reprise

- `content/` contient les coordonnées, textes, catégories, décisions, manifeste et fiches. `src/` contient la présentation. Pour ajouter une catégorie, renseigner son identifiant et ses trois libellés dans `content/categories.json`. Les nouvelles catégories s’appliquent aux futures analyses. Pour reclasser une photo déjà analysée, ajuster son analyse dans le manifeste.
- Le manifeste associe chaque ID Drive haché à la somme de contrôle Drive ou à sa version et au SHA-256 du contenu. Les résultats d’analyse sont conservés par SHA-256 dans Git, y compris lorsqu’une photo quitte le dossier. Un doublon exact ne reçoit qu’une analyse. Une réexécution sans changement fait l’inventaire mais n’effectue aucun téléchargement ni appel IA. Les WebP sont réorientés, réduits à 1 800 px maximum et privés de leurs métadonnées.
- Chaque lot terminé laisse des points de reprise locaux. Actions conserve les points de reprise textuels disponibles lorsque le workflow échoue. Une relance après un conflit de push utilise le nouveau `main` sans écrasement forcé. Si Drive a déjà poussé une mise à jour et que le déclenchement Pages a échoué, lancer `pages.yml` manuellement sur `main`. [Déclenchement des workflows avec GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)
- Une relance à l’identique n’écrit aucun nouveau commit. Les commits regroupent manifeste, décisions, fiches et médias. Pour restaurer un état antérieur, désactiver temporairement `DRIVE_SYNC_ENABLED`, faire un revert des commits concernés, vérifier puis pousser sur `main`. Remettre Drive et les décisions en cohérence avec l’état souhaité avant de réactiver le workflow.
