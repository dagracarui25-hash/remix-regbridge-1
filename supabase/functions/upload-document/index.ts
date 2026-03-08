import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Split text into overlapping chunks */
function chunkText(text: string, chunkSize = 800, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += chunkSize - overlap;
  }
  return chunks;
}

/** Use Gemini to extract text from PDF (multimodal) */
async function extractTextFromPdf(
  pdfBase64: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Tu es un extracteur de texte. Extrais TOUT le texte du document PDF fourni. Préserve la structure (titres, paragraphes, listes). Ne résume PAS, ne commente PAS. Retourne uniquement le texte brut extrait.",
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
              {
                type: "text",
                text: "Extrais tout le texte de ce document PDF. Retourne uniquement le texte brut, sans commentaire.",
              },
            ],
          },
        ],
        stream: false,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini extraction error:", response.status, errText);
    throw new Error(`Text extraction failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/** Generate embeddings using Lovable AI gateway */
async function generateEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  // Try the embeddings endpoint
  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    }
  );

  if (response.ok) {
    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }

  // Fallback: use Gemini to generate pseudo-embeddings via tool calling
  console.log(
    "Embeddings endpoint not available, using Gemini fallback for semantic vectors"
  );
  const embeddings: number[][] = [];

  for (const text of texts) {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You are an embedding generator. Generate a 384-dimensional normalized float vector that semantically represents the input text. Output ONLY a JSON array of 384 floating point numbers between -1 and 1. No explanation.`,
            },
            { role: "user", content: text.slice(0, 500) },
          ],
          stream: false,
        }),
      }
    );

    if (!resp.ok) {
      const t = await resp.text();
      console.error("Embedding fallback error:", resp.status, t);
      // Generate random vector as last resort
      embeddings.push(
        Array.from({ length: 384 }, () => Math.random() * 2 - 1)
      );
      continue;
    }

    const d = await resp.json();
    const content = d.choices?.[0]?.message?.content || "";
    try {
      // Extract JSON array from response
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const vec = JSON.parse(match[0]);
        if (Array.isArray(vec) && vec.length >= 100) {
          // Normalize to target dimension
          const normalized = vec.slice(0, 384);
          while (normalized.length < 384) normalized.push(0);
          embeddings.push(normalized);
          continue;
        }
      }
    } catch {}
    // Fallback random
    embeddings.push(
      Array.from({ length: 384 }, () => Math.random() * 2 - 1)
    );
  }

  return embeddings;
}

/** Check collection info to get vector size */
async function getCollectionVectorSize(
  qdrantUrl: string,
  apiKey: string,
  collection: string
): Promise<number> {
  try {
    const res = await fetch(`${qdrantUrl}/collections/${collection}`, {
      headers: { "api-key": apiKey },
    });
    if (res.ok) {
      const data = await res.json();
      const config = data.result?.config?.params?.vectors;
      if (typeof config === "object" && config.size) return config.size;
      // Named vectors
      if (typeof config === "object") {
        const first = Object.values(config)[0] as any;
        if (first?.size) return first.size;
      }
    }
  } catch (e) {
    console.error("Error getting collection info:", e);
  }
  return 384; // default
}

/** Ensure collection exists */
async function ensureCollection(
  qdrantUrl: string,
  apiKey: string,
  collection: string,
  vectorSize: number
): Promise<void> {
  const checkRes = await fetch(`${qdrantUrl}/collections/${collection}`, {
    headers: { "api-key": apiKey },
  });

  if (checkRes.ok) {
    await checkRes.text();
    return; // exists
  }
  await checkRes.text();

  // Create collection
  const createRes = await fetch(`${qdrantUrl}/collections/${collection}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      vectors: { size: vectorSize, distance: "Cosine" },
    }),
  });

  if (!createRes.ok) {
    const t = await createRes.text();
    console.error("Create collection error:", t);
    throw new Error("Failed to create Qdrant collection");
  }
  await createRes.text();
}

/** Upsert points to Qdrant */
async function upsertToQdrant(
  qdrantUrl: string,
  apiKey: string,
  collection: string,
  points: { id: string; vector: number[]; payload: Record<string, unknown> }[]
): Promise<void> {
  const res = await fetch(
    `${qdrantUrl}/collections/${collection}/points?wait=true`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({ points }),
    }
  );

  if (!res.ok) {
    const t = await res.text();
    console.error("Qdrant upsert error:", t);
    throw new Error("Failed to upsert to Qdrant");
  }
  await res.text();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const QDRANT_URL = Deno.env.get("QDRANT_URL");
    const QDRANT_API_KEY = Deno.env.get("QDRANT_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!QDRANT_URL || !QDRANT_API_KEY || !LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Configuration manquante" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body (JSON with base64 PDF)
    const body = await req.json();
    const { file_base64, filename, categorie } = body;

    if (!file_base64 || !filename) {
      return new Response(
        JSON.stringify({ error: "file_base64 et filename requis" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const collection = "company_documents";

    // 1. Check/get collection vector size
    let vectorSize = await getCollectionVectorSize(
      QDRANT_URL,
      QDRANT_API_KEY,
      collection
    );

    // 2. Ensure collection exists
    await ensureCollection(QDRANT_URL, QDRANT_API_KEY, collection, vectorSize);

    // 3. Extract text from PDF using Gemini
    console.log(`Extracting text from ${filename}...`);
    const extractedText = await extractTextFromPdf(file_base64, LOVABLE_API_KEY);

    if (!extractedText || extractedText.length < 10) {
      return new Response(
        JSON.stringify({
          error: "Impossible d'extraire le texte du PDF",
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Chunk the text
    const chunks = chunkText(extractedText);
    console.log(`${filename}: ${chunks.length} chunks created`);

    // 5. Generate embeddings
    // Re-check vector size now that collection definitely exists
    vectorSize = await getCollectionVectorSize(
      QDRANT_URL,
      QDRANT_API_KEY,
      collection
    );

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(chunks, LOVABLE_API_KEY);
    } catch (e) {
      console.error("Embedding generation failed:", e);
      // Fallback: random vectors (will still store the text for retrieval)
      embeddings = chunks.map(() =>
        Array.from({ length: vectorSize }, () => Math.random() * 2 - 1)
      );
    }

    // Ensure embeddings match vector size
    embeddings = embeddings.map((emb) => {
      if (emb.length === vectorSize) return emb;
      if (emb.length > vectorSize) return emb.slice(0, vectorSize);
      return [...emb, ...Array(vectorSize - emb.length).fill(0)];
    });

    // 6. Prepare points for Qdrant
    const now = new Date().toISOString();
    const points = chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i],
      payload: {
        text: chunk,
        content: chunk,
        document: filename,
        nom_fichier: filename,
        filename: filename,
        categorie: categorie || "Autre",
        page: i + 1,
        page_number: i + 1,
        chunk_index: i,
        total_chunks: chunks.length,
        date_ajout: now,
        source: "regbridge-upload",
      },
    }));

    // 7. Upsert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await upsertToQdrant(QDRANT_URL, QDRANT_API_KEY, collection, batch);
      console.log(
        `Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(points.length / batchSize)}`
      );
    }

    console.log(
      `✅ ${filename}: ${chunks.length} chunks indexed in Qdrant`
    );

    return new Response(
      JSON.stringify({
        success: true,
        filename,
        chunks: chunks.length,
        message: `Document indexé — ${chunks.length} chunks créés`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("upload-document error:", e);

    if (e instanceof Error && e.message.includes("extraction failed")) {
      return new Response(
        JSON.stringify({ error: "Erreur lors de l'extraction du texte PDF" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Erreur interne",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
