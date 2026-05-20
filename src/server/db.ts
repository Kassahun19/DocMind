import fs from 'fs';
import path from 'path';
import { User, PDFDocument, PDFChunk, ChatSession, DashboardStats } from '../types';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

// Ensure database directory and file exist
function initializeDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: [],
      pdfs: [],
      chunks: [],
      chatSessions: []
    }, null, 2), 'utf-8');
  }
}

// Low-level read/write
function readData(): {
  users: any[];
  pdfs: PDFDocument[];
  chunks: PDFChunk[];
  chatSessions: ChatSession[];
} {
  initializeDb();
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading database file, resetting:', error);
    return { users: [], pdfs: [], chunks: [], chatSessions: [] };
  }
}

function writeData(data: any): void {
  initializeDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// User CRUD
export const db = {
  // Users
  getUserByEmail(email: string) {
    const data = readData();
    return data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  getUserById(id: string) {
    const data = readData();
    return data.users.find(u => u.id === id);
  },

  createUser(user: any) {
    const data = readData();
    data.users.push(user);
    writeData(data);
    return user;
  },

  // PDFs
  getPDFsByUser(userId: string): PDFDocument[] {
    const data = readData();
    return data.pdfs.filter(p => p.userId === userId);
  },

  getPDF(pdfId: string): PDFDocument | undefined {
    const data = readData();
    return data.pdfs.find(p => p.id === pdfId);
  },

  savePDF(pdf: PDFDocument): void {
    const data = readData();
    data.pdfs.push(pdf);
    writeData(data);
  },

  deletePDF(pdfId: string, userId: string): boolean {
    const data = readData();
    const pdfIndex = data.pdfs.findIndex(p => p.id === pdfId && p.userId === userId);
    if (pdfIndex === -1) return false;

    // Remove file from disk
    const pdf = data.pdfs[pdfIndex];
    try {
      if (fs.existsSync(pdf.filePath)) {
        fs.unlinkSync(pdf.filePath);
      }
    } catch (e) {
      console.error('Error unlinking PDF file:', e);
    }

    data.pdfs.splice(pdfIndex, 1);
    
    // Cascading delete: chunks
    data.chunks = data.chunks.filter(c => c.pdfId !== pdfId);
    
    // Cascading delete: clear any matching source references or leave as is.
    writeData(data);
    return true;
  },

  // Chunks & Embeddings
  saveChunks(chunks: PDFChunk[]): void {
    const data = readData();
    data.chunks.push(...chunks);
    writeData(data);
  },

  // Semantic retrieval using Cosine Similarity (Dot product on normalized vectors)
  searchSimilarChunks(userId: string, queryEmbedding: number[], topK: number = 4): { chunk: PDFChunk; similarity: number }[] {
    const data = readData();
    // Filter chunks by user
    const userChunks = data.chunks.filter(c => c.userId === userId);
    if (userChunks.length === 0) return [];

    const scores = userChunks.map(chunk => {
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      const v1 = queryEmbedding;
      const v2 = chunk.embedding;

      const len = Math.min(v1.length, v2.length);
      for (let i = 0; i < len; i++) {
        dotProduct += v1[i] * v2[i];
        normA += v1[i] * v1[i];
        normB += v2[i] * v2[i];
      }

      const similarity = normA > 0 && normB > 0 
        ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) 
        : 0;

      return { chunk, similarity };
    });

    // Sort by similarity descending
    scores.sort((a, b) => b.similarity - a.similarity);
    return scores.slice(0, topK);
  },

  // Chat sessions
  getChatSessions(userId: string): ChatSession[] {
    const data = readData();
    return data.chatSessions.filter(c => c.userId === userId);
  },

  getChatSession(sessionId: string, userId: string): ChatSession | undefined {
    const data = readData();
    return data.chatSessions.find(c => c.id === sessionId && c.userId === userId);
  },

  saveChatSession(session: ChatSession): void {
    const data = readData();
    const idx = data.chatSessions.findIndex(c => c.id === session.id);
    if (idx !== -1) {
      data.chatSessions[idx] = session;
    } else {
      data.chatSessions.push(session);
    }
    writeData(data);
  },

  deleteChatSession(sessionId: string, userId: string): boolean {
    const data = readData();
    const idx = data.chatSessions.findIndex(c => c.id === sessionId && c.userId === userId);
    if (idx === -1) return false;
    data.chatSessions.splice(idx, 1);
    writeData(data);
    return true;
  },

  // Statistics
  getStats(userId: string): DashboardStats {
    const data = readData();
    const userPdfs = data.pdfs.filter(p => p.userId === userId);
    const userChunks = data.chunks.filter(c => c.userId === userId);
    const userSessions = data.chatSessions.filter(s => s.userId === userId);
    
    let totalChats = 0;
    userSessions.forEach(s => {
      totalChats += s.messages.filter(m => m.sender === 'user').length;
    });

    let storageUsed = 0;
    userPdfs.forEach(p => {
      storageUsed += p.fileSize;
    });

    return {
      totalDocs: userPdfs.length,
      totalChunks: userChunks.length,
      totalChats,
      storageUsed
    };
  }
};
