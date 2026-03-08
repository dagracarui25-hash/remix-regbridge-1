import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const QDRANT_URL = Deno.env.get("QDRANT_URL");
    const QDRANT_API_KEY = Deno.env.get("QDRANT_API_KEY");

    if (!QDRANT_URL || !QDRANT_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Qdrant non configuré" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const collection = "company_documents";

    // Check if collection exists
    const checkRes = await fetch(`${QDRANT_URL}/collections/${collection}`, {
      headers: { "api-key": QDRANT_API_KEY },
    });

    if (!checkRes.ok) {
      await checkRes.text();
      // Collection doesn't exist yet - return empty
      return new Response(JSON.stringify({ documents: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await checkRes.text();

    // Scroll through all points to get unique documents
    const allDocs = new Map<string, { nom_fichier: string; categorie: string; chunks: number; date_ajout: string }>();
    let offset: string | number | null = null;
    let hasMore = true;

    while (hasMore) {
      const scrollBody: Record<string, unknown> = {
        limit: 100,
        with_payload: true,
        with_vector: false,
      };
      if (offset !== null) scrollBody.offset = offset;

      const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": QDRANT_API_KEY,
        },
        body: JSON.stringify(scrollBody),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error("Qdrant scroll error:", t);
        break;
      }

      const data = await res.json();
      const points = data.result?.points || [];

      for (const point of points) {
        const payload = point.payload || {};
        const filename = (payload.document || payload.filename || payload.nom_fichier || "") as string;
        if (!filename) continue;

        const existing = allDocs.get(filename);
        if (existing) {
          existing.chunks++;
        } else {
          allDocs.set(filename, {
            nom_fichier: filename,
            categorie: (payload.categorie as string) || "Autre",
            chunks: 1,
            date_ajout: (payload.date_ajout as string) || "",
          });
        }
      }

      offset = data.result?.next_page_offset ?? null;
      hasMore = offset !== null && points.length > 0;
    }

    const documents = Array.from(allDocs.values()).sort((a, b) =>
      (b.date_ajout || "").localeCompare(a.date_ajout || "")
    );

    return new Response(JSON.stringify({ documents }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("list-documents error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
