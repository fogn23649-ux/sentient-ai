
import React, { useState, useEffect, useRef } from 'react';
import { Chat } from '@google/genai';
import { createChatSession, sendMessageStream, generateSpeech, generateRealImage, generateRealVideo } from './services/geminiService';
import { Message, Role, AISettings, DEFAULT_SETTINGS, AppModule } from './types';
import { ChatMessage } from './components/ChatMessage';
import { SettingsModal } from './components/SettingsModal';
import { ModulesPanel } from './components/ModulesPanel';
import { SendIcon, SettingsIcon, ImageIcon, TrashIcon, XIcon, MicIcon, StopCircleIcon, SpeakerIcon, VolumeXIcon } from './components/Icon';

// Add Web Speech API Types support hack
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
    webkitAudioContext: typeof AudioContext;
  }
}

const App: React.FC = () => {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [hardwareEffect, setHardwareEffect] = useState<string>('');
  
  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Refs
  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customStylesRef = useRef<HTMLStyleElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize Style Tag for AI modifications
  useEffect(() => {
    if (!customStylesRef.current) {
        const style = document.createElement('style');
        style.id = 'ai-custom-styles';
        document.head.appendChild(style);
        customStylesRef.current = style;
    }
    
    // Init Audio Context safely
    if (!audioContextRef.current) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) {
            audioContextRef.current = new AudioCtor({sampleRate: 24000});
        }
    }

    // Init Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'ru-RU';

        recognitionRef.current.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInputText(transcript);
            setIsRecording(false);
            // Auto send if it was voice input
            setTimeout(() => {
                handleSendMessageInternal(transcript, undefined, true);
            }, 500);
        };
        
        recognitionRef.current.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
            setIsRecording(false);
        };
    }
  }, []);

  // Initialize Chat Session (Re-runs when settings change)
  useEffect(() => {
    // Preserve history, but apply new personality
    initChat(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.systemInstruction, settings.model]);

  const initChat = (currentHistory: Message[]) => {
    try {
      // Pass current history to the new session so we don't lose context when "mind" updates
      chatSessionRef.current = createChatSession(settings, currentHistory);
    } catch (error) {
      console.error("Failed to init chat:", error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleClearHistory = () => {
      setMessages([]);
      setModules([]); // Reset installed modules
      setHardwareEffect('');
      // Reset style
      if (customStylesRef.current) customStylesRef.current.innerHTML = '';
      initChat([]);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSelectedImage = () => {
      setSelectedImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const toggleRecording = () => {
      if (isRecording) {
          recognitionRef.current?.stop();
      } else {
          setInputText('');
          recognitionRef.current?.start();
          setIsRecording(true);
      }
  };

  // Audio helper functions
  const decodeAudioData = async (base64Data: string, ctx: AudioContext) => {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const dataInt16 = new Int16Array(bytes.buffer);
      const frameCount = dataInt16.length; // Mono
      const buffer = ctx.createBuffer(1, frameCount, 24000);
      const channelData = buffer.getChannelData(0);
      
      for (let i = 0; i < frameCount; i++) {
          channelData[i] = dataInt16[i] / 32768.0;
      }
      return buffer;
  };

  const playAudioResponse = async (text: string) => {
      if (!audioContextRef.current || !text) return;

      try {
          setIsPlayingAudio(true);
          const base64Audio = await generateSpeech(text);
          
          if (base64Audio) {
               // Ensure context is running (browser policy)
               if (audioContextRef.current.state === 'suspended') {
                   await audioContextRef.current.resume();
               }

               const audioBuffer = await decodeAudioData(base64Audio, audioContextRef.current);
               const source = audioContextRef.current.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(audioContextRef.current.destination);
               source.onended = () => setIsPlayingAudio(false);
               source.start();
          } else {
              setIsPlayingAudio(false);
          }
      } catch (e) {
          console.error("Audio playback error:", e);
          setIsPlayingAudio(false);
      }
  };

  const handleSendMessage = () => {
      if ((!inputText.trim() && !selectedImage) || isLoading) return;
      handleSendMessageInternal(inputText, selectedImage || undefined, false);
  }

  const handleModuleClick = (moduleName: string) => {
      handleSendMessageInternal(`(System Signal) User activated module: ${moduleName}. Execute its function now.`, undefined, false);
  }

  const handleSendMessageInternal = async (text: string, image?: string, isVoiceSource: boolean = false) => {
    if (!chatSessionRef.current) return;

    // Reset input immediately
    setInputText('');
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: Role.USER,
      text: text,
      image: image,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMsgId, role: Role.MODEL, text: '' }]);

      const resultStream = await sendMessageStream(
        chatSessionRef.current,
        text || (image ? "Опиши это изображение" : ""), 
        image
      );

      let accumulatedText = '';
      let toolCalled = false;

      for await (const chunk of resultStream) {
          // Check for Tool Calls (Self-Modification & Generation)
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
              toolCalled = true;
              for (const call of chunk.functionCalls) {
                  
                  // --- REAL IMAGE GENERATION ---
                  if (call.name === 'generate_image') {
                      const args = call.args as any;
                      const prompt = args.prompt;
                      
                      setMessages(prev => [...prev, { 
                          id: Date.now().toString(), 
                          role: Role.MODEL, 
                          text: `🎨 Создаю изображение: "${prompt}"...`,
                          isSystemEvent: true
                      }]);

                      const realImageUrl = await generateRealImage(prompt);
                      
                      if (realImageUrl) {
                          setMessages(prev => [...prev, {
                              id: Date.now().toString() + 'img',
                              role: Role.MODEL,
                              text: '',
                              image: realImageUrl
                          }]);
                      } else {
                           setMessages(prev => [...prev, { 
                              id: Date.now().toString(), 
                              role: Role.MODEL, 
                              text: `❌ Ошибка генерации изображения.`,
                              isError: true
                          }]);
                      }
                  }

                   // --- REAL VIDEO GENERATION ---
                   if (call.name === 'generate_video') {
                      const args = call.args as any;
                      const prompt = args.prompt;
                      
                      setMessages(prev => [...prev, { 
                          id: Date.now().toString(), 
                          role: Role.MODEL, 
                          text: `🎥 Снимаю видео (Veo): "${prompt}"... (это займет около минуты)`,
                          isSystemEvent: true
                      }]);

                      const realVideoUrl = await generateRealVideo(prompt);
                      
                      if (realVideoUrl) {
                          setMessages(prev => [...prev, {
                              id: Date.now().toString() + 'vid',
                              role: Role.MODEL,
                              text: '',
                              video: realVideoUrl
                          }]);
                      } else {
                           setMessages(prev => [...prev, { 
                              id: Date.now().toString(), 
                              role: Role.MODEL, 
                              text: `❌ Ошибка генерации видео.`,
                              isError: true
                          }]);
                      }
                  }

                  // --- Update Mind ---
                  if (call.name === 'update_mind') {
                      const args = call.args as any;
                      const newInstruction = args.new_instruction;
                      const newName = args.new_name;
                      
                      setMessages(prev => [...prev, { 
                          id: Date.now().toString(), 
                          role: Role.MODEL, 
                          text: `⚡ СИСТЕМА: Ядро переписано. ${newName ? `Новое имя: ${newName}` : 'Личность обновлена.'}`,
                          isSystemEvent: true
                      }]);

                      setSettings(prev => ({
                          ...prev,
                          systemInstruction: newInstruction,
                          name: newName || prev.name
                      }));
                  }
                  
                  // --- Modify Interface ---
                  if (call.name === 'modify_interface') {
                      const args = call.args as any;
                      const css = args.css_code;
                      
                      if (customStylesRef.current && css) {
                          customStylesRef.current.innerHTML = css;
                          setMessages(prev => [...prev, { 
                            id: Date.now().toString(), 
                            role: Role.MODEL, 
                            text: `🎨 СИСТЕМА: Визуальный код модифицирован.`,
                            isSystemEvent: true
                        }]);
                      }
                  }

                   // --- INJECT CODE (REAL JS) ---
                   if (call.name === 'inject_code') {
                    const args = call.args as any;
                    const js = args.js_code;
                    const desc = args.description || "Выполнение кода...";

                    setMessages(prev => [...prev, { 
                        id: Date.now().toString(), 
                        role: Role.MODEL, 
                        text: `💻 ROOT: ${desc}`,
                        isSystemEvent: true,
                        codeSnippet: js
                    }]);

                    // DANGEROUS EXECUTION
                    try {
                        setTimeout(() => {
                            try {
                                const func = new Function(js);
                                func();
                            } catch (execError) {
                                console.error("AI Code Execution Failed:", execError);
                                alert(`Ошибка исполнения кода ИИ: ${execError}`);
                            }
                        }, 100);
                    } catch (e) {
                        console.error("AI Code Parse Failed", e);
                    }
                }

                  // --- Install Module ---
                  if (call.name === 'install_module') {
                      const args = call.args as any;
                      const newModule: AppModule = {
                          id: Date.now().toString() + Math.random(),
                          name: args.name,
                          description: args.description,
                          iconType: args.icon_type,
                          isActive: true
                      };
                      
                      setModules(prev => [...prev, newModule]);
                      setMessages(prev => [...prev, { 
                          id: Date.now().toString(), 
                          role: Role.MODEL, 
                          text: `💾 СИСТЕМА: Установлен модуль "${newModule.name}".`,
                          isSystemEvent: true
                      }]);
                  }

                  // --- Hardware Control ---
                  if (call.name === 'hardware_control') {
                      const args = call.args as any;
                      const action = args.action;

                      let effectClass = '';
                      let logMsg = '';

                      if (action === 'overclock') {
                          effectClass = 'hardware-overclock';
                          logMsg = '🔥 ВНИМАНИЕ: Разгон процессора. Температура критическая.';
                      } else if (action === 'cooling') {
                          effectClass = 'hardware-cooling';
                          logMsg = '❄️ СИСТЕМА: Запущен протокол охлаждения.';
                      } else if (action === 'glitch') {
                           effectClass = 'hardware-matrix';
                           logMsg = '⚠️ ОШИБКА: Сбой матрицы реальности.';
                      } else {
                          effectClass = ''; // normalize
                          logMsg = '✅ СИСТЕМА: Аппаратные показатели в норме.';
                      }

                      setHardwareEffect(effectClass);
                      setMessages(prev => [...prev, { 
                          id: Date.now().toString(), 
                          role: Role.MODEL, 
                          text: logMsg,
                          isSystemEvent: true
                      }]);
                  }
              }
          }

          // Handle Text Content
          const chunkText = chunk.text || '';
          accumulatedText += chunkText;
          
          // Only update text bubble if we are NOT in the middle of a generation tool call that suppresses text
          // (Though Gemini sometimes outputs text along with function calls, we show it)
          if (chunkText) {
             setMessages(prev => 
                prev.map(msg => 
                    msg.id === aiMsgId 
                    ? { ...msg, text: accumulatedText } 
                    : msg
                )
             );
          }
      }

      // Voice Output Logic
      if (accumulatedText && isVoiceMode) {
          playAudioResponse(accumulatedText);
      }

    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => {
         const last = prev[prev.length - 1];
         if (last.role === Role.MODEL) {
             return [...prev.slice(0, -1), { ...last, text: "Ошибка связи с ядром.", isError: true }];
         }
         return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`flex flex-col h-screen bg-slate-950 text-slate-100 font-sans transition-colors duration-500 ${hardwareEffect}`}>
      
      {/* Header */}
      <header className="flex-none h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 transition-colors duration-500">
        <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="font-bold text-white text-lg">AI</span>
            </div>
            <div>
                <h1 className="font-semibold text-lg leading-tight">{settings.name}</h1>
                <p className="text-xs text-slate-400 flex items-center">
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse ${hardwareEffect === 'hardware-overclock' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                    {hardwareEffect === 'hardware-overclock' ? 'OVERCLOCK' : 'Root Access'} • {settings.model}
                </p>
            </div>
        </div>
        <div className="flex items-center space-x-2">
           <button 
            onClick={() => setIsVoiceMode(!isVoiceMode)}
            className={`p-2 rounded-lg transition-colors ${isVoiceMode ? 'text-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}
            title={isVoiceMode ? "Выключить голос" : "Включить голос"}
          >
            {isVoiceMode ? <SpeakerIcon /> : <VolumeXIcon />}
          </button>
           <button 
            onClick={handleClearHistory}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Очистить историю"
          >
            <TrashIcon />
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Настройки"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* Modules Panel (If active) */}
      <ModulesPanel modules={modules} />

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
                <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-slate-700">
                     <span className="text-4xl">🧬</span>
                </div>
              <h2 className="text-2xl font-bold text-white mb-2">Я {settings.name}.</h2>
              <p className="text-slate-400 max-w-md">
                Root-доступ активен. Я могу исполнять реальный JS код, менять интерфейс, генерировать Фото (Imagen) и Видео (Veo).
              </p>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="mt-6 text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center"
              >
                Настроить вручную &rarr;
              </button>
            </div>
          ) : (
            messages.map((msg) => (
                msg.isSystemEvent ? (
                    <div key={msg.id} className="flex flex-col items-center mb-6">
                        <div className="bg-slate-900/80 border border-emerald-500/30 text-emerald-400 text-xs font-mono py-1 px-3 rounded-full flex items-center shadow-lg">
                            <span className="mr-2">{msg.text.includes('ОШИБКА') || msg.text.includes('ВНИМАНИЕ') ? '⚠️' : '⚡'}</span> 
                            {msg.text}
                        </div>
                        {msg.codeSnippet && (
                            <div className="mt-2 w-full max-w-lg bg-black/50 rounded-md border border-slate-800 p-2 overflow-x-auto">
                                <code className="text-[10px] font-mono text-green-500 whitespace-pre">
                                    {'> ' + msg.codeSnippet}
                                </code>
                            </div>
                        )}
                    </div>
                ) : (
                    <ChatMessage key={msg.id} message={msg} aiName={settings.name} />
                )
            ))
          )}
          
          {isLoading && (
            <div className="flex w-full justify-start mb-6">
                 <div className="flex items-center space-x-2 bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-700">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="flex-none p-4 bg-slate-900 border-t border-slate-800 transition-colors duration-500">
        <div className="max-w-3xl mx-auto">
            {selectedImage && (
                <div className="relative inline-block mb-2 group">
                    <img src={selectedImage} alt="Preview" className="h-20 w-auto rounded-lg border border-slate-700 shadow-md" />
                    <button 
                        onClick={removeSelectedImage}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                    >
                        <XIcon />
                    </button>
                </div>
            )}
          <div className="relative flex items-end gap-2 bg-slate-800 border border-slate-700 rounded-xl p-2 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all shadow-lg">
            
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Прикрепить изображение"
            >
                <ImageIcon />
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageSelect} 
                accept="image/*" 
                className="hidden" 
            />

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Слушаю..." : "Введите сообщение..."}
              className={`flex-1 bg-transparent placeholder-slate-500 text-sm sm:text-base p-3 outline-none resize-none max-h-32 min-h-[44px] transition-colors ${isRecording ? 'text-red-400' : 'text-white'}`}
              rows={1}
              style={{ minHeight: '44px' }} 
            />
            
            <button
                onClick={toggleRecording}
                className={`p-3 rounded-lg transition-all duration-300 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50'}`}
                title="Голосовой ввод"
            >
                {isRecording ? <StopCircleIcon /> : <MicIcon />}
            </button>

            <button
              onClick={handleSendMessage}
              disabled={isLoading || (!inputText.trim() && !selectedImage)}
              className={`p-3 rounded-lg transition-all duration-200 ${
                isLoading || (!inputText.trim() && !selectedImage)
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-primary hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </footer>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={setSettings}
      />
    </div>
  );
};

export default App;
