document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('reception-login-form');
  const message = document.getElementById('login-message');
  const auth = window.MAFDReceptionAuth;
  const query = new URL(window.location.href).searchParams;
  const nextPage = /^checkin\.html(?:\?[^#]*)?$/.test(query.get('next') || '') ? query.get('next') : 'checkin.html';
  const setMessage = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle('is-error', error);
  };

  try {
    const current = await auth.getAuthorizedSession();
    if (current.session && current.authorized) {
      window.location.replace(nextPage);
      return;
    }
  } catch (error) {
    console.error('Falha ao verificar sessão:', error);
  }

  if (query.get('denied') === '1') setMessage('Acesso negado. Este usuário não pertence à equipe de recepção.', true);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const originalButtonText = button.textContent;
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = 'Entrando...';
    setMessage('');
    try {
      const { data: result, error } = await auth.client.auth.signInWithPassword({
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || '')
      });
      if (error || !result.session) throw error || new Error('Sessão não criada.');
      const role = auth.getRole(result.session);
      if (!['checkin', 'admin'].includes(role)) {
        await auth.client.auth.signOut();
        setMessage('Acesso negado. Este usuário não pertence à equipe de recepção.', true);
        return;
      }
      window.location.replace(nextPage);
    } catch (error) {
      console.error('Falha técnica no login:', error);
      setMessage('E-mail ou senha inválidos.', true);
    } finally {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
  });
});
