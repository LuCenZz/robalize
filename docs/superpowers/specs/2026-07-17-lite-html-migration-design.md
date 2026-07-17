# Robalize Lite — Migration vers une version HTML/JS vanilla

**Date :** 2026-07-17
**Statut :** validé par Cédric

## Objectif

Créer une version « lite » de Robalize en HTML + JavaScript pur (sans React, sans build),
plus légère à charger et plus simple à faire évoluer. La version actuelle (React + Supabase)
reste intacte et accessible pendant toute la transition : la lite est une **duplication**,
pas un remplacement. Rien n'est supprimé de l'existant.

## Périmètre

### Inclus
- Connexion JIRA (email + token API + JQL), config stockée en localStorage — identique à l'existant
- Gantt chart (rendu identique à l'existant, y compris les corrections récentes : DST,
  étendue des barres d'initiative, boîtes d'epic sur max endDate)
- Barre de filtres + recherche
- Panneau IA (via `api/ai` existant)
- Cache des données en localStorage (affichage immédiat au rechargement)

### Exclus (volontairement)
- Login / authentification (LoginPage, useAuth, Supabase auth)
- Persistance Supabase (useData, lib/supabase)
- Panneau admin (AdminPanel, api/admin)
- Import CSV/Excel (FileUploader, parseFile, xlsx, papaparse)
- Export PowerPoint (generatePptx, pptxgenjs)

## Architecture

### Emplacement : `public/lite/`

Vite copie `public/` tel quel dans `dist/` au build. La version lite est donc servie sur
**`/lite/`** du même déploiement Vercel, à côté de l'app React qui reste à la racine.

- **Dev :** `npm run dev` puis ouvrir `localhost:5173/lite/`. Modifier un fichier JS,
  rafraîchir — aucune compilation.
- **Prod :** aucun changement de pipeline. Seul ajout dans `vercel.json` : un rewrite
  `/lite` → `/lite/index.html` placé avant le catch-all SPA.

### Fichiers

```
public/lite/
├── index.html        # coquille de la page
├── style.css         # styles, reprise du thème actuel (src/styles/theme.ts)
└── js/
    ├── main.js       # démarrage, orchestration, état global
    ├── jira.js       # config + fetch JIRA — port direct de src/utils/jiraFetch.ts
    ├── transform.js  # port direct de src/utils/transformData.ts
    ├── filters.js    # port direct de src/utils/filterEngine.ts
    ├── gantt.js      # rendu du Gantt en DOM pur — réécriture de GanttChart.tsx
    ├── topbar.js     # barre du haut (titre, refresh, boutons IA/JIRA)
    ├── filterbar.js  # barre de filtres + recherche — réécriture de FilterBar.tsx
    └── ai.js         # panneau IA — réécriture de AiPanel.tsx
```

ES modules natifs (`<script type="module">`), aucun bundler, aucune dépendance npm côté client.

### Backend réutilisé tel quel

`api/jira-proxy.ts` et `api/ai.ts` n'ont aucune dépendance à l'authentification et sont
réutilisés sans modification. Le proxy JIRA reste indispensable (JIRA Cloud bloque le CORS
navigateur).

## Flux de données

1. **Chargement de la page** : lecture du cache `localStorage` (`oem-session-data`) →
   si présent, rendu immédiat du Gantt.
2. **Pas de cache et pas de config JIRA** : affichage du panneau de connexion JIRA.
3. **Refresh (bouton ou intervalle configuré)** : `fetchJiraData` → `/api/jira-proxy` →
   transformation → mise à jour du cache localStorage → re-rendu.
4. **Filtres / recherche** : appliqués en mémoire sur les données transformées, re-rendu du Gantt.
5. **Panneau IA** : construit le contexte depuis les lignes visibles → POST `/api/ai`.

Les clés localStorage (`oem-jira-config`, `oem-session-data`) sont les mêmes que l'app
actuelle : un utilisateur qui bascule vers `/lite/` retrouve sa config et ses données.

## Gestion des erreurs

- Échec d'appel JIRA : bandeau d'erreur visible avec le message (statut + corps de réponse),
  les données en cache restent affichées.
- Quota localStorage dépassé : le rendu continue, le cache est simplement ignoré (try/catch,
  comme l'existant).
- Échec `api/ai` : message d'erreur dans le fil de conversation du panneau (comme l'existant).

## Vérification

- **Logique pure** (`transform.js`, `filters.js`) : tests `node --test` sans dépendance,
  vérifiant le comportement à l'identique des versions TypeScript sur des cas représentatifs
  (regroupement initiative/epic, dates aux bornes DST, filtres combinés).
- **Rendu** : comparaison côte à côte `/` vs `/lite/` sur les mêmes données JIRA — mêmes
  barres, mêmes dates, mêmes regroupements.

## Critères de réussite

- `/lite/` fonctionne sans login : connexion JIRA → Gantt → filtres → IA.
- Chargement initial nettement plus rapide que l'app actuelle (pas de bundle React,
  pas de handshake Supabase).
- Cycle de dev : modifier un fichier → rafraîchir, sans étape de build.
- L'app existante à la racine est strictement inchangée (aucun fichier existant modifié,
  à l'exception du rewrite ajouté dans `vercel.json`).
