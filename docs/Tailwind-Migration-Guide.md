# Migration CSS vers Tailwind

Ce guide explique comment migrer progressivement les composants de CSS global vers Tailwind.

## Vue d'ensemble

Le projet utilise actuellement un mélange de:
- CSS global dans `src/styles/components/*.css`
- Classes utilitaires Tailwind existantes
- Variables CSS pour les design tokens

L'objectif est de migrer vers du Tailwind pur tout en permettant une migration incrémentale.

## Infrastructure disponible

### 1. Utilitaire `css()` (recommandé)

```tsx
import { css, compose } from '@/lib/migration'

// Syntaxe simple - garde la classe legacy + ajoute Tailwind
className={css('notification-bell-dropdown', 'absolute top-full right-0')}

// Multiple classes Tailwind
className={css('notification-bell-item', 'flex gap-3 p-3')}

// Compose pour les conditions
className={compose(
  'flex items-center gap-2',
  isActive && 'bg-white shadow-sm',
)}
```

### 2. Map de migration

`src/lib/migration.ts` contient `CSS_MIGRATION_MAP` avec les équivalents Tailwind pour chaque classe CSS.

## Stratégie de migration (3 phases)

### Phase 1: Migration incrémentale (Dual-class)

Pour chaque composant:

1. **Identifier les classes CSS utilisées**
   ```bash
   grep -E "className=.*\"" Component.tsx | head -20
   ```

2. **Ajouter les équivalents Tailwind**
   ```tsx
   // Avant
   className="notification-bell-dropdown"
   
   // Après (dual-class)
   className={css('notification-bell-dropdown', 'absolute top-full right-0 mt-2 w-96')}
   ```

3. **Vérifier que ça fonctionne** - Les deux classes sont appliquées

### Phase 2: Supprimer les classes legacy

Une fois tous les composants migrés:

1. **Supprimer la classe legacy du JSX**
   ```tsx
   // Après
   className="absolute top-full right-0 mt-2 w-96 ..."
   ```

2. **Garder la classe dans le CSS** (pour référence) OU la supprimer si plus utilisée

### Phase 3: Nettoyer le CSS

Quand un fichier CSS n'a plus de classes utilisées:

1. **Identifier les classes orphelines**
   ```bash
   # Lister les classes dans le CSS
   grep -E "^\." src/styles/components/chat.css | sed 's/{.*//' | sed 's/\..*//'
   
   # Lister les classes utilisées dans le code
   grep -roh "className=\"[^\"]*\"" src/ | grep -oE "[a-z][a-z-]+" | sort -u
   ```

2. **Supprimer les classes CSS migrées**

## Guide par fichier CSS

### `notification-bell.css` (~230 lignes) ✅ PRÊT À MIGRER

Classes à migrer:
- `.notification-bell-wrapper`
- `.notification-bell-button`
- `.notification-bell-badge`
- `.notification-bell-dropdown`
- `.notification-bell-header`
- `.notification-bell-title`
- `.notification-bell-clear`
- `.notification-bell-list`
- `.notification-bell-empty`
- `.notification-bell-item`
- `.notification-bell-item-icon`
- `.notification-bell-item-content`
- `.notification-bell-item-message`
- `.notification-bell-item-meta`
- `.notification-bell-item-type`
- `.notification-bell-item-time`
- `.notification-bell-item-delete`
- `.notification-bell-item-link`
- `.notification-bell-overlay`

### `LinkSheet.css` (~62 lignes) ✅ PRÊT À MIGRER

### `chat.css` (~1164 lignes) - Composant complexe

Classes principales:
- `.chat-section`
- `.chat-timeline`
- `.chat-message`
- `.chat-message-user`
- `.chat-message-assistant`
- `.chat-message-body`
- `.chat-message-text`
- `.chat-markdown`
- `.chat-tool-blocks`

### `composer.css` (~952 lignes) - Composant complexe

### `layout.css` (~1473 lignes) - Sidebar et navigation

## Dark mode

Le projet supporte déjà le dark mode via `.dark *`. Pour Tailwind:

```tsx
// Light mode
className="bg-white text-gray-900"

// Dark mode avec tailwind
className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100"
```

Ou utiliser les variables CSS existantes:
```tsx
className="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
```

## Commandes utiles

### Trouver les classes CSS utilisées
```bash
grep -roh "className=\"[^\"]*\"" src/components/FeatureName/ | \
  grep -oE '\.[a-z][a-z0-9-]+' | sort -u
```

