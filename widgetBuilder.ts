// Builds the self-contained embeddable floating attendance widget script (/widget.js)
// and a standalone demo host webpage (/widget-demo) so users can test external embedding live.

export function buildEmbedWidgetJs(defaultOrigin: string): string {
  return `(function () {
  if (window.__CR_WIDGET_MOUNTED__) return;
  window.__CR_WIDGET_MOUNTED__ = true;

  var scriptEl = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('widget.js') !== -1) return scripts[i];
    }
    return null;
  })();

  var cfg = window.ChatRouletteWidgetConfig || {};
  var origin = cfg.origin || (scriptEl && scriptEl.src ? new URL(scriptEl.src, window.location.href).origin : ${JSON.stringify(defaultOrigin)});
  var ownerCode = (cfg.code || (scriptEl && scriptEl.getAttribute('data-code')) || '#CR-849201').trim();
  var position = (cfg.position || (scriptEl && scriptEl.getAttribute('data-position')) || 'left').toLowerCase() === 'right' ? 'right' : 'left';
  var accent = cfg.accent || (scriptEl && scriptEl.getAttribute('data-accent')) || '#10b981';
  var title = cfg.title || (scriptEl && scriptEl.getAttribute('data-title')) || 'Atendimento Online';
  var subtitle = cfg.subtitle || (scriptEl && scriptEl.getAttribute('data-subtitle')) || 'Fale agora por áudio ou chat com nossa equipe';
  var buttonText = cfg.buttonText || (scriptEl && scriptEl.getAttribute('data-button-text')) || 'Atendimento';

  var host = document.createElement('div');
  host.id = 'cr-attendance-widget-root';
  host.style.cssText = 'position:fixed;z-index:2147483647;bottom:20px;' + (position === 'right' ? 'right:20px;' : 'left:20px;') + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
  document.body.appendChild(host);

  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var isRight = position === 'right';
  var style = document.createElement('style');
  style.textContent = [
    ':host, * { box-sizing: border-box; font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
    '.cr-wrap { position: relative; display: flex; flex-direction: column; align-items: ' + (isRight ? 'flex-end' : 'flex-start') + '; gap: 12px; }',
    '.cr-fab { display: inline-flex; align-items: center; gap: 10px; padding: 13px 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: linear-gradient(135deg, ' + accent + ', #0f172a); color: #ffffff; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 14px 34px rgba(0,0,0,0.34); transition: transform .18s ease, box-shadow .18s ease; }',
    '.cr-fab:hover { transform: translateY(-2px); box-shadow: 0 18px 40px rgba(0,0,0,0.42); }',
    '.cr-dot { width: 9px; height: 9px; border-radius: 50%; background: #34d399; box-shadow: 0 0 0 4px rgba(52,211,153,0.22); flex-shrink: 0; }',
    '.cr-card { width: min(360px, calc(100vw - 32px)); background: #0f172a; color: #f8fafc; border: 1px solid rgba(148,163,184,0.22); border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px rgba(2,6,23,0.58); display: none; flex-direction: column; }',
    '.cr-card.open { display: flex; animation: crPop .18s cubic-bezier(.16,1,.3,1); }',
    '@keyframes crPop { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }',
    '.cr-head { padding: 16px 18px; background: linear-gradient(135deg, rgba(16,185,129,0.22), rgba(15,23,42,0.96)); border-bottom: 1px solid rgba(148,163,184,0.16); display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }',
    '.cr-head h4 { margin: 0; font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -0.01em; }',
    '.cr-head p { margin: 4px 0 0; font-size: 12px; color: #cbd5e1; line-height: 1.4; }',
    '.cr-close { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #e2e8f0; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
    '.cr-close:hover { background: rgba(255,255,255,0.16); }',
    '.cr-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 11px; }',
    '.cr-field label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 4px; }',
    '.cr-field input, .cr-field textarea { width: 100%; background: #020617; border: 1px solid #334155; border-radius: 10px; padding: 9px 12px; color: #f8fafc; font-size: 13px; outline: none; transition: border-color .15s; }',
    '.cr-field input:focus, .cr-field textarea:focus { border-color: ' + accent + '; }',
    '.cr-field textarea { resize: none; min-height: 62px; }',
    '.cr-submit { width: 100%; padding: 11px 16px; border: none; border-radius: 11px; background: ' + accent + '; color: #022c22; font-size: 13px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: filter .15s, transform .15s; }',
    '.cr-submit:hover { filter: brightness(1.08); }',
    '.cr-submit:disabled { opacity: 0.6; cursor: wait; }',
    '.cr-err { background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.35); color: #fca5a5; border-radius: 10px; padding: 8px 10px; font-size: 12px; display: none; }',
    '.cr-call { padding: 16px 18px; display: none; flex-direction: column; gap: 12px; }',
    '.cr-call.active { display: flex; }',
    '.cr-status-box { background: #020617; border: 1px solid rgba(148,163,184,0.18); border-radius: 14px; padding: 14px; text-align: center; }',
    '.cr-badge { display: inline-block; font-size: 11px; font-weight: 700; color: #34d399; margin-bottom: 6px; }',
    '.cr-timer { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 20px; font-weight: 800; color: #fff; margin: 4px 0; }',
    '.cr-sub { font-size: 12px; color: #94a3b8; margin: 0; }',
    '.cr-controls { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }',
    '.cr-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: #f8fafc; font-size: 12px; font-weight: 700; cursor: pointer; }',
    '.cr-btn.hangup { background: #dc2626; border-color: #ef4444; color: #fff; }',
    '.cr-chat-log { height: 150px; overflow-y: auto; background: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }',
    '.cr-msg { max-width: 85%; padding: 7px 10px; border-radius: 10px; font-size: 12px; line-height: 1.4; word-break: break-word; }',
    '.cr-msg.me { align-self: flex-end; background: ' + accent + '; color: #022c22; font-weight: 600; }',
    '.cr-msg.peer { align-self: flex-start; background: #1e293b; color: #f8fafc; }',
    '.cr-chat-form { display: flex; gap: 6px; }',
    '.cr-chat-form input { flex: 1; background: #020617; border: 1px solid #334155; border-radius: 10px; padding: 8px 10px; color: #fff; font-size: 12px; outline: none; }',
    '.cr-chat-form button { padding: 8px 12px; border: none; border-radius: 10px; background: ' + accent + '; color: #022c22; font-weight: 800; font-size: 12px; cursor: pointer; }'
  ].join('\\n');
  shadow.appendChild(style);

  var wrap = document.createElement('div');
  wrap.className = 'cr-wrap';
  wrap.innerHTML = [
    '<div class="cr-card" id="cr-card">',
    '  <div class="cr-head">',
    '    <div><h4 id="cr-title"></h4><p id="cr-subtitle"></p></div>',
    '    <button type="button" class="cr-close" id="cr-close" aria-label="Fechar">&times;</button>',
    '  </div>',
    '  <form class="cr-body" id="cr-form">',
    '    <div class="cr-err" id="cr-err"></div>',
    '    <div class="cr-field"><label>Nome completo</label><input type="text" id="cr-name" required placeholder="Seu nome" /></div>',
    '    <div class="cr-field"><label>WhatsApp</label><input type="tel" id="cr-whatsapp" required placeholder="(11) 99999-9999" /></div>',
    '    <div class="cr-field"><label>E-mail</label><input type="email" id="cr-email" required placeholder="voce@email.com" /></div>',
    '    <div class="cr-field"><label>Mensagem curta</label><textarea id="cr-message" required placeholder="Como podemos ajudar você hoje?"></textarea></div>',
    '    <button type="submit" class="cr-submit" id="cr-submit"><span>Enviar e Chamar por Áudio</span></button>',
    '  </form>',
    '  <div class="cr-call" id="cr-call">',
    '    <div class="cr-status-box">',
    '      <div class="cr-badge" id="cr-call-label">Conectando atendimento...</div>',
    '      <div class="cr-timer" id="cr-call-timer">Chamando...</div>',
    '      <p class="cr-sub" id="cr-call-sub">Aguardando o atendente aceitar sua chamada de áudio.</p>',
    '      <div class="cr-controls">',
    '        <button type="button" class="cr-btn" id="cr-mute-btn">Silenciar Mic</button>',
    '        <button type="button" class="cr-btn" id="cr-mic-enable" style="display:none;background:#0284c7;border-color:#38bdf8;color:#fff;">Ativar Microfone</button>',
    '        <button type="button" class="cr-btn" id="cr-audio-unlock" style="display:none;background:#059669;border-color:#10b981;color:#fff;">Ouvir Áudio</button>',
    '        <button type="button" class="cr-btn hangup" id="cr-hangup-btn">Encerrar</button>',
    '      </div>',
    '    </div>',
    '    <div class="cr-chat-log" id="cr-chat-log"></div>',
    '    <form class="cr-chat-form" id="cr-chat-form">',
    '      <input type="text" id="cr-chat-input" placeholder="Enviar mensagem no chat..." />',
    '      <button type="submit">Enviar</button>',
    '    </form>',
    '  </div>',
    '</div>',
    '<button type="button" class="cr-fab" id="cr-fab">',
    '  <span class="cr-dot"></span>',
    '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    '  <span id="cr-fab-text"></span>',
    '</button>'
  ].join('');
  shadow.appendChild(wrap);

  var card = shadow.getElementById('cr-card');
  var fab = shadow.getElementById('cr-fab');
  var closeBtn = shadow.getElementById('cr-close');
  var form = shadow.getElementById('cr-form');
  var errBox = shadow.getElementById('cr-err');
  var submitBtn = shadow.getElementById('cr-submit');
  var callPane = shadow.getElementById('cr-call');
  var callLabel = shadow.getElementById('cr-call-label');
  var callTimer = shadow.getElementById('cr-call-timer');
  var callSub = shadow.getElementById('cr-call-sub');
  var muteBtn = shadow.getElementById('cr-mute-btn');
  var micEnableBtn = shadow.getElementById('cr-mic-enable');
  var audioUnlockBtn = shadow.getElementById('cr-audio-unlock');
  var hangupBtn = shadow.getElementById('cr-hangup-btn');
  var chatLog = shadow.getElementById('cr-chat-log');
  var chatForm = shadow.getElementById('cr-chat-form');
  var chatInput = shadow.getElementById('cr-chat-input');

  shadow.getElementById('cr-title').textContent = title;
  shadow.getElementById('cr-subtitle').textContent = subtitle;
  shadow.getElementById('cr-fab-text').textContent = buttonText;

  var remoteAudio = document.createElement('audio');
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  remoteAudio.muted = false;
  remoteAudio.volume = 1.0;
  remoteAudio.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  shadow.appendChild(remoteAudio);

  audioUnlockBtn.addEventListener('click', function () {
    remoteAudio.muted = false;
    remoteAudio.volume = 1.0;
    remoteAudio.play().then(function () {
      audioUnlockBtn.style.display = 'none';
    }).catch(function () {});
  });

  var socket = null;
  var pc = null;
  var localStream = null;
  var hasRealMic = false;
  var earlyCandidates = [];
  var activeCallId = null;
  var activeRoomId = null;
  var peerSocketId = null;
  var timerInt = null;
  var pollInt = null;
  var isMuted = false;
  var isCallAccepted = false;
  var visitorName = 'Cliente';
  var seenMsgIds = {};
  var pendingPayload = null;
  var callRequestSent = false;

  function appendChatMsg(text, isMe, sender, msgId) {
    if (msgId) {
      if (seenMsgIds[msgId]) return;
      seenMsgIds[msgId] = true;
    }
    var div = document.createElement('div');
    div.className = 'cr-msg ' + (isMe ? 'me' : 'peer');
    div.textContent = (sender && !isMe ? sender + ': ' : '') + text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function formatSec(sec) {
    var m = Math.floor(sec / 60).toString().padStart(2, '0');
    var s = (sec % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function stopHttpPoll() {
    if (pollInt) { clearInterval(pollInt); pollInt = null; }
  }

  function resetCallState() {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    stopHttpPoll();
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }
    hasRealMic = false;
    earlyCandidates = [];
    activeCallId = null;
    activeRoomId = null;
    peerSocketId = null;
    isCallAccepted = false;
    callRequestSent = false;
    pendingPayload = null;
    seenMsgIds = {};
    isMuted = false;
    muteBtn.textContent = 'Silenciar Mic';
    micEnableBtn.style.display = 'none';
    audioUnlockBtn.style.display = 'none';
    callPane.classList.remove('active');
    form.style.display = 'flex';
    submitBtn.disabled = false;
  }

  function loadSocketIo(cb) {
    if (window.io) return cb(window.io);
    var s = document.createElement('script');
    s.src = origin + '/socket.io/socket.io.js';
    s.async = true;
    s.onload = function () { cb(window.io); };
    s.onerror = function () { cb(null); };
    document.head.appendChild(s);
  }

  function getAudioFallbackStream() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return new MediaStream();
      var ctx = new Ctx();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      var dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();
      return dest.stream;
    } catch (e) {
      return new MediaStream();
    }
  }

  function applyRealMicStream(realStream) {
    if (!realStream) return;
    var realTrack = realStream.getAudioTracks && realStream.getAudioTracks()[0];
    if (!realTrack) return;

    var prevStream = localStream;
    localStream = realStream;
    hasRealMic = true;
    isMuted = false;
    muteBtn.textContent = 'Silenciar Mic';
    micEnableBtn.style.display = 'none';

    if (prevStream && prevStream !== realStream) {
      prevStream.getTracks().forEach(function (t) {
        if (t !== realTrack) { try { t.stop(); } catch (e) {} }
      });
    }

    if (pc) {
      var audioSender = null;
      var senders = pc.getSenders ? pc.getSenders() : [];
      for (var i = 0; i < senders.length; i++) {
        if (senders[i].track && senders[i].track.kind === 'audio') {
          audioSender = senders[i];
          break;
        }
      }
      if (!audioSender && pc.getTransceivers) {
        var trans = pc.getTransceivers();
        for (var j = 0; j < trans.length; j++) {
          var t = trans[j];
          if ((t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') || (t.sender && !t.sender.track)) {
            audioSender = t.sender;
            break;
          }
        }
      }
      if (audioSender && audioSender.replaceTrack) {
        audioSender.replaceTrack(realTrack).catch(function (err) {
          console.warn('[WidgetWebRTC] replaceTrack warning:', err);
        });
      } else {
        try { pc.addTrack(realTrack, realStream); } catch (e) {}
      }
    }
  }

  function getMicStream() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      var rawMicPromise = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });

      // Keep real mic attachment hooked even if permission prompt takes > 4s
      rawMicPromise.then(function (realStream) {
        applyRealMicStream(realStream);
      }).catch(function () {
        hasRealMic = false;
        micEnableBtn.style.display = 'inline-block';
      });

      return Promise.race([
        rawMicPromise.catch(function () { return getAudioFallbackStream(); }),
        new Promise(function (resolve) {
          setTimeout(function () {
            if (!hasRealMic) {
              micEnableBtn.style.display = 'inline-block';
              resolve(getAudioFallbackStream());
            }
          }, 4000);
        })
      ]);
    }
    micEnableBtn.style.display = 'inline-block';
    return Promise.resolve(getAudioFallbackStream());
  }

  micEnableBtn.addEventListener('click', function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    }).then(function (realStream) {
      applyRealMicStream(realStream);
      callSub.textContent = 'Microfone ativado! Sua voz está conectada.';
    }).catch(function () {
      callSub.textContent = 'Permissão de microfone negada no navegador. Libere no ícone de cadeado da barra de endereço.';
    });
  });

  function startCallTimer() {
    var sec = 0;
    callTimer.textContent = '00:00';
    if (timerInt) clearInterval(timerInt);
    timerInt = setInterval(function () {
      sec++;
      callTimer.textContent = formatSec(sec);
    }, 1000);
  }

  function createPeerConnection(targetSocketId, roomId, isInitiator) {
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelay', credential: 'openrelay' }
      ],
      iceCandidatePoolSize: 2,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    if (localStream && localStream.getAudioTracks().length > 0) {
      localStream.getAudioTracks().forEach(function (track) {
        try {
          pc.addTrack(track, localStream);
        } catch (e) {}
      });
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (e) {}
    }

    pc.ontrack = function (ev) {
      var stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      remoteAudio.srcObject = stream;
      remoteAudio.muted = false;
      remoteAudio.volume = 1.0;
      remoteAudio.play().then(function () {
        audioUnlockBtn.style.display = 'none';
      }).catch(function () {
        audioUnlockBtn.style.display = 'inline-block';
      });
    };

    pc.onconnectionstatechange = function () {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        callLabel.textContent = 'Áudio P2P Conectado';
        callSub.textContent = hasRealMic
          ? 'Áudio ativo em tempo real. Você pode falar ou usar o chat abaixo.'
          : 'Ouvindo atendente. Clique em "Ativar Microfone" para falar.';
      } else if (pc.connectionState === 'connecting') {
        callSub.textContent = 'Sincronizando áudio P2P...';
      } else if (pc.connectionState === 'failed' && isInitiator && socket && socket.connected && targetSocketId) {
        pc.createOffer({ iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: false })
          .then(function (offer) {
            return pc.setLocalDescription(offer).then(function () {
              socket.emit('webrtc:offer', {
                toSocketId: targetSocketId,
                sdp: { type: offer.type, sdp: offer.sdp },
                roomId: roomId
              });
            });
          }).catch(function () {});
      }
    };

    pc.onicecandidate = function (ev) {
      if (ev.candidate && socket && socket.connected && targetSocketId) {
        var cand = ev.candidate.toJSON ? ev.candidate.toJSON() : {
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex
        };
        socket.emit('webrtc:ice_candidate', {
          toSocketId: targetSocketId,
          candidate: cand,
          roomId: roomId
        });
      }
    };

    if (isInitiator && socket && socket.connected && targetSocketId) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false })
        .then(function (offer) {
          return pc.setLocalDescription(offer).then(function () {
            socket.emit('webrtc:offer', {
              toSocketId: targetSocketId,
              sdp: { type: offer.type, sdp: offer.sdp },
              roomId: roomId
            });
          });
        })
        .catch(function (err) {
          console.warn('[WidgetWebRTC] Offer error:', err);
        });
    }
  }

  function startHttpStatePolling(callId) {
    stopHttpPoll();
    if (!callId) return;
    pollInt = setInterval(function () {
      if (!activeCallId || activeCallId !== callId) {
        stopHttpPoll();
        return;
      }
      fetch(origin + '/api/widget/call-state/' + encodeURIComponent(callId))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (st) {
          if (!st) return;
          if (st.roomId && !activeRoomId) activeRoomId = st.roomId;
          if (st.ownerSocketId && !peerSocketId) peerSocketId = st.ownerSocketId;

          if (Array.isArray(st.messages)) {
            st.messages.forEach(function (m) {
              var isMe = m.sender_code === 'WEB-CHAT' || m.sender_id === 'widget_visitor' || (socket && m.sender_id === socket.id);
              appendChatMsg(m.text, isMe, m.sender_name, m.id);
            });
          }

          if (st.status === 'accepted' && !isCallAccepted) {
            isCallAccepted = true;
            callLabel.textContent = (socket && socket.connected) ? 'Em Chamada de Áudio' : 'Atendimento Conectado (Chat)';
            callSub.textContent = (socket && socket.connected)
              ? 'Conectado em tempo real. Você pode falar ou usar o chat abaixo.'
              : 'Atendente conectado! Envie mensagens abaixo enquanto sincronizamos o áudio.';
            startCallTimer();
          } else if (st.status === 'rejected') {
            stopHttpPoll();
            callLabel.textContent = 'Chamada Recusada';
            callTimer.textContent = 'Indisponível';
            callSub.textContent = st.reason || 'Seus dados ficaram salvos para retorno.';
            if (timerInt) clearInterval(timerInt);
          } else if (st.status === 'ended') {
            resetCallState();
          }
        })
        .catch(function () {});
    }, 1400);
  }

  fab.addEventListener('click', function () {
    card.classList.toggle('open');
  });

  closeBtn.addEventListener('click', function () {
    card.classList.remove('open');
  });

  muteBtn.addEventListener('click', function () {
    if (!localStream) return;
    var tracks = localStream.getAudioTracks();
    if (tracks[0]) {
      tracks[0].enabled = !tracks[0].enabled;
      isMuted = !tracks[0].enabled;
      muteBtn.textContent = isMuted ? 'Ativar Mic' : 'Silenciar Mic';
    }
  });

  function notifyWidgetHangup(reason) {
    var cId = activeCallId;
    var rId = activeRoomId;
    if (socket && socket.connected && (cId || rId)) {
      socket.emit('call:hangup', {
        callId: cId,
        roomId: rId,
        targetSocketId: peerSocketId
      });
    }
    if (cId || rId) {
      try {
        fetch(origin + '/api/widget/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            callId: cId,
            roomId: rId,
            reason: reason || 'Cliente Saiu do Chat'
          })
        }).catch(function () {});
      } catch (e) {}
    }
  }

  hangupBtn.addEventListener('click', function () {
    notifyWidgetHangup('Cliente Saiu do Chat');
    resetCallState();
  });

  window.addEventListener('pagehide', function () {
    if (activeCallId && isCallAccepted && navigator.sendBeacon) {
      try {
        var blob = new Blob([JSON.stringify({
          callId: activeCallId,
          roomId: activeRoomId,
          reason: 'Cliente Saiu do Chat'
        })], { type: 'application/json' });
        navigator.sendBeacon(origin + '/api/widget/hangup', blob);
      } catch (e) {}
    }
  });

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var txt = (chatInput.value || '').trim();
    if (!txt) return;
    chatInput.value = '';
    if (socket && socket.connected && activeRoomId) {
      socket.emit('chat:message', {
        roomId: activeRoomId,
        callId: activeCallId,
        toSocketId: peerSocketId,
        text: txt,
        senderName: visitorName
      });
    } else if (activeCallId || activeRoomId) {
      fetch(origin + '/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: activeCallId,
          roomId: activeRoomId,
          text: txt,
          senderName: visitorName,
          senderRole: 'visitor'
        })
      })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.message) {
          appendChatMsg(data.message.text, true, visitorName, data.message.id);
        } else {
          appendChatMsg(txt, true, visitorName);
        }
      })
      .catch(function () {
        appendChatMsg(txt, true, visitorName);
      });
    } else {
      appendChatMsg(txt, true, visitorName);
    }
  });

  function sendHttpFallback(payload) {
    return fetch(origin + '/api/widget/call-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function showRingingPane(data, initialMessage, visitorLabelName) {
    activeCallId = data.callId;
    form.style.display = 'none';
    callPane.classList.add('active');
    callLabel.textContent = data.clientLabel + ' • Áudio';
    callTimer.textContent = data.ownerOnline === false ? 'Recebido!' : 'Chamando...';
    callSub.textContent = data.ownerOnline === false
      ? 'O atendente está offline no momento, mas seus dados ficaram salvos para retorno.'
      : 'Tocando no painel de ' + (data.ownerName || 'atendimento') + '...';
    chatLog.innerHTML = '';
    seenMsgIds = {};
    appendChatMsg('Solicitação enviada: "' + initialMessage + '"', true, visitorLabelName);
    if (data.ownerOnline !== false) {
      startHttpStatePolling(data.callId);
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;
    errBox.style.display = 'none';
    var name = shadow.getElementById('cr-name').value.trim();
    var whatsapp = shadow.getElementById('cr-whatsapp').value.trim();
    var email = shadow.getElementById('cr-email').value.trim();
    var message = shadow.getElementById('cr-message').value.trim();

    if (!name || !whatsapp || !email || !message) {
      errBox.textContent = 'Preencha todos os campos para iniciar o atendimento.';
      errBox.style.display = 'block';
      return;
    }

    visitorName = name;
    submitBtn.disabled = true;
    isCallAccepted = false;
    callRequestSent = false;

    // Unlock audio element synchronously inside user click gesture
    try { remoteAudio.load(); } catch (errLoad) {}

    var payload = {
      ownerCode: ownerCode,
      name: name,
      whatsapp: whatsapp,
      email: email,
      message: message,
      sourceUrl: window.location.href
    };
    pendingPayload = payload;

    getMicStream().then(function (stream) {
      localStream = stream;
      loadSocketIo(function (ioLib) {
        if (!ioLib) {
          callRequestSent = true;
          sendHttpFallback(payload).then(function (data) {
            showRingingPane(data, message, name);
          }).catch(function () {
            errBox.textContent = 'Não foi possível conectar ao servidor (' + origin + '). Verifique se a URL pública está acessível.';
            errBox.style.display = 'block';
            submitBtn.disabled = false;
          });
          return;
        }

        var responseReceived = false;
        var connectWatchdog = setTimeout(function () {
          if (responseReceived) return;
          callRequestSent = true;
          sendHttpFallback(payload).then(function (data) {
            responseReceived = true;
            showRingingPane(data, message, name);
            if (socket && socket.connected && data.callId) {
              socket.emit('widget:attach_call', { callId: data.callId });
            }
          }).catch(function () {
            errBox.textContent = 'Tempo esgotado ao conectar com ' + origin + '. Verifique se o servidor está online.';
            errBox.style.display = 'block';
            submitBtn.disabled = false;
          });
        }, 4500);

        if (!socket) {
          socket = ioLib(origin, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5,
            timeout: 8000
          });

          socket.on('connect', function () {
            if (activeCallId) {
              socket.emit('widget:attach_call', { callId: activeCallId });
            } else if (pendingPayload && !callRequestSent) {
              callRequestSent = true;
              socket.emit('widget:call_start', pendingPayload);
            }
          });

          socket.on('connect_error', function () {
            if (responseReceived || callRequestSent) return;
            callRequestSent = true;
            clearTimeout(connectWatchdog);
            sendHttpFallback(payload).then(function (data) {
              responseReceived = true;
              showRingingPane(data, message, name);
            }).catch(function () {
              errBox.textContent = 'Falha ao conectar em tempo real com ' + origin + '.';
              errBox.style.display = 'block';
              submitBtn.disabled = false;
            });
          });

          socket.on('widget:call_ringing', function (data) {
            responseReceived = true;
            clearTimeout(connectWatchdog);
            showRingingPane(data, message, name);
          });

          socket.on('widget:owner_offline', function (data) {
            responseReceived = true;
            clearTimeout(connectWatchdog);
            showRingingPane({
              callId: (data && data.lead && data.lead.id) || ('off_' + Date.now()),
              clientLabel: data.clientLabel,
              ownerOnline: false
            }, message, name);
          });

          socket.on('call:accepted', function (data) {
            isCallAccepted = true;
            activeCallId = data.callId || activeCallId;
            activeRoomId = data.roomId;
            peerSocketId = data.peerSocketId;
            callLabel.textContent = 'Em Chamada de Áudio';
            callSub.textContent = 'Conectado em tempo real. Você pode falar ou usar o chat abaixo.';
            startCallTimer();
            createPeerConnection(data.peerSocketId, data.roomId, data.isInitiator);
          });

          socket.on('webrtc:offer', function (payloadOffer) {
            var fromId = payloadOffer.fromSocketId || peerSocketId;
            var rId = payloadOffer.roomId || activeRoomId;
            if (!pc) createPeerConnection(fromId, rId, false);
            var handleOffer = function () {
              return pc.setRemoteDescription(new RTCSessionDescription(payloadOffer.sdp))
                .then(function () {
                  while (earlyCandidates.length > 0) {
                    var c = earlyCandidates.shift();
                    pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
                  }
                  return pc.createAnswer();
                })
                .then(function (ans) {
                  return pc.setLocalDescription(ans).then(function () {
                    socket.emit('webrtc:answer', {
                      toSocketId: fromId,
                      sdp: { type: ans.type, sdp: ans.sdp },
                      roomId: rId
                    });
                  });
                });
            };
            if (pc.signalingState !== 'stable' && pc.setLocalDescription) {
              pc.setLocalDescription({ type: 'rollback' }).catch(function () {}).then(handleOffer).catch(function (err) {
                console.warn('[WidgetWebRTC] Offer handle error:', err);
              });
            } else {
              handleOffer().catch(function (err) {
                console.warn('[WidgetWebRTC] Offer handle error:', err);
              });
            }
          });

          socket.on('webrtc:answer', function (payloadAns) {
            if (pc && pc.signalingState === 'have-local-offer') {
              pc.setRemoteDescription(new RTCSessionDescription(payloadAns.sdp))
                .then(function () {
                  while (earlyCandidates.length > 0) {
                    var c = earlyCandidates.shift();
                    pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
                  }
                })
                .catch(function (err) {
                  console.warn('[WidgetWebRTC] Answer error:', err);
                });
            }
          });

          socket.on('webrtc:ice_candidate', function (payloadCand) {
            if (!payloadCand || !payloadCand.candidate) return;
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              pc.addIceCandidate(new RTCIceCandidate(payloadCand.candidate)).catch(function () {});
            } else {
              earlyCandidates.push(payloadCand.candidate);
            }
          });

          socket.on('chat:message', function (msg) {
            if (!msg) return;
            var isMe = msg.sender_id === socket.id || msg.sender_code === 'WEB-CHAT' || msg.sender_id === 'widget_visitor';
            appendChatMsg(msg.text, isMe, msg.sender_name, msg.id);
          });

          socket.on('call:rejected', function (data) {
            stopHttpPoll();
            callLabel.textContent = 'Chamada Recusada';
            callTimer.textContent = 'Indisponível';
            callSub.textContent = (data && data.reason) || 'Seus dados ficaram salvos para retorno.';
            if (timerInt) clearInterval(timerInt);
          });

          socket.on('call:ended', function () {
            resetCallState();
          });

          socket.on('call:error', function (data) {
            responseReceived = true;
            clearTimeout(connectWatchdog);
            errBox.textContent = (data && data.message) || 'Erro ao iniciar chamada.';
            errBox.style.display = 'block';
            submitBtn.disabled = false;
          });
        } else if (socket.connected) {
          callRequestSent = true;
          socket.emit('widget:call_start', payload);
        } else if (typeof socket.connect === 'function') {
          socket.connect();
        }
      });
    });
  });
})();`;
}

