import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BrainCircuit, LayoutDashboard, MessageSquareLock, LogOut, 
  Database, UserCheck, RefreshCw, Layers, Sparkles 
} from 'lucide-react';

import AuthScreen from './components/AuthScreen';
import DashboardTab from './components/DashboardTab';
import ChatTab from './components/ChatTab';
import { User, PDFDocument, ChatSession, DashboardStats, AuthResponse } from './types';

// Establish a default, eye-pleasing theme state
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('documind_token'));
  const [user, setUser] = useState<User | null>(null);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Core Data models
  const [stats, setStats] = useState<DashboardStats>({
    totalDocs: 0,
    totalChunks: 0,
    totalChats: 0,
    storageUsed: 0
  });
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // 1. Initial Profile Recovery
  useEffect(() => {
    if (!token) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Session expired');
        }

        setUser(data);
      } catch (e) {
        handleLogout();
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  // 2. Fetch Dashboard Content & AI Conversations
  useEffect(() => {
    if (!token || !user) return;

    const fetchData = async () => {
      try {
        // Fetch stats
        const statsRes = await fetch('/api/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        // Fetch PDFs list
        const pdfRes = await fetch('/api/pdf', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json();
          setPdfs(pdfData);
        }

        // Fetch Chat sessions
        const chatRes = await fetch('/api/chats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          setSessions(chatData);
        }
      } catch (err) {
        console.error('Error fetching dashboard indices:', err);
      }
    };

    fetchData();
  }, [token, user, refreshTrigger]);

  const handleAuthSuccess = (data: AuthResponse) => {
    localStorage.setItem('documind_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const handleLogout = () => {
    localStorage.removeItem('documind_token');
    setToken(null);
    setUser(null);
    setActiveTab('dashboard');
  };

  const forceRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // If fetching authentic identity, display loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center animate-spin mb-4">
          <BrainCircuit className="h-6 w-6 text-slate-950 stroke-[2.5]" />
        </div>
        <p className="text-slate-400 font-semibold text-xs uppercase tracking-widest animate-pulse">
          Decrypting secured memory vault...
        </p>
      </div>
    );
  }

  // If guest, show Authentication Landing
  if (!token || !user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden select-none">
      {/* Visual Ambient Light Spots */}
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/5 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-cyan-500/5 blur-[150px] pointer-events-none" />

      {/* 1. Global Navigation Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 select-none px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
            <BrainCircuit className="h-4.5 w-4.5 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            DocuMind AI
          </span>
        </div>

        {/* Tab route control widgets */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/50 rounded-xl border border-slate-800/65">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Document Vault
          </button>
          
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <MessageSquareLock className="h-3.5 w-3.5" /> Q&amp;A AI Agent
          </button>
        </div>

        {/* Identity & Session Control */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-850 bg-slate-900/30">
            <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="truncate max-w-[120px] font-semibold text-slate-300">
              {user.name}
            </span>
          </div>

          <button
            onClick={forceRefresh}
            className="p-2 hover:bg-slate-900 rounded-xl border border-slate-850 hover:text-white transition cursor-pointer text-slate-500"
            title="Reload indices"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 py-2 px-3 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition cursor-pointer text-slate-400 font-bold"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* 2. Main Tab Viewport */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <DashboardTab 
                stats={stats}
                pdfs={pdfs}
                authToken={token}
                onRefresh={forceRefresh}
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <ChatTab 
                sessions={sessions}
                pdfs={pdfs}
                authToken={token}
                onRefreshSessions={forceRefresh}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
