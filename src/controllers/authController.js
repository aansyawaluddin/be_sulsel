import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';

export const authController = {
    login: async (req, res) => {
        try {
            const { username, password } = req.body;

            const user = await prisma.user.findUnique({
                where: { username },
                include: { dinas: true }
            });

            if (!user) return res.status(404).json({ msg: "User tidak ditemukan" });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ msg: "Password salah" });

            const accessToken = jwt.sign(
                {
                    id: user.id,
                    role: user.role,
                    dinasId: user.dinasId
                },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            const refreshToken = jwt.sign(
                { id: user.id, role: user.role },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '1d' }
            );

            await prisma.accessToken.create({
                data: {
                    token: refreshToken,
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
            });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000
            });

            console.log(`✅ [LOGIN SUCCESS] User '${user.username}' (Dinas: ${user.dinasId})`);

            res.json({
                accessToken,
                id: user.id,
                username: user.username,
                role: user.role,
                dinasId: user.dinasId,
                namaDinas: user.dinas ? user.dinas.namaDinas : null
            });

        } catch (error) {
            console.error(`🔥 [LOGIN ERROR]:`, error);
            res.status(500).json({ msg: error.message });
        }
    },

    logout: async (req, res) => {
        try {
            const refreshToken = req.cookies.refreshToken;

            if (!refreshToken) {
                return res.status(204).send();
            }

            await prisma.accessToken.deleteMany({
                where: {
                    token: refreshToken
                }
            });

            res.clearCookie('refreshToken', {
                httpOnly: true,
            });

            console.log(`✅ [LOGOUT SUCCESS] Token berhasil dihapus`);

            res.status(200).json({ msg: "Berhasil logout" });

        } catch (error) {
            console.error(`🔥 [LOGOUT ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    }
};