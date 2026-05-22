import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import { db } from './src/server/db.js';
import { User, PDFDocument, PDFChunk, ChatSession, ChatMessage } from './src/types';

// Redirect logs to server.log so we can debug errors instantly
const logFile = path.join(process.cwd(), 'server.log');
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  originalLog(...args);
  try {
    fs.appendFileSync(logFile, args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
  } catch (e) {}
};
console.error = (...args) => {
  originalError(...args);
  try {
    fs.appendFileSync(logFile, '[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
  } catch (e) {}
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'documind_ai_secret_encryption_key_2026';

// Lazy initialize GoogleGenAI client (secures startup in case key is missing)
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY context environment variable is required for AI capabilities.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Custom Recursive Character-style Text Splitter
function splitText(text: string, chunkSize: number = 800, overlap: number = 150): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const cleanedParagraph = paragraph.replace(/\s+/g, ' ').trim();
    if (!cleanedParagraph) continue;

    if ((currentChunk + ' ' + cleanedParagraph).length <= chunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + cleanedParagraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        // Retain overlap words
        const words = currentChunk.split(' ');
        let overlapText = '';
        for (let i = words.length - 1; i >= 0; i--) {
          if ((words[i] + ' ' + overlapText).length <= overlap) {
            overlapText = words[i] + (overlapText ? ' ' : '') + overlapText;
          } else {
            break;
          }
        }
        currentChunk = overlapText;
      }

      // If single paragraph exceeds max chunk size, divide logically by sentences
      if (cleanedParagraph.length > chunkSize) {
        const sentences = cleanedParagraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length <= chunkSize) {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
          }
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + cleanedParagraph;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter(c => c.trim().length > 10);
}

// Express initialization
const app = express();
app.use(express.json({ limit: '10mb' }));

// Setup file upload directories
const uploadsDir = process.env.VERCEL 
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration (using memoryStorage prevents filesystem bottlenecks and write permission issues on Cloud Run)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported!'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max limit
  },
});

// Authentication middleware
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Token is invalid or expired' });
    }
    req.user = decoded;
    next();
  });
}

// --- API ROUTES ---

// Auth Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields (name, email, password) are required' });
    }

    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email address is already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = Date.now().toString() + Math.round(Math.random() * 1000).toString();
    
    const newUser: any = {
      id,
      name,
      email,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString(),
      promptCount: 0,
      tier: 'free',
      paymentStatus: 'none',
      paymentPlanRequested: null,
      paymentTxId: null,
      paymentDate: null
    };

    db.createUser(newUser);

    // Generate token
    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt,
        promptCount: 0,
        tier: 'free',
        paymentStatus: 'none',
        paymentPlanRequested: null,
        paymentTxId: null,
        paymentDate: null
      },
      token,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Auth Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Dynamic admin reinforcement & direct robust login bypass
    const checkEmail = (email || '').toLowerCase().trim();
    const checkPassword = (password || '').trim();

    if (checkEmail === 'kmulatu21@gmail.com' && checkPassword === 'admin@docmind') {
      let existing = db.getUserByEmail('kmulatu21@gmail.com');
      const hashedPassword = await bcrypt.hash('admin@docmind', 10);
      if (!existing) {
        existing = db.createUser({
          id: `usr-${Date.now()}`,
          name: 'Kmulatu Admin',
          email: 'kmulatu21@gmail.com',
          password: hashedPassword,
          role: 'admin',
          createdAt: new Date().toISOString(),
          promptCount: 0,
          tier: 'premium',
          paymentStatus: 'approved'
        });
        console.log('Interception: dynamically created kmulatu21@gmail.com administrator account');
      } else {
        // Double check existing fields are correct
        if (existing.role !== 'admin' || existing.tier !== 'premium' || !await bcrypt.compare('admin@docmind', existing.password)) {
          existing = db.updateUser({
            id: existing.id,
            role: 'admin',
            tier: 'premium',
            paymentStatus: 'approved',
            password: hashedPassword
          });
          console.log('Interception: dynamically corrected kmulatu21@gmail.com admin credentials and role');
        }
      }

      // Generate token and return session immediately! This guarantees flawless 100% login success.
      const token = jwt.sign({ id: existing.id, email: existing.email, role: existing.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        user: {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          role: existing.role,
          createdAt: existing.createdAt,
          promptCount: existing.promptCount || 0,
          tier: existing.tier || 'premium',
          paymentStatus: existing.paymentStatus || 'approved',
          paymentPlanRequested: existing.paymentPlanRequested || null,
          paymentTxId: existing.paymentTxId || null,
          paymentDate: existing.paymentDate || null
        },
        token,
      });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        promptCount: user.promptCount || 0,
        tier: user.tier || 'free',
        paymentStatus: user.paymentStatus || 'none',
        paymentPlanRequested: user.paymentPlanRequested || null,
        paymentTxId: user.paymentTxId || null,
        paymentDate: user.paymentDate || null
      },
      token,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Auth get profile
