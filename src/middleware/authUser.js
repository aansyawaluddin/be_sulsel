import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js'; 

export const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ msg: "Akses Ditolak: Token tidak ditemukan" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: { dinas: true }
        });

        if (!user) return res.status(404).json({ msg: "User tidak valid" });

        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            dinasId: user.dinasId,
            namaDinas: user.dinas ? user.dinas.namaDinas : null
        };

        next();
    } catch (error) {
        return res.status(403).json({ msg: "Token Invalid atau Kadaluarsa" });
    }
};

export const verifyGovernor = (req, res, next) => {
    if (req.user.role !== 'GUBERNUR') {
        return res.status(403).json({
            msg: "Akses Terlarang: Fitur ini khusus untuk Gubernur."
        });
    }
    next();
};

export const verifyProgramAccess = (req, res, next) => {
    const allowedRoles = ['GUBERNUR', 'STAFF'];

    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ msg: "Akses Terlarang" });
    }

    if (req.user.role === 'GUBERNUR') return next();

    if (!req.user.dinasId) {
        return res.status(403).json({ msg: "Anda belum ditugaskan ke Dinas manapun." });
    }

    next();
};