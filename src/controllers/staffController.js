import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import { DAY_MS, getMidnightMs, addDaysMs, hitungForecastPengadaan } from '../utils/dateHelper.js';
import { getCache, setCache, deleteCacheByPrefix } from '../utils/cache.js';
import { logActivity } from '../utils/logger.js';

export const staffController = {

    getDinas: async (req, res) => {
        try {
            const { role, dinasId, username } = req.user;

            const cacheKey = `getDinas:${role}:${dinasId ?? 'all'}`;
            const cached = getCache(cacheKey);
            if (cached) {
                logActivity(req, 'GET DINAS', 'dari cache');
                return res.status(200).json({ ...cached, user: { username, role } });
            }

            const dinasList = await prisma.dinas.findMany({
                where: role === 'staff' ? { id: dinasId } : {},
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
            for (const { programId, dinasId: pDinasId, tahapanList } of Object.values(transaksiMap)) {
                if (!programMap[programId]) {
                    programMap[programId] = { dinasId: pDinasId, transaksiList: [] };
                }
                programMap[programId].transaksiList.push(tahapanList);
            }

            for (const { dinasId: pDinasId, transaksiList } of Object.values(programMap)) {
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
                if (sudahDikerjakan) dinasStats[pDinasId].dikerjakan++;
                if (isProgramTerlambat) dinasStats[pDinasId].terlambat++;
            }

            const formattedDinas = dinasList.map(dinas => ({
                id: dinas.id, namaDinas: dinas.namaDinas, slug: dinas.slug,
                totalProgram: dinas._count.programs,
                programPrioritas: dinasStats[dinas.id]?.dikerjakan ?? 0,
                programTerlambat: dinasStats[dinas.id]?.terlambat ?? 0
            }));

            const responseData = {
                msg: "Berhasil mengambil data instansi/dinas",
                user: { username, role },
                data: formattedDinas
            };

            setCache(cacheKey, responseData, 30);
            logActivity(req, 'GET DINAS', `${dinasList.length} dinas`);
            res.status(200).json(responseData);

        } catch (error) {
            console.error(`🔥 [GET DINAS ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
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
            console.error(`🔥 [GET PENGADAAN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    createProgram: async (req, res) => {
        try {
            const { namaProgram, pengadaanList, tanggalMulai } = req.body;
            const dinasId = req.user.dinasId;

            if (!dinasId) return res.status(403).json({ msg: "Akun Staff Anda belum terikat dengan Dinas manapun" });
            if (!namaProgram || !pengadaanList || pengadaanList.length === 0) {
                return res.status(400).json({ msg: "Semua field wajib diisi beserta detail pengadaannya" });
            }

            const result = await prisma.$transaction(async (tx) => {
                const baseSlug = namaProgram.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram, slug: baseSlug, dinasId, isPrioritas: true,
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
                            programId: programBaru.id, pengadaanId: masterPengadaan.id
                        }
                    });

                    const masterTahapanList = await tx.tahapan.findMany({
                        where: { pengadaanId: masterPengadaan.id }, orderBy: { noUrut: 'asc' }
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
                            transaksiId: transaksi.id, tahapanId: tahapan.id, status: 'on_progress',
                            planningTanggalMulai: tanggalMulaiSekarang,
                            planningTanggalSelesai: tanggalSelesaiSekarang
                        });

                        estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
                        estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    }

                    if (dataProgres.length > 0) await tx.progresTahapan.createMany({ data: dataProgres });
                }

                return {
                    id: programBaru.id, namaProgram: programBaru.namaProgram,
                    slug: programBaru.slug, tanggalMulai: programBaru.tanggalMulai
                };
            });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'CREATE PROGRAM', `Nama: ${namaProgram}`);
            res.status(201).json({ msg: "Program dan seluruh jadwal pengadaan berhasil dibuat!", data: result });
        } catch (error) {
            console.error(`🔥 [CREATE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const cacheKey = `getProgram:staff:${slug}:${dinasId}`;
            const cached = getCache(cacheKey);
            if (cached) {
                logActivity(req, 'GET PROGRAM', `Dinas: ${slug} | dari cache`);
                return res.status(200).json(cached);
            }

            const filter = {};

            if (slug) {
                const targetDinas = await prisma.dinas.findUnique({ where: { slug } });
                if (!targetDinas) return res.status(404).json({ msg: "Instansi/Dinas tidak ditemukan." });

                if (role === 'staff' && targetDinas.id !== dinasId) {
                    return res.status(403).json({
                        msg: "Akses Terlarang: Anda tidak diizinkan melihat data milik instansi lain."
                    });
                }

                filter.dinas = { slug };
            }

            if (role === 'staff') filter.dinasId = dinasId;

            const programList = await prisma.program.findMany({
                where: filter,
                select: {
                    id: true, namaProgram: true, slug: true,
                    isPrioritas: true, status: true, tanggalMulai: true, createdAt: true,
                    pengadaan: {
                        select: {
                            id: true, title: true, anggaran: true,
                            pengadaan: { select: { namaPengadaan: true } },
                            progresTahapan: {
                                select: {
                                    status: true,
                                    planningTanggalMulai: true, planningTanggalSelesai: true,
                                    aktualTanggalMulai: true, aktualTanggalSelesai: true,
                                    keterangan: true,
                                    tahapan: { select: { noUrut: true, namaTahapan: true } }
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
                let currentTahapanNama = "Belum Mulai";
                let currentTahapanKeterangan = null;

                if (program.pengadaan.length === 0) {
                    semuaTahapanSelesai = false;
                } else {
                    let foundActiveTahapan = false;
                    for (const pengadaan of program.pengadaan) {
                        if (!foundActiveTahapan) {
                            const activeTahapan = pengadaan.progresTahapan.find(t => t.status === 'on_progress');
                            if (activeTahapan) {
                                currentTahapanNama = activeTahapan.tahapan.namaTahapan;
                                const ket = activeTahapan.keterangan;
                                if (Array.isArray(ket) && ket.length > 0) {
                                    currentTahapanKeterangan = ket[ket.length - 1].catatan;
                                }
                                foundActiveTahapan = true;
                            }
                        }

                        const { forecastEndMs, planEndMs, pengadaanSelesai, semuaSelesai } =
                            hitungForecastPengadaan(pengadaan.progresTahapan);

                        if (!semuaSelesai) semuaTahapanSelesai = false;
                        if (forecastEndMs && planEndMs && forecastEndMs > planEndMs) isProgramTerlambat = true;
                        if (!pengadaanSelesai && forecastEndMs && todayMs > forecastEndMs) isProgramTerlambat = true;
                    }

                    if (semuaTahapanSelesai) {
                        isProgramTerlambat = false;
                        currentTahapanNama = "Selesai Keseluruhan";
                    }
                }

                return {
                    id: program.id, namaProgram: program.namaProgram, slug: program.slug,
                    tanggalMulai: program.tanggalMulai, anggaran: calculatedAnggaran,
                    isPrioritas: program.isPrioritas, status: program.status, createdAt: program.createdAt,
                    pengadaanList: program.pengadaan.map(p => ({
                        id: p.id, metode: p.pengadaan.namaPengadaan,
                        title: p.title, anggaran: Number(p.anggaran)
                    })),
                    isSelesai: semuaTahapanSelesai, isTerlambat: isProgramTerlambat,
                    tahapanSaatIni: currentTahapanNama, keteranganSaatIni: currentTahapanKeterangan
                };
            });

            const responseData = { msg: "Berhasil mengambil daftar program", data: formattedPrograms };
            setCache(cacheKey, responseData, 30);
            logActivity(req, 'GET PROGRAM', `Dinas: ${slug} | ${programList.length} program`);
            res.status(200).json(responseData);

        } catch (error) {
            console.error(`🔥 [GET PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateProgram: async (req, res) => {
        try {
            const { id } = req.params;
            const { namaProgram, tanggalMulai, pengadaanList } = req.body;
            const dinasId = req.user.dinasId;

            const programEksis = await prisma.program.findUnique({ where: { id: parseInt(id) } });
            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });
            if (programEksis.dinasId !== dinasId) {
                return res.status(403).json({ msg: "Akses Terlarang: Anda tidak dapat mengubah program milik instansi lain." });
            }
            if (programEksis.status !== 'menunggu') {
                return res.status(403).json({
                    msg: "Akses Ditolak: Program yang sudah divalidasi tidak dapat diubah rinciannya lagi."
                });
            }

            const result = await prisma.$transaction(async (tx) => {
                const dataUpdate = {};

                if (namaProgram) {
                    dataUpdate.namaProgram = namaProgram;
                    const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                    dataUpdate.slug = baseSlug;
                }

                if (tanggalMulai !== undefined) {
                    dataUpdate.tanggalMulai = tanggalMulai ? new Date(tanggalMulai) : null;
                }

                const programDiupdate = await tx.program.update({
                    where: { id: parseInt(id) }, data: dataUpdate
                });

                if (pengadaanList && Array.isArray(pengadaanList)) {
                    await tx.transaksiPengadaan.deleteMany({ where: { programId: parseInt(id) } });

                    for (const item of pengadaanList) {
                        if (!item.anggaran) throw new Error(`Anggaran wajib diisi untuk pengadaan: ${item.title}`);

                        const masterPengadaan = await tx.pengadaan.findUnique({
                            where: { id: parseInt(item.pengadaanId) }
                        });
                        if (!masterPengadaan) throw new Error(`Pengadaan ID ${item.pengadaanId} tidak ditemukan`);

                        const transaksi = await tx.transaksiPengadaan.create({
                            data: {
                                namaTransaksi: `${masterPengadaan.namaPengadaan} - ${programDiupdate.namaProgram}`,
                                title: item.title || "Tanpa Judul Spesifik",
                                anggaran: BigInt(item.anggaran),
                                programId: programDiupdate.id, pengadaanId: masterPengadaan.id
                            }
                        });

                        const masterTahapanList = await tx.tahapan.findMany({
                            where: { pengadaanId: masterPengadaan.id }, orderBy: { noUrut: 'asc' }
                        });

                        const tglMulaiAcuan = tanggalMulai !== undefined ? tanggalMulai : programEksis.tanggalMulai;
                        let estimasiTanggalMulai = tglMulaiAcuan ? new Date(tglMulaiAcuan) : new Date();
                        if (!tglMulaiAcuan) estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
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
                                transaksiId: transaksi.id, tahapanId: tahapan.id, status: 'on_progress',
                                planningTanggalMulai: tanggalMulaiSekarang,
                                planningTanggalSelesai: tanggalSelesaiSekarang
                            });

                            estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
                            estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                        }

                        if (dataProgres.length > 0) await tx.progresTahapan.createMany({ data: dataProgres });
                    }
                }

                return programDiupdate;
            });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'UPDATE PROGRAM', `ID: ${id}`);
            res.status(200).json({ msg: "Berhasil memperbarui data program secara keseluruhan.", data: result });
        } catch (error) {
            console.error(`🔥 [STAFF - UPDATE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    deleteProgram: async (req, res) => {
        try {
            const { id } = req.params;
            const dinasId = req.user.dinasId;

            const programEksis = await prisma.program.findUnique({ where: { id: parseInt(id) } });
            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });
            if (programEksis.dinasId !== dinasId) {
                return res.status(403).json({ msg: "Akses Terlarang: Anda tidak dapat menghapus program milik instansi lain." });
            }
            if (programEksis.status === 'terima') {
                return res.status(403).json({ msg: "Akses Ditolak: Program yang sudah disetujui tidak dapat dihapus." });
            }

            await prisma.program.delete({ where: { id: parseInt(id) } });

            const targetDir = path.join('public', 'uploads', programEksis.slug);
            if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

            deleteCacheByPrefix('getDinas:');
            deleteCacheByPrefix('getProgram:');

            logActivity(req, 'DELETE PROGRAM', `ID: ${id} | Nama: ${programEksis.namaProgram}`);
            res.status(200).json({ msg: `Program '${programEksis.namaProgram}' berhasil dihapus.` });
        } catch (error) {
            console.error(`🔥 [STAFF - DELETE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDetailProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = { slug };
            if (role === 'staff') filter.dinasId = dinasId;

            const detailProgram = await prisma.program.findFirst({
                where: filter,
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

            if (!detailProgram) {
                return res.status(404).json({
                    msg: "Program tidak ditemukan atau Anda tidak memiliki hak akses untuk melihat program ini."
                });
            }

            if (role === 'staff' && detailProgram.status === 'menunggu') {
                return res.status(403).json({
                    msg: "Akses Ditolak: Program ini sedang menunggu validasi dari Master Staff dan belum bisa diakses."
                });
            }

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
                    id: transaksi.id, pengadaanId: transaksi.pengadaanId,
                    namaTransaksi: transaksi.namaTransaksi,
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
                msg: "Berhasil mengambil detail informasi program beserta hasil forecast",
                data: {
                    id: detailProgram.id, namaProgram: detailProgram.namaProgram,
                    slug: detailProgram.slug, tanggalMulai: detailProgram.tanggalMulai,
                    anggaran: calculatedTotalAnggaran, status: detailProgram.status,
                    isPrioritas: detailProgram.isPrioritas,
                    isPlanningLocked: detailProgram.isPlanningLocked,
                    createdAt: detailProgram.createdAt,
                    dinas: detailProgram.dinas,
                    dokumenProgram: detailProgram.dokumen,
                    pengadaanList: formattedPengadaanList
                }
            });
        } catch (error) {
            console.error(`🔥 [GET DETAIL PROGRAM ERROR]:`, error);
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

            if (req.user.role === 'staff' && progresEksis.transaksi.program.dinasId !== req.user.dinasId) {
                return res.status(403).json({ msg: "Akses Ditolak: Anda tidak memiliki akses ke program instansi lain." });
            }
            if (progresEksis.transaksi.program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
            }
            if (progresEksis.transaksi.program.isPlanningLocked === true) {
                return res.status(403).json({
                    msg: "Akses Ditolak: Jadwal (Planning) program ini telah DIKUNCI oleh Master Staff."
                });
            }

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
                msg: `Berhasil mengatur ulang jadwal planning. Jadwal tahapan selanjutnya telah disesuaikan otomatis.`,
                data: result
            });
        } catch (error) {
            console.error(`🔥 [UPDATE PLANNING ERROR]:`, error);
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

            if (req.user.role === 'staff' && progresEksis.transaksi.program.dinasId !== req.user.dinasId) {
                return res.status(403).json({ msg: "Akses Ditolak: Anda tidak memiliki akses ke program instansi lain." });
            }
            if (progresEksis.transaksi.program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
            }
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
            res.status(200).json({ msg: `Berhasil menyimpan data aktual.`, data: result });
        } catch (error) {
            console.error(`🔥 [UPDATE AKTUAL ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    selesaikanTahapan: async (req, res) => {
        try {
            const { progresId } = req.params;

            const progresEksis = await prisma.progresTahapan.findUnique({
                where: { id: parseInt(progresId) },
                include: { transaksi: { include: { program: true } } }
            });

            if (!progresEksis) return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });

            if (req.user.role === 'staff' && progresEksis.transaksi.program.dinasId !== req.user.dinasId) {
                return res.status(403).json({ msg: "Akses Ditolak: Anda tidak memiliki akses ke program instansi lain." });
            }
            if (progresEksis.transaksi.program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
            }
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
                msg: "Tahapan berhasil diselesaikan dan dikunci. Data pada tahapan ini tidak dapat diubah lagi.",
                data: progresDikunci
            });
        } catch (error) {
            console.error(`🔥 [SELESAIKAN TAHAPAN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    uploadDokumenProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = { slug };
            if (role === 'staff') filter.dinasId = dinasId;

            const program = await prisma.program.findFirst({ where: filter });
            if (!program) return res.status(404).json({ msg: "Program tidak ditemukan atau Anda tidak memiliki akses." });
            if (role === 'staff' && program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
            }
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
            res.status(201).json({ msg: "Berhasil mengunggah dokumen program", data: dokumenTerbaru });
        } catch (error) {
            console.error(`🔥 [UPLOAD DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDokumenProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = { slug };
            if (role === 'staff') filter.dinasId = dinasId;

            const program = await prisma.program.findFirst({
                where: filter, select: { id: true, status: true }
            });

            if (!program) return res.status(404).json({ msg: "Program tidak ditemukan atau Anda tidak memiliki akses." });
            if (role === 'staff' && program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
            }

            const dokumenList = await prisma.dokumenProgram.findMany({
                where: { programId: program.id },
                orderBy: { createdAt: 'desc' }
            });

            logActivity(req, 'GET DOKUMEN PROGRAM', `Slug: ${slug}`);
            res.status(200).json({ msg: "Berhasil mengambil daftar dokumen program", data: dokumenList });
        } catch (error) {
            console.error(`🔥 [GET DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    }
};