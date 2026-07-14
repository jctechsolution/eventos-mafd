(function () {
  const config = window.MAFD_CONFIG || {};

  const simNaoParaBoolean = (valor) => {
    if (typeof valor === 'boolean') {
      return valor;
    }
    return String(valor).trim().toLowerCase() === 'sim';
  };

  async function salvarConfirmacao(dados) {
    if (!dados || typeof dados !== 'object') {
      throw new Error('Dados inválidos para salvar a confirmação.');
    }

    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const publishableKey = String(config.supabasePublishableKey || '');
    if (!supabaseUrl || !publishableKey || supabaseUrl.includes('COLE_AQUI') || publishableKey.includes('COLE_AQUI')) {
      throw new Error('Supabase não configurado. Preencha Project URL e Publishable Key em assets/js/config.js.');
    }

    const levaConvidados = simNaoParaBoolean(dados.leva_convidados);
    const payload = {
      nome_completo: String(dados.nome_completo || '').trim(),
      whatsapp: String(dados.whatsapp || '').replace(/\D/g, '').slice(-11),
      igreja: String(dados.igreja || '').trim() || null,
      primeira_vez: simNaoParaBoolean(dados.primeira_vez),
      participa_coquetel: simNaoParaBoolean(dados.participa_coquetel),
      leva_convidados: levaConvidados,
      quantidade_convidados: levaConvidados ? Number(dados.quantidade_convidados || 0) : 0,
      observacao: String(dados.observacao || '').trim() || null,
      consentimento: true
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/confirmacoes`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let responseText = '';
      try {
        responseText = await response.text();
      } catch (_) {
        responseText = '';
      }

      let details = {};
      try {
        details = JSON.parse(responseText);
      } catch (_) {
        details = { message: responseText };
      }

      console.error('Erro técnico ao salvar confirmação no Supabase:', {
        status: response.status,
        statusText: response.statusText,
        details
      });

      const error = new Error(details.message || `O Supabase recusou a confirmação (HTTP ${response.status}).`);
      error.code = details.code || '';
      error.isDuplicate = response.status === 409 || details.code === '23505' || /duplicate|unique|exists|already/i.test(String(details.message || ''));
      throw error;
    }

    return true;
  }

  window.MAFDSupabase = { salvarConfirmacao };
})();