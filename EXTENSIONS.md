# Extensions

Cette page documente le contrat actuel des extensions Chatons, incluant les quick actions, les deeplinks UI, et le tri adaptatif basé sur l’usage.

## Manifest (`chaton.extension.json`)

Exemple minimal:

```json
{
  "id": "@chaton/your-extension",
  "name": "Your Extension",
  "version": "1.0.0",
  "capabilities": ["ui.mainView"],
  "ui": {
    "mainViews": [
      {
        "viewId": "your.main",
        "title": "Your View",
        "webviewUrl": "chaton-extension://@chaton/your-extension/index.html",
        "initialRoute": "/"
      }
    ]
  }
}
```

## Quick Actions

Les extensions peuvent déclarer des quick actions dans `ui.quickActions`.

- Limite: `2` quick actions maximum par extension (les suivantes sont ignorées côté UI).
- Les quick actions sont affichées dans le rail horizontal des cards d’accueil.
- Un clic sur une action incrémente son compteur d’usage (persisté en DB).

Schéma recommandé:

```json
{
  "ui": {
    "quickActions": [
      {
        "id": "your.create",
        "title": "Créer quelque chose",
        "description": "Optionnel",
        "scope": "global-thread",
        "deeplink": {
          "viewId": "your.main",
          "target": "open-create",
          "params": { "preset": "default" },
          "createConversation": true,
          "prefillPrompt": "Prompt optionnel injecté dans le composer"
        }
      }
    ]
  }
}
```

Champs:

- `id` (string, requis): identifiant stable et unique (utilisé pour les stats d’usage).
- `title` (string, requis): label visible dans la card.
- `description` (string, optionnel): sous-texte d’aide.
- `scope` (optionnel): contexte d’affichage de la card.
  - `always`: visible tout le temps.
  - `global-thread`: visible uniquement en mode fil global (hors projet).
  - `project-thread`: visible uniquement en mode fil projet.
  - `global-or-no-thread`: visible en contexte global et quand aucun fil n’est sélectionné.
  - défaut: `always`.
- `deeplink` (optionnel):
  - `viewId` (requis): `mainView` à ouvrir.
  - `target` (requis): action ciblée dans la vue.
  - `params` (optionnel): payload libre.
  - `createConversation` (optionnel, bool): crée un nouveau fil avant d’ouvrir la vue.
  - `prefillPrompt` (optionnel, string): texte prérempli dans le composer du nouveau fil.

Règle importante:

- Si `deeplink.createConversation = true`, le fil créé est toujours global (hors projet), même si un projet est sélectionné.
- Le curseur est positionné en fin du texte prérempli.

## Deeplinks (contrat générique)

Quand une quick action avec `deeplink` est cliquée:

1. Chatons ouvre la `mainView` ciblée (`viewId`).
2. Chatons envoie un message à l’iframe de la vue:

```ts
window.postMessage({
  type: 'chaton.extension.deeplink',
  payload: {
    viewId: 'your.main',
    target: 'open-create',
    params: { /* optionnel */ }
  }
}, '*')
```

Côté extension (dans la page webview), il faut écouter:

```js
window.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || data.type !== 'chaton.extension.deeplink') return;
  const payload = data.payload || {};
  if (payload.viewId !== 'your.main') return;

  if (payload.target === 'open-create') {
    // Ouvrir le panneau de création
  }
});
```

## Tri des Quick Actions (usage + decay)

Les quick actions sont triées automatiquement selon un score qui favorise l’usage récent:

- `uses_count`: nombre brut d’utilisations.
- `decayed_score`: score pondéré par le temps.
- `last_used_at`: dernier clic.

Comportement:

- À chaque clic: `decayed_score` est d’abord décayé depuis `last_used_at`, puis `+1`.
- L’ordre d’affichage est trié par score décayé décroissant.
- Résultat: les habitudes récentes remontent, les anciennes perdent progressivement du poids.

Paramètre actuel:

- demi-vie du decay: `14 jours`.

## Base de données

Table: `quick_actions_usage`

- `action_id` (PK)
- `uses_count`
- `decayed_score`
- `last_used_at`
- `created_at`
- `updated_at`

Migration associée: `electron/db/migrations/009_quick_actions_usage.sql`.

## Exemple concret: Automation

L’extension `@chaton/automation` déclare:

- quick action: `Créer automatisation`
- deeplink:
  - `viewId = automation.main`
  - `target = open-create-automation`

La vue `automation.main` écoute ensuite `chaton.extension.deeplink` et ouvre son modal de création.

## Notes UI

- Les quick action cards sont filtrées par `scope` avant tri.
- Les cards utilisent une animation d’apparition/disparition via `AnimatePresence` pour des transitions fluides.
- Les quick actions natives:
  - `Créer une extension`: scope `global-or-no-thread`.
  - `Créer une compétence`: scope `global-or-no-thread`.
