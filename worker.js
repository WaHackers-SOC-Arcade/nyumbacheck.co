/**
 * NyumbaCheck Cloudflare Worker — _worker.js
 * ─────────────────────────────────────────────────────────────────
 * KV binding: NYUMBA_DB  (set in wrangler.toml)
 * Env variables to set in Cloudflare Dashboard → Worker → Settings → Variables:
 *   ADMIN_TOKEN  = your secret password for admin panel
 *   IMGBB_KEY    = your ImgBB API key (free at api.imgbb.com)
 * ─────────────────────────────────────────────────────────────────
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ══════════════════════════════════════════════════════════════
    // GET /api/properties
    // PUBLIC endpoint — returns all APPROVED listings.
    // Your main website calls this on load so approved properties
    // appear automatically without any copy-paste.
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/api/properties' && request.method === 'GET') {
      try {
        const list    = await env.NYUMBA_DB.list({ prefix: 'listing_' });
        const results = [];

        for (const key of list.keys) {
          const raw = await env.NYUMBA_DB.get(key.name);
          if (!raw) continue;
          const listing = JSON.parse(raw);
          // Only return approved listings to the public
          if (listing.status === 'approved') {
            results.push(listing);
          }
        }

        results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        return json({ properties: results, total: results.length });

      } catch (err) {
        return json({ error: 'Failed to fetch properties', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // POST /upload-photo
    // Uploads a single photo to ImgBB and returns the hosted URL.
    // Frontend sends one file at a time as FormData { image: File }.
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/upload-photo' && request.method === 'POST') {
      try {
        const formData  = await request.formData();
        const imageFile = formData.get('image');

        if (!imageFile) return json({ error: 'No image received' }, 400);
        if (!env.IMGBB_KEY) return json({ error: 'IMGBB_KEY not configured in Worker variables' }, 500);

        const imgbbForm = new FormData();
        imgbbForm.append('key', env.IMGBB_KEY);
        imgbbForm.append('image', imageFile);

        const imgbbRes  = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: imgbbForm });
        const imgbbData = await imgbbRes.json();

        if (imgbbData.success) {
          return json({ url: imgbbData.data.display_url, deleteUrl: imgbbData.data.delete_url });
        }
        return json({ error: 'ImgBB upload failed', detail: imgbbData }, 500);

      } catch (err) {
        return json({ error: 'Photo upload error', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // POST /submit-listing
    // Saves a seller's new property submission to KV as "pending".
    // You review and approve it in admin.html — then it goes live
    // automatically on your website (no copy-paste needed).
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/submit-listing' && request.method === 'POST') {
      try {
        const data = await request.json();

        if (!data.name || !data.email || !data.city || !data.neighborhood) {
          return json({ error: 'Missing required fields: name, email, city, neighborhood' }, 400);
        }

        const id      = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const listing = {
          id,
          status:       'pending',
          submittedAt:  new Date().toISOString(),
          name:         data.name,
          email:        data.email,
          city:         data.city,
          neighborhood: data.neighborhood,
          type:         data.type      || 'For Rent',
          beds:         data.beds      || '—',
          baths:        data.baths     || '—',
          priceTZS:     data.priceTZS  || data.price || '',
          priceUSD:     data.priceUSD  || '',
          description:  data.description || '',
          photos:       data.photos    || [],
          hasDeed:      data.hasDeed   || false,
        };

        await env.NYUMBA_DB.put(id, JSON.stringify(listing));
        return json({ success: true, id });

      } catch (err) {
        return json({ error: 'Submission error', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // GET /admin/listings?token=XXX
    // Returns ALL listings (pending + approved + rejected).
    // Protected — only you can access this with your ADMIN_TOKEN.
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/admin/listings' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      try {
        const list    = await env.NYUMBA_DB.list({ prefix: 'listing_' });
        const results = [];

        for (const key of list.keys) {
          const raw = await env.NYUMBA_DB.get(key.name);
          if (raw) results.push(JSON.parse(raw));
        }

        results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        return json({ listings: results, total: results.length });

      } catch (err) {
        return json({ error: 'Failed to fetch listings', detail: String(err) }, 500);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // PATCH /admin/update-listing?token=XXX
    // Updates status of a listing: pending → approved / rejected.
    // When you approve, the listing automatically appears on the
    // public /api/properties endpoint and shows on the website.
    // Body: { "id": "listing_xxx", "status": "approved" }
    // ══════════════════════════════════════════════════════════════
    if (url.pathname === '/admin/update-listing' && request.method === 'PATCH') {
      const token = url.searchParams.get('token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
      try {
        const { id, status } = await request.json();
        if (!id || !status) return json({ error: 'Missing id or status' }, 400);

        const existing = await env.NYUMBA_DB.get(id);
        if (!existing) return json({ error: 'Listing not found' }, 404);

        const listing     = JSON.parse(existing);
        listing.status    = status;
        listing.updatedAt = new Date().toISOString();

        await env.NYUMBA_DB.put(id, JSON.stringify(listing));
        return json({ success: true, id, status });

      } catch (err) {
        return json({ error: 'Update error', detail: String(err) }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
