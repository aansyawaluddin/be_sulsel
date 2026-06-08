import express from 'express';
import { verifyToken, verifyGovernor } from '../middleware/authUser.js';
import { gubernurController } from '../controllers/gubernurController.js';

const router = express.Router();
router.use(verifyToken);
router.use(verifyGovernor);

// Profile
router.patch('/profile', gubernurController.updateProfile);

// List Dinas
router.get('/dinas', gubernurController.getDinas);

// List Program
router.get('/dinas/:slug/program', gubernurController.getProgram);

// Detail Program
router.get('/program/:slug', gubernurController.getDetailProgram);

// Lihat Dokumen Arsip
router.get('/program/:slug/dokumen', gubernurController.getDokumenProgram);

export default router;