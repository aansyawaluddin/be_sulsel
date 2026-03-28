import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import gubernurRoutes from './routes/gubernurRoutes.js';
import masterStaffRoutes from './routes/masterStaffRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

BigInt.prototype.toJSON = function () {
  return this.toString();
};

dotenv.config();

const app = express();
const port = process.env.PORT || 3030;

const allowedOrigins = [
  'http://localhost:3000',
  'https://monev-prio.vercel.app',
  'https://www.monevprio.com',
  'https://monevprio.com'
];

app.use(cors({
  origin: function (origin, callback) {
    console.log("Request Origin yang masuk:", origin);
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    } else {
      console.error("CORS BLOCKED untuk origin:", origin);
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));
// Middleare
app.use(cookieParser());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/gubernur', gubernurRoutes);
app.use('/api/master', masterStaffRoutes);

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
