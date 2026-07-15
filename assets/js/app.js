document.addEventListener('DOMContentLoaded', () => {
  const config = window.MAFD_CONFIG;
  const form = document.getElementById('confirmation-form');
  const formMessage = document.getElementById('form-message');
  const summary = document.getElementById('confirmation-summary');
  const confirmationSection = document.getElementById('confirmacao');
  const confirmationLayout = confirmationSection?.querySelector('.confirmation__layout');
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

  const generateUuid = () => {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  const getPublicBaseUrl = () => {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      || window.location.protocol === 'file:';
    if (!isLocal && config.publicSiteUrl) {
      return new URL(config.publicSiteUrl);
    }
    return new URL('./', window.location.href);
  };

  const buildCheckinUrl = (token) => {
    const url = new URL('pages/checkin.html', getPublicBaseUrl());
    const params = new URLSearchParams({ token });
    url.search = params.toString();
    return url.toString();
  };

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

  let activeReceipt = null;

  const addLogoToQr = (canvas) => new Promise((resolve) => {
    const logo = new Image();
    logo.onload = () => {
      try {
        const context = canvas.getContext('2d');
        const logoSize = Math.round(canvas.width * 0.18);
        const protection = Math.round(canvas.width * 0.025);
        const boxSize = logoSize + protection * 2;
        const boxX = Math.round((canvas.width - boxSize) / 2);
        const boxY = Math.round((canvas.height - boxSize) / 2);
        context.fillStyle = '#fffaf0';
        if (typeof context.roundRect === 'function') {
          context.beginPath();
          context.roundRect(boxX, boxY, boxSize, boxSize, Math.round(canvas.width * 0.02));
          context.fill();
        } else {
          context.fillRect(boxX, boxY, boxSize, boxSize);
        }
        const scale = Math.min(logoSize / logo.naturalWidth, logoSize / logo.naturalHeight);
        const width = Math.round(logo.naturalWidth * scale);
        const height = Math.round(logo.naturalHeight * scale);
        context.drawImage(logo, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
      } catch (error) {
        console.warn('Não foi possível inserir a logomarca no QR Code.', error);
      }
      resolve();
    };
    logo.onerror = () => resolve();
    logo.src = 'assets/img/logo-rede-homens.jpeg';
  });

  const buildSuccessMarkup = (record) => {
    const totalParticipants = Number(record.quantidadeConvidados || 0) + 1;
    const shortCode = record.checkinToken.replace(/-/g, '').slice(0, 8).toUpperCase();
    return `
      <div class="digital-receipt" tabindex="-1">
        <span class="digital-receipt__seal">PRESENÇA CONFIRMADA</span>
        <h3>Seu acesso está garantido</h3>
        <p class="digital-receipt__greeting">Olá, <strong data-receipt-name></strong>. Sua confirmação foi registrada com sucesso.</p>
        <div class="digital-receipt__event">
          <strong>Festa de Crente... Com Homens de Deus</strong>
          <span>08 de agosto de 2026 · 17h às 21h</span>
          <span>MAFD — Ministério Apostólico Fortaleza de Davi</span>
          <span>Total de participantes: <strong>${totalParticipants}</strong></span>
        </div>
        <div class="digital-receipt__qr" id="receipt-qr" aria-label="QR Code individual para check-in"></div>
        <p class="digital-receipt__qr-status" id="receipt-qr-status" role="status"></p>
        <p class="digital-receipt__instruction">Apresente este QR Code na entrada do evento para realizar seu check-in e garantir sua participação no sorteio dos brindes.</p>
        <p class="digital-receipt__warning">Este código é individual. Evite compartilhá-lo com outras pessoas.</p>
        <span class="digital-receipt__code">Código: ${shortCode.slice(0, 4)}-${shortCode.slice(4)}</span>
        <div class="button-group digital-receipt__actions">
          <button class="button" type="button" data-action="download">Baixar comprovante</button>
          <button class="button button--ghost" type="button" data-action="share-receipt">Compartilhar confirmação</button>
          <button class="button button--ghost" type="button" data-action="agenda">Adicionar à agenda</button>
          <button class="button button--ghost" type="button" data-action="location">Abrir localização</button>
          <button class="button button--ghost" type="button" data-action="new-registration">Fazer outra inscrição</button>
        </div>
      </div>
    `;
  };

  const safeFilename = (name) => name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'participante';

  const getQrCanvas = () => summary.querySelector('#receipt-qr canvas');

  const createReceiptPng = () => {
    const qrCanvas = getQrCanvas();
    if (!qrCanvas || !activeReceipt) {
      throw new Error('QR Code indisponível para gerar o comprovante.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1180;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fffaf0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#17130a';
    context.textAlign = 'center';
    context.font = '700 42px Inter, sans-serif';
    context.fillText('Festa de Crente... Com Homens de Deus', 450, 95);
    context.font = '600 30px Inter, sans-serif';
    context.fillText('08 de agosto de 2026 · 17h às 21h', 450, 150);
    context.drawImage(qrCanvas, 190, 220, 520, 520);
    context.font = '600 27px Inter, sans-serif';
    context.fillText('Apresente este QR Code na entrada do evento para realizar seu check-in e garantir sua participação no sorteio dos brindes.', 450, 825);
    context.font = '24px Inter, sans-serif';
    context.fillText('MAFD — Ministério Apostólico Fortaleza de Davi', 450, 890);
    return canvas;
  };

  const baixarComprovante = () => {
    try {
      const canvas = createReceiptPng();
      const link = document.createElement('a');
      link.download = `ingresso-mafd-${safeFilename(activeReceipt.nomeCompleto)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      showMessage(error.message, true);
    }
  };

  window.baixarComprovante = baixarComprovante;

  const resetRegistration = () => {
    activeReceipt = null;
    form.reset();
    form.querySelectorAll('input, select, textarea, button').forEach((field) => { field.disabled = false; });
    setQuantityVisibility();
    showMessage('');
    summary.innerHTML = '<h3>Resumo elegante</h3><p>Após o envio, você receberá uma confirmação visual com o total de participantes e links prontos para compartilhar.</p><div class="summary-badges"><span>Presença assegurada</span><span>Coquetel incluso</span><span>Comunhão especial</span></div>';
    confirmationSection?.classList.remove('is-confirmed');
    confirmationLayout?.classList.remove('is-receipt-only');
    form.querySelector('button[type="submit"]').textContent = 'Confirmar minha presença';
    form.querySelector('#nome').focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAction = async (action) => {
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

    if (action === 'download') {
      baixarComprovante();
      return;
    }

    if (action === 'new-registration') {
      resetRegistration();
      return;
    }

    if (action === 'share-receipt' && activeReceipt) {
      const text = `${config.eventName} — 08 de agosto de 2026, das 17h às 21h.`;
      const shareData = { title: 'Confirmação MAFD Eventos', text, url: config.publicSiteUrl };
      try {
        let file = null;
        try {
          const canvas = createReceiptPng();
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          file = blob ? new File([blob], `ingresso-mafd-${safeFilename(activeReceipt.nomeCompleto)}.png`, { type: 'image/png' }) : null;
        } catch (_) {
          file = null;
        }
        if (navigator.share) {
          if (file && navigator.canShare?.({ files: [file] })) shareData.files = [file];
          await navigator.share(shareData);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(`${text} ${config.publicSiteUrl}`);
          showMessage('Mensagem e link copiados para a área de transferência.');
        } else {
          window.prompt('Copie a confirmação:', `${text} ${config.publicSiteUrl}`);
        }
      } catch (error) {
        if (error.name !== 'AbortError') showMessage('Não foi possível compartilhar agora.', true);
      }
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

      const checkinToken = generateUuid();
      const record = {
        id: generateUuid(),
        nomeCompleto,
        whatsapp,
        igreja,
        primeiraVez,
        participaCoquetel,
        levaConvidados,
        quantidadeConvidados: levaConvidados === 'Sim' ? quantidadeConvidados : 0,
        observacao,
        consentimento,
        criadoEm: new Date().toISOString(),
        checkinToken
      };

      submitButton.disabled = true;
      submitButton.textContent = 'Enviando...';

      try {
        const result = await window.MAFDSupabase.salvarConfirmacao({
          nome_completo: nomeCompleto,
          whatsapp: normalizePhone(whatsapp),
          igreja,
          primeira_vez: primeiraVez,
          participa_coquetel: participaCoquetel,
          leva_convidados: levaConvidados,
          quantidade_convidados: record.quantidadeConvidados,
          observacao,
          consentimento,
          checkin_token: checkinToken
        });

        if (!result?.sucesso || result.checkinToken !== checkinToken) {
          throw new Error('O servidor não confirmou o token do comprovante.');
        }

        saveConfirmation({ ...record, checkinToken: undefined, status: 'confirmed' });
        activeReceipt = { ...record, checkinUrl: buildCheckinUrl(result.checkinToken) };
        showMessage('Confirmação enviada com sucesso.');
        summary.innerHTML = buildSuccessMarkup(activeReceipt);
        confirmationSection?.classList.add('is-confirmed');
        confirmationLayout?.classList.add('is-receipt-only');
        summary.querySelector('[data-receipt-name]').textContent = nomeCompleto;
        const qrStatus = summary.querySelector('#receipt-qr-status');
        if (typeof window.QRCode === 'function') {
          const receiptActions = summary.querySelectorAll('[data-action="download"], [data-action="share-receipt"]');
          receiptActions.forEach((button) => { button.disabled = true; });
          new window.QRCode(summary.querySelector('#receipt-qr'), {
            text: activeReceipt.checkinUrl,
            width: 320,
            height: 320,
            colorDark: '#211b0d',
            colorLight: '#fffaf0',
            correctLevel: window.QRCode.CorrectLevel.H
          });
          const qrCanvas = getQrCanvas();
          if (qrCanvas) await addLogoToQr(qrCanvas);
          receiptActions.forEach((button) => { button.disabled = false; });
          qrStatus.textContent = '';
        } else {
          qrStatus.textContent = 'QR Code temporariamente indisponível. Sua confirmação continua válida.';
        }
        summary.querySelectorAll('[data-action]').forEach((button) => {
          button.addEventListener('click', () => handleAction(button.getAttribute('data-action')));
        });
        summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) {
        console.error('Erro completo ao registrar presença:', error);
        showMessage(
          error.isDuplicate
            ? 'Este WhatsApp já possui uma confirmação registrada.'
            : 'Não foi possível registrar sua presença agora. Verifique sua conexão e tente novamente.',
          true
        );
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
