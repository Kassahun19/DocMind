import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BrainCircuit, LayoutDashboard, MessageSquareLock, LogOut, 
  Database, UserCheck, RefreshCw, Layers, Sparkles, CreditCard, ShieldAlert, Users
} from 'lucide-react';

import AuthScreen from './components/AuthScreen';
import DashboardTab from './components/DashboardTab';
import ChatTab from './components/ChatTab';
import BillingTab from './components/BillingTab';
import AdminTab from './components/AdminTab';
import { User, PDFDocument, ChatSession, DashboardStats, AuthResponse } from './types';

// Establish a default, eye-pleasing theme state
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('documind_token'));
  const [user, setUser] = useState<User | null>(null);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'billing' | 'admin'>('dashboard');
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
      }
    };

    fetchProfile();
  }, [token, refreshTrigger]);

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
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 select-none px-4 py-3 md:px-6 md:py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Row 1 / Left section: Logo */}
        <div className="w-full xl:w-auto flex items-center justify-between xl:justify-start gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0">
              <BrainCircuit className="h-4.5 w-4.5 text-slate-950 stroke-[2.5]" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent shrink-0">
              DocuMind AI
            </span>
          </div>
        </div>

        {/* Tab route control widgets - Centered on mobile and desktop */}
        <div className="w-full xl:w-auto flex flex-wrap justify-center items-center gap-1.5 p-1 bg-slate-900/50 rounded-xl border border-slate-800/65 max-w-full overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-indigo-505 to-cyan-505 bg-indigo-500 text-slate-900'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Document Vault</span><span className="sm:hidden">Vault</span>
          </button>
          
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-indigo-505 to-cyan-505 bg-indigo-500 text-slate-900'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <MessageSquareLock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Q&amp;A Agent</span><span className="sm:hidden">Q&amp;A</span>
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition flex items-center gap-1.5 cursor-pointer relative shrink-0 ${
              activeTab === 'billing'
                ? 'bg-gradient-to-r from-indigo-505 to-cyan-505 bg-indigo-500 text-slate-900'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pricing</span><span className="sm:hidden">Price</span>
            {user.tier === 'free' && (user.promptCount || 0) >= 5 && (
              <span className="absolute -top-1.5 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </button>

          {user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'admin'
                  ? 'bg-gradient-to-r from-indigo-505 to-cyan-505 bg-indigo-500 text-slate-900'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <Users className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Admin Console</span><span className="sm:hidden">Admin</span>
            </button>
          )}
        </div>

        {/* Identity & Session Control */}
        <div className="w-full xl:w-auto flex items-center justify-center xl:justify-end gap-3 md:gap-4 text-xs font-medium text-slate-400 flex-wrap">
          {user.role !== 'admin' && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/auth/make-admin', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) {
                    forceRefresh();
                    setActiveTab('admin');
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-slate-950 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0"
              title="Promote yourself to administrator instantly to test payment approvals"
            >
              Test Admin View
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-850 bg-slate-900/30 shrink-0">
            <UserCheck className={`h-3.5 w-3.5 ${user.role === 'admin' ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span className="truncate max-w-[100px] font-semibold text-slate-300">
              {user.name} {user.role === 'admin' && '(Admin)'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
        </div>
      </header>

      {/* 2. Main Tab Viewport */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardTab 
                stats={stats}
                pdfs={pdfs}
                authToken={token}
                onRefresh={forceRefresh}
                user={user}
              />
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <ChatTab 
                sessions={sessions}
                pdfs={pdfs}
                authToken={token}
                onRefreshSessions={forceRefresh}
                user={user}
                onRefreshUser={forceRefresh}
                onSwitchToBilling={() => setActiveTab('billing')}
              />
            </motion.div>
          )}

          {activeTab === 'billing' && (
            <motion.div
              key="billing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <BillingTab 
                user={user}
                authToken={token!}
                onRefreshUser={forceRefresh}
              />
            </motion.div>
          )}

          {activeTab === 'admin' && user.role === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <AdminTab 
                authToken={token!}
                currentUserEmail={user.email}
                onRefreshCurrentUser={forceRefresh}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