export function buildWidgetDemoHtml(params: {
  origin: string;
  code: string;
  position: 'left' | 'right';
  accent: string;
  title: string;
  buttonText: string;
}): string {
  const safeCode = params.code.replace(/"/g, '&quot;');
  const safePos = params.position === 'right' ? 'right' : 'left';
  const safeAccent = params.accent.replace(/"/g, '&quot;');
  const safeTitle = params.title.replace(/"/g, '&quot;');
  const safeBtn = params.buttonText.replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Página Externa de Teste — Botão de Atendimento</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { margin: 0; min-height: 100vh; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; padding: 32px; }
    .box { max-width: 680px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px; box-shadow: 0 12px 32px rgba(15,23,42,0.06); }
    .kicker { font-size: 12px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
    h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.2; }
    p { margin: 0 0 14px; color: #475569; line-height: 1.6; font-size: 15px; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; font-size: 13px; color: #0f172a; }
  </style>
</head>
<body>
  <div class="box">
    <div class="kicker">Simulação de Site Externo</div>
    <h1>Botão Flutuante Incorporado com Sucesso</h1>
    <p>Esta página simula qualquer site institucional, loja virtual ou landing page com o seu botão de atendimento incorporado no <strong>${safePos === 'right' ? 'canto inferior direito' : 'canto inferior esquerdo'}</strong>.</p>
    <p>Clique no botão flutuante para preencher Nome, WhatsApp, E-mail e Mensagem e disparar uma chamada de áudio real para o código <code>${safeCode}</code>.</p>
  </div>
  <script
    src="${params.origin}/widget.js"
    data-code="${safeCode}"
    data-position="${safePos}"
    data-accent="${safeAccent}"
    data-title="${safeTitle}"
    data-button-text="${safeBtn}"
  ></script>
</body>
</html>`;
}
