export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. AUTO-ROUTER: If you type /admin, automatically serve admin.html
    if (url.pathname === "/admin") {
      return env.ASSETS.fetch(new Request(url.origin + "/admin.html", request));
    }

    // 2. ACTION: Form submission
    if (url.pathname === "/api/properties" && request.method === "POST") {
      try {
        const data = await request.json();
        const propertyId = "prop_" + Date.now();
        
        data.id = propertyId;
        data.status = "Pending"; 
        data.date_submitted = new Date().toISOString();

        await env.NYUMBA_DB.put(propertyId, JSON.stringify(data));

        return new Response(JSON.stringify({ success: true, id: propertyId }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // 3. ACTION: Get properties list
    if (url.pathname === "/api/properties" && request.method === "GET") {
      const list = await env.NYUMBA_DB.list();
      const properties = [];
      
      for (const key of list.keys) {
        const value = await env.NYUMBA_DB.get(key.name);
        if (value) {
          properties.push(JSON.parse(value));
        }
      }
      
      return new Response(JSON.stringify(properties), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. FALLBACK: Serve static assets (index.html, etc.)
    return env.ASSETS.fetch(request);
  } 
};