app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      promptCount: user.promptCount || 0,
      tier: user.tier || 'free',
      paymentStatus: user.paymentStatus || 'none',
      paymentPlanRequested: user.paymentPlanRequested || null,
      paymentTxId: user.paymentTxId || null,
      paymentDate: user.paymentDate || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PDF List Uploads
app.get('/api/pdf', authenticateToken, (req: any, res) => {
  try {
    const pdfs = db.getPDFsByUser(req.user.id);
    res.json(pdfs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PDF Upload & Process
app.post('/api/pdf/upload', authenticateToken, upload.array('files'), async (req: any, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userPdfs = db.getPDFsByUser(req.user.id);
    const existingCount = userPdfs.length;
    const tier = user.tier || 'free';
    
    let maxAllowed = 1; // Free and Basic get max 1 PDF
    if (tier === 'pro') {
      maxAllowed = 2; // Pro gets max 2 PDFs
    } else if (tier === 'premium') {
      maxAllowed = 999; // Premium allows 3 or more (essentially unlimited)
    }

    if (existingCount + files.length > maxAllowed) {
      return res.status(403).json({
        error: 'PDF vault limit reached',
        tier,
        currentCount: existingCount,
        maxAllowed,
        message: `Your active ${tier.toUpperCase()} Plan allows a maximum of ${maxAllowed} PDF upload(s). Upgrade your tier to upload more files.`
      });
    }

    // Verify Gemini API key is configured
    try {
      getGeminiClient();
    } catch (e: any) {
      return res.status(503).json({ error: 'Gemini API key is missing. Please set GEMINI_API_KEY in the Secrets panel.' });
    }

    const ai = getGeminiClient();
    const processedDocs: PDFDocument[] = [];

    // Helper for sequential async PDF parsing & embedding
    for (const file of files) {
      // Use file.buffer directly from memoryStorage
      const fileBuffer = file.buffer;
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error(`Uploaded file ${file.originalname} is empty or has binary stream issues.`);
      }

      const pdfId = Date.now().toString() + Math.round(Math.random() * 1000).toString();
      const safeStoreName = `${pdfId}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const filePath = path.join(uploadsDir, safeStoreName);
      
      // Store the PDF permanently on disk
      fs.writeFileSync(filePath, fileBuffer);
      
      // Parse content page-by-page using custom pagerender callback
      const pageTexts: { pageNum: number; text: string }[] = [];
      const pdfData = await pdfParse(fileBuffer, {
        pagerender: function(pageData: any) {
          return pageData.getTextContent().then(function(textContent: any) {
            let lastY: number | undefined, text = '';
            for (const item of textContent.items) {
              if (lastY === undefined || lastY === item.transform[5]) {
                text += item.str;
              } else {
                text += '\n' + item.str;
              }
              lastY = item.transform[5];
            }
            const pageNum = pageData.pageNumber || pageData.pageIndex + 1 || 1;
            pageTexts.push({ pageNum, text });
            return text;
          });
        }
      });

      const pageCount = pdfData.numpages || pageTexts.length || 1;

      // Create PDF record referencing physical filePath on disk
      const pdfInfo: PDFDocument = {
        id: pdfId,
        userId: req.user.id,
        fileName: file.originalname,
        filePath,
        fileSize: file.size,
        pageCount,
        uploadDate: new Date().toISOString(),
      };

      // Extract chunks and index them page by page
      const generatedChunks: PDFChunk[] = [];
      let globalChunkIdx = 0;

      if (pageTexts.length > 0) {
        for (const page of pageTexts) {
          if (!page.text || page.text.trim().length <= 5) continue;
          const pageChunks = splitText(page.text, 800, 150);
          for (const text of pageChunks) {
            try {
              const embedRes = await ai.models.embedContent({
                model: 'gemini-embedding-2-preview',
                contents: text,
              });

              const anyRes = embedRes as any;
              const values = anyRes.embedding?.values || anyRes.embeddings?.[0]?.values;
              if (values && values.length > 0) {
                generatedChunks.push({
                  id: `${pdfId}-chunk-${globalChunkIdx++}`,
                  pdfId,
                  userId: req.user.id,
                  text,
                  embedding: values,
                  pageNum: page.pageNum,
                });
              }
            } catch (embedError) {
              console.error(`Error embedding chunk for page ${page.pageNum} in file ${file.originalname}:`, embedError);
            }
          }
        }
      } else {
        // Fallback for full textual extraction
        const extractedText = pdfData.text || '';
        const textChunks = splitText(extractedText);
        for (let i = 0; i < textChunks.length; i++) {
          const text = textChunks[i];
          try {
            const embedRes = await ai.models.embedContent({
              model: 'gemini-embedding-2-preview',
              contents: text,
            });

            const anyRes = embedRes as any;
            const values = anyRes.embedding?.values || anyRes.embeddings?.[0]?.values;
            if (values && values.length > 0) {
              generatedChunks.push({
                id: `${pdfId}-chunk-${globalChunkIdx++}`,
                pdfId,
                userId: req.user.id,
                text,
                embedding: values,
                pageNum: 1,
              });
            }
          } catch (embedError) {
            console.error(`Error embedding chunk ${i} for file ${file.originalname}:`, embedError);
          }
        }
      }

      // Store in DB
      db.savePDF(pdfInfo);
      if (generatedChunks.length > 0) {
        db.saveChunks(generatedChunks);
      }
      processedDocs.push(pdfInfo);
    }

    res.status(201).json(processedDocs);
  } catch (error: any) {
    console.error('Error in upload controller:', error);
    res.status(500).json({ error: error.message || 'Failed to process document uploads' });
  }
});

// PDF Delete
app.delete('/api/pdf/:id', authenticateToken, (req: any, res) => {
  try {
    const success = db.deletePDF(req.params.id, req.user.id);
    if (!success) {
      return res.status(404).json({ error: 'PDF not found or unauthorized' });
    }
    res.json({ message: 'Document and processed knowledge successfully deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Chat Sessions List
app.get('/api/chats', authenticateToken, (req: any, res) => {
  try {
    const sessions = db.getChatSessions(req.user.id);
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Chat Session
app.post('/api/chats', authenticateToken, (req: any, res) => {
  try {
    const { title } = req.body;
    const session: ChatSession = {
      id: Date.now().toString() + Math.round(Math.random() * 1000).toString(),
      userId: req.user.id,
      title: title || 'New PDF Inquiry',
      messages: [],
      createdAt: new Date().toISOString(),
    };
    db.saveChatSession(session);
    res.status(201).json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Chat Session
app.delete('/api/chats/:id', authenticateToken, (req: any, res) => {
  try {
    const success = db.deleteChatSession(req.params.id, req.user.id);
    if (!success) {
      return res.status(404).json({ error: 'Chat session not found or unauthorized' });
    }
    res.json({ message: 'Chat history cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit Query & Q&A RAG Retrieval
app.post('/api/chats/:id/message', authenticateToken, upload.single('questionFile'), async (req: any, res) => {
  try {
    const { message } = req.body;
    const sessionId = req.params.id;

    if ((!message || message.trim() === '') && !req.file) {
      return res.status(400).json({ error: 'Query message or questions file upload is required' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const promptCount = user.promptCount || 0;
    const tier = user.tier || 'free';
    const paymentStatus = user.paymentStatus || 'none';

    if (tier === 'free') {
      const userPdfsCount = db.getPDFsByUser(req.user.id).length;
      if (promptCount >= 5 || userPdfsCount >= 1) {
        return res.status(403).json({
          error: 'Free credit limit reached or document limit reached',
          promptLimitReached: true,
          message: 'Your free tier has completed. You have either hit the limit of 5 free prompt requests or indexed 1 PDF document. Please upgrade your plan to continue asking questions.'
        });
      }
    } else {
      // Basic, Pro, or Premium status checks:
      if (paymentStatus !== 'approved') {
        return res.status(403).json({
          error: 'Payment pending approval',
          paymentPendingApproval: true,
          message: 'Your payment is being reviewed. The app will be unlocked as soon as an admin approves your transaction proof.'
        });
      }
    }

    const session = db.getChatSession(sessionId, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    // Verify Gemini API Connection
    let ai;
    try {
      ai = getGeminiClient();
    } catch (e) {
      return res.status(503).json({ error: 'Gemini API key is not configured. Please use the Secrets panel to enter your GEMINI_API_KEY.' });
    }

    // Parse question PDF if attached
    let questionFileContext = '';
    let questionFileName = '';
    let displayUserMessage = message || '';

    if (req.file) {
      questionFileName = req.file.originalname;
      const qPageTexts: { pageNum: number; text: string }[] = [];
      try {
        const qPdfData = await pdfParse(req.file.buffer, {
          pagerender: function(pageData: any) {
            return pageData.getTextContent().then(function(textContent: any) {
              let lastY: number | undefined, text = '';
              for (const item of textContent.items) {
                if (lastY === undefined || lastY === item.transform[5]) {
                  text += item.str;
                } else {
                  text += '\n' + item.str;
                }
                lastY = item.transform[5];
              }
              const pageNum = pageData.pageNumber || pageData.pageIndex + 1 || 1;
              qPageTexts.push({ pageNum, text });
              return text;
            });
          }
        });

        if (qPageTexts.length > 0) {
          questionFileContext = qPageTexts.map(qp => 
            `[UPLOADED QUESTIONS FILE: "${questionFileName}" - Page ${qp.pageNum}]:\n${qp.text}`
          ).join('\n\n');
        } else {
          const fallbackText = qPdfData.text || '';
          questionFileContext = `[UPLOADED QUESTIONS FILE: "${questionFileName}" - Page 1]:\n${fallbackText}`;
        }
      } catch (parseErr: any) {
        console.error('Error parsing uploaded question file:', parseErr);
        questionFileContext = `[ERROR parsing uploaded questions file "${questionFileName}"]`;
      }

      const truncatedPromptLabel = message ? ` - "${message.substring(0, 30)}..."` : '';
      displayUserMessage = `📁 [Questions File: ${questionFileName}]${truncatedPromptLabel}`;
    }

    // Combine user message query with parts of question text for similarity embedding mapping
    let queryEmbeddingText = (message || '').trim();
    if (questionFileContext && queryEmbeddingText.length < 50) {
      queryEmbeddingText += ' ' + questionFileContext.substring(0, 1000);
    }
    if (!queryEmbeddingText) {
      queryEmbeddingText = "Questions and key facts summary";
    }

    // 1. Convert user's question into embedding
    let queryEmbedding: number[] = [];
    try {
      const embedRes = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: queryEmbeddingText,
      });
      const anyRes = embedRes as any;
      queryEmbedding = anyRes.embedding?.values || anyRes.embeddings?.[0]?.values || [];
    } catch (e: any) {
      return res.status(500).json({ error: `Embedding generation failed: ${e.message}` });
    }

    // 2. Perform semantic search over user's PDF chunks using dot-product similarity
    const matches = db.searchSimilarChunks(req.user.id, queryEmbedding, 5);

    // 3. Compile contextual prompts
    let documentContext = '';
    const sources: { pdfId: string; fileName: string; text: string; pageNum?: number }[] = [];

    matches.forEach((match, idx) => {
      const doc = db.getPDF(match.chunk.pdfId);
      const filename = doc ? doc.fileName : 'Unknown Document';
      const pageNum = match.chunk.pageNum || 1;
      
      documentContext += `[Stored Reference Document ${idx + 1}: "${filename}" (Page ${pageNum})]:\n${match.chunk.text}\n\n`;
      
      // Store sources for backend tracking
      sources.push({
        pdfId: match.chunk.pdfId,
        fileName: filename,
        text: match.chunk.text,
        pageNum: pageNum,
      });
    });

    // 4. Construct AI System Instructions
    let systemPrompt = `You are DocuMind AI, an advanced AI-powered PDF Knowledge Assistant.
Your sole mission is to answer user inquiries strictly and accurately based on the text snippets retrieved from the user's uploaded stored documents.

`;

    if (questionFileContext) {
      systemPrompt += `QUESTIONS FILE ATTACHED BY USER:
The user has uploaded a PDF containing questions. Here are the pages and text content from the uploaded questions file:
${questionFileContext}

`;
    }

    systemPrompt += `CONTEXT FROM STORED REFERENCE DOCUMENTS:
${documentContext || 'NO DOCUMENTS HAVE BEEN UPLOADED YET OR NO RELEVANT CONTEXT FOUND.'}

RULES OF ENGAGEMENT:
- Try to give the correct, grounded answer based on the stored PDF file/files.
- Rely ONLY on the provided Context of Uploaded/Stored Documents above to formulate your response.
- DO NOT display any "RAG context citations" section or block under the final answer. Provide all citations and sources naturally inside the text.
- IMPORTANT: You MUST include the exact PDF name and page number of BOTH the question (from the uploaded questions file, e.g. "assignment.pdf", Page X) and the answer (from the stored reference PDF files, e.g. "textbook.pdf", Page Y) for each question/answer in your response.
  For example, format it like: "According to [Questions File Page X], the question asks... The answer can be found in [Reference File Page Y] which states..." or similar clear references.
- If the context matches are blank, or they do not contain facts to resolve the user's instruction, state clearly and humbly: "I cannot find the answer in the uploaded documents." Do not try to hypothesize or supply general knowledge answers.
- Format your response in clean, easy-to-read Markdown. Use headers, bullet points, numbered lists, or bold highlights as necessary to organize your points.`;

    // 5. Ask Gemini - using Chat interface context or Direct generateContent using history
    // Since we want context history, we map previous chats as messages in the contents list
    const promptContents: any[] = [];
    
    // Add brief history (last 6 messages) for conversational continuity
    const history = session.messages.slice(-6);
    history.forEach(m => {
      promptContents.push({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      });
    });

    // Add current user prompt
    const finalPromptText = message || 'Please answer the questions found in our attached questions file based on the reference documents.';
    promptContents.push({
      role: 'user',
      parts: [{ text: finalPromptText }],
    });

    let aiResponseText = '';
    try {
      const genRes = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: promptContents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2, // Lower temperature keeps content strictly grounded
        },
      });

      aiResponseText = genRes.text || 'I encountered an issue generating a grounded answer.';
    } catch (e: any) {
      aiResponseText = `AI Retrieval Error: ${e.message || 'Unknown generation failure'}`;
    }

    // Save user message
    const userMsg: ChatMessage = {
      id: 'msg-user-' + Date.now(),
      sender: 'user',
      text: displayUserMessage || 'Uploaded a questions file.',
      timestamp: new Date().toISOString(),
    };

    // Save AI response
    const aiMsg: ChatMessage = {
      id: 'msg-ai-' + Date.now(),
      sender: 'ai',
      text: aiResponseText,
      timestamp: new Date().toISOString(),
      sources: sources.length > 0 ? sources : undefined,
    };

    session.messages.push(userMsg, aiMsg);
    
    // Give Chat title a descriptive name if it was titled "New PDF Inquiry" and we have a message
    if (session.title === 'New PDF Inquiry' && session.messages.length === 2) {
      const titleLabel = message ? message : `Q&A File: ${questionFileName}`;
      session.title = titleLabel.length > 40 ? titleLabel.substring(0, 37) + '...' : titleLabel;
    }

    db.saveChatSession(session);

    // Save incremented prompt count
    const updatedUserObj = db.updateUser({
      id: req.user.id,
      promptCount: (user.promptCount || 0) + 1
    });

    res.json({
      userMessage: userMsg,
      aiMessage: aiMsg,
      sessionTitle: session.title,
      promptCount: updatedUserObj ? updatedUserObj.promptCount : (user.promptCount || 0) + 1
    });
  } catch (error: any) {
    console.error('Error managing chat message:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze request' });
  }
});

// Fetch Stats Analytics
app.get('/api/stats', authenticateToken, (req: any, res) => {
  try {
    const stats = db.getStats(req.user.id);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submits upgrade with TX reference
app.post('/api/billing/upgrade', authenticateToken, (req: any, res) => {
  try {
    const { plan, txId, paymentReceiptName, paymentReceiptData } = req.body;
    if (!plan || !['basic', 'pro', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan selected. Choose basic, pro, or premium.' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = db.updateUser({
      id: req.user.id,
      paymentPlanRequested: plan,
      paymentTxId: txId || `TX-${Date.now()}`,
      paymentReceiptName: paymentReceiptName || null,
      paymentReceiptData: paymentReceiptData || null,
      paymentStatus: 'pending',
      paymentDate: new Date().toISOString()
    });

    res.json({ message: 'Upgrade request submitted successfully! Pending admin approval.', user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Promoter endpoint to let developers/testers toggles/trigger Admin view easily in UI
app.post('/api/auth/make-admin', authenticateToken, (req: any, res) => {
  try {
    const updatedUser = db.updateUser({
      id: req.user.id,
      role: 'admin'
    });
    res.json({ message: 'Successful switch: You are now an Admin!', user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin helper middleware
function requireAdmin(req: any, res: any, next: any) {
  const user = db.getUserById(req.user.id);
  // Authorize if user is explicitly admin or has designated emails
  if (user && (user.role === 'admin' || user.email.toLowerCase() === 'kassahunmulatu273@gmail.com' || user.email.toLowerCase() === 'admin@documind.ai')) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
}

// Admin get list of users with billing properties
app.get('/api/admin/users', authenticateToken, requireAdmin, (req: any, res) => {
  try {
    const users = db.getUsers().map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      promptCount: u.promptCount || 0,
      tier: u.tier || 'free',
      paymentStatus: u.paymentStatus || 'none',
      paymentPlanRequested: u.paymentPlanRequested || null,
      paymentTxId: u.paymentTxId || null,
      paymentDate: u.paymentDate || null,
      paymentReceiptName: u.paymentReceiptName || null,
      paymentReceiptData: u.paymentReceiptData || null
    }));
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin approves/declines a transaction request
app.post('/api/admin/approve-payment', authenticateToken, requireAdmin, (req: any, res) => {
  try {
    const { userId, approved, tier, role, promptCount, paymentStatus } = req.body;
    const user = db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedFields: any = {};
    if (approved !== undefined) {
      if (approved) {
        updatedFields.paymentStatus = 'approved';
        updatedFields.tier = tier || user.paymentPlanRequested || 'basic';
      } else {
        updatedFields.paymentStatus = 'none';
        updatedFields.paymentPlanRequested = null;
        updatedFields.paymentTxId = null;
        updatedFields.paymentReceiptName = null;
        updatedFields.paymentReceiptData = null;
      }
    }

    if (tier !== undefined) {
      updatedFields.tier = tier;
    }

    if (role !== undefined) {
      updatedFields.role = role;
    }

    if (promptCount !== undefined) {
      updatedFields.promptCount = Number(promptCount);
    }

    if (paymentStatus !== undefined) {
      updatedFields.paymentStatus = paymentStatus;
    }

    const updatedUser = db.updateUser({
      id: userId,
      ...updatedFields
    });

    res.json({ message: 'User status successfully updated!', user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback for unmatched API routes to prevent Vite SPA HTML responses
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.path} not found` });
});

// Create global error-handling middleware to ensure all errors are returned as JSON, preventing Vite/HTML fallback issues
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Captured unhandled server error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'An unexpected error occurred during document processing'
  });
});

