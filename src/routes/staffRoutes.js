import express from 'express';
import { verifyToken, verifyProgramAccess } from '../middleware/authUser.js';
import { staffController } from '../controllers/staffController.js';

const router = express.Router();

router.use(verifyToken);
router.use(verifyProgramAccess);

// DropDown Pengadaan
router.get('/pengadaan', staffController.getPengadaan);

// Buat Program
router.post('/program', staffController.createProgram);

export default router;