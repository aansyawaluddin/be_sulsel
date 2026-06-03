import prisma from '../utils/prisma.js';
import { DAY_MS, getMidnightMs, addDaysMs, hitungForecastPengadaan } from '../utils/dateHelper.js';
import { getCache, setCache } from '../utils/cache.js';

export const gubernurController = {

    getDinas: async (req, res) => {
        try {
            const { role, username } = req.user;

            const cacheKey = `getDinas:${role}`;
            const cached = getCache(cacheKey);
            if (cached) return res.status(200).json({ ...cached, user: { username, role } });

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
            res.status(200).json(responseData);

        } catch (error) {
            console.error(`🔥 [GUBERNUR - GET DINAS ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const cacheKey = `getProgram:gubernur:${slug}`;
            const cached = getCache(cacheKey);
            if (cached) return res.status(200).json(cached);

            const programList = await prisma.program.findMany({
                where: { dinas: { slug } },
                select: {
                    id: true, namaProgram: true, slug: true,
                    isPrioritas: true, status: true, createdAt: true,
                    pengadaan: {
                        select: {
                            anggaran: true,
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
                    anggaran: calculatedAnggaran, status: program.status,
                    isPrioritas: program.isPrioritas, createdAt: program.createdAt,
                    pengadaanList: program.pengadaan.map(p => p.pengadaan.namaPengadaan),
                    isSelesai: semuaTahapanSelesai, isTerlambat: isProgramTerlambat,
                    tahapanSaatIni: currentTahapanNama, keteranganSaatIni: currentTahapanKeterangan
                };
            });

            const responseData = {
                msg: `Berhasil mengambil daftar program untuk dinas: ${slug}`,
                data: formattedPrograms
            };

            setCache(cacheKey, responseData, 30);
            res.status(200).json(responseData);

        } catch (error) {
            console.error(`🔥 [GUBERNUR - GET PROGRAM ERROR]:`, error);
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

            if (!detailProgram) {
                return res.status(404).json({ msg: "Program tidak ditemukan." });
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
                            keterangan: p.keterangan, dokumenBukti: p.dokumen ?? [],
                            updatedAt: p.updatedAt
                        },
                        forecast: {
                            forecastTanggalMulai: forecastStartMs ? new Date(forecastStartMs).toISOString() : null,
                            forecastTanggalSelesai: forecastEndMs ? new Date(forecastEndMs).toISOString() : null
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
                    title: transaksi.title, anggaran: transaksi.anggaran,
                    createdAt: transaksi.createdAt,
                    forecastKeseluruhan: {
                        planTanggalSelesaiKeseluruhan: planEndMs ? new Date(planEndMs).toISOString() : null,
                        forecastTanggalSelesaiKeseluruhan: lastForecast ?? null
                    },
                    tahapanList: tahapanWithForecast
                };
            });

            res.status(200).json({
                msg: "Berhasil mengambil detail informasi program (Gubernur Mode)",
                data: {
                    id: detailProgram.id, namaProgram: detailProgram.namaProgram,
                    slug: detailProgram.slug, tanggalMulai: detailProgram.tanggalMulai,
                    anggaran: calculatedTotalAnggaran, isPrioritas: detailProgram.isPrioritas,
                    createdAt: detailProgram.createdAt, dinas: detailProgram.dinas,
                    dokumenProgram: detailProgram.dokumen,
                    pengadaanList: formattedPengadaanList
                }
            });

        } catch (error) {
            console.error(`🔥 [GUBERNUR - GET DETAIL PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDokumenProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const program = await prisma.program.findUnique({
                where: { slug }, select: { id: true }
            });

            if (!program) {
                return res.status(404).json({ msg: "Program tidak ditemukan." });
            }

            const dokumenList = await prisma.dokumenProgram.findMany({
                where: { programId: program.id },
                orderBy: { createdAt: 'desc' }
            });

            res.status(200).json({
                msg: "Berhasil mengambil daftar dokumen program",
                data: dokumenList
            });

        } catch (error) {
            console.error(`🔥 [GUBERNUR - GET DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    }
};