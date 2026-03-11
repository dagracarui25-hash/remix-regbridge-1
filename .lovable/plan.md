

## Plan: Fix sidebar button + Complete translations

### CORRECTION 1 -- Sidebar button visibility

The "+ Nouvelle conversation" button code exists in `ChatSidebar.tsx` (lines 54-61). The issue is likely caused by the sidebar's inner container having `overflow: hidden` or the `SidebarHeader` being cut off. I will ensure the button renders correctly by adding `overflow-visible` to the sidebar and verifying the header section is not clipped.

**File: `src/components/ChatSidebar.tsx`**
- Add `style={{ overflow: 'visible' }}` or ensure the Sidebar's inner wrapper does not clip the header
- The button styling already matches what the user described (gradient-primary, Plus icon, full width, rounded)

### CORRECTION 2 -- Complete all translations

The i18next system is already set up with 4 locale files (fr/en/de/it) and most translations already exist. The remaining hardcoded French strings are in:

**Hardcoded strings to fix:**

1. **`src/hooks/useConversations.ts`** -- Welcome message (line 22) and conversation title (line 31) are hardcoded in French. Since this is a hook without React context, I will import `i18n` directly from `@/i18n` to get translations.
   - `WELCOME_MESSAGE.text` -> use `i18n.t("chat.welcome")`
   - `"Nouvelle conversation"` title -> use `i18n.t("chat.newConversation")`
   - `"Pas de réponse."` -> use `i18n.t("chat.noResponse")`

2. **`src/components/AnalyseCroisee.tsx`** -- Suggestion cards (lines 24-28) and "En attente..." (line 337) are hardcoded.
   - Move SUGGESTION_CARDS inside the component to access `t()`
   - Replace `"En attente…"` with `t("cross.waiting")`

**New translation keys to add to all 4 locale files:**

| Key | FR | EN | DE | IT |
|-----|----|----|----|----|
| `chat.welcome` | Bienvenue dans RegBridge... | Welcome to RegBridge... | Willkommen bei RegBridge... | Benvenuto in RegBridge... |
| `chat.noResponse` | Pas de reponse. | No response. | Keine Antwort. | Nessuna risposta. |
| `cross.waiting` | En attente... | Waiting... | Wartend... | In attesa... |
| `cross.suggestKyc` | Comparer KYC interne vs FINMA | Compare internal KYC vs FINMA | Internes KYC vs FINMA vergleichen | Confronta KYC interno vs FINMA |
| `cross.suggestKycQuery` | Compare les obligations KYC... | Compare internal KYC obligations... | Vergleiche die internen KYC-Pflichten... | Confronta gli obblighi KYC... |
| `cross.suggestLba` | Analyser la conformite LBA | Analyze AML compliance | GwG-Konformitat analysieren | Analizzare la conformita LRD |
| `cross.suggestLbaQuery` | Analyse la conformite... | Analyze the compliance... | Analysiere die Konformitat... | Analizza la conformita... |
| `cross.suggestCdb` | Verifier les procedures CDB | Verify CDB procedures | CDB-Verfahren prufen | Verificare le procedure CDB |
| `cross.suggestCdbQuery` | Verifie la conformite... | Verify the compliance... | Prufe die Konformitat... | Verifica la conformita... |

### Files to modify

1. `src/i18n/locales/fr.json` -- Add new keys
2. `src/i18n/locales/en.json` -- Add new keys
3. `src/i18n/locales/de.json` -- Add new keys
4. `src/i18n/locales/it.json` -- Add new keys
5. `src/hooks/useConversations.ts` -- Import i18n, replace hardcoded strings
6. `src/components/AnalyseCroisee.tsx` -- Use t() for suggestion cards and waiting text
7. `src/components/ChatSidebar.tsx` -- Ensure button visibility (overflow fix)

No functional changes to API calls, upload, RAG, or layout/colors.

