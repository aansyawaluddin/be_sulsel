import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import bcrypt from 'bcrypt';
import { DAY_MS, getMidnightMs, addDaysMs, hitungForecastPengadaan } from '../utils/dateHelper.js';
import { getCache, setCache, deleteCache, deleteCacheByPrefix } from '../utils/cache.js';
import { logActivity } from '../utils/logger.js';

export const masterStaffController = {

    createDinas: async (req, res) => {
        try {
            const { namaDinas } = req.body;
            if (!namaDinas) return res.status(400).json({ msg: "Nama Dinas wajib diisi" });

            const baseSlug = namaDinas.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const dinasBaru = await prisma.dinas.create({
                data: { namaDinas, slug: baseSlug }
            });

            deleteCacheByPrefix('getDinas:');
            deleteCache('dinasDropdown');

            logActivity(req, 'CREATE DINAS', `Nama: ${namaDinas}`);
            res.status(201).json({ msg: "Berhasil membuat Dinas baru", data: dinasBaru });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    getDinas: async (req, res) => {
        try {
            const { role, username } = req.user;

            const cacheKey = `getDinas:${role}`;
            const cached = getCache(cacheKey);
            if (cached) {
                logActivity(req, 'GET DINAS', 'dari cache');
                return res.status(200).json({ ...cached, user: { username, role } });
            }

            const dinasList = await prisma.dinas.findMany({
                select: {
                    id: true, namaDinas: true, slug: true,
                    _count: { select: { programs: true } }
                },
                orderBy: { namaDinas: 'asc' }
            });

            const allProgresData = await prisma.progresTahapan.findMany({
                where: {
                    transaksi: {
                        program: { dinasId: { in: dinasList.map(d => d.id) } }
                    }
                },
                select: {
                    status: true,
                    aktualTanggalMulai: true, aktualTanggalSelesai: true,
                    planningTanggalMulai: true, planningTanggalSelesai: true,
                    transaksi: {
                        select: {
                            id: true, programId: true,
                            program: { select: { id: true, dinasId: true } }
                        }
                    }
                }
            });

            const todayMs = getMidnightMs(new Date());
            const dinasStats = Object.fromEntries(
                dinasList.map(d => [d.id, { dikerjakan: 0, terlambat: 0 }])
            );

            const transaksiMap = {};
            for (const progres of allProgresData) {
                const { id: tId, programId, program } = progres.transaksi;
                if (!transaksiMap[tId]) {
                    transaksiMap[tId] = { programId, dinasId: program.dinasId, tahapanList: [] };
                }
                transaksiMap[tId].tahapanList.push(progres);
            }

            const programMap = {};
            for (const { programId, dinasId, tahapanList } of Object.values(transaksiMap)) {
                if (!programMap[programId]) {
                    programMap[programId] = { dinasId, transaksiList: [] };
                }
                programMap[programId].transaksiList.push(tahapanList);
            }

            for (const { dinasId, transaksiList } of Object.values(programMap)) {
                let semuaProgramSelesai = true;
                let isProgramTerlambat = false;
                let sudahDikerjakan = false;

                for (const tahapanList of transaksiList) {
                    const { forecastEndMs, planEndMs, pengadaanSelesai, semuaSelesai } =
                        hitungForecastPengadaan(tahapanList);

                    if (tahapanList.some(t =>
                        t.aktualTanggalMulai !== null || t.aktualTanggalSelesai !== null
                    )) sudahDikerjakan = true;

                    if (!semuaSelesai) semuaProgramSelesai = false;
                    if (forecastEndMs && planEndMs && forecastEndMs > planEndMs) isProgramTerlambat = true;
                    if (!pengadaanSelesai && forecastEndMs && todayMs > forecastEndMs) isProgramTerlambat = true;
                }

                if (semuaProgramSelesai) isProgramTerlambat = false;
                if (sudahDikerjakan) dinasStats[dinasId].dikerjakan++;
                if (isProgramTerlambat) dinasStats[dinasId].terlambat++;
            }

            const formattedDinas = dinasList.map(dinas => ({
                id: dinas.id, namaDinas: dinas.namaDinas, slug: dinas.slug,
                totalProgram: dinas._count.programs,
                programPrioritas: dinasStats[dinas.id]?.dikerjakan ?? 0,
                programTerlambat: dinasStats[dinas.id]?.terlambat ?? 0
            }));

            const responseData = {
                msg: "Berhasil mengambil data seluruh instansi/dinas",
                user: { username, role },
                data: formattedDinas
            };

            setCache(cacheKey, responseData, 30);
            logActivity(req, 'GET DINAS', `${dinasList.length} dinas`);
            res.status(200).json(responseData);

        } catch (error) {
            console.error(`🔥 [MASTER - GET DINAS ERROR]:`, error);
            res.status(500).json({ msg: error.message });
        }
    },

    updateDinas: async (req, res) => {
        try {
            const { id } = req.params;
            const { namaDinas } = req.body;

            const baseSlug = namaDinas.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const slugUnik = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;

            const dinasDiupdate = await prisma.dinas.update({
                where: { id: parseInt(id) },
                data: { namaDinas, slug: slugUnik }
            });

            deleteCacheByPrefix('getDinas:');
            deleteCache('dinasDropdown');

            logActivity(req, 'UPDATE DINAS', `ID: ${id} → Nama: ${namaDinas}`);
            res.status(200).json({ msg: "Dinas berhasil diupdate", data: dinasDiupdate });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    deleteDinas: async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.dinas.delete({ where: { id: parseInt(id) } });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');
            deleteCache('dinasDropdown');

            logActivity(req, 'DELETE DINAS', `ID: ${id}`);
            res.status(200).json({ msg: "Dinas berhasil dihapus" });
        } catch (error) {
            res.status(500).json({ msg: "Gagal menghapus dinas. Pastikan tidak ada data yang terikat." });
        }
    },

    getDinasDropdown: async (req, res) => {
        try {
            const cacheKey = 'dinasDropdown';
            const cached = getCache(cacheKey);
            if (cached) return res.status(200).json(cached);

            const dinasList = await prisma.dinas.findMany({
                select: { id: true, namaDinas: true },
                orderBy: { namaDinas: 'asc' }
            });

            const response = {
                msg: "Berhasil mengambil daftar Dinas untuk dropdown",
                data: dinasList
            };

            setCache(cacheKey, response, 120);
            logActivity(req, 'GET DINAS DROPDOWN');
            res.status(200).json(response);
        } catch (error) {
            console.error(`🔥 [MASTER - GET DINAS DROPDOWN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    createStaff: async (req, res) => {
        try {
            const { username, password, name, dinasId } = req.body;
            if (!username || !password || !dinasId) {
                return res.status(400).json({ msg: "Username, password, dan dinasId wajib diisi" });
            }

            const salt = await bcrypt.genSalt(10);
            const hashPassword = await bcrypt.hash(password, salt);

            const staffBaru = await prisma.user.create({
                data: { username, password: hashPassword, name, role: 'staff', dinasId: parseInt(dinasId) }
            });

            deleteCache('staffList');

            logActivity(req, 'CREATE STAFF', `Username: ${username}`);
            res.status(201).json({
                msg: "Berhasil membuat akun Staff",
                data: { username: staffBaru.username, name: staffBaru.name }
            });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    getStaffList: async (req, res) => {
        try {
            const cacheKey = 'staffList';
            const cached = getCache(cacheKey);
            if (cached) {
                logActivity(req, 'GET STAFF LIST', 'dari cache');
                return res.status(200).json(cached);
            }

            const staffList = await prisma.user.findMany({
                where: { role: 'staff' },
                select: {
                    id: true, username: true, name: true,
                    dinas: { select: { namaDinas: true } }, createdAt: true
                }
            });

            const response = { msg: "Berhasil mengambil data staff", data: staffList };
            setCache(cacheKey, response, 60);
            logActivity(req, 'GET STAFF LIST', `${staffList.length} staff`);
            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    getDetailStaff: async (req, res) => {
        try {
            const { id } = req.params;

            const detailStaff = await prisma.user.findUnique({
                where: { id: parseInt(id) },
                select: {
                    id: true, username: true, name: true, dinasId: true,
                    dinas: { select: { namaDinas: true } }, role: true, createdAt: true
                }
            });

            if (!detailStaff || detailStaff.role !== 'staff') {
                return res.status(404).json({ msg: "Data Staff tidak ditemukan." });
            }

            logActivity(req, 'GET DETAIL STAFF', `ID: ${id} | Username: ${detailStaff.username}`);
            res.status(200).json({ msg: "Berhasil mengambil detail data staff", data: detailStaff });
        } catch (error) {
            console.error(`🔥 [MASTER - GET DETAIL STAFF ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateStaff: async (req, res) => {
        try {
            const { id } = req.params;
            const { username, password, name, dinasId } = req.body;

            const existingUser = await prisma.user.findUnique({ where: { id: parseInt(id) } });

            if (!existingUser || existingUser.role !== 'staff') {
                return res.status(404).json({ msg: "Data Staff tidak ditemukan." });
            }

            const dataUpdate = {};
            if (username) dataUpdate.username = username;
            if (name) dataUpdate.name = name;
            if (dinasId) dataUpdate.dinasId = parseInt(dinasId);
            if (password) {
                const salt = await bcrypt.genSalt(10);
                dataUpdate.password = await bcrypt.hash(password, salt);
            }

            const staffDiupdate = await prisma.user.update({
                where: { id: parseInt(id) },
                data: dataUpdate,
                select: {
                    id: true, username: true, name: true, role: true,
                    dinas: { select: { namaDinas: true } }, updatedAt: true
                }
            });

            deleteCache('staffList');

            logActivity(req, 'UPDATE STAFF', `ID: ${id} | Username: ${staffDiupdate.username}`);
            res.status(200).json({ msg: "Data akun Staff berhasil diperbarui", data: staffDiupdate });
        } catch (error) {
            console.error(`🔥 [UPDATE STAFF ERROR]:`, error);
            if (error.code === 'P2002' && error.meta?.target?.includes('username')) {
                return res.status(400).json({ msg: "Username tersebut sudah digunakan oleh akun lain." });
            }
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    deleteStaff: async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.user.delete({ where: { id: parseInt(id) } });

            deleteCache('staffList');

            logActivity(req, 'DELETE STAFF', `ID: ${id}`);
            res.status(200).json({ msg: "Akun Staff berhasil dihapus" });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    getPengadaan: async (req, res) => {
        try {
            const cacheKey = 'pengadaan';
            const cached = getCache(cacheKey);
            if (cached) return res.status(200).json(cached);

            const pengadaanList = await prisma.pengadaan.findMany({
                select: { id: true, namaPengadaan: true },
                orderBy: { id: 'asc' }
            });

            const response = { msg: "Berhasil mengambil data master pengadaan", data: pengadaanList };
            setCache(cacheKey, response, 300);
            logActivity(req, 'GET PENGADAAN');
            res.status(200).json(response);
        } catch (error) {
            console.error(`🔥 [MASTER - GET PENGADAAN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    createProgramPrioritas: async (req, res) => {
        try {
            const { namaProgram, pengadaanList, dinasId, tanggalMulai } = req.body;

            if (!dinasId || !namaProgram || !pengadaanList || pengadaanList.length === 0) {
                return res.status(400).json({ msg: "Semua field termasuk dinasId wajib diisi beserta detail pengadaannya" });
            }

            const result = await prisma.$transaction(async (tx) => {
                const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram, slug: baseSlug, dinasId: parseInt(dinasId),
                        isPrioritas: true, status: 'terima',
                        tanggalMulai: tanggalMulai ? new Date(tanggalMulai) : null
                    }
                });

                for (const item of pengadaanList) {
                    if (!item.anggaran) throw new Error(`Anggaran wajib diisi untuk pengadaan: ${item.title}`);

                    const masterPengadaan = await tx.pengadaan.findUnique({
                        where: { id: parseInt(item.pengadaanId) }
                    });
                    if (!masterPengadaan) throw new Error(`Pengadaan ID ${item.pengadaanId} tidak ditemukan`);

                    const transaksi = await tx.transaksiPengadaan.create({
                        data: {
                            namaTransaksi: `${masterPengadaan.namaPengadaan} - ${programBaru.namaProgram}`,
                            title: item.title || "Tanpa Judul Spesifik",
                            anggaran: BigInt(item.anggaran),
                            programId: programBaru.id,
                            pengadaanId: masterPengadaan.id
                        }
                    });

                    const masterTahapanList = await tx.tahapan.findMany({
                        where: { pengadaanId: masterPengadaan.id },
                        orderBy: { noUrut: 'asc' }
                    });

                    let estimasiTanggalMulai = tanggalMulai ? new Date(tanggalMulai) : new Date();
                    if (!tanggalMulai) estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    estimasiTanggalMulai.setHours(0, 0, 0, 0);

                    const dataProgres = [];
                    for (const tahapan of masterTahapanList) {
                        let tanggalMulaiSekarang = new Date(estimasiTanggalMulai);
                        let tanggalSelesaiSekarang = new Date(tanggalMulaiSekarang);

                        let durasiHari = tahapan.standarWaktuHari;
                        if (tahapan.isWaktuEditable && durasiHari === null) durasiHari = 14;
                        else if (durasiHari === null) durasiHari = 1;

                        tanggalSelesaiSekarang.setDate(tanggalSelesaiSekarang.getDate() + durasiHari);
                        dataProgres.push({
                            transaksiId: transaksi.id, tahapanId: tahapan.id,
                            status: 'on_progress',
                            planningTanggalMulai: tanggalMulaiSekarang,
                            planningTanggalSelesai: tanggalSelesaiSekarang
                        });

                        estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
                        estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    }

                    if (dataProgres.length > 0) {
                        await tx.progresTahapan.createMany({ data: dataProgres });
                    }
                }

                return {
                    id: programBaru.id, namaProgram: programBaru.namaProgram,
                    slug: programBaru.slug, isPrioritas: programBaru.isPrioritas,
                    tanggalMulai: programBaru.tanggalMulai
                };
            });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');
            deleteCache('inbox');

            logActivity(req, 'CREATE PROGRAM PRIORITAS', `Nama: ${namaProgram}`);
            res.status(201).json({
                msg: "Program Prioritas dan jadwal pengadaan berhasil dibuat oleh Master Staff!",
                data: result
            });
        } catch (error) {
            console.error(`🔥 [CREATE PROGRAM PRIORITAS ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateProgram: async (req, res) => {
        try {
            const { id } = req.params;
            const { namaProgram } = req.body;

            if (!namaProgram) return res.status(400).json({ msg: "Nama Program baru wajib diisi." });

            const programEksis = await prisma.program.findUnique({ where: { id: parseInt(id) } });
            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });

            const dataUpdate = { namaProgram };
            if (programEksis.status === 'menunggu') {
                const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                dataUpdate.slug = baseSlug;
            }

            const programDiupdate = await prisma.program.update({
                where: { id: parseInt(id) },
                data: dataUpdate
            });

            deleteCacheByPrefix('getProgram:');
            deleteCache('inbox');

            logActivity(req, 'UPDATE PROGRAM', `ID: ${id} → Nama: ${namaProgram}`);
            res.status(200).json({ msg: "Berhasil mengubah nama program (Master Mode).", data: programDiupdate });
        } catch (error) {
            console.error(`🔥 [MASTER - UPDATE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const cacheKey = `getProgram:master:${slug}`;
            const cached = getCache(cacheKey);
            if (cached) {
                logActivity(req, 'GET PROGRAM', `Dinas: ${slug} | dari cache`);
                return res.status(200).json(cached);
            }

            const programList = await prisma.program.findMany({
                where: { dinas: { slug } },
                select: {
                    id: true, namaProgram: true, slug: true,
                    isPrioritas: true, status: true, isPlanningLocked: true, createdAt: true,
                    pengadaan: {
                        select: {
                            anggaran: true,
                            pengadaan: { select: { namaPengadaan: true } },
                            progresTahapan: {
                                select: {
                                    status: true,
                                    planningTanggalMulai: true, planningTanggalSelesai: true,
                                    aktualTanggalMulai: true, aktualTanggalSelesai: true,
                                    tahapan: { select: { noUrut: true } }
                                },
                                orderBy: { tahapan: { noUrut: 'asc' } }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const todayMs = getMidnightMs(new Date());

            const formattedPrograms = programList.map(program => {
                const calculatedAnggaran = program.pengadaan.reduce(
                    (sum, p) => sum + Number(p.anggaran), 0
                );

                let semuaTahapanSelesai = true;
                let isProgramTerlambat = false;

                if (program.pengadaan.length === 0) {
                    semuaTahapanSelesai = false;
                } else {
                    for (const pengadaan of program.pengadaan) {
                        const { forecastEndMs, planEndMs, pengadaanSelesai, semuaSelesai } =
                            hitungForecastPengadaan(pengadaan.progresTahapan);

                        if (!semuaSelesai) semuaTahapanSelesai = false;
                        if (forecastEndMs && planEndMs && forecastEndMs > planEndMs) isProgramTerlambat = true;
                        if (!pengadaanSelesai && forecastEndMs && todayMs > forecastEndMs) isProgramTerlambat = true;
                    }
                    if (semuaTahapanSelesai) isProgramTerlambat = false;
                }

                return {
                    id: program.id, namaProgram: program.namaProgram, slug: program.slug,
                    anggaran: calculatedAnggaran, status: program.status,
                    isPrioritas: program.isPrioritas, isPlanningLocked: program.isPlanningLocked,
                    createdAt: program.createdAt,
                    pengadaanList: program.pengadaan.map(p => p.pengadaan.namaPengadaan),
                    isSelesai: semuaTahapanSelesai, isTerlambat: isProgramTerlambat
                };
            });

            const responseData = {
                msg: `Berhasil mengambil daftar program untuk dinas: ${slug}`,
                data: formattedPrograms
            };

            setCache(cacheKey, responseData, 30);
            logActivity(req, 'GET PROGRAM', `Dinas: ${slug} | ${programList.length} program`);
            res.status(200).json(responseData);
        } catch (error) {
            console.error(`🔥 [MASTER - GET PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    deleteProgramDiterima: async (req, res) => {
        try {
            const { slug } = req.params;

            const programTarget = await prisma.program.findUnique({
                where: { slug }, include: { dinas: true }
            });

            if (!programTarget) return res.status(404).json({ msg: "Program tidak ditemukan." });

            if (programTarget.status !== 'terima') {
                return res.status(400).json({
                    msg: `Penghapusan ditolak: Status program ini adalah '${programTarget.status}'.`
                });
            }

            await prisma.program.delete({ where: { slug } });

            const targetDir = path.join('public', 'uploads', programTarget.slug);
            if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');
            deleteCache('inbox');

            logActivity(req, 'DELETE PROGRAM DITERIMA', `Slug: ${slug} | Nama: ${programTarget.namaProgram}`);
            res.status(200).json({
                msg: `Program '${programTarget.namaProgram}' berhasil dihapus secara permanen.`
            });
        } catch (error) {
            console.error(`🔥 [MASTER - DELETE PROGRAM DITERIMA ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    toggleLockPlanning: async (req, res) => {
        try {
            const { slug } = req.params;

            const programEksis = await prisma.program.findUnique({ where: { slug } });
            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });

            const statusBaru = !programEksis.isPlanningLocked;

            const programDiupdate = await prisma.program.update({
                where: { slug },
                data: { isPlanningLocked: statusBaru },
                select: { id: true, namaProgram: true, isPlanningLocked: true }
            });

            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'TOGGLE LOCK PLANNING', `Slug: ${slug} → ${statusBaru ? 'DIKUNCI' : 'DIBUKA'}`);
            res.status(200).json({
                msg: `Jadwal Planning untuk '${programDiupdate.namaProgram}' telah ${statusBaru ? 'DIKUNCI' : 'DIBUKA'}.`,
                data: programDiupdate
            });
        } catch (error) {
            console.error(`🔥 [MASTER - TOGGLE LOCK PLANNING ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDetailProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const detailProgram = await prisma.program.findUnique({
                where: { slug },
                include: {
                    dinas: { select: { namaDinas: true } },
                    dokumen: true,
                    pengadaan: {
                        include: {
                            pengadaan: { select: { namaPengadaan: true } },
                            progresTahapan: {
                                include: { tahapan: true, dokumen: true },
                                orderBy: { tahapan: { noUrut: 'asc' } }
                            }
                        }
                    }
                }
            });

            if (!detailProgram) return res.status(404).json({ msg: "Program tidak ditemukan." });

            const calculatedTotalAnggaran = detailProgram.pengadaan.reduce(
                (sum, p) => sum + Number(p.anggaran), 0
            );

            const formattedPengadaanList = detailProgram.pengadaan.map(transaksi => {
                let prevEndDateMs = null;

                const tahapanWithForecast = transaksi.progresTahapan.map(p => {
                    const planStartMs = getMidnightMs(p.planningTanggalMulai);
                    const planEndMs = getMidnightMs(p.planningTanggalSelesai);
                    const aktualStartMs = getMidnightMs(p.aktualTanggalMulai);
                    const aktualEndMs = getMidnightMs(p.aktualTanggalSelesai);

                    let forecastStartMs = null;
                    let forecastEndMs = null;

                    if (planStartMs && planEndMs) {
                        const planDurDays = Math.round((planEndMs - planStartMs) / DAY_MS);

                        if (aktualStartMs && aktualEndMs) {
                            forecastStartMs = aktualStartMs;
                            forecastEndMs = aktualEndMs;
                        } else if (aktualStartMs) {
                            forecastStartMs = aktualStartMs;
                            forecastEndMs = addDaysMs(aktualStartMs, planDurDays);
                        } else {
                            forecastStartMs = prevEndDateMs !== null
                                ? addDaysMs(prevEndDateMs, 1) : planStartMs;
                            forecastEndMs = addDaysMs(forecastStartMs, planDurDays);
                        }
                        prevEndDateMs = forecastEndMs;
                    }

                    return {
                        idTahapan: p.tahapan.id, noUrut: p.tahapan.noUrut,
                        namaTahapan: p.tahapan.namaTahapan,
                        standarWaktuHari: p.tahapan.standarWaktuHari,
                        isWaktuEditable: p.tahapan.isWaktuEditable,
                        bobot: p.tahapan.bobot,
                        progres: {
                            idProgres: p.id, status: p.status,
                            planningTanggalMulai: p.planningTanggalMulai,
                            planningTanggalSelesai: p.planningTanggalSelesai,
                            aktualTanggalMulai: p.aktualTanggalMulai,
                            aktualTanggalSelesai: p.aktualTanggalSelesai,
                            keterangan: p.keterangan,
                            dokumenBukti: p.dokumen ?? [],
                            updatedAt: p.updatedAt
                        },
                        forecast: {
                            forecastTanggalMulai: forecastStartMs
                                ? new Date(forecastStartMs).toISOString() : null,
                            forecastTanggalSelesai: forecastEndMs
                                ? new Date(forecastEndMs).toISOString() : null
                        }
                    };
                });

                const planEndMs = tahapanWithForecast.reduce((max, t) => {
                    const ms = getMidnightMs(t.progres.planningTanggalSelesai);
                    return ms && ms > max ? ms : max;
                }, null);

                const lastForecast = tahapanWithForecast.at(-1)?.forecast.forecastTanggalSelesai;

                return {
                    id: transaksi.id, namaTransaksi: transaksi.namaTransaksi,
                    jenisPengadaan: transaksi.pengadaan.namaPengadaan,
                    title: transaksi.title, anggaran: transaksi.anggaran, createdAt: transaksi.createdAt,
                    forecastKeseluruhan: {
                        planTanggalSelesaiKeseluruhan: planEndMs ? new Date(planEndMs).toISOString() : null,
                        forecastTanggalSelesaiKeseluruhan: lastForecast ?? null
                    },
                    tahapanList: tahapanWithForecast
                };
            });

            logActivity(req, 'GET DETAIL PROGRAM', `Program: ${slug}`);
            res.status(200).json({
                msg: "Berhasil mengambil detail informasi program (Master Mode)",
                data: {
                    id: detailProgram.id, namaProgram: detailProgram.namaProgram,
                    slug: detailProgram.slug, tanggalMulai: detailProgram.tanggalMulai,
                    anggaran: calculatedTotalAnggaran,
                    isPrioritas: detailProgram.isPrioritas,
                    isPlanningLocked: detailProgram.isPlanningLocked,
                    createdAt: detailProgram.createdAt,
                    dinas: detailProgram.dinas,
                    dokumenProgram: detailProgram.dokumen,
                    pengadaanList: formattedPengadaanList
                }
            });
        } catch (error) {
            console.error(`🔥 [MASTER - GET DETAIL PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDokumenProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const program = await prisma.program.findUnique({
                where: { slug }, select: { id: true }
            });

            if (!program) return res.status(404).json({ msg: "Program tidak ditemukan." });

            const dokumenList = await prisma.dokumenProgram.findMany({
                where: { programId: program.id },
                orderBy: { createdAt: 'desc' }
            });

            logActivity(req, 'GET DOKUMEN PROGRAM', `Program: ${slug}`);
            res.status(200).json({ msg: "Berhasil mengambil daftar dokumen program", data: dokumenList });
        } catch (error) {
            console.error(`🔥 [MASTER - GET DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updatePlanningTahapan: async (req, res) => {
        try {
            const { progresId } = req.params;
            const { planningTanggalMulai, planningTanggalSelesai } = req.body;

            const progresEksis = await prisma.progresTahapan.findUnique({
                where: { id: parseInt(progresId) },
                include: { tahapan: true, transaksi: { include: { program: true } } }
            });

            if (!progresEksis) return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });

            const result = await prisma.$transaction(async (tx) => {
                const dataUpdate = {};

                if (planningTanggalMulai) {
                    const d = new Date(planningTanggalMulai);
                    if (!isNaN(d.getTime())) dataUpdate.planningTanggalMulai = d;
                }
                if (planningTanggalSelesai) {
                    const d = new Date(planningTanggalSelesai);
                    if (!isNaN(d.getTime())) dataUpdate.planningTanggalSelesai = d;
                }

                const progresDiupdate = await tx.progresTahapan.update({
                    where: { id: parseInt(progresId) }, data: dataUpdate
                });

                if (dataUpdate.planningTanggalSelesai) {
                    const tahapanSelanjutnya = await tx.progresTahapan.findMany({
                        where: {
                            transaksiId: progresEksis.transaksiId,
                            tahapan: { noUrut: { gt: progresEksis.tahapan.noUrut } }
                        },
                        include: { tahapan: true },
                        orderBy: { tahapan: { noUrut: 'asc' } }
                    });

                    if (tahapanSelanjutnya.length > 0) {
                        let currentEndDate = new Date(dataUpdate.planningTanggalSelesai);

                        for (const nextProgres of tahapanSelanjutnya) {
                            let pMulai = new Date(currentEndDate);
                            pMulai.setDate(pMulai.getDate() + 1);
                            pMulai.setHours(0, 0, 0, 0);

                            let durasiHari = nextProgres.tahapan.standarWaktuHari;
                            if (durasiHari === null) {
                                if (nextProgres.planningTanggalMulai && nextProgres.planningTanggalSelesai) {
                                    const diffTime = nextProgres.planningTanggalSelesai.getTime() - nextProgres.planningTanggalMulai.getTime();
                                    durasiHari = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    if (durasiHari < 0) durasiHari = 1;
                                } else {
                                    durasiHari = nextProgres.tahapan.isWaktuEditable ? 14 : 1;
                                }
                            }

                            let pSelesai = new Date(pMulai);
                            pSelesai.setDate(pSelesai.getDate() + durasiHari);

                            await tx.progresTahapan.update({
                                where: { id: nextProgres.id },
                                data: { planningTanggalMulai: pMulai, planningTanggalSelesai: pSelesai }
                            });

                            currentEndDate = new Date(pSelesai);
                        }
                    }
                }

                return progresDiupdate;
            });

            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'UPDATE PLANNING TAHAPAN', `ProgresID: ${progresId}`);
            res.status(200).json({
                msg: `Berhasil mengatur ulang jadwal planning (Master Mode)`,
                data: result
            });
        } catch (error) {
            console.error(`🔥 [MASTER - UPDATE PLANNING ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateAktualTahapan: async (req, res) => {
        try {
            const { progresId } = req.params;
            const { aktualTanggalMulai, aktualTanggalSelesai, keterangan } = req.body;

            const progresEksis = await prisma.progresTahapan.findUnique({
                where: { id: parseInt(progresId) },
                include: { tahapan: true, transaksi: { include: { program: true } } }
            });

            if (!progresEksis) return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            if (progresEksis.status === 'selesai') {
                return res.status(403).json({ msg: "Akses Ditolak: Tahapan ini sudah diselesaikan dan datanya telah dikunci." });
            }

            const result = await prisma.$transaction(async (tx) => {
                const dataUpdate = {};

                if (keterangan && keterangan.trim() !== "") {
                    let daftarKeterangan = [];
                    if (progresEksis.keterangan) {
                        if (Array.isArray(progresEksis.keterangan)) {
                            daftarKeterangan = progresEksis.keterangan;
                        } else if (typeof progresEksis.keterangan === 'string') {
                            daftarKeterangan.push({
                                catatan: progresEksis.keterangan,
                                tanggal: progresEksis.updatedAt.toISOString(),
                                penulis: "Sistem (Data Lama)"
                            });
                        }
                    }
                    daftarKeterangan.push({
                        catatan: keterangan,
                        tanggal: new Date().toISOString(),
                        penulis: req.user.username
                    });
                    dataUpdate.keterangan = daftarKeterangan;
                }

                if (aktualTanggalMulai) {
                    const d = new Date(aktualTanggalMulai);
                    if (!isNaN(d.getTime())) dataUpdate.aktualTanggalMulai = d;
                }
                if (aktualTanggalSelesai) {
                    const d = new Date(aktualTanggalSelesai);
                    if (!isNaN(d.getTime())) dataUpdate.aktualTanggalSelesai = d;
                }

                await tx.progresTahapan.update({
                    where: { id: parseInt(progresId) }, data: dataUpdate
                });

                if (req.files && req.files.length > 0) {
                    const programSlug = progresEksis.transaksi.program.slug;
                    const targetDir = path.join('public', 'uploads', programSlug);
                    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                    const dataDokumen = req.files.map(file => {
                        fs.renameSync(file.path, path.join(targetDir, file.filename));
                        return {
                            progresTahapanId: parseInt(progresId),
                            namaFile: file.originalname,
                            fileUrl: `/uploads/${programSlug}/${file.filename}`
                        };
                    });

                    await tx.dokumenProgresTahapan.createMany({ data: dataDokumen });
                }

                return await tx.progresTahapan.findUnique({
                    where: { id: parseInt(progresId) },
                    include: { dokumen: true }
                });
            });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'UPDATE AKTUAL TAHAPAN', `ProgresID: ${progresId}`);
            res.status(200).json({ msg: `Berhasil menyimpan data aktual (Master Mode).`, data: result });
        } catch (error) {
            console.error(`🔥 [MASTER - UPDATE AKTUAL ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    selesaikanTahapan: async (req, res) => {
        try {
            const { progresId } = req.params;

            const progresEksis = await prisma.progresTahapan.findUnique({
                where: { id: parseInt(progresId) }
            });

            if (!progresEksis) return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            if (progresEksis.status === 'selesai') {
                return res.status(400).json({ msg: "Tahapan ini sudah dikunci sebelumnya." });
            }

            const progresDikunci = await prisma.progresTahapan.update({
                where: { id: parseInt(progresId) },
                data: { status: 'selesai' }
            });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'SELESAIKAN TAHAPAN', `ProgresID: ${progresId}`);
            res.status(200).json({
                msg: "Tahapan berhasil diselesaikan dan dikunci (Master Mode).",
                data: progresDikunci
            });
        } catch (error) {
            console.error(`🔥 [MASTER - SELESAIKAN TAHAPAN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    uploadDokumenProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const program = await prisma.program.findFirst({ where: { slug } });
            if (!program) return res.status(404).json({ msg: "Program tidak ditemukan." });
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ msg: "Tidak ada dokumen yang diunggah." });
            }

            const targetDir = path.join('public', 'uploads', program.slug);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

            const dataDokumen = req.files.map(file => {
                fs.renameSync(file.path, path.join(targetDir, file.filename));
                return {
                    programId: program.id,
                    namaFile: file.originalname,
                    fileUrl: `/uploads/${program.slug}/${file.filename}`
                };
            });

            await prisma.dokumenProgram.createMany({ data: dataDokumen });

            const dokumenTerbaru = await prisma.dokumenProgram.findMany({
                where: { programId: program.id },
                orderBy: { createdAt: 'desc' }
            });

            logActivity(req, 'UPLOAD DOKUMEN PROGRAM', `Slug: ${slug} | ${req.files.length} file`);
            res.status(201).json({ msg: "Berhasil mengunggah dokumen program (Master Mode)", data: dokumenTerbaru });
        } catch (error) {
            console.error(`🔥 [MASTER - UPLOAD DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getInbox: async (req, res) => {
        try {
            const cacheKey = 'inbox';
            const cached = getCache(cacheKey);
            if (cached) {
                logActivity(req, 'GET INBOX', 'dari cache');
                return res.status(200).json(cached);
            }

            const inboxList = await prisma.program.findMany({
                select: {
                    id: true, namaProgram: true, slug: true, status: true, createdAt: true,
                    dinas: { select: { namaDinas: true } },
                    pengadaan: {
                        select: {
                            anggaran: true,
                            pengadaan: { select: { namaPengadaan: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const formattedInbox = inboxList.map(program => ({
                id: program.id, namaProgram: program.namaProgram,
                dinasPemohon: program.dinas.namaDinas, slug: program.slug,
                status: program.status,
                totalAnggaran: program.pengadaan.reduce((sum, p) => sum + Number(p.anggaran), 0),
                tanggalPengajuan: program.createdAt,
                pengadaanList: program.pengadaan.map(p => p.pengadaan.namaPengadaan)
            }));

            const responseData = {
                msg: "Berhasil mengambil seluruh riwayat program (Semua Status)",
                totalData: formattedInbox.length,
                data: formattedInbox
            };

            setCache(cacheKey, responseData, 30);
            logActivity(req, 'GET INBOX', `${inboxList.length} program`);
            res.status(200).json(responseData);
        } catch (error) {
            console.error(`🔥 [MASTER - GET INBOX ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    terimaProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const programTarget = await prisma.program.findUnique({ where: { slug } });
            if (!programTarget) return res.status(404).json({ msg: "Program tidak ditemukan." });
            if (programTarget.status !== 'menunggu') {
                return res.status(400).json({
                    msg: `Program ini sudah pernah divalidasi dengan status: ${programTarget.status}`
                });
            }

            const programDiterima = await prisma.program.update({
                where: { slug }, data: { status: 'terima' },
                select: {
                    id: true, namaProgram: true, slug: true, status: true,
                    dinas: { select: { namaDinas: true } }
                }
            });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');
            deleteCache('inbox');

            logActivity(req, 'TERIMA PROGRAM', `Slug: ${slug} | Nama: ${programDiterima.namaProgram}`);
            res.status(200).json({
                msg: `Program '${programDiterima.namaProgram}' dari ${programDiterima.dinas.namaDinas} berhasil diterima!`,
                data: programDiterima
            });
        } catch (error) {
            console.error(`🔥 [MASTER - TERIMA PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    tolakProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const programTarget = await prisma.program.findUnique({
                where: { slug }, include: { dinas: true }
            });

            if (!programTarget) return res.status(404).json({ msg: "Program tidak ditemukan." });
            if (programTarget.status !== 'menunggu') {
                return res.status(400).json({
                    msg: `Program ini sudah pernah divalidasi dengan status: ${programTarget.status}`
                });
            }

            await prisma.program.delete({ where: { slug } });

            const targetDir = path.join('public', 'uploads', programTarget.slug);
            if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');
            deleteCache('inbox');

            logActivity(req, 'TOLAK PROGRAM', `Slug: ${slug} | Nama: ${programTarget.namaProgram}`);
            res.status(200).json({
                msg: `Program '${programTarget.namaProgram}' dari ${programTarget.dinas?.namaDinas || 'Tidak Diketahui'} telah DITOLAK dan DIHAPUS.`,
                data: { namaProgram: programTarget.namaProgram, status: 'ditolak_dan_dihapus' }
            });
        } catch (error) {
            console.error(`🔥 [MASTER - TOLAK PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    tambahPengadaanProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const { pengadaanList } = req.body;

            if (!pengadaanList || pengadaanList.length === 0) {
                return res.status(400).json({ msg: "Daftar pengadaan baru wajib diisi." });
            }

            const programEksis = await prisma.program.findUnique({
                where: { slug }, include: { dinas: true }
            });

            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });

            if (programEksis.status !== 'terima') {
                return res.status(400).json({
                    msg: "Fitur ini hanya untuk program yang sudah di-ACC (status: terima)."
                });
            }

            const result = await prisma.$transaction(async (tx) => {
                const pengadaanDibuat = [];

                for (const item of pengadaanList) {
                    if (!item.pengadaanId || !item.anggaran) {
                        throw new Error(`pengadaanId dan anggaran wajib diisi.`);
                    }

                    const masterPengadaan = await tx.pengadaan.findUnique({
                        where: { id: parseInt(item.pengadaanId) }
                    });

                    if (!masterPengadaan) {
                        throw new Error(`Pengadaan ID ${item.pengadaanId} tidak ditemukan.`);
                    }

                    const transaksi = await tx.transaksiPengadaan.create({
                        data: {
                            namaTransaksi: `${masterPengadaan.namaPengadaan} - ${programEksis.namaProgram}`,
                            title: item.title || "Tanpa Judul Spesifik",
                            anggaran: BigInt(item.anggaran),
                            programId: programEksis.id,
                            pengadaanId: masterPengadaan.id
                        }
                    });

                    const masterTahapanList = await tx.tahapan.findMany({
                        where: { pengadaanId: masterPengadaan.id },
                        orderBy: { noUrut: 'asc' }
                    });

                    let estimasiTanggalMulai = item.tanggalMulai
                        ? new Date(item.tanggalMulai) : new Date();

                    if (!item.tanggalMulai) {
                        estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    }
                    estimasiTanggalMulai.setHours(0, 0, 0, 0);

                    const dataProgres = [];
                    for (const tahapan of masterTahapanList) {
                        let tanggalMulaiSekarang = new Date(estimasiTanggalMulai);
                        let tanggalSelesaiSekarang = new Date(tanggalMulaiSekarang);

                        let durasiHari = tahapan.standarWaktuHari;
                        if (tahapan.isWaktuEditable && durasiHari === null) durasiHari = 14;
                        else if (durasiHari === null) durasiHari = 1;

                        tanggalSelesaiSekarang.setDate(tanggalSelesaiSekarang.getDate() + durasiHari);

                        dataProgres.push({
                            transaksiId: transaksi.id, tahapanId: tahapan.id,
                            status: 'on_progress',
                            planningTanggalMulai: tanggalMulaiSekarang,
                            planningTanggalSelesai: tanggalSelesaiSekarang
                        });

                        estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
                        estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    }

                    if (dataProgres.length > 0) {
                        await tx.progresTahapan.createMany({ data: dataProgres });
                    }

                    pengadaanDibuat.push({
                        id: transaksi.id,
                        namaTransaksi: transaksi.namaTransaksi,
                        jenisPengadaan: masterPengadaan.namaPengadaan,
                        title: transaksi.title,
                        anggaran: transaksi.anggaran
                    });
                }

                return pengadaanDibuat;
            });

            deleteCacheByPrefix('getProgram:');
            deleteCacheByPrefix('getDinas:');

            logActivity(req, 'TAMBAH PENGADAAN PROGRAM', `Slug: ${slug} | ${result.length} pengadaan baru`);
            res.status(201).json({
                msg: `Berhasil menambahkan ${result.length} pengadaan baru ke program '${programEksis.namaProgram}'.`,
                data: result
            });

        } catch (error) {
            console.error(`🔥 [MASTER - TAMBAH PENGADAAN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },
};