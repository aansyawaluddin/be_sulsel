import multer from 'multer';
import path from 'path';
import fs from 'fs';

const tempDir = 'public/uploads/temp/';
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const parsedPath = path.parse(file.originalname);
        const namaAsliAman = parsedPath.name.replace(/\s+/g, '_');
        const ekstensi = parsedPath.ext;
        const namaFileFinal = `${namaAsliAman}-${Date.now()}${ekstensi}`;
        cb(null, namaFileFinal);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Tipe file tidak valid. Hanya PDF, Word, dan Gambar yang diizinkan.'));
    }
};

export const uploadDokumen = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});