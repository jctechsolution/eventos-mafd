document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.MAFDReceptionAuth;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const elements = {
    message: document.getElementById('reception-message'), reader: document.getElementById('qr-reader'),
    start: document.getElementById('start-camera'), stop: document.getElementById('stop-camera'),
    manualForm: document.getElementById('manual-search-form'), manualToken: document.getElementById('manual-token'),
    card: document.getElementById('participant-card'), seal: document.getElementById('participant-seal'),
    name: document.getElementById('participant-name'), church: document.getElementById('participant-church'),
    firstTime: document.getElementById('participant-first-time'), cocktail: document.getElementById('participant-cocktail'),
    guests: document.getElementById('participant-guests'), total: document.getElementById('participant-total'),
    status: document.getElementById('participant-status'), time: document.getElementById('checkin-time'),
    confirm: document.getElementById('confirm-entry'), next: document.getElementById('next-participant'),
    dialog: document.getElementById('confirmation-dialog'), logout: document.getElementById('logout-button'),
    operator: document.getElementById('operator-email')
  };
  let scanner = null;
  let currentToken = '';
  let operationInProgress = false;

  const loginUrl = () => `login-recepcao.html?next=${encodeURIComponent(`checkin.html${window.location.search}`)}`;
  const redirectToLogin = () => window.location.replace(loginUrl());
  const setMessage = (text, error = false) => {
    elements.message.textContent = text;
    elements.message.classList.toggle('is-error', error);
  };
  const yesNo = (value) => value ? 'Sim' : 'Não';
  const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short', timeZone:'America/Manaus' }).format(new Date(value)) : '';

  const extractToken = (value) => {
    const candidate = String(value || '').trim();
    if (uuidPattern.test(candidate)) return candidate.toLowerCase();
    try {
      const url = new URL(candidate);
      const token = url.searchParams.get('token') || '';
      return uuidPattern.test(token) ? token.toLowerCase() : '';
    } catch (_) {
      return '';
    }
  };

  const stopCamera = async () => {
    if (scanner?.isScanning) {
      try { await scanner.stop(); } catch (error) { console.warn('Falha ao interromper câmera:', error); }
    }
    elements.reader.hidden = true;
    elements.start.disabled = false;
    elements.stop.disabled = true;
  };

  const showParticipant = (participant) => {
    const used = participant.resultado === 'ja_realizado' || participant.checkin_realizado;
    elements.card.hidden = false;
    elements.card.className = `participant-card${used ? ' is-used' : ''}`;
    elements.seal.textContent = used ? 'CHECK-IN JÁ REALIZADO' : 'PARTICIPANTE LOCALIZADO';
    elements.name.textContent = participant.nome_completo || 'Participante';
    elements.church.textContent = participant.igreja || 'Não informada';
    elements.firstTime.textContent = yesNo(participant.primeira_vez);
    elements.cocktail.textContent = yesNo(participant.participa_coquetel);
    const guests = Number(participant.quantidade_convidados || 0);
    elements.guests.textContent = String(guests);
    elements.total.textContent = String(guests + 1);
    elements.status.textContent = used ? 'Check-in já realizado' : 'Aguardando confirmação da entrada';
    elements.time.textContent = used ? `Registrado em ${formatDate(participant.checkin_em)}` : '';
    elements.confirm.hidden = used;
    elements.confirm.disabled = used;
    elements.next.hidden = false;
    elements.card.scrollIntoView({ behavior:'smooth', block:'center' });
  };

  const consult = async (rawToken) => {
    if (operationInProgress) return;
    const token = extractToken(rawToken);
    if (!token) {
      elements.card.hidden = true;
      setMessage('QR Code inválido ou confirmação não localizada.', true);
      return;
    }
    operationInProgress = true;
    currentToken = token;
    setMessage('Consultando participante...');
    try {
      const rows = await auth.rpc('consultar_checkin', token);
      const participant = Array.isArray(rows) ? rows[0] : rows;
      if (!participant || participant.resultado === 'nao_encontrado') {
        elements.card.hidden = true;
        setMessage('QR Code inválido ou confirmação não localizada.', true);
        return;
      }
      showParticipant(participant);
      setMessage('Participante localizado. Confira os dados antes de confirmar.');
    } catch (error) {
      console.error('Falha ao consultar check-in:', error);
      if (error.isAuthError) return redirectToLogin();
      setMessage('Não foi possível consultar agora. Tente novamente.', true);
    } finally {
      operationInProgress = false;
    }
  };

  const confirmEntry = async () => {
    if (operationInProgress || !currentToken) return;
    operationInProgress = true;
    elements.confirm.disabled = true;
    elements.confirm.textContent = 'Confirmando...';
    try {
      const rows = await auth.rpc('realizar_checkin', currentToken);
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result || result.resultado === 'nao_encontrado') {
        setMessage('QR Code inválido ou confirmação não localizada.', true);
        return;
      }
      if (result.resultado === 'ja_realizado') {
        elements.card.className = 'participant-card is-used';
        elements.seal.textContent = 'CHECK-IN JÁ REALIZADO';
        elements.status.textContent = 'Check-in já realizado';
        elements.time.textContent = `Registrado em ${formatDate(result.checkin_em)}`;
        elements.confirm.hidden = true;
        setMessage('Este participante já realizou o check-in.', true);
        return;
      }
      elements.card.className = 'participant-card is-complete';
      elements.seal.textContent = 'ENTRADA LIBERADA';
      elements.status.textContent = 'Entrada confirmada';
      elements.time.textContent = `Registrado em ${formatDate(result.checkin_em)}`;
      elements.confirm.hidden = true;
      elements.next.hidden = false;
      setMessage('Entrada confirmada com sucesso.');
      navigator.vibrate?.(120);
    } catch (error) {
      console.error('Falha ao realizar check-in:', error);
      if (error.isAuthError) return redirectToLogin();
      elements.confirm.disabled = false;
      setMessage('Não foi possível confirmar a entrada. Tente novamente.', true);
    } finally {
      operationInProgress = false;
      elements.confirm.textContent = 'Confirmar entrada';
    }
  };

  try {
    const state = await auth.getAuthorizedSession();
    if (!state.session) return redirectToLogin();
    if (!state.authorized) {
      await auth.client.auth.signOut();
      window.location.replace('login-recepcao.html?denied=1');
      return;
    }
    elements.operator.textContent = state.session.user.email || 'Equipe autorizada';
  } catch (error) {
    console.error('Falha ao validar acesso:', error);
    return redirectToLogin();
  }

  elements.logout.addEventListener('click', async () => { await stopCamera(); await auth.client.auth.signOut(); window.location.replace('login-recepcao.html'); });
  elements.start.addEventListener('click', async () => {
    if (typeof window.Html5Qrcode !== 'function') return setMessage('Leitor de câmera indisponível. Use a consulta manual.', true);
    elements.start.disabled = true;
    elements.reader.hidden = false;
    scanner ||= new window.Html5Qrcode('qr-reader');
    try {
      await scanner.start({ facingMode:'environment' }, { fps:10, qrbox:{ width:240, height:240 } }, async (decodedText) => {
        await stopCamera();
        await consult(decodedText);
      }, () => undefined);
      elements.stop.disabled = false;
      setMessage('Aponte a câmera para o QR Code do comprovante.');
    } catch (error) {
      console.error('Falha ao iniciar câmera:', error);
      await stopCamera();
      setMessage('Não foi possível acessar a câmera. Use a consulta manual.', true);
    }
  });
  elements.stop.addEventListener('click', stopCamera);
  elements.manualForm.addEventListener('submit', async (event) => { event.preventDefault(); await stopCamera(); await consult(elements.manualToken.value); });
  elements.confirm.addEventListener('click', () => elements.dialog.showModal());
  elements.dialog.addEventListener('close', () => { if (elements.dialog.returnValue === 'confirm') confirmEntry(); });
  elements.next.addEventListener('click', () => {
    currentToken = '';
    elements.card.hidden = true;
    elements.manualForm.reset();
    setMessage('Pronto para o próximo participante.');
    elements.manualToken.focus();
    elements.manualToken.scrollIntoView({ behavior:'smooth', block:'center' });
  });

  const urlToken = new URL(window.location.href).searchParams.get('token');
  if (urlToken) await consult(urlToken);
});
