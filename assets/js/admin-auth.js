(function () {
  const config = window.MAFD_CONFIG || {};
  const client = window.supabase?.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const getRole = (session) => session?.user?.app_metadata?.mafd_role || '';

  async function obterSessaoAdmin() {
    if (!client) throw new Error('Serviço de autenticação indisponível.');
    let { data, error } = await client.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (!session) return { session: null, authorized: false };
    if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60000) {
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) return { session: null, authorized: false };
      session = refreshed.data.session;
    }
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user) return { session: null, authorized: false };
    session = { ...session, user: verified.data.user };
    return { session, authorized: getRole(session) === 'admin' };
  }

  async function rpcAdmin(name, body = {}, retry = true) {
    const state = await obterSessaoAdmin();
    if (!state.session || !state.authorized) {
      const error = new Error('Sessão administrativa não autorizada.');
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
      body: JSON.stringify(body)
    });
    if (response.status === 401 && retry) {
      const refreshed = await client.auth.refreshSession();
      if (!refreshed.error && refreshed.data.session) return rpcAdmin(name, body, false);
    }
    if (!response.ok) {
      const error = new Error('Não foi possível carregar os dados agora.');
      error.isAuthError = response.status === 401 || response.status === 403;
      throw error;
    }
    return response.json();
  }

  async function sairDoPainel() {
    await client?.auth.signOut();
  }

  window.MAFDAdminAuth = { client, getRole, obterSessaoAdmin, rpcAdmin, sairDoPainel };
})();
