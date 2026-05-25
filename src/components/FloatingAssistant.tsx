import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, X, Send, Globe, BookOpen, User, Bot, CornerDownLeft, Copy, Check
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  sourceType?: 'document' | 'website';
  sources?: Array<{ fileName: string; pageNum?: number; text: string }>;
}

interface FloatingAssistantProps {
  token: string | null;
  userName?: string;
}

export default function FloatingAssistant({ token, userName }: FloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<'document' | 'website'>('website');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: userName 
        ? `Hi **${userName}**! I'm **Mindy**, your intelligent DocuMind companion. How can I help you today? You can ask me questions about this **website** or query your active **stored documents** directly!`
        : `Hi there! I'm **Mindy**, your modern DocuMind assistant. Ask me anything about our **AI capabilities**, **Pricing Plans**, or **how to use the app**. If you sign in, I can even query your uploaded documents! 🌟`,
      timestamp: new Date(),
      sourceType: 'website'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || inputValue.trim();
    if (!messageText) return;

    if (!textToSend) {
      setInputValue('');
    }

    const newUserMessage: Message = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: new Date(),
      sourceType: source
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsTyping(true);

    try {
      // Map user history format
      const historyPayload = messages.map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: messageText,
          history: historyPayload,
          source: source
        })
      });

      if (!res.ok) {
        throw new Error('Connection failed');
      }

      const data = await res.json();

      const newAiMessage: Message = {
        id: `msg-ai-${Date.now()}`,
        sender: 'assistant',
        text: data.reply,
        timestamp: new Date(),
        sources: data.sources,
        sourceType: source
      };

      setMessages(prev => [...prev, newAiMessage]);
    } catch (err) {
      const errorMsg: Message = {
        id: `msg-err-${Date.now()}`,
        sender: 'assistant',
        text: `Oh dear, I seem to have run into a temporary network ripple. Please verify your internet connection or try sending again!`,
        timestamp: new Date(),
        sourceType: source
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const suggestedQuestions = source === 'website' 
    ? [
        "What is DocuMind AI?",
        "What are the pricing tiers?",
        "How do I test the admin view?",
        "Is there a test login?"
      ]
    : [
        "Search my document vault",
        "Summarize active files",
        "How do I upload PDFs?"
      ];

  return (
    <div className="fixed bottom-6 right-6 z-50 select-none font-sans">
      <AnimatePresence>
        {/* Expanded Chat Box */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="absolute bottom-18 right-0 w-[92vw] sm:w-[400px] h-[550px] max-h-[80vh] flex flex-col bg-slate-950/95 border border-slate-800 rounded-3xl shadow-2xl shadow-indigo-500/10 backdrop-blur-xl overflow-hidden"
          >
            {/* Top Header Card */}
            <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-cyan-950/60 p-4 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Bot className="h-4.5 w-4.5 text-slate-950 stroke-[2.2]" />
                  </div>
                  {/* Alive status dot */}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                    <span>Mindy</span>
                    <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded-full font-bold border border-indigo-500/20 uppercase tracking-wide">
                      AI Companion
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">Ready to assist you in real-time</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-100 transition cursor-pointer"
                title="Minimize panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Toggle Switch Mode Selector */}
            <div className="p-2.5 bg-slate-900/40 border-b border-slate-900/80 flex items-center gap-2">
              <button
                onClick={() => setSource('website')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap ${
                  source === 'website'
                    ? 'bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
                title="Ground answers with platform specs"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>🌐 Website &amp; Q&amp;A Info</span>
              </button>
              <button
                onClick={() => setSource('document')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap ${
                  source === 'document'
                    ? 'bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
                title="Ground answers with PDF uploads"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>📚 Stored Documents</span>
              </button>
            </div>

            {/* Warning when choosing documents without login */}
            {source === 'document' && !token && (
              <div className="mx-3.5 mt-3 p-2.5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl text-[10.5px] text-indigo-400 font-medium leading-relaxed">
                ✨ <strong>Guest Mode:</strong> Please log in or sign up using our <strong>"Get Started"</strong> button to sync and query your own PDFs!
              </div>
            )}

            {/* Messages Scroll viewport */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 max-w-[85%] ${
                    msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  }`}
                >
                  {/* Sender Avatar Icon */}
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                      msg.sender === 'user'
                        ? 'bg-slate-900 border border-slate-800 text-cyan-400'
                        : 'bg-gradient-to-br from-indigo-500 to-cyan-500 text-slate-950'
                    }`}
                  >
                    {msg.sender === 'user' ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Bubble body */}
                  <div className="space-y-1">
                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed border group relative ${
                        msg.sender === 'user'
                          ? 'bg-indigo-500/10 border-indigo-500/25 text-indigo-100 rounded-tr-none'
                          : 'bg-slate-900/60 border-slate-900 text-slate-300 rounded-tl-none'
                      }`}
                    >
                      {/* Formatted Markdown Render Helper */}
                      <p className="whitespace-pre-wrap">
                        {msg.text.split('**').map((chunk, idx) => {
                          if (idx % 2 === 1) {
                            return <strong key={idx} className="text-white font-bold">{chunk}</strong>;
                          }
                          return chunk;
                        })}
                      </p>

                      {/* Matching Sources under bubble */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 space-y-1 text-[10.5px]">
                          <p className="text-indigo-400 font-bold tracking-tight uppercase text-[9px] mb-1">
                            Retrieved Context Sources:
                          </p>
                          {msg.sources.map((src, i) => (
                            <div key={i} className="text-slate-400 flex items-start gap-1">
                              <span className="text-[9px] text-cyan-400 shrink-0 font-mono mt-0.5">[{i + 1}]</span>
                              <span className="font-semibold text-slate-300">
                                "{src.fileName}" {src.pageNum && `(Page ${src.pageNum})`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quick copy bubble button */}
                      <button
                        onClick={() => copyToClipboard(msg.id, msg.text)}
                        className="absolute -bottom-5 right-2 opacity-0 group-hover:opacity-100 transition duration-155 p-1 bg-slate-900 hover:bg-slate-850 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {/* Timestamp badge */}
                    <div
                      className={`text-[9px] text-slate-500 px-1 font-medium ${
                        msg.sender === 'user' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loader/Typing Simulator */}
              {isTyping && (
                <div className="flex gap-2.5 max-w-[85%] mr-auto items-center">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0 text-slate-950">
                    <Bot className="h-3.5 w-3.5 animate-bounce" />
                  </div>
                  <div className="px-3.5 py-3.5 bg-slate-900/60 border border-slate-900 rounded-2xl rounded-tl-none flex items-center gap-1.5 shadow-inner">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Horizontal Suggested Questions Rail */}
            <div className="px-4 py-2 border-t border-slate-950/80 bg-slate-950/40">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-400" />
                <span>Quick Prompts:</span>
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(q)}
                    className="px-2.5 py-1.2 rounded-full bg-slate-900 hover:bg-slate-850/80 hover:text-white border border-slate-850 text-[10.5px] font-semibold text-slate-400 transition cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Typing input bar */}
            <div className="p-4 bg-slate-950 border-t border-slate-900 flex items-center gap-2">
              <input
                type="text"
                placeholder={source === 'document' ? "Search uploaded PDFs..." : "Ask Mindy about plans or features..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1 bg-slate-900 border border-slate-800 text-xs px-3.5 py-2.5 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim()}
                className="p-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-slate-950 font-bold transition-all transform hover:scale-[1.05] active:scale-[0.95] cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hanging/Floating Levitating Launcher Orb */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-500 flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 relative border border-white/15 focus:outline-none transition group"
        aria-label="Open support assistant"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -45, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 45, opacity: 0 }}
            >
              <X className="h-6 w-6 text-slate-950 stroke-[2.5]" />
            </motion.div>
          ) : (
            <motion.div
              key="spark"
              initial={{ rotate: 45, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -45, opacity: 0 }}
              className="relative"
            >
              <Bot className="h-6 w-6 text-slate-950 stroke-[2.2] animate-pulse" />
              {/* Decorative mini glowing halo */}
              <span className="absolute -top-1 -right-1 block h-2.5 w-2.5 rounded-full bg-cyan-300 border border-indigo-600 shadow-md animate-ping" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Levitating hover helper tag */}
        {!isOpen && (
          <div className="absolute right-16 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] font-bold text-slate-200 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0 pointer-events-none whitespace-nowrap shadow-xl">
            Ask Mindy <span className="text-indigo-400">AI</span> ✨
          </div>
        )}
      </motion.button>
    </div>
  );
}
