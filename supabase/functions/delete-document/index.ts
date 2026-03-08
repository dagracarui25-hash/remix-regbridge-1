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

    const { filename } = await req.json();
    if (!filename) {
      return new Response(
        JSON.stringify({ error: "filename requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const collection = "company_documents";

    // Delete all points matching this filename using filter
    const res = await fetch(
      `${QDRANT_URL}/collections/${collection}/points/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": QDRANT_API_KEY,
        },
        body: JSON.stringify({
          filter: {
            should: [
              { key: "document", match: { value: filename } },
              { key: "filename", match: { value: filename } },
              { key: "nom_fichier", match: { value: filename } },
            ],
          },
        }),
      }
    );

    if (!res.ok) {
      const t = await res.text();
      console.error("Qdrant delete error:", t);
      throw new Error("Failed to delete from Qdrant");
    }
    await res.text();

    return new Response(
      JSON.stringify({ success: true, message: `Document ${filename} supprimé` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("delete-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
