(function () {
  const config = window.MAFD_CONFIG || {};
  const client = window.supabase?.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const allowedRoles = new Set(['checkin', 'admin']);
  const getRole = (session) => session?.user?.app_metadata?.mafd_role || '';

  async function getAuthorizedSession() {
    if (!client) throw new Error('Serviço de autenticação indisponível.');
    let { data, error } = await client.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (!session) return { session: null, authorized: false };
    if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30000) {
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error) return { session: null, authorized: false };
      session = refreshed.data.session;
    }
    return { session, authorized: allowedRoles.has(getRole(session)) };
  }

  async function rpc(name, token, retry = true) {
    const state = await getAuthorizedSession();
    if (!state.session || !state.authorized) {
      const error = new Error('Sessão não autorizada.');
      error.isAuthError = true;
      throw error;
    }
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${state.session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_token: token })
    });
    if (response.status === 401 && retry) {
      const refreshed = await client.auth.refreshSession();
      if (!refreshed.error && refreshed.data.session) return rpc(name, token, false);
    }
    if (!response.ok) {
      const details = await response.text();
      console.error(`Falha técnica em ${name}:`, response.status, details);
      const error = new Error('Não foi possível concluir a operação.');
      error.isAuthError = response.status === 401 || response.status === 403;
      throw error;
    }
    return response.json();
  }

  window.MAFDReceptionAuth = { client, getAuthorizedSession, getRole, rpc };
})();
