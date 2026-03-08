import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ places: [], error: "Missing GOOGLE_PLACES_API_KEY" }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const body = (await request.json()) as { city?: string; query?: string };
    const query = `${body.query ?? ""} ${body.city ?? ""}`.trim();
    if (!query) {
      return new Response(JSON.stringify({ places: [] }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    url.searchParams.set("key", apiKey);

    const result = await fetch(url.toString());
    if (!result.ok) {
      throw new Error(`Google Places returned ${result.status}`);
    }

    const payload = await result.json();

    return new Response(JSON.stringify({ places: payload.results ?? [] }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        places: [],
        error: error instanceof Error ? error.message : "Google Places request failed."
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
