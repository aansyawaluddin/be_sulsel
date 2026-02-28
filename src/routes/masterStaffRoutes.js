import express from 'express';
import { verifyToken, verifyMasterStaff } from '../middleware/authUser.js';
import { masterStaffController } from '../controllers/masterStaffController.js';
import { uploadDokumen } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(verifyMasterStaff);

// Create Update Delete Dinas
router.post('/dinas', masterStaffController.createDinas);
router.patch('/dinas/:id', masterStaffController.updateDinas);
router.delete('/dinas/:id', masterStaffController.deleteDinas);

// Create Update Delete Staff
router.post('/staff', masterStaffController.createStaff);
router.get('/staff/:id', masterStaffController.getDetailStaff);
router.patch('/staff/:id', masterStaffController.updateStaff);
router.delete('/staff/:id', masterStaffController.deleteStaff);

// List DInas
router.get('/dinas', masterStaffController.getDinas);

// List Staff
router.get('/staff', masterStaffController.getStaffList);

// List Program
router.get('/dinas/:slug/program', masterStaffController.getProgram);

// Dropdown Pengadaan
router.get('/pengadaan', masterStaffController.getPengadaan);
router.get('/dinas/dropdown', masterStaffController.getDinasDropdown);

// Buat Program Prooritas
router.post('/program', masterStaffController.createProgramPrioritas);

// Detail Program
router.get('/program/:slug', masterStaffController.getDetailProgram);

// List Dokumen Arsip
router.get('/program/:slug/dokumen', masterStaffController.getDokumenProgram);

// Update Planning
router.patch('/progres/:progresId/planning', masterStaffController.updatePlanningTahapan);

// Update Aktual (beserta upload file)
router.patch(
    '/progres/:progresId/aktual',
    uploadDokumen.array('dokumen', 5),
    masterStaffController.updateAktualTahapan
);

// Upload Dokumen Program
router.post(
    '/program/:slug/dokumen',
    uploadDokumen.array('dokumen', 5),
    masterStaffController.uploadDokumenProgram
);

export default router;