document.addEventListener('DOMContentLoaded', () => {
  const config = window.MAFD_CONFIG;
  const form = document.getElementById('confirmation-form');
  const formMessage = document.getElementById('form-message');
  const summary = document.getElementById('confirmation-summary');
  const whatsappInput = document.getElementById('whatsapp');
  const convidadosSelect = document.getElementById('convidados');
  const quantidadeGroup = document.getElementById('grupo-convidados');
  const quantidadeInput = document.getElementById('quantidade-convidados');
  const menuToggle = document.querySelector('.menu-toggle');
  const siteNav = document.getElementById('site-nav');
  const backToTopButton = document.querySelector('.back-to-top');
  const header = document.querySelector('.site-header');
  const openingScreen = document.getElementById('opening-screen');
  const skipIntroButton = document.getElementById('skip-intro');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  document.querySelectorAll('[data-animate]').forEach((item) => observer.observe(item));

  const introTimeouts = new Set();
  let introState = 'active';

  const scheduleIntro = (callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      introTimeouts.delete(timeoutId);
      callback();
    }, delay);
    introTimeouts.add(timeoutId);
    return timeoutId;
  };

  const clearIntroTimeouts = () => {
    introTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    introTimeouts.clear();
  };

  const storeIntroCompletion = () => {
    try {
      window.sessionStorage.setItem('mafd-intro-seen', 'true');
    } catch (error) {
      console.warn('Não foi possível registrar a abertura nesta sessão.', error);
    }
  };

  const finishIntro = ({ markSeen = true } = {}) => {
    if (introState === 'complete') {
      return;
    }

    introState = 'complete';
    clearIntroTimeouts();
    openingScreen?.classList.add('is-hidden');
    document.body.classList.remove('intro-active');
    document.body.classList.add('intro-complete');
    if (markSeen) {
      storeIntroCompletion();
    }
    openingScreen?.remove();
  };

  const closeIntro = ({ immediate = false, skipped = false, markSeen = true } = {}) => {
    if (introState === 'complete') {
      return;
    }

    clearIntroTimeouts();

    if (!openingScreen || immediate) {
      finishIntro({ markSeen });
      return;
    }

    introState = 'leaving';
    openingScreen.classList.add(skipped ? 'is-skipping' : 'is-leaving');
    scheduleIntro(finishIntro, skipped ? 160 : 600);
  };

  if (!openingScreen) {
    closeIntro({ immediate: true, markSeen: false });
  } else {
    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem('mafd-intro-seen') === 'true';
    } catch (error) {
      console.warn('Não foi possível consultar o estado da abertura.', error);
    }

    if (alreadySeen) {
      closeIntro({ immediate: true, markSeen: false });
    } else if (prefersReducedMotion) {
      document.body.classList.add('intro-active');
      scheduleIntro(() => closeIntro({ skipped: true }), 40);
    } else {
      document.body.classList.add('intro-active');
      openingScreen.classList.add('is-visible');
      scheduleIntro(closeIntro, 1250);
      skipIntroButton?.addEventListener('click', () => closeIntro({ skipped: true }), { once: true });
    }
  }

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!expanded));
      siteNav.classList.toggle('is-open');
    });

    siteNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        siteNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const setQuantityVisibility = () => {
    const shouldShow = convidadosSelect.value === 'Sim';
    quantidadeGroup.style.display = shouldShow ? 'grid' : 'none';
    quantidadeInput.required = shouldShow;
    quantidadeInput.value = shouldShow ? quantidadeInput.value || '1' : '';
  };

  if (convidadosSelect) {
    convidadosSelect.addEventListener('change', setQuantityVisibility);
    setQuantityVisibility();
  }

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) => (c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`));
    }
    return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => (c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`));
  };

  if (whatsappInput) {
    whatsappInput.addEventListener('input', (event) => {
      event.target.value = formatPhone(event.target.value);
    });
  }

  const normalizePhone = (value) => value.replace(/\D/g, '').slice(-11);

  const getStoredConfirmations = () => {
    const raw = localStorage.getItem(config.storageKey);
    if (!raw) {
      return [];
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Não foi possível ler as confirmações salvas localmente.', error);
      return [];
    }
  };

  const saveConfirmation = (record) => {
    const current = getStoredConfirmations();
    current.push(record);
    localStorage.setItem(config.storageKey, JSON.stringify(current));
  };

  const showMessage = (message, isError = false) => {
    formMessage.textContent = message;
    formMessage.style.color = isError ? '#ffb3b3' : '#f0c96b';
  };

  const buildSuccessMarkup = (record) => {
    const totalParticipants = Number(record.quantidadeConvidados || 0) + 1;
    return `
      <div class="confirmation__success">
        <h3>Presença confirmada com excelência</h3>
        <p>Olá, ${record.nomeCompleto}! Sua presença foi registrada com sucesso para o evento.</p>
        <p>Total de participantes: <strong>${totalParticipants}</strong></p>
        <div class="button-group">
          <button class="button" type="button" data-action="agenda">Adicionar à agenda</button>
          <button class="button button--ghost" type="button" data-action="location">Abrir localização</button>
          <button class="button button--ghost" type="button" data-action="share">Compartilhar</button>
        </div>
      </div>
    `;
  };

  const handleAction = (action) => {
    if (action === 'agenda') {
      const startDate = '20260808T170000';
      const endDate = '20260808T210000';
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(config.eventName)}&details=${encodeURIComponent(config.address)}&location=${encodeURIComponent(config.address)}&dates=${startDate}/${endDate}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'location') {
      window.open(config.googleMapsUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action === 'share') {
      const data = {
        title: config.eventName,
        text: `${config.eventName} — ${config.address}`,
        url: window.location.href
      };
      if (navigator.share) {
        navigator.share(data).catch(() => undefined);
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(`${data.text} ${data.url}`).then(() => showMessage('Link copiado para a área de transferência.'));
      }
    }
  };

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => handleAction(button.getAttribute('data-action')));
  });

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const nomeCompleto = (data.nome || '').trim();
      const whatsapp = (data.whatsapp || '').trim();
      const igreja = (data.igreja || '').trim();
      const primeiraVez = data.primeiraVez || '';
      const participaCoquetel = data.coquetel || '';
      const levaConvidados = data.convidados || '';
      const quantidadeConvidados = Number(data.quantidadeConvidados || 0);
      const observacao = (data.observacao || '').trim();
      const consentimento = form.querySelector('#consentimento').checked;

      if (!nomeCompleto || !whatsapp || !primeiraVez || !participaCoquetel || !levaConvidados || !consentimento) {
        showMessage('Preencha todos os campos obrigatórios e aceite o consentimento.', true);
        return;
      }

      if (levaConvidados === 'Sim' && (!quantidadeConvidados || quantidadeConvidados < 1)) {
        showMessage('Informe a quantidade de convidados.', true);
        return;
      }

      if (normalizePhone(whatsapp).length < 10) {
        showMessage('Informe um WhatsApp válido com DDD e número.', true);
        return;
      }

      const record = {
        id: crypto.randomUUID(),
        nomeCompleto,
        whatsapp,
        igreja,
        primeiraVez,
        participaCoquetel,
        levaConvidados,
        quantidadeConvidados: levaConvidados === 'Sim' ? quantidadeConvidados : 0,
        observacao,
        consentimento,
        criadoEm: new Date().toISOString()
      };

      submitButton.disabled = true;
      submitButton.textContent = 'Enviando...';

      try {
        await window.MAFDSupabase.salvarConfirmacao({
          nome_completo: nomeCompleto,
          whatsapp: normalizePhone(whatsapp),
          igreja,
          primeira_vez: primeiraVez,
          participa_coquetel: participaCoquetel,
          leva_convidados: levaConvidados,
          quantidade_convidados: record.quantidadeConvidados,
          observacao,
          consentimento
        });

        saveConfirmation({ ...record, status: 'confirmed' });
        form.reset();
        setQuantityVisibility();
        showMessage('Confirmação enviada com sucesso.');
        summary.innerHTML = buildSuccessMarkup(record);
        summary.querySelectorAll('[data-action]').forEach((button) => {
          button.addEventListener('click', () => handleAction(button.getAttribute('data-action')));
        });
        summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) {
        console.error('Erro completo ao registrar presença:', error);
        saveConfirmation({ ...record, status: 'pending' });
        showMessage(
          error.isDuplicate
            ? 'Este WhatsApp já possui uma confirmação registrada.'
            : 'Não foi possível registrar sua presença agora. Verifique sua conexão e tente novamente.',
          true
        );
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    });
  }

  const updateCountdown = () => {
    const countdown = document.getElementById('countdown');
    if (!countdown) {
      return;
    }

    const targetTime = new Date(config.date).getTime();
    const now = Date.now();
    const distance = targetTime - now;

    if (distance <= 0) {
      countdown.innerHTML = '<div class="countdown__item countdown__item--full"><strong>O grande dia chegou</strong><span>08/08/2026 · 17h</span></div>';
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    countdown.querySelector('[data-unit="days"]').textContent = String(days).padStart(2, '0');
    countdown.querySelector('[data-unit="hours"]').textContent = String(hours).padStart(2, '0');
    countdown.querySelector('[data-unit="minutes"]').textContent = String(minutes).padStart(2, '0');
    countdown.querySelector('[data-unit="seconds"]').textContent = String(seconds).padStart(2, '0');
  };

  updateCountdown();
  window.setInterval(updateCountdown, 1000);

  window.addEventListener('scroll', () => {
    if (header) {
      header.classList.toggle('is-scrolled', window.scrollY > 18);
    }
    backToTopButton.classList.toggle('is-visible', window.scrollY > 500);
  });

  backToTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
