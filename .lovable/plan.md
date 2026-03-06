

## Plan : Connecter le chat à l'API backend

### Modification unique : `src/hooks/useConversations.ts`

Remplacer la logique simulée dans `sendMessage` par un appel `fetch` réel :

- **Endpoint** : `POST https://granolithic-belletristic-bulah.ngrok-free.dev/question`
- **Body** : `{ "question": "<message>" }`
- **Header ngrok** : Ajouter `"ngrok-skip-browser-warning": "true"` pour éviter la page d'avertissement ngrok
- **Parsing réponse** : Mapper `response.sources` de `[{ document, page }]` vers `string[]` au format `"fichier.pdf — Page 12"`
- **Erreur** : Afficher `"⚠️ Serveur indisponible."` comme message agent en cas d'échec réseau ou HTTP
- **Supprimer** : Le tableau `SIMULATED_RESPONSES` et le `setTimeout`

