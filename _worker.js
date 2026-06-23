

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {

    // ── CORS preflight ────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ══════════════════════════════════════════════════════════════
    // POST /upload-photo
    // Receives an image file, uploads it to ImgBB, returns the URL.
    // The frontend sends one photo at a time as FormData.
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/upload-photo' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');

        if (!imageFile) {
          return json({ error: 'No image file received' }, 400);
        }

        // Build FormData for ImgBB API
        const imgbbForm = new FormData();
        imgbbForm.append('key', env.IMGBB_KEY);
        imgbbForm.append('image', imageFile);

        const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
          method: 'POST',
          body:   imgbbForm,
        });

        const imgbbData = await imgbbRes.json();

        if (imgbbData.success) {
          return json({
            url:       imgbbData.data.display_url,   // direct image URL
            deleteUrl: imgbbData.data.delete_url,    // if you ever need to delete it
          });
        } else {
          return json({ error: 'ImgBB upload failed', detail: imgbbData }, 500);
        }

      } catch (err) {
        return json({ error: 'Photo upload error', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // POST /submit-listing
    // Saves a new property submission to KV with status "pending".
    // You review it in the Cloudflare KV dashboard, then manually
    // add approved properties to your website's properties array.
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/submit-listing' && request.method === 'POST') {
      try {
        const data = await request.json();

        // Validate required fields
        if (!data.name || !data.email || !data.city || !data.neighborhood) {
          return json({ error: 'Missing required fields' }, 400);
        }

        // Generate a unique key for this listing
        const id  = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const now = new Date().toISOString();

        const listing = {
          id,
          status:      'pending',   // ← you change this to "approved" when ready
          submittedAt: now,
          name:        data.name,
          email:       data.email,
          city:        data.city,
          neighborhood: data.neighborhood,
          type:        data.type,
          beds:        data.beds,
          price:       data.price,
          description: data.description,
          photos:      data.photos || [],   // array of ImgBB URLs
          hasDeed:     data.hasDeed || false,
        };

        // Save to KV
        await env.LISTINGS.put(id, JSON.stringify(listing));

        return json({ success: true, id });

      } catch (err) {
        return json({ error: 'Submission error', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // GET /admin/listings
    // Returns all pending listings so you can review them.
    // Protected by a simple secret token — add ADMIN_TOKEN as a
    // Worker environment variable.
    //
    // Usage: GET /admin/listings?token=YOUR_SECRET_TOKEN
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/admin/listings' && request.method === 'GET') {
      const token = url.searchParams.get('token');

      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }

      try {
        // List all keys in the LISTINGS namespace
        const list = await env.LISTINGS.list();
        const results = [];

        for (const key of list.keys) {
          const value = await env.LISTINGS.get(key.name);
          if (value) {
            results.push(JSON.parse(value));
          }
        }

        // Sort newest first
        results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        return json({ listings: results, total: results.length });

      } catch (err) {
        return json({ error: 'Failed to retrieve listings', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // PATCH /admin/update-listing
    // Updates the status of a listing (pending → approved / rejected)
    // Usage: PATCH /admin/update-listing?token=YOUR_TOKEN
    // Body: { "id": "listing_xxx", "status": "approved" }
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/admin/update-listing' && request.method === 'PATCH') {
      const token = url.searchParams.get('token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      try {
        const { id, status } = await request.json();
        const existing = await env.LISTINGS.get(id);
        if (!existing) return json({ error: 'Listing not found' }, 404);
        const listing = JSON.parse(existing);
        listing.status    = status;
        listing.updatedAt = new Date().toISOString();
        await env.LISTINGS.put(id, JSON.stringify(listing));
        return json({ success: true, id, status });
      } catch (err) {
        return json({ error: 'Update error', detail: String(err) }, 500);
      }
    }

    // ── 404 ───────────────────────────────────────────────────────
    return json({ error: 'Not found' }, 404);
  },
};
       
