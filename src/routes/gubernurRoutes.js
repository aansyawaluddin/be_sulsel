import express from 'express';
import { verifyToken, verifyGovernor } from '../middleware/authUser.js';
import { gubernurController } from '../controllers/gubernurController.js';

const router = express.Router();

router.use(verifyToken);
router.use(verifyGovernor);

// List Dinas
router.get('/dinas', gubernurController.getDinas);

// List Progra
router.get('/dinas/:slug/program', gubernurController.getProgram);

// Detail Program
router.get('/program/:slug', gubernurController.getDetailProgram);

// Liat Dokumen Arsip
router.get('/program/:slug/dokumen', gubernurController.getDokumenProgram);

export default router;