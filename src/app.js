import express from 'express';
import cors from 'cors';
import router from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeDatabase } from './config/database.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ;

app.use(cors());
app.use(express.json());

// Initialize routes
app.use('/api', router);

// Error handling
app.use(errorHandler);

// Database initialization and server start
try {
  await initializeDatabase();
  console.log('Database initialized successfully');
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}

export default app;