### Trouver les imports CSS
```bash
grep -r "import.*\.css" src/ --include="*.tsx"
```

### Analyser la progression
```tsx
import { analyzeMigrationProgress } from '@/lib/migration'

const usedClasses = ['sidebar-item', 'chat-message', 'composer-input', 'custom-class']
const progress = analyzeMigrationProgress(usedClasses)
console.log(`${progress.percentage}% migrated`)
```

## Anti-patterns à éviter

### ❌ Ne pas utiliser @apply dans les composants
```tsx
// Mauvais
className={css('my-class', 'hover:scale-105')}
```

### ❌ Ne pas mélanger trop de patterns
```tsx
// Mauvais - trop de duplication
className="flex items-center gap-2" + (isActive ? ' bg-white' : '')

// Bon - utiliser compose
className={compose('flex items-center gap-2', isActive && 'bg-white')}
```

### ✅ Préférer les utilitaires natifs

Avant de créer une nouvelle classe, vérifier si Tailwind a l'équivalent:
- `flex`, `grid`, `block`, `inline` pour display
- `gap-2`, `space-y-4` pour spacing
- `text-sm`, `text-lg` pour typography
- `rounded-lg`, `rounded-xl` pour border-radius
- `shadow-sm`, `shadow-md` pour shadows

## Checklist de migration pour un composant

- [ ] Identifier toutes les classes CSS utilisées
- [ ] Créer le mapping Tailwind équivalent
- [ ] Mettre à jour le JSX avec `css()` ou `compose()`
- [ ] Tester en mode clair ET sombre
- [ ] Vérifier le responsive (si applicable)
- [ ] Supprimer l'import CSS si plus nécessaire
- [ ] Supprimer les classes CSS orphelines

## Progression de la migration

| Composant | Status | Fichier CSS | Classes migrées |
|-----------|--------|-------------|-----------------|
| NotificationBell | ✅ Terminé | notification-bell.css (~230 lignes) | 19 classes |
| NotificationUrlViewer | ✅ Terminé | notification-url-viewer.css (~240 lignes) | 15 classes |
| LinkSheet | ✅ Terminé | LinkSheet.css (~62 lignes) | 8 classes |
| LogConsole | ✅ Terminé | log-console.css (~77 lignes) | 15 classes |
| TaskListPanel | ✅ Terminé | task-list.css (~321 lignes) | 45+ classes |
| SubAgentDetailSheet | ✅ Terminé | task-list.css (~321 lignes) | 25+ classes |
| Chat | 🟡 En cours | chat.css (~1164 lignes) | wrappers/messages/markdown/diff migrés partiellement |
| Composer | 🔲 À faire | composer.css (~952 lignes) | - |
| Layout/Sidebar | 🔲 À faire | layout.css (~1473 lignes) | - |
| Settings | 🔲 À faire | settings.css (~1426 lignes) | - |
| ProjectSheet | 🔲 À faire | project-sheet.css (~620 lignes) | - |
| Landing | 🔲 À faire | landing/src/styles.css (~4929 lignes) | - |

## Fichiers créés

1. **`src/lib/migration.ts`** - Utilitaires de migration
   - `css(legacy, tailwind)` - Migration progressive
   - `compose(...)` - Composition de classes
   - `CSS_MIGRATION_MAP` - Map des équivalents

2. **`docs/Tailwind-Migration-Guide.md`** - Guide de migration complet

## Prochaine étapes recommandées

1. **LinkSheet** - Petit composant simple (~62 lignes)
2. **LogConsole** - Composant moyen (~77 lignes)
3. **Composants de layout** - SidebarItem, Header, etc.

Pour les composants complexes (chat, composer), migrer par sections:

### Chat.css (1164 lignes) - Sections recommandées

1. `.chat-section`, `.chat-timeline` (layout)
2. `.chat-message`, `.chat-message-user`, `.chat-message-assistant` (messages)
3. `.chat-message-text`, `.chat-markdown` (contenu texte)
4. `.chat-tool-blocks`, `.chat-tool-block` (outils)
5. Animations et keyframes

### Composer.css (952 lignes) - Sections recommandées

1. `.composer-shell`, `.composer-input` (structure)
2. `.composer-footer`, `.composer-actions` (actions)
3. États (drag-over, active, etc.)
4. Animations

### Layout.css (1473 lignes) - Sections recommandées

1. Sidebar (`.sidebar-panel`, `.sidebar-item`, etc.)
2. Search (`.sidebar-search-*`)
3. Projects (`.project-*`)
4. Cloud indicators
