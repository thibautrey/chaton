# Bibliotheque UI pour extensions Chatons

Cette bibliotheque propose des composants visuels deja alignes sur l'UI Chatons, sans retirer aux extensions la possibilite d'implementer leur propre interface.

## Objectif

Les extensions restent libres de construire leurs propres composants graphiques.

En parallele, Chatons fournit une bibliotheque UI legere pour:
- accelerer le developpement,
- encourager une coherence graphique,
- mutualiser les patterns deja presents dans l'application,
- reduire les divergences entre les vues d'extension et le shell principal.

Le principe est donc:
- **liberte totale** pour les extensions,
- **composants recommandes** pour celles qui veulent s'integrer visuellement a Chatons.

## Source de verite visuelle

La bibliotheque est basee sur les tokens et conventions UI de l'application:
- palette issue de `src/styles/base.css`
- conventions de boutons / inputs / badges issues de:
  - `src/components/ui/button.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/badge.tsx`

Pour les vues d'extension HTML chargees dans `mainView`, Chatons injecte automatiquement une aide UI dans la page via `window.chatonUi`.

## API injectee

Disponible dans les pages `mainView`:

- `window.chatonUi.ensureStyles()`
- `window.chatonUi.createModelPicker(options)`
- `window.chatonUi.createButton(options)`
- `window.chatonUi.createComponents()`

## Model picker

Le helper suivant reste la facon recommandee d'afficher un selecteur de modele coherent avec Chatons:

```js
const picker = window.chatonUi.createModelPicker({
  host: document.getElementById('modelHost'),
  onChange: (modelKey) => {
    localStorage.setItem('my-extension:model', modelKey);
  },
  labels: {
    filterPlaceholder: 'Filtrer les modeles...',
    more: 'plus',
    scopedOnly: 'scoped uniquement',
    noScoped: 'Aucun modele scoped',
    noModels: 'Aucun modele disponible',
  },
});

const res = await window.chaton.listPiModels();
if (res.ok) {
  picker.setModels(res.models);
  picker.setSelected(localStorage.getItem('my-extension:model'));
}
```

API:
- `setModels([{ id, provider, key, scoped }])`
- `setSelected(modelKey | null)`
- `getSelected()`
- `destroy()`

## Composants de base

Pour les besoins simples, `window.chatonUi.createComponents()` retourne un petit toolkit DOM:

```js
const ui = window.chatonUi.createComponents();
ui.ensureStyles();

const button = ui.createButton({ text: 'Executer', variant: 'default' });
const ghost = ui.createButton({ text: 'Annuler', variant: 'ghost' });
const badge = ui.createBadge({ text: 'Beta', variant: 'secondary' });
const card = ui.el('section', 'my-card');
```

Helpers disponibles:
- `cls(...classNames)`
- `el(tag, className?, text?)`
- `createButton({ text, variant, type })`
- `createBadge({ text, variant })`
- `ensureStyles()`

Variants actuels:
- bouton: `default`, `outline`, `ghost`
- badge: `default`, `secondary`, `outline`

## Recommandations d'usage

Pour garder une bonne coherence:
- reutiliser les helpers Chatons pour les boutons, badges, champs et model picker quand c'est possible,
- conserver les libelles et espacements dans le meme ton que l'application,
- reserver les styles totalement custom aux cas ou l'extension a une vraie identite produit ou un besoin fort.

## Cas de reference

L'extension integree `@chaton/automation` a ete migree vers cette bibliotheque UI. Elle sert d'exemple de reference pour:
- structure de page,
- cartes de contenu,
- listes d'elements,
- modale de creation,
- integration du model picker.

Fichiers:
- `electron/extensions/builtin/automation/components.js`
- `electron/extensions/builtin/automation/index.js`
- `electron/extensions/builtin/automation/index.html`

## Limites actuelles

Version initiale volontairement legere:
- pas de framework React impose,
- pas de systeme de layout complet injecte,
- pas de theming d'extension expose comme API stable,
- API orientee DOM simple pour rester compatible avec les extensions HTML autonomes.

Cette base pourra etre etendue ensuite avec d'autres composants communs si plusieurs extensions convergent vers les memes besoins.
