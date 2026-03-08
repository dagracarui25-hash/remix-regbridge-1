

## Plan : Agrandir la zone de réponse du chat

Le conteneur des messages est limité à `max-w-3xl` (~768px), ce qui tronque visuellement les réponses et les sources sur les écrans larges.

### Modifications

**`src/components/QuestionFinma.tsx`** :
- Ligne 83 : Remplacer `max-w-3xl` par `max-w-5xl` pour élargir la zone de conversation (~1024px)
- Ligne 104 : La bulle agent est déjà en `max-w-full`, pas de changement nécessaire

Cela élargit toute la zone de chat (messages + input + suggestions) pour que les réponses et sources soient entièrement visibles.

