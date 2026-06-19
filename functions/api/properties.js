
// File: functions/api/properties.js

export async function onRequest(context) {
  const { request, env } = context;

  // If the website asks for properties, send them from the Cloudflare KV Database
  if (request.method === "GET") {
    const data = await env.DB.get("properties");
    return new Response(data || "[]", {
      headers: { "Content-Type": "application/json" }
    });
  }

  // If the admin dashboard uploads a new property, save it to the KV Database
  if (request.method === "POST") {
    try {
      const newProperty = await request.json();
      
      // Get the existing properties list
      const existingData = await env.DB.get("properties");
      let properties = existingData ? JSON.parse(existingData) : [];
      
      // Add the new one
      properties.push({
        id: Date.now().toString(),
        ...newProperty
      });

      // Save back to Cloudflare
      await env.DB.put("properties", JSON.stringify(properties));
      
      return new Response(JSON.stringify({ success: true }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response("Error saving property", { status: 500 });
    }
  }
}
