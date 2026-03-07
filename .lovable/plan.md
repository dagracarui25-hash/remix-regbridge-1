

## Plan : Refonte complète de RegBridge — Navigation à onglets, Analyse croisée, Gestion documentaire

### Architecture

L'application passe d'un chat unique à une interface à 3 onglets avec un système de paramètres et de sécurité.

```text
┌─────────────────────────────────────────────────┐
│  Header : RegBridge + ⚙️ Paramètres + Déconnexion │
├─────────────────────────────────────────────────┤
│  [💬 Question FINMA] [🔀 Analyse croisée] [📁 Docs] │
├─────────────────────────────────────────────────┤
│                                                 │
│              Contenu de l'onglet actif           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Fichiers à créer / modifier

**1. `src/hooks/useApiUrl.ts`** (nouveau)
- Hook qui lit/écrit `regbridge_api_url` dans localStorage
- URL par défaut : `https://granolithic-belletristic-bulah.ngrok-free.dev`
- Expose `apiUrl`, `setApiUrl`, `resetApiUrl`

**2. `src/hooks/useDocumentAccess.ts`** (nouveau)
- Gère l'authentification par code d'accès pour l'onglet Documents
- Hash SHA-256 du code via `crypto.subtle.digest`
- Stocke timestamp en `sessionStorage`, expire après 30 min
- Expose `isAuthenticated`, `authenticate(code)`, `validateSession()`

**3. `src/hooks/useConversations.ts`** (modifier)
- Remplacer l'URL hardcodée par import de `useApiUrl`
- Ajouter timeout 30s sur fetch
- Garder la logique de conversations existante pour l'onglet Question FINMA

**4. `src/components/SettingsDrawer.tsx`** (nouveau)
- Sheet/drawer avec champ URL, boutons Tester/Sauvegarder/Réinitialiser
- Test connexion via `GET {apiUrl}/`
- Utilise le hook `useApiUrl`

**5. `src/components/QuestionFinma.tsx`** (nouveau)
- Reprend la logique chat actuelle de `Index.tsx` (messages, input, suggestions, sidebar de conversations)
- Utilise `useConversations` avec URL dynamique
- Garde le `FormattedMessage` pour le rendu

**6. `src/components/AnalyseCroisee.tsx`** (nouveau)
- Champ de saisie + bouton Envoyer
- Appelle `POST {apiUrl}/question-croisee`
- Affichage en 2 colonnes (grid responsive) : FINMA à gauche, Interne à droite
- Chaque colonne : réponse formatée + sources
- Fallback si pas de documents internes

**7. `src/components/DocumentsInternes.tsx`** (nouveau)
- Modale d'authentification par code (SHA-256)
- Zone A : Upload PDF + sélecteur catégorie + barre de progression
- Zone B : Liste documents via `GET /documents` + suppression avec confirmation
- Revalide la session avant chaque action protégée

**8. `src/components/AccessCodeModal.tsx`** (nouveau)
- Modale centrée avec champ mot de passe + bouton "Accéder"
- Message d'erreur en rouge si code incorrect

**9. `src/components/ErrorBanner.tsx`** (nouveau)
- Bandeau d'erreur global en haut de page, fermable
- Message : "Serveur hors ligne — Relancez le notebook..."
- Affiché via un context ou state remonté

**10. `src/pages/Index.tsx`** (refonte majeure)
- Supprime la sidebar de conversations (remplacée par les onglets)
- Header simplifié : logo + nom + ⚙️ + déconnexion
- Navigation par onglets (Tabs de shadcn)
- Rend `QuestionFinma`, `AnalyseCroisee`, ou `DocumentsInternes` selon l'onglet actif
- Intègre `SettingsDrawer` et `ErrorBanner`

### Sécurité

- Le code d'accès `regbridge2026` n'est jamais stocké en clair — seul le hash SHA-256 est comparé
- La session expire après 30 min (timestamp en sessionStorage)
- Revalidation silencieuse avant upload/suppression

### Points techniques

- Toutes les requêtes utilisent `useApiUrl()` pour l'URL dynamique
- Timeout 30s via `AbortController` sur tous les fetch
- Headers : `ngrok-skip-browser-warning: true` sur toutes les requêtes
- FormData pour `/upload-document` (pas de Content-Type manuel)
- Pas de nouvelle dépendance ajoutée

