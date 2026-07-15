document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('admin-login-form');
  const message = document.getElementById('admin-login-message');
  const auth = window.MAFDAdminAuth;
  const setMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  };

  try {
    const current = await auth.obterSessaoAdmin();
    if (current.session && current.authorized) {
      window.location.replace('admin.html');
      return;
    }
    if (current.session && !current.authorized) await auth.sairDoPainel();
  } catch (_) {
    setMessage('Não foi possível verificar sua sessão agora.', true);
  }

  if (new URL(window.location.href).searchParams.get('denied') === '1') {
    setMessage('Acesso negado. Somente administradores autorizados podem entrar.', true);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = 'Verificando...';
    setMessage('');
    try {
      const { data: result, error } = await auth.client.auth.signInWithPassword({
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || '')
      });
      if (error || !result.session) throw new Error('Login recusado.');
      if (auth.getRole(result.session) !== 'admin') {
        await auth.sairDoPainel();
        setMessage('Acesso negado. Somente administradores autorizados podem entrar.', true);
        return;
      }
      window.location.replace('admin.html');
    } catch (_) {
      setMessage('E-mail ou senha inválidos.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar no painel';
    }
  });
});
