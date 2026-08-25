import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import cerebroImg from './assets/cerebro.png';

const STATUS = {
  IDLE: 'Aguardando comando...',
  PINGING: 'Testando IPC...',
  ERROR: 'Erro na comunicação.',
};

export default function App() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [lastPong, setLastPong] = useState(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [keysConfigured, setKeysConfigured] = useState(false);
  const [primaryProvider, setPrimaryProvider] = useState('groq');
  const [assistantName, setAssistantName] = useState('Jarvis');
  const [userName, setUserName] = useState('Chefe');
  const [allowSystemControl, setAllowSystemControl] = useState(true);
  const [allowBrowserAutomation, setAllowBrowserAutomation] = useState(false);
  const [allowScreenCapture, setAllowScreenCapture] = useState(false);
  const [allowPassiveListening, setAllowPassiveListening] = useState(false);
  const [passiveListening, setPassiveListening] = useState(false);
  const [launchingBrowserWorkspace, setLaunchingBrowserWorkspace] = useState(false);
  const [lastAction, setLastAction] = useState('');
  const [testingExecutor, setTestingExecutor] = useState(false);
  const [useOpenAiVoice, setUseOpenAiVoice] = useState(false);
  const [ttsProvider, setTtsProvider] = useState('piper');
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [hasElevenLabsCredentials, setHasElevenLabsCredentials] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [typedCommand, setTypedCommand] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const listeningRef = useRef(false);
  const turnRef = useRef(0);
  const startRecordingRef = useRef(null);
  const passiveStreamRef = useRef(null);
  const passiveAudioContextRef = useRef(null);
  const passiveAnalyserRef = useRef(null);
  const passiveAnimationRef = useRef(null);
  const passiveLastClapRef = useRef(0);
  const passiveNoiseFloorRef = useRef(0.02);
  const passiveStartingRef = useRef(false);
  const passiveAutoStartedRef = useRef(false);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopPassiveListening = useCallback(() => {
    if (passiveAnimationRef.current) cancelAnimationFrame(passiveAnimationRef.current);
    passiveAnimationRef.current = null;
    passiveStreamRef.current?.getTracks().forEach((track) => track.stop());
    passiveStreamRef.current = null;
    const context = passiveAudioContextRef.current;
    passiveAudioContextRef.current = null;
    passiveAnalyserRef.current = null;
    if (context && context.state !== 'closed') context.close().catch(() => {});
    passiveStartingRef.current = false;
    setPassiveListening(false);
  }, []);

  const stopAllSpeech = useCallback(() => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const playWakeFeedback = useCallback(() => {
    setStatus('DUAS PALMAS DETECTADAS. Jarvis acordou; fale o comando.');
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
      oscillator.addEventListener('ended', () => context.close().catch(() => {}), { once: true });
    } catch (error) {
      console.debug('[Renderer] Feedback sonoro indisponível:', error.message);
    }
  }, []);

  const startPassiveListening = useCallback(async () => {
    if (passiveListening || passiveStartingRef.current || listeningRef.current || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setStatus('A escuta passiva não está disponível neste ambiente.');
      return;
    }

    passiveStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.15;
      context.createMediaStreamSource(stream).connect(analyser);
      passiveStreamRef.current = stream;
      passiveAudioContextRef.current = context;
      passiveAnalyserRef.current = analyser;
      passiveNoiseFloorRef.current = 0.02;
      passiveLastClapRef.current = 0;
      passiveStartingRef.current = false;
      setPassiveListening(true);
      setStatus('ESCUTA PASSIVA ATIVA. Duas palmas acordam o Jarvis.');

      const samples = new Uint8Array(analyser.fftSize);
      const inspect = () => {
        if (!passiveAnalyserRef.current || !passiveStreamRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        let peak = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
          peak = Math.max(peak, Math.abs(normalized));
        }
        const rms = Math.sqrt(sum / samples.length);
        const floor = passiveNoiseFloorRef.current;
        passiveNoiseFloorRef.current = floor * 0.96 + Math.min(rms, floor * 2) * 0.04;
        const now = performance.now();
        const isTransient = rms > Math.max(0.12, floor * 3.4) && peak > 0.38;
        if (isTransient && now - passiveLastClapRef.current > 180) {
          const previous = passiveLastClapRef.current;
          passiveLastClapRef.current = now;
          if (previous && now - previous <= 1000) {
            passiveLastClapRef.current = 0;
            stopPassiveListening();
            playWakeFeedback();
            setTimeout(() => startRecordingRef.current?.(), 120);
          }
        }
        passiveAnimationRef.current = requestAnimationFrame(inspect);
      };
      passiveAnimationRef.current = requestAnimationFrame(inspect);
    } catch (error) {
      passiveStartingRef.current = false;
      stopPassiveListening();
      setStatus('Permita o acesso ao microfone para ativar a escuta passiva.');
      console.error('[Renderer] Não foi possível ativar a escuta passiva:', error);
    }
  }, [passiveListening, playWakeFeedback, stopPassiveListening, transcribing]);

  useEffect(() => () => {
    stopPassiveListening();
    releaseMicrophone();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    window.speechSynthesis?.cancel();
  }, [releaseMicrophone, stopPassiveListening]);

  useEffect(() => {
    let cancelled = false;

    window.jarvis?.getApiKeyStatus()
      .then((status) => {
        if (cancelled) return;
        setPrimaryProvider(status.primaryProvider);
        setAssistantName(status.assistantName || 'Jarvis');
        setUserName(status.userName || 'Chefe');
        setKeysConfigured(status.isConfigured);
        setAllowSystemControl(status.allowSystemControl);
        setAllowBrowserAutomation(Boolean(status.allowBrowserAutomation));
        setAllowScreenCapture(Boolean(status.allowScreenCapture));
        setAllowPassiveListening(Boolean(status.allowPassiveListening));
        setUseOpenAiVoice(status.useOpenAiVoice);
        setTtsProvider(status.ttsProvider || 'piper');
        setHasOpenAiKey(status.hasOpenAiKey);
        setHasElevenLabsCredentials(status.hasElevenLabsKey && status.hasElevenLabsVoiceId);
        setSettingsOpen(!status.isConfigured);
      })
      .catch((error) => {
        console.error('[Renderer] Não foi possível ler as configurações:', error);
        if (!cancelled) setSettingsOpen(true);
      });

    return () => { cancelled = true; };
  }, []);

  const playSpeech = useCallback(async (audioBuffer, mimeType) => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);

    const blob = new Blob([audioBuffer], { type: mimeType || 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audioUrlRef.current = url;
    setSpeaking(true);
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
      setSpeaking(false);
    }, { once: true });
    audio.addEventListener('error', () => setSpeaking(false), { once: true });
    await audio.play();
  }, []);

  const playNativeSpeech = useCallback((text) => {
    if (!window.speechSynthesis) {
      throw new Error('A voz nativa não está disponível neste ambiente.');
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.88;
    utterance.pitch = 0.86;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => /antonio|daniel/i.test(voice.name) && /pt[-_]BR|portugu/i.test(voice.lang + ' ' + voice.name))
      || voices.find((voice) => /pt[-_]BR/i.test(voice.lang))
      || null;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  const handlePing = useCallback(async () => {
    if (!window.jarvis) {
      setStatus('API Jarvis não disponível (rode via Electron).');
      return;
    }

    setStatus(STATUS.PINGING);
    try {
      const response = await window.jarvis.ping('olá do React!');
      setLastPong(response);
      setStatus('Pong recebido: ' + response.message);
    } catch (error) {
      console.error('[Renderer] Erro no ping:', error);
      setStatus(STATUS.ERROR);
    }
  }, []);

  const applyResult = useCallback(async (result, turn) => {
    if (turn !== turnRef.current) return;
    setTranscript(result.transcript);
    setAssistantResponse(result.text);
    setLastAction(result.action?.label || result.action?.url || result.action?.path || result.action?.name || '');
    if (listeningRef.current) return;
    if (result.audioBuffer) {
      await playSpeech(result.audioBuffer, result.audioMimeType);
      if (turn !== turnRef.current) return;
      setStatus(result.action ? 'Abri no PC: ' + (result.action.label || result.action.name) : 'Resposta reproduzida.');
    } else {
      playNativeSpeech(result.text);
      setStatus(result.action ? 'Abri no PC: ' + (result.action.label || result.action.name) : 'Voz nativa reproduzida.');
    }
  }, [playNativeSpeech, playSpeech]);

  const sendRecordingForTranscription = useCallback(async (blob) => {
    if (!window.jarvis?.transcribeAudio) {
      setStatus('A API de transcrição não está disponível. Reinicie o Electron.');
      return;
    }
    console.log('[Renderer] Audio para transcrever:', blob.size, blob.type);
    if (blob.size < 2500) {
      setStatus('Nao ouvi nada. Clique em FALAR, fale o comando, clique em PARAR.');
      return;
    }

    const turn = turnRef.current;
    setTranscribing(true);
    setStatus('Ouvi voce. Processando o comando...');
    try {
      const audioBuffer = await blob.arrayBuffer();
      const result = await window.jarvis.transcribeAudio(audioBuffer, blob.type);
      await applyResult(result, turn);
    } catch (error) {
      console.error('[Renderer] Falha na transcrição:', error);
      setStatus(error.message || 'Não foi possível transcrever o áudio.');
    } finally {
      setTranscribing(false);
    }
  }, [applyResult]);

  const sendTypedCommand = useCallback(async (event) => {
    event.preventDefault();
    const command = typedCommand.trim();
    if (!command || transcribing || !keysConfigured) return;
    if (!window.jarvis?.sendTextCommand) {
      setStatus('Reinicie o Jarvis para enviar comando digitado.');
      return;
    }
    setTypedCommand('');
    setTranscribing(true);
    setStatus('Executando comando...');
    try {
      const result = await window.jarvis.sendTextCommand(command);
      await applyResult(result, turnRef.current);
    } catch (error) {
      console.error('[Renderer] Falha no comando digitado:', error);
      setStatus(error.message || 'Não foi possível executar o comando.');
    } finally {
      setTranscribing(false);
    }
  }, [applyResult, keysConfigured, transcribing, typedCommand]);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus('Este ambiente não oferece suporte à gravação de áudio.');
      return;
    }

    stopPassiveListening();
    stopAllSpeech();
    setTranscribing(false);
    turnRef.current += 1;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      } catch { /* ignore */ }
    }

    try {
      setStatus('Parei de falar. Abrindo o microfone...');
      await new Promise((resolve) => setTimeout(resolve, 160));
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredMimeType = 'audio/webm;codecs=opus';
      const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        listeningRef.current = false;
        setListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        releaseMicrophone();
        recorderRef.current = null;
        console.log('[Renderer] Gravacao encerrada. Bytes:', blob.size);
        if (blob.size > 0) await sendRecordingForTranscription(blob);
        else setStatus('Nao gravei audio. Clique em FALAR e tente de novo.');
        if (allowPassiveListening) startPassiveListening();
      };
      recorder.onerror = (event) => {
        console.error('[Renderer] Erro do MediaRecorder:', event.error);
        listeningRef.current = false;
        releaseMicrophone();
        setListening(false);
        setStatus('A gravação falhou. Clique em FALAR de novo.');
      };

      recorderRef.current = recorder;
      recorder.start(200);
      setTranscript('');
      setAssistantResponse('');
      setLastAction('');
      listeningRef.current = true;
      setListening(true);
      setStatus('OUVINDO VOCE AGORA. Fale o comando e clique em PARAR.');
    } catch (error) {
      console.error('[Renderer] Não foi possível acessar o microfone:', error);
      listeningRef.current = false;
      releaseMicrophone();
      setListening(false);
      setStatus('Permita o acesso ao microfone para falar com o Jarvis.');
    }
  }, [allowPassiveListening, releaseMicrophone, sendRecordingForTranscription, startPassiveListening, stopAllSpeech, stopPassiveListening]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  useEffect(() => {
    if (!allowPassiveListening) passiveAutoStartedRef.current = false;
    if (keysConfigured && allowPassiveListening && !passiveListening && !passiveAutoStartedRef.current) {
      passiveAutoStartedRef.current = true;
      startPassiveListening();
    }
  }, [allowPassiveListening, keysConfigured, passiveListening, startPassiveListening]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    setStatus('Parou. Vou executar o que voce pediu...');
    if (!recorder) {
      listeningRef.current = false;
      setListening(false);
      return;
    }
    if (recorder.state === 'recording' || recorder.state === 'paused') {
      try { recorder.requestData(); } catch { /* ignore */ }
      recorder.stop();
      return;
    }
    listeningRef.current = false;
    setListening(false);
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
    releaseMicrophone();
    recorderRef.current = null;
    if (blob.size > 0) sendRecordingForTranscription(blob);
  }, [releaseMicrophone, sendRecordingForTranscription]);

  useEffect(() => {
    const removeShortcutListener = window.jarvis?.onGlobalShortcut?.(() => {
      if (!listeningRef.current && !transcribing) startRecording();
    });
    return () => removeShortcutListener?.();
  }, [startRecording, transcribing]);

  const saveSettings = useCallback(async (event) => {
    event.preventDefault();
    setSettingsError('');
    setSavingSettings(true);
    try {
      const status = await window.jarvis.saveApiKeys({
        primaryProvider,
        assistantName,
        userName,
        groqApiKey,
        openAiApiKey,
        elevenLabsApiKey,
        elevenLabsVoiceId,
        allowSystemControl,
        allowBrowserAutomation,
        allowScreenCapture,
        allowPassiveListening,
        useOpenAiVoice,
        ttsProvider,
      });
      setKeysConfigured(status.isConfigured);
      setHasOpenAiKey(status.hasOpenAiKey);
      setHasElevenLabsCredentials(status.hasElevenLabsKey && status.hasElevenLabsVoiceId);
      if (!status.isConfigured) {
        setSettingsError('Informe a chave do provedor principal selecionado.');
        return;
      }
      setGroqApiKey('');
      setOpenAiApiKey('');
      setElevenLabsApiKey('');
      setElevenLabsVoiceId('');
      setSettingsOpen(false);
      setStatus('Chaves salvas. Jarvis está pronto.');
    } catch (error) {
      console.error('[Renderer] Não foi possível salvar as chaves:', error);
      setSettingsError(error.message || 'Não foi possível salvar as chaves.');
    } finally {
      setSavingSettings(false);
    }
  }, [
    allowSystemControl,
    allowBrowserAutomation,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    groqApiKey,
    openAiApiKey,
    primaryProvider,
    assistantName,
    userName,
    useOpenAiVoice,
    ttsProvider,
    allowPassiveListening,
  ]);

  const openAuthorizedBrowserWorkspace = useCallback(async () => {
    setLaunchingBrowserWorkspace(true);
    setSettingsError('');
    try {
      await window.jarvis.browser.openAuthorizedWorkspace();
      setStatus('Navegador autorizado aberto. Faça login manualmente nas contas.');
    } catch (error) {
      setSettingsError(error.message || 'Não foi possível abrir o navegador autorizado.');
    } finally {
      setLaunchingBrowserWorkspace(false);
    }
  }, []);

  const togglePassiveListening = useCallback(() => {
    if (passiveListening) {
      stopPassiveListening();
      setAllowPassiveListening(false);
      setStatus('Escuta passiva desativada.');
      return;
    }
    if (!keysConfigured) {
      setSettingsOpen(true);
      setSettingsError('Configure a chave do provedor antes de usar o gatilho de palmas.');
      return;
    }
    setAllowPassiveListening(true);
    startPassiveListening();
  }, [keysConfigured, passiveListening, startPassiveListening, stopPassiveListening]);

  const handleMicrophone = useCallback(() => {
    if (!keysConfigured) {
      setSettingsOpen(true);
      return;
    }
    stopAllSpeech();
    if (listeningRef.current) stopRecording();
    else startRecording();
  }, [keysConfigured, startRecording, stopAllSpeech, stopRecording]);

  return (
    <div className="jarvis-root">
      <div className="drag-handle">
        <span className="brand">JARVIS</span>
          <span className="header-actions">
            <span className={'perm-pill ' + (allowSystemControl ? 'on' : 'off')}>
              {allowSystemControl ? 'FULL' : 'OFF'}
            </span>
            <span className="dot" />
            <button
              className="minimize-btn"
              onClick={() => window.jarvis?.minimizeWindow()}
              title="Minimizar"
              aria-label="Minimizar Jarvis"
            >
              MIN
            </button>
            <button
            className="settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Configurações"
          >
            CFG
          </button>
        </span>
      </div>

      <p className="status">{status}</p>

      <button
        className={'mic-btn ' + (
          listening ? 'listening' : transcribing ? 'thinking' : speaking ? 'speaking' : ''
        )}
        onClick={handleMicrophone}
        disabled={!keysConfigured}
        title={listening ? 'Parar de ouvir e executar' : 'Parar de falar e me ouvir'}
      >
        <img src={cerebroImg} className="brain-avatar" alt="Jarvis Brain" />
        <span className="brain-label">{listening ? 'PARAR' : transcribing ? 'PROCESSANDO' : 'FALAR'}</span>
      </button>

      <form className="command-bar" onSubmit={sendTypedCommand}>
        <input
          type="text"
          value={typedCommand}
          onChange={(event) => setTypedCommand(event.target.value)}
          placeholder="Digite um comando para o Jarvis"
          disabled={!keysConfigured || transcribing}
          autoComplete="off"
        />
      </form>

      {transcript && <p className="transcript">Você disse: {transcript}</p>}
      {lastAction && <p className="action-ok">EXECUTADO: {lastAction}</p>}
      {assistantResponse && <p className="transcript">Jarvis: {assistantResponse}</p>}

      {settingsOpen && (
        <div className="settings-overlay">
          <form className="settings-card" onSubmit={saveSettings}>
            <h2>Configurações</h2>
            <p>Permissoes no estilo Codex: escolha se o Jarvis pode executar no seu PC ou so conversar.</p>

            <label htmlFor="assistant-name">Nome do assistente</label>
            <input
              id="assistant-name"
              type="text"
              value={assistantName}
              onChange={(event) => setAssistantName(event.target.value)}
              placeholder="Jarvis"
              maxLength={40}
            />

            <label htmlFor="user-name">Como devo chamar você?</label>
            <input
              id="user-name"
              type="text"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="Chefe"
              maxLength={40}
            />

            <label htmlFor="tts-provider">Voz do Jarvis</label>
            <select
              id="tts-provider"
              value={ttsProvider}
              onChange={(event) => setTtsProvider(event.target.value)}
            >
              <option value="piper">Piper local — Jarvis (recomendada)</option>
              <option value="edge">Cinematográfica brasileira Edge</option>
              <option value="elevenlabs">ElevenLabs configurada</option>
            </select>

            <label htmlFor="groq-api-key">Chave da Groq</label>
            <input
              id="groq-api-key"
              type="password"
              value={groqApiKey}
              onChange={(event) => setGroqApiKey(event.target.value)}
              placeholder={keysConfigured ? 'Chave Groq ja salva. Deixe em branco para manter.' : 'gsk_...'}
              autoComplete="off"
              required={primaryProvider === 'groq' && !keysConfigured}
            />

            <p className="perm-title">Liberar Acesso Total ao Computador (Modo Executor)</p>
            <label className={'perm-card ' + (allowSystemControl ? 'selected' : '')}>
              <input
                type="radio"
                name="pc-access"
                checked={allowSystemControl}
                onChange={() => setAllowSystemControl(true)}
              />
              <span>
                <strong>Modo Executor ativado</strong>
                Permite abrir apps, jogos, sites, pastas e arquivos pelo Windows.
              </span>
            </label>
            <label className={'perm-card ' + (!allowSystemControl ? 'selected' : '')}>
              <input
                type="radio"
                name="pc-access"
                checked={!allowSystemControl}
                onChange={() => setAllowSystemControl(false)}
              />
              <span>
                <strong>Somente conversa</strong>
                Nao executa nada. So responde por voz.
              </span>
            </label>

            <p className="perm-title">Permitir navegador local autorizado</p>
            <label className={'perm-card ' + (allowBrowserAutomation ? 'selected' : '')}>
              <input
                type="checkbox"
                checked={allowBrowserAutomation}
                onChange={(event) => setAllowBrowserAutomation(event.target.checked)}
              />
              <span>
                <strong>Gmail, WhatsApp Web e Instagram</strong>
                Abre um perfil local isolado para login manual. O Jarvis não recebe senhas.
              </span>
            </label>
            {allowBrowserAutomation && (
              <button
                className="executor-test-btn"
                type="button"
                disabled={launchingBrowserWorkspace || savingSettings}
                onClick={openAuthorizedBrowserWorkspace}
              >
                {launchingBrowserWorkspace ? 'Abrindo navegador...' : 'Abrir contas autorizadas'}
              </button>
            )}

            <p className="perm-title">Permitir Visão de Tela</p>
            <label className={'perm-card ' + (allowScreenCapture ? 'selected' : '')}>
              <input
                type="checkbox"
                checked={allowScreenCapture}
                onChange={(event) => setAllowScreenCapture(event.target.checked)}
              />
              <span>
                <strong>Analisar minha tela sob comando</strong>
                O Jarvis captura a tela principal somente quando você pedir e envia a imagem ao modelo de visão configurado. A captura não é salva.
              </span>
            </label>

            <p className="perm-title">Gatilho de Palmas (escuta passiva)</p>
            <label className={'perm-card ' + (allowPassiveListening ? 'selected' : '')}>
              <input
                type="checkbox"
                checked={allowPassiveListening}
                onChange={(event) => setAllowPassiveListening(event.target.checked)}
              />
              <span>
                <strong>Ativar duas palmas para acordar</strong>
                Mantém uma análise leve do microfone. Duas palmas em até 1 segundo iniciam a gravação; fica desligado por padrão.
              </span>
            </label>
            <button
              className="executor-test-btn"
              type="button"
              disabled={savingSettings || !keysConfigured}
              onClick={togglePassiveListening}
            >
              {passiveListening ? 'Desativar escuta passiva' : 'Ativar escuta passiva agora'}
            </button>

            <button
              className="cancel-settings-btn"
              type="button"
              disabled={testingExecutor}
              onClick={async () => {
                setSettingsError('');
                setTestingExecutor(true);
                try {
                  const result = await window.jarvis.testOpenGoogle();
                  setLastAction(result.action?.url || 'https://www.google.com/');
                  setStatus('Teste real: Google aberto no navegador.');
                } catch (error) {
                  setSettingsError(error.message || 'Nao foi possivel abrir o Google.');
                } finally {
                  setTestingExecutor(false);
                }
              }}
            >
              {testingExecutor ? 'Abrindo Google...' : 'Testar agora: abrir Google'}
            </button>

            {settingsError && <p className="settings-error">{settingsError}</p>}

            <button className="save-settings-btn" type="submit" disabled={savingSettings}>
              {savingSettings ? 'Salvando...' : 'Salvar e ativar'}
            </button>

            {keysConfigured && (
              <button className="cancel-settings-btn" type="button" onClick={() => setSettingsOpen(false)}>
                Cancelar
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}







