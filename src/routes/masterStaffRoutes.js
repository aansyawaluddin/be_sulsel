import express from 'express';
import { verifyToken, verifyMasterStaff } from '../middleware/authUser.js';
import { masterStaffController } from '../controllers/masterStaffController.js';
import { uploadDokumen } from '../middleware/uploadMiddleware.js';

const router = express.Router();
router.use(verifyToken);
router.use(verifyMasterStaff);

// Profile
router.patch('/profile', masterStaffController.updateProfile);

// Create Update Delete Dinas
router.post('/dinas', masterStaffController.createDinas);
router.patch('/dinas/:id', masterStaffController.updateDinas);
router.delete('/dinas/:id', masterStaffController.deleteDinas);

// List Dinas
router.get('/dinas', masterStaffController.getDinas);
router.get('/dinas/dropdown', masterStaffController.getDinasDropdown);

// Create Update Delete Staff
router.post('/staff', masterStaffController.createStaff);
router.get('/staff', masterStaffController.getStaffList);
router.get('/staff/:id', masterStaffController.getDetailStaff);
router.patch('/staff/:id', masterStaffController.updateStaff);
router.delete('/staff/:id', masterStaffController.deleteStaff);

// Inbox
router.get('/inbox', masterStaffController.getInbox);

// Validasi Program
router.patch('/program/:slug/terima', masterStaffController.terimaProgram);
router.patch('/program/:slug/tolak', masterStaffController.tolakProgram);

// Hapus Program yang sudah di-ACC
router.delete('/program/:slug/diterima', masterStaffController.deleteProgramDiterima);

// Kunci/Buka Planning
router.patch('/program/:slug/toggle-lock', masterStaffController.toggleLockPlanning);

// Buat & Edit Program Prioritas
router.post('/program', masterStaffController.createProgramPrioritas);
router.patch('/program/:id', masterStaffController.updateProgram);

// List Program per Dinas
router.get('/dinas/:slug/program', masterStaffController.getProgram);

// Detail Program
router.get('/program/:slug', masterStaffController.getDetailProgram);

// Dokumen Program
router.get('/program/:slug/dokumen', masterStaffController.getDokumenProgram);
router.post(
    '/program/:slug/dokumen',
    uploadDokumen.array('dokumen', 5),
    masterStaffController.uploadDokumenProgram
);

// Tambah Pengadaan ke Program
router.post('/program/:slug/tambah-pengadaan', masterStaffController.tambahPengadaanProgram);

// Dropdown Pengadaan
router.get('/pengadaan', masterStaffController.getPengadaan);

// Update Planning
router.patch('/progres/:progresId/planning', masterStaffController.updatePlanningTahapan);

// Update Aktual
router.patch(
    '/progres/:progresId/aktual',
    uploadDokumen.array('dokumen', 5),
    masterStaffController.updateAktualTahapan
);

// Kunci Selesai
router.patch('/progres/:progresId/selesai', masterStaffController.selesaikanTahapan);

export default router;