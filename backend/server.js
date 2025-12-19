// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dialogRoutes from './routes/dialog.js';
import contextRoutes from './routes/context.js';
import resourcesRoutes from './routes/resources.js';
import llmRoutes from './routes/llm.js';
import cypressRoutes from './routes/cypress.js';
import sessionsRoutes from './routes/sessions.js';
import ecDatabaseRoutes, { binomiRouter } from './routes/ecDatabase.js';
import contextDocumentRoutes from './routes/contextDocument.js';
import businessSpecRoutes from './routes/businessSpec.js';
import llmMatchRoutes from './routes/llmMatch.js';

// Carica variabili d'ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Aumenta il limite del body a 10MB per gestire contesti grandi
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/dialog', dialogRoutes);
app.use('/api/context', contextRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/cypress', cypressRoutes);
app.use('/api/sessions', sessionsRoutes);
console.log('✅ Route /api/sessions registrata');
app.use('/api/ec-objects', ecDatabaseRoutes);
console.log('✅ Route /api/ec-objects registrata');
app.use('/api/binomi', binomiRouter);
console.log('✅ Route /api/binomi registrata');
app.use('/api/context-document', contextDocumentRoutes);
console.log('✅ Route /api/context-document registrata');
app.use('/api/business-spec', businessSpecRoutes);
console.log('✅ Route /api/business-spec registrata');
app.use('/api/llm-match', llmMatchRoutes);
console.log('✅ Route /api/llm-match registrata');

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler (deve essere prima dell'error handler)
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route non trovata: ' + req.path 
  });
});

// Error handler globale (deve essere l'ultimo, con 4 parametri)
app.use((err, req, res, next) => {
  console.error('Errore non gestito:', err);
  res.status(err.status || 500).json({ 
    error: 'Errore interno del server: ' + err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🚀 G2A Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 OpenAI API Key configurata: ${process.env.OPENAI_API_KEY ? 'Sì' : 'No'}`);
});

