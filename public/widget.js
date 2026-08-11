/* Brain widget — Fastline InfinitiQ. Osadzenie:
   <script src="https://brain.fastlineinfinitiq.pl/widget.js" data-key="…" data-color="#B8FF00"
           data-icon="#0d0d0d" data-bg="#0D0D0D" data-position="left" async></script>
   data-color  = kolor przycisku i akcentów okna
   data-icon   = kolor ikony SVG na przycisku (domyślnie auto-kontrast)
   data-bg     = kolor tła okna czatu (domyślnie ciemne #0D0D0D)
   Tryb WhatsApp: data-mode="whatsapp" data-phone="48600000000". */
(function () {
  'use strict';
  var s = document.currentScript;
  if (!s) return;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var KEY = s.getAttribute('data-key') || '';
  var COLOR = s.getAttribute('data-color') || '#B8FF00';
  if (!HEX.test(COLOR)) COLOR = '#B8FF00';
  var POS = s.getAttribute('data-position') === 'right' ? 'right' : 'left';
  var MODE = s.getAttribute('data-mode') === 'whatsapp' ? 'whatsapp' : 'chat';
  var PHONE = (s.getAttribute('data-phone') || '').replace(/[^\d]/g, '');
  var ORIGIN = 'https://brain.fastlineinfinitiq.pl';
  if (MODE === 'chat' && !KEY) return;

  function ink(hex) {
    return parseInt(hex.slice(1), 16) > 0x7fffff ? '#0d0d0d' : '#ffffff';
  }
  var ICON = s.getAttribute('data-icon') || '';
  if (!HEX.test(ICON)) ICON = ink(COLOR);
  var BG = s.getAttribute('data-bg') || '';
  if (!HEX.test(BG)) BG = '#0D0D0D';

  var css =
    '.fiqb-btn{position:fixed;bottom:20px;' + POS + ':20px;width:58px;height:58px;border-radius:50%;' +
    'background:' + COLOR + ';color:' + ICON + ';border:none;cursor:pointer;z-index:2147483000;' +
    'display:flex;align-items:center;justify-content:center;box-shadow:0 8px 28px rgba(0,0,0,.35);' +
    'transition:transform .18s cubic-bezier(.22,1,.36,1)}' +
    '.fiqb-btn:hover{transform:scale(1.07)}' +
    '.fiqb-btn svg{width:26px;height:26px;pointer-events:none}' +
    /* genie: okno "wysysa się" z przycisku przy otwarciu i "zasysa" z powrotem przy zamknięciu */
    '.fiqb-frame{position:fixed;bottom:90px;' + POS + ':20px;width:378px;height:600px;max-width:calc(100vw - 32px);' +
    'max-height:calc(100vh - 110px);border:1px solid rgba(128,128,128,.25);border-radius:0;z-index:2147483000;' +
    'box-shadow:0 24px 64px rgba(0,0,0,.45);background:' + BG + ';opacity:0;pointer-events:none;' +
    'transform:translateY(46px) scale(.04);transform-origin:' + (POS === 'right' ? '92%' : '8%') + ' 100%;' +
    'transition:opacity .3s cubic-bezier(.32,.72,.3,1), transform .42s cubic-bezier(.3,1.25,.32,1)}' +
    '.fiqb-frame.on{opacity:1;transform:none;pointer-events:auto}' +
    '.fiqb-frame.off{transition:opacity .26s cubic-bezier(.6,0,.8,.4), transform .32s cubic-bezier(.6,-.05,.75,.25)}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var CHAT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>';
  var WA_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M9 8.5c0 4 2.5 6.5 6.5 6.5l.8-1.8-2.3-1-.9.9c-1-.5-1.7-1.2-2.2-2.2l.9-.9-1-2.3z" stroke-width="1.4"/></svg>';
  var X_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var btn = document.createElement('button');
  btn.className = 'fiqb-btn';
  btn.setAttribute('aria-label', MODE === 'whatsapp' ? 'WhatsApp' : 'Czat');
  btn.innerHTML = MODE === 'whatsapp' ? WA_SVG : CHAT_SVG;
  document.body.appendChild(btn);

  if (MODE === 'whatsapp') {
    btn.addEventListener('click', function () {
      window.open('https://wa.me/' + PHONE, '_blank', 'noopener');
    });
    return;
  }

  var frame = null;
  var open = false;
  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    if (open && !frame) {
      frame = document.createElement('iframe');
      frame.className = 'fiqb-frame';
      frame.title = 'Czat z asystentem AI';
      frame.src =
        ORIGIN + '/w?key=' + encodeURIComponent(KEY) + '&color=' + encodeURIComponent(COLOR) +
        '&bg=' + encodeURIComponent(BG);
      document.body.appendChild(frame);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          frame.classList.add('on');
        });
      });
    } else if (frame) {
      frame.classList.toggle('off', !open); // krzywa "zasysania" przy zamykaniu
      frame.classList.toggle('on', open);
    }
    btn.innerHTML = open ? X_SVG : CHAT_SVG;
  }
  btn.addEventListener('click', function () {
    toggle();
  });
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.brain === 'close') toggle(false);
  });
})();
