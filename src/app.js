import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import authRoutes from './routes/authRoutes.js';
import staffRoutes from './routes/staffRoutes.js';

BigInt.prototype.toJSON = function () {
  return this.toString();
};

dotenv.config();

const app = express();
const port = process.env.PORT || 3030;

const allowedOrigins = [
  'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy: URL ini tidak diizinkan mengakses API.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleare
app.use(cookieParser());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes)

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
