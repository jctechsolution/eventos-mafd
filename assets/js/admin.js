document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.MAFDAdminAuth;
  const elements = {
    loading: document.getElementById('admin-loading'), app: document.getElementById('admin-app'),
    email: document.getElementById('admin-email'), updated: document.getElementById('last-updated'),
    message: document.getElementById('admin-global-message'), stats: document.getElementById('admin-stats'),
    retrySummary: document.getElementById('retry-summary'), refresh: document.getElementById('refresh-data'),
    filters: document.getElementById('admin-filters'), search: document.getElementById('filter-search'),
    first: document.getElementById('filter-first'), cocktail: document.getElementById('filter-cocktail'),
    checkin: document.getElementById('filter-checkin'), order: document.getElementById('filter-order'),
    clearFilters: document.getElementById('clear-filters'), tableState: document.getElementById('table-state'),
    retryList: document.getElementById('retry-list'),
    tableWrapper: document.getElementById('table-wrapper'), tbody: document.getElementById('participants-body'),
    cards: document.getElementById('participant-cards'), pagination: document.getElementById('pagination'),
    previous: document.getElementById('previous-page'), next: document.getElementById('next-page'),
    pageIndicator: document.getElementById('page-indicator'), recordsIndicator: document.getElementById('records-indicator'),
    pageSize: document.getElementById('page-size'), export: document.getElementById('export-csv'),
    sidebarExport: document.getElementById('sidebar-export'), sidebar: document.getElementById('admin-sidebar'),
    sidebarBackdrop: document.getElementById('admin-sidebar-backdrop'), menu: document.getElementById('admin-menu-button'),
    showCheckins: document.getElementById('show-checkins'), modal: document.getElementById('participant-modal'),
    modalPanel: document.querySelector('.participant-modal__panel'), details: document.getElementById('participant-details'),
    logoutButtons: [...document.querySelectorAll('.admin-logout-button')]
  };
  const state = { page: 1, pageSize: 25, total: 0, rows: [], requestId: 0, detailReturnFocus: null };
  let logoutInProgress = false;
  const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Manaus' }).format(new Date(value)) : '—';
  const yesNo = (value) => value ? 'Sim' : 'Não';
  const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-11);
  const formatPhone = (value) => {
    const digits = normalizePhone(value);
    return digits.length === 11 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` : digits;
  };
  const setMessage = (text = '', isError = false) => { elements.message.textContent = text; elements.message.classList.toggle('is-error', isError); };
  const redirectLogin = () => window.location.replace('login-admin.html');

  const handleAuthError = async (error) => {
    if (!error?.isAuthError) return false;
    elements.tbody.replaceChildren(); elements.cards.replaceChildren();
    await auth.sairDoPainel(); redirectLogin(); return true;
  };

  const statDefinitions = [
    ['total_confirmacoes', 'Confirmações', 'Cadastros principais'], ['total_participantes', 'Participantes estimados', 'Confirmados + convidados'],
    ['total_convidados', 'Convidados', 'Acompanhantes informados'], ['total_primeira_vez', 'Primeira participação', 'Novos participantes'],
    ['total_coquetel', 'Coquetel', 'Confirmações principais'], ['total_checkins', 'Check-ins realizados', 'Entradas registradas'],
    ['total_aguardando_checkin', 'Aguardando entrada', 'Confirmações sem check-in'], ['confirmacoes_hoje', 'Confirmações de hoje', 'Novos cadastros no dia']
  ];
  const iconSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6"/></svg>';
  const renderStatsSkeleton = () => {
    elements.stats.replaceChildren(...statDefinitions.map(() => {
      const card = document.createElement('article'); card.className = 'stat-card is-loading'; card.textContent = 'Carregando'; return card;
    }));
  };
  const renderStats = (summary) => {
    elements.stats.replaceChildren(...statDefinitions.map(([key, title, description]) => {
      const card = document.createElement('article'); card.className = 'stat-card';
      const icon = document.createElement('span'); icon.className = 'stat-card__icon'; icon.innerHTML = iconSvg;
      const heading = document.createElement('h3'); heading.textContent = title;
      const value = document.createElement('strong'); value.textContent = String(summary[key] ?? 0);
      const note = document.createElement('p'); note.textContent = description;
      card.append(icon, heading, value, note); return card;
    }));
  };

  async function carregarResumo() {
    renderStatsSkeleton(); elements.retrySummary.hidden = true;
    try {
      const payload = await auth.rpcAdmin('admin_resumo_evento');
      const summary = Array.isArray(payload) ? payload[0] : payload;
      renderStats(summary || {});
      elements.updated.textContent = `Última atualização: ${formatDate(summary?.atualizado_em || new Date())}`;
    } catch (error) {
      if (await handleAuthError(error)) return;
      elements.stats.replaceChildren(); elements.retrySummary.hidden = false;
      setMessage('Não foi possível carregar os indicadores agora.', true);
    }
  }

  const filtersPayload = () => ({
    p_busca: elements.search.value.trim() || null,
    p_filtro_primeira_vez: elements.first.value === '' ? null : elements.first.value === 'true',
    p_filtro_coquetel: elements.cocktail.value === '' ? null : elements.cocktail.value === 'true',
    p_filtro_checkin: elements.checkin.value,
    p_ordem: elements.order.value,
    p_limite: state.pageSize,
    p_offset: (state.page - 1) * state.pageSize
  });

  const statusElement = (row) => {
    const status = document.createElement('span'); status.className = `status${row.checkin_realizado ? ' is-complete' : ''}`;
    status.textContent = row.checkin_realizado ? 'Realizado' : 'Aguardando'; return status;
  };
  const actionElements = (row, index) => {
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const phone = normalizePhone(row.whatsapp);
    const whatsapp = document.createElement('a'); whatsapp.textContent = 'WhatsApp'; whatsapp.target = '_blank'; whatsapp.rel = 'noopener';
    whatsapp.href = `https://wa.me/55${phone}?text=${encodeURIComponent(`Olá, ${row.nome_completo}! Estamos entrando em contato sobre o evento Festa de Crente... Com Homens de Deus.`)}`;
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copiar'; copy.dataset.action = 'copy'; copy.dataset.index = String(index);
    const view = document.createElement('button'); view.type = 'button'; view.textContent = 'Visualizar'; view.dataset.action = 'view'; view.dataset.index = String(index);
    actions.append(whatsapp, copy, view); return actions;
  };
  const cell = (value) => { const td = document.createElement('td'); td.textContent = value; return td; };
  const renderRows = () => {
    elements.tbody.replaceChildren(); elements.cards.replaceChildren();
    state.rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.append(cell(row.nome_completo || '—'), cell(formatPhone(row.whatsapp) || '—'), cell(row.igreja || '—'), cell(yesNo(row.primeira_vez)), cell(yesNo(row.participa_coquetel)), cell(String(row.quantidade_convidados || 0)), cell(formatDate(row.criado_em)));
      const statusCell = document.createElement('td'); statusCell.append(statusElement(row));
      const actionsCell = document.createElement('td'); actionsCell.append(actionElements(row, index)); tr.append(statusCell, actionsCell); elements.tbody.append(tr);

      const card = document.createElement('article'); card.className = 'participant-card';
      const title = document.createElement('h3'); title.textContent = row.nome_completo || 'Participante';
      const dl = document.createElement('dl');
      [['WhatsApp', formatPhone(row.whatsapp)], ['Igreja', row.igreja || '—'], ['Convidados', String(row.quantidade_convidados || 0)], ['Check-in', row.checkin_realizado ? 'Realizado' : 'Aguardando']].forEach(([label, value]) => { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; dl.append(dt, dd); });
      card.append(title, dl, actionElements(row, index)); elements.cards.append(card);
    });
  };

  async function listarConfirmacoes() {
    const requestId = ++state.requestId;
    elements.retryList.hidden = true;
    elements.tableState.hidden = false; elements.tableState.classList.remove('is-error'); elements.tableState.textContent = 'Carregando participantes...';
    elements.tableWrapper.hidden = true; elements.cards.hidden = true; elements.pagination.hidden = true;
    try {
      const rows = await auth.rpcAdmin('admin_listar_confirmacoes', filtersPayload());
      if (requestId !== state.requestId) return;
      state.rows = Array.isArray(rows) ? rows : [];
      state.total = Number(state.rows[0]?.total_registros || 0);
      if (!state.rows.length) {
        elements.tableState.textContent = 'Nenhuma confirmação encontrada para os filtros selecionados.';
        return;
      }
      renderRows(); elements.tableState.hidden = true; elements.tableWrapper.hidden = false; elements.cards.hidden = false; elements.pagination.hidden = false;
      const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      elements.pageIndicator.textContent = `Página ${state.page} de ${pages}`;
      const start = (state.page - 1) * state.pageSize + 1; const end = Math.min(state.total, start + state.rows.length - 1);
      elements.recordsIndicator.textContent = `${start}–${end} de ${state.total}`;
      elements.previous.disabled = state.page <= 1; elements.next.disabled = state.page >= pages;
    } catch (error) {
      if (requestId !== state.requestId || await handleAuthError(error)) return;
      elements.tableState.hidden = false; elements.tableState.classList.add('is-error'); elements.tableState.textContent = 'Não foi possível carregar os dados agora.';
      elements.retryList.hidden = false;
    }
  }

  const detailItems = (row) => [
    ['Nome', row.nome_completo || '—'], ['Igreja', row.igreja || '—'], ['WhatsApp', formatPhone(row.whatsapp) || '—'],
    ['Primeira vez', yesNo(row.primeira_vez)], ['Participa do coquetel', yesNo(row.participa_coquetel)],
    ['Convidados', String(row.quantidade_convidados || 0)], ['Total do grupo', String(Number(row.quantidade_convidados || 0) + 1)],
    ['Confirmação', formatDate(row.criado_em)], ['Check-in', row.checkin_realizado ? 'Realizado' : 'Aguardando'],
    ['Horário do check-in', row.checkin_realizado ? formatDate(row.checkin_em) : '—']
  ];
  const openDetails = (row, trigger) => {
    state.detailReturnFocus = trigger; elements.details.replaceChildren();
    detailItems(row).forEach(([label, value]) => { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; elements.details.append(dt, dd); });
    elements.modal.hidden = false; elements.modalPanel.focus();
  };
  const closeDetails = () => { elements.modal.hidden = true; state.detailReturnFocus?.focus(); };
  const handleRowAction = async (event) => {
    const trigger = event.target.closest('[data-action][data-index]'); if (!trigger) return;
    const row = state.rows[Number(trigger.dataset.index)]; if (!row) return;
    if (trigger.dataset.action === 'view') openDetails(row, trigger);
    if (trigger.dataset.action === 'copy') {
      try { await navigator.clipboard.writeText(formatPhone(row.whatsapp)); trigger.textContent = 'Copiado'; window.setTimeout(() => { trigger.textContent = 'Copiar'; }, 1200); }
      catch (_) { setMessage('Não foi possível copiar o telefone.', true); }
    }
  };

  const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  async function exportarConfirmacoes() {
    const buttons = [elements.export, elements.sidebarExport]; buttons.forEach((button) => { button.disabled = true; });
    const original = elements.export.textContent; elements.export.textContent = 'Gerando arquivo...';
    try {
      const rows = await auth.rpcAdmin('admin_exportar_confirmacoes');
      const headers = ['Nome completo','WhatsApp','Igreja','Primeira vez','Coquetel','Leva convidados','Quantidade de convidados','Total do grupo','Confirmação','Check-in','Horário do check-in'];
      const lines = [headers.map(csvEscape).join(';')];
      (Array.isArray(rows) ? rows : []).forEach((row) => lines.push([
        row.nome_completo, formatPhone(row.whatsapp), row.igreja || '', yesNo(row.primeira_vez), yesNo(row.participa_coquetel), yesNo(row.leva_convidados), row.quantidade_convidados, row.total_grupo, formatDate(row.criado_em), row.checkin_realizado ? 'Realizado' : 'Aguardando', row.checkin_realizado ? formatDate(row.checkin_em) : ''
      ].map(csvEscape).join(';')));
      const now = new Date(); const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const url = URL.createObjectURL(new Blob(['\ufeff', lines.join('\r\n')], { type:'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `confirmacoes_mafd_${stamp}.csv`; link.click(); URL.revokeObjectURL(url);
      setMessage('Exportação concluída.');
    } catch (error) { if (!(await handleAuthError(error))) setMessage('Não foi possível gerar a exportação agora.', true); }
    finally { buttons.forEach((button) => { button.disabled = false; }); elements.export.textContent = original; }
  }

  const clearAdministrativeInterface = () => {
    state.requestId += 1;
    state.rows = [];
    state.total = 0;
    elements.tbody.replaceChildren();
    elements.cards.replaceChildren();
    elements.stats.replaceChildren();
    elements.details.replaceChildren();
    elements.tableWrapper.hidden = true;
    elements.cards.hidden = true;
    elements.pagination.hidden = true;
    elements.modal.hidden = true;
    elements.email.textContent = '';
    elements.updated.textContent = '';
    elements.message.textContent = '';
    elements.app.hidden = true;
    elements.loading.hidden = false;
    elements.loading.querySelector('p').textContent = 'Encerrando sessão...';
  };

  async function sairDoPainel() {
    if (logoutInProgress) return;
    logoutInProgress = true;
    elements.logoutButtons.forEach((button) => { button.disabled = true; button.textContent = 'Saindo...'; });
    clearAdministrativeInterface();
    try {
      await auth.sairDoPainel();
    } finally {
      window.location.replace('login-admin.html');
    }
  }
  const toggleSidebar = (open) => { elements.sidebar.classList.toggle('is-open', open); elements.sidebarBackdrop.hidden = !open; elements.menu.setAttribute('aria-expanded', String(open)); };

  try {
    const sessionState = await auth.obterSessaoAdmin();
    if (!sessionState.session) return redirectLogin();
    if (!sessionState.authorized) { await auth.sairDoPainel(); window.location.replace('login-admin.html?denied=1'); return; }
    elements.email.textContent = sessionState.session.user.email || 'Administrador';
    elements.loading.hidden = true; elements.app.hidden = false;
  } catch (_) { return redirectLogin(); }

  elements.retrySummary.addEventListener('click', carregarResumo); elements.refresh.addEventListener('click', async () => { elements.refresh.disabled = true; await Promise.all([carregarResumo(), listarConfirmacoes()]); elements.refresh.disabled = false; });
  elements.retryList.addEventListener('click', listarConfirmacoes);
  elements.filters.addEventListener('submit', (event) => { event.preventDefault(); state.page = 1; listarConfirmacoes(); });
  let debounceId; elements.search.addEventListener('input', () => { window.clearTimeout(debounceId); debounceId = window.setTimeout(() => { state.page = 1; listarConfirmacoes(); }, 400); });
  elements.clearFilters.addEventListener('click', () => { elements.filters.reset(); state.page = 1; state.pageSize = 25; elements.pageSize.value = '25'; listarConfirmacoes(); });
  elements.previous.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; listarConfirmacoes(); } });
  elements.next.addEventListener('click', () => { state.page += 1; listarConfirmacoes(); });
  elements.pageSize.addEventListener('change', () => { state.pageSize = Number(elements.pageSize.value); state.page = 1; listarConfirmacoes(); });
  elements.tbody.addEventListener('click', handleRowAction); elements.cards.addEventListener('click', handleRowAction);
  elements.export.addEventListener('click', exportarConfirmacoes); elements.sidebarExport.addEventListener('click', exportarConfirmacoes);
  elements.showCheckins.addEventListener('click', () => { elements.checkin.value = 'realizado'; state.page = 1; listarConfirmacoes(); document.getElementById('participants').scrollIntoView(); toggleSidebar(false); });
  elements.logoutButtons.forEach((button) => button.addEventListener('click', sairDoPainel));
  elements.menu.addEventListener('click', () => toggleSidebar(!elements.sidebar.classList.contains('is-open'))); elements.sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
  elements.modal.querySelectorAll('[data-detail-close]').forEach((button) => button.addEventListener('click', closeDetails));
  elements.modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetails(); if (event.key !== 'Tab') return; const focusable = [...elements.modalPanel.querySelectorAll('button:not([disabled])')]; if (!focusable.length) return; const first=focusable[0],last=focusable[focusable.length-1]; if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); } });

  renderStatsSkeleton(); await Promise.all([carregarResumo(), listarConfirmacoes()]);

  window.addEventListener('pageshow', async (event) => {
    if (!event.persisted) return;
    elements.app.hidden = true;
    elements.loading.hidden = false;
    elements.loading.querySelector('p').textContent = 'Validando acesso administrativo...';
    try {
      const cachedSession = await auth.obterSessaoAdmin();
      if (!cachedSession.session || !cachedSession.authorized) {
        clearAdministrativeInterface();
        window.location.replace('login-admin.html');
        return;
      }
      elements.email.textContent = cachedSession.session.user.email || 'Administrador';
      elements.loading.hidden = true;
      elements.app.hidden = false;
    } catch (_) {
      clearAdministrativeInterface();
      window.location.replace('login-admin.html');
    }
  });
});