// Serve files physically inside uploads if authorized (optional, keep simple files private or accessible via proxy if required)
// Since we only query textual chunks, we don't need direct file serving routes unless they want to preview. Let's make it secure.

// --- BIND VITE DEV SERVER OR SERVE STATIC MAIN PAGE ---
async function startServer() {
  // Seed default admin user if not present
  try {
    const existingAdmin = db.getUserByEmail('kmulatu21@gmail.com');
    if (!existingAdmin) {
      const hashedPassword = bcrypt.hashSync('admin@docmind', 10);
      db.createUser({
        id: `usr-${Date.now()}`,
        name: 'Kmulatu Admin',
        email: 'kmulatu21@gmail.com',
        password: hashedPassword,
        role: 'admin',
        createdAt: new Date().toISOString(),
        promptCount: 0,
        tier: 'premium',
        paymentStatus: 'approved'
      });
      console.log('Seeded default admin user: kmulatu21@gmail.com');
    } else {
      // Ensure the role is admin and tier is premium
      if (existingAdmin.role !== 'admin' || existingAdmin.tier !== 'premium') {
        db.updateUser({
          id: existingAdmin.id,
          role: 'admin',
          tier: 'premium',
          paymentStatus: 'approved'
        });
        console.log('Updated existing user kmulatu21@gmail.com to be Admin and Premium');
      }
    }
  } catch (err) {
    console.error('Error seeding admin user:', err);
  }

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server launched on Port ${PORT}`);
    });
  }
}

startServer();

export default app;
