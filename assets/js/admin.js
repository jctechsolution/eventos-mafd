document.addEventListener('DOMContentLoaded', () => {
  const config = window.MAFD_CONFIG;
  const storageKey = config.adminStorageKey || config.storageKey;
  const tbody = document.getElementById('registrations-body');
  const emptyState = document.getElementById('empty-state');
  const tableWrapper = document.getElementById('table-wrapper');
  const searchInput = document.getElementById('search-input');
  const totalInscricoes = document.getElementById('total-inscricoes');
  const totalParticipantes = document.getElementById('total-participantes');
  const totalCoquetel = document.getElementById('total-coquetel');
  const totalPrimeiraVez = document.getElementById('total-primeira-vez');
  const exportButton = document.getElementById('export-csv');
  const clearAllButton = document.getElementById('clear-all');

  const readRecords = () => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Não foi possível carregar os registros do painel.', error);
      return [];
    }
  };

  const renderRows = (records) => {
    tbody.innerHTML = '';

    if (!records.length) {
      emptyState.hidden = false;
      tableWrapper.hidden = true;
      return;
    }

    emptyState.hidden = true;
    tableWrapper.hidden = false;

    records.forEach((record) => {
      const row = document.createElement('tr');
      const convidCount = Number(record.quantidadeConvidados || 0);
      const totalPeople = convidCount + 1;
      const createdAt = record.criadoEm ? new Date(record.criadoEm).toLocaleString('pt-BR') : '—';
      row.innerHTML = `
        <td>${record.nomeCompleto || '—'}</td>
        <td>${record.whatsapp || '—'}</td>
        <td>${record.igreja || '—'}</td>
        <td>${totalPeople}</td>
        <td>${createdAt}</td>
        <td><button class="delete-button" data-id="${record.id}" type="button">Apagar</button></td>
      `;
      tbody.appendChild(row);
    });
  };

  const updateSummary = (records) => {
    totalInscricoes.textContent = String(records.length);
    const totalParticipants = records.reduce((sum, record) => sum + (Number(record.quantidadeConvidados || 0) + 1), 0);
    const coquetel = records.filter((record) => record.participaCoquetel === 'Sim').length;
    const primeiraVez = records.filter((record) => record.primeiraVez === 'Sim').length;
    totalParticipantes.textContent = String(totalParticipants);
    totalCoquetel.textContent = String(coquetel);
    totalPrimeiraVez.textContent = String(primeiraVez);
  };

  const render = () => {
    const records = readRecords();
    updateSummary(records);
    const searchTerm = searchInput.value.trim().toLowerCase();
    const filtered = records.filter((record) => {
      const nome = (record.nomeCompleto || '').toLowerCase();
      const whatsapp = (record.whatsapp || '').toLowerCase();
      return nome.includes(searchTerm) || whatsapp.includes(searchTerm);
    });
    renderRows(filtered);
  };

  searchInput.addEventListener('input', render);

  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) {
      return;
    }

    const shouldDelete = window.confirm('Deseja apagar esta inscrição?');
    if (!shouldDelete) {
      return;
    }

    const id = button.getAttribute('data-id');
    const records = readRecords().filter((record) => record.id !== id);
    localStorage.setItem(storageKey, JSON.stringify(records));
    render();
  });

  clearAllButton.addEventListener('click', () => {
    const confirmed = window.confirm('Tem certeza de que deseja apagar todos os registros? Esta ação não pode ser desfeita.');
    if (!confirmed) {
      return;
    }
    localStorage.removeItem(storageKey);
    render();
  });

  exportButton.addEventListener('click', () => {
    const records = readRecords();
    const headers = ['nome_completo', 'whatsapp', 'igreja', 'primeira_vez', 'participa_coquetel', 'leva_convidados', 'quantidade_convidados', 'observacao', 'criado_em'];
    const lines = [headers.join(',')];

    records.forEach((record) => {
      const row = headers.map((header) => {
        const value = record[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      lines.push(row.join(','));
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'confirmacoes-mafd.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  });

  render();
});
