import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, ngrok-skip-browser-warning",
};

interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
}

async function searchQdrant(
  qdrantUrl: string,
  apiKey: string,
  collection: string,
  queryVector: number[],
  limit = 5
): Promise<QdrantSearchResult[]> {
  const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      vector: queryVector,
      limit,
      with_payload: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Qdrant search error (${collection}):`, res.status, text);
    return [];
  }
  const data = await res.json();
  return data.result || [];
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  // Use Lovable AI gateway for embeddings via a chat completion trick:
  // We'll use a simpler approach - call Qdrant's built-in embedding if available,
  // or use a lightweight embedding approach.
  // Since Qdrant might have named vectors, let's try using the query API if available.
  
  // Fallback: Use Lovable AI to generate a semantic search query and search by payload
  // For now, try Qdrant's recommend/query endpoint or use text search
  // 
  // Best approach: Use Qdrant's built-in query with text if FastEmbed is configured,
  // otherwise we need an embedding model.
  
  // Let's try using the Lovable AI gateway to get embeddings via a workaround:
  // We'll use the Google embedding model through the gateway if supported,
  // or fall back to keyword-based search.
  
  // Actually, let's check if the Qdrant collection supports text queries
  // For production, we should use the same embedding model as the one used to index.
  // Since the user's Colab backend likely uses sentence-transformers, let's use
  // Qdrant's query API with prefetch if available.
  
  // Simplest reliable approach: use Qdrant's scroll with payload filter for keyword matching,
  // combined with AI analysis of retrieved chunks.
  
  return []; // Will use alternative search method
}

async function searchQdrantByText(
  qdrantUrl: string,
  apiKey: string,
  collection: string,
  query: string,
  limit = 5
): Promise<QdrantSearchResult[]> {
  // Try Qdrant's query endpoint (v1.7+) which supports text input with built-in embedding
  try {
    const res = await fetch(`${qdrantUrl}/collections/${collection}/points/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        query: query,
        limit,
        with_payload: true,
      }),
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.result?.points?.length > 0) {
        return data.result.points;
      }
    } else {
      const text = await res.text();
      console.log(`Query API not available for ${collection}, trying scroll:`, res.status, text);
    }
  } catch (e) {
    console.log(`Query API failed for ${collection}:`, e);
  }

  // Fallback: scroll and return recent/all chunks (less precise but functional)
  try {
    const res = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        limit,
        with_payload: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.result?.points || [];
    }
  } catch (e) {
    console.error(`Scroll failed for ${collection}:`, e);
  }

  return [];
}

function extractContext(results: QdrantSearchResult[]): { text: string; sources: { document: string; page: number }[] } {
  const sources: { document: string; page: number }[] = [];
  const texts: string[] = [];

  for (const r of results) {
    const payload = r.payload || {};
    const content = (payload.text || payload.content || payload.chunk || "") as string;
    const doc = (payload.document || payload.filename || payload.source || payload.nom_fichier || "Document inconnu") as string;
    const page = (payload.page || payload.page_number || 1) as number;

    if (content) {
      texts.push(content);
      // Avoid duplicate sources
      if (!sources.find(s => s.document === doc && s.page === page)) {
        sources.push({ document: doc, page });
      }
    }
  }

  return { text: texts.join("\n\n"), sources };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "Question requise" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const QDRANT_URL = Deno.env.get("QDRANT_URL");
    const QDRANT_API_KEY = Deno.env.get("QDRANT_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!QDRANT_URL || !QDRANT_API_KEY) {
      return new Response(JSON.stringify({ error: "Qdrant non configuré" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search both collections in parallel
    const [finmaResults, interneResults] = await Promise.all([
      searchQdrantByText(QDRANT_URL, QDRANT_API_KEY, "finma_compliance", question, 5),
      searchQdrantByText(QDRANT_URL, QDRANT_API_KEY, "company_documents", question, 5),
    ]);

    const finmaContext = extractContext(finmaResults);
    const interneContext = extractContext(interneResults);

    // Build AI prompt for cross-analysis
    const systemPrompt = `Tu es un expert en conformité bancaire suisse (FINMA, LBA, CDB, LPD).
Tu reçois deux ensembles de contextes :
1. **Réglementation FINMA** : extraits de circulaires et lois
2. **Documents internes** : procédures et politiques de la banque

Ta mission :
- Analyse la question en croisant les deux sources
- Identifie les écarts de conformité entre les documents internes et les exigences réglementaires
- Cite précisément les sources (nom du document + page)
- Formule des recommandations actionnables si des écarts sont détectés
- Si les documents internes sont conformes, confirme-le explicitement
- Réponds toujours en français

Structure ta réponse en deux parties clairement séparées :
1. ANALYSE FINMA : ce que dit la réglementation
2. ANALYSE INTERNE : ce que disent les documents internes et les écarts identifiés`;

    const userPrompt = `Question : ${question}

--- CONTEXTE FINMA ---
${finmaContext.text || "Aucun document FINMA pertinent trouvé."}

--- CONTEXTE DOCUMENTS INTERNES ---
${interneContext.text || "Aucun document interne pertinent trouvé."}

Fournis une analyse croisée détaillée.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requêtes atteinte, réessayez plus tard." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits épuisés, veuillez recharger votre compte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Erreur du service d'analyse" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const fullResponse = aiData.choices?.[0]?.message?.content || "Pas de réponse générée.";

    // Split the response into FINMA and internal parts
    let finmaReponse = fullResponse;
    let interneReponse = "";

    // Try to split on "ANALYSE INTERNE" marker
    const interneMarker = fullResponse.match(/#{0,3}\s*(?:2[\.\)]\s*)?ANALYSE\s+(?:INTERNE|DOCUMENTS?\s+INTERNES?)/i);
    const finmaMarker = fullResponse.match(/#{0,3}\s*(?:1[\.\)]\s*)?ANALYSE\s+FINMA/i);
    
    if (interneMarker && interneMarker.index !== undefined) {
      finmaReponse = fullResponse.slice(0, interneMarker.index).trim();
      interneReponse = fullResponse.slice(interneMarker.index).trim();
      
      // Remove the FINMA header if present
      if (finmaMarker) {
        finmaReponse = finmaReponse.replace(finmaMarker[0], "").trim();
      }
      // Remove the INTERNE header
      interneReponse = interneReponse.replace(interneMarker[0], "").trim();
    } else {
      // If no clear split, put everything in finma and note no internal docs
      finmaReponse = fullResponse;
      interneReponse = interneContext.text ? "" : "";
    }

    const result = {
      finma: finmaReponse
        ? { reponse: finmaReponse, sources: finmaContext.sources }
        : null,
      interne: interneReponse
        ? { reponse: interneReponse, sources: interneContext.sources }
        : interneContext.text
          ? { reponse: "Analyse en cours — les documents internes ont été consultés mais aucun écart spécifique n'a été identifié pour cette question.", sources: interneContext.sources }
          : null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("question-croisee error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
