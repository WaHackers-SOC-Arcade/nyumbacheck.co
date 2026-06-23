export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. ACTION: Someone submits the form on admin.html
    if (url.pathname === "/api/properties" && request.method === "POST") {
      try {
        const data = await request.json();
        const propertyId = "prop_" + Date.now(); // Unique key for each house
        
        // Add business tracking fields
        data.id = propertyId;
        data.status = "Pending"; 
        data.date_submitted = new Date().toISOString();

        // Using your exact syntax to WRITE to your database
        await env.NYUMBA_DB.put(propertyId, JSON.stringify(data));

        return new Response(JSON.stringify({ success: true, id: propertyId }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // 2. ACTION: Your homepage (index.html) requests the house list
    if (url.pathname === "/api/properties" && request.method === "GET") {
      // Using your exact syntax to LIST keys
      const list = await env.NYUMBA_DB.list();
      const properties = [];
      
      for (const key of list.keys) {
        // Using your exact syntax to READ the value of each house
        const value = await env.NYUMBA_DB.get(key.name);
        if (value) {
          properties.push(JSON.parse(value));
        }
      }
      
      return new Response(JSON.stringify(properties), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. FALLBACK: If it's not an API call, let Cloudflare serve your static pages (index.html, admin.html)
    return env.ASSETS.fetch(request);
  } 
};
