import express from 'express';
import { verifyToken, verifyProgramAccess } from '../middleware/authUser.js';
import { staffController } from '../controllers/staffController.js';
import { uploadDokumen } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(verifyProgramAccess);

// Dinas
router.get('/dinas', staffController.getDinas);

// List Program
router.get('/:slug/program', staffController.getProgram);

// DropDown Pengadaan
router.get('/pengadaan', staffController.getPengadaan);

// Buat Program
router.post('/program', staffController.createProgram);

// Detail Program
router.get('/program/:slug', staffController.getDetailProgram);

// Update Planning
router.patch('/progres/:progresId/planning', staffController.updatePlanningTahapan);

// Update Aktual
router.patch(
    '/progres/:progresId/aktual',
    uploadDokumen.array('dokumen', 5),
    staffController.updateAktualTahapan
);

// Daftar Dokumen Program
router.get('/program/:slug/dokumen', staffController.getDokumenProgram);

// Upload Dokumen Program
router.post(
    '/program/:slug/dokumen',
    uploadDokumen.array('dokumen', 5),
    staffController.uploadDokumenProgram
);

export default router;