import prisma from '../utils/prisma.js';

export const gubernurController = {

    getDinas: async (req, res) => {
        try {
            const { role, username } = req.user;

            const dinasList = await prisma.dinas.findMany({
                include: {
                    programs: {
                        include: {
                            pengadaan: {
                                include: {
                                    progresTahapan: { select: { status: true } }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    namaDinas: 'asc'
                }
            });

            const formattedDinas = dinasList.map(dinas => {
                const totalPrograms = dinas.programs.length;
                let jumlahProgramSelesai = 0;

                dinas.programs.forEach(program => {
                    if (program.pengadaan.length > 0) {
                        let semuaTahapanSelesai = true;

                        program.pengadaan.forEach(pengadaan => {
                            pengadaan.progresTahapan.forEach(tahapan => {
                                if (tahapan.status !== 'selesai') {
                                    semuaTahapanSelesai = false;
                                }
                            });
                        });

                        if (semuaTahapanSelesai) {
                            jumlahProgramSelesai++;
                        }
                    }
                });

                return {
                    id: dinas.id,
                    namaDinas: dinas.namaDinas,
                    slug: dinas.slug,
                    totalProgram: totalPrograms,
                    programPrioritas: jumlahProgramSelesai
                };
            });

            res.status(200).json({
                msg: "Berhasil mengambil data seluruh instansi/dinas",
                user: {
                    username: username,
                    role: role
                },
                data: formattedDinas
            });

        } catch (error) {
            console.error(`🔥 [GUBERNUR - GET DINAS ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const programList = await prisma.program.findMany({
                where: { dinas: { slug: slug } },
                select: {
                    id: true,
                    namaProgram: true,
                    slug: true,
                    createdAt: true,
                    pengadaan: {
                        select: {
                            anggaran: true,
                            pengadaan: {
                                select: {
                                    namaPengadaan: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            const formattedPrograms = programList.map(program => {
                const calculatedAnggaran = program.pengadaan.reduce((sum, p) => sum + Number(p.anggaran), 0);

                return {
                    id: program.id,
                    namaProgram: program.namaProgram,
                    slug: program.slug,
                    anggaran: calculatedAnggaran,
                    createdAt: program.createdAt,
                    pengadaanList: program.pengadaan.map(p => p.pengadaan.namaPengadaan)
                };
            });

            res.status(200).json({
                msg: `Berhasil mengambil daftar program untuk dinas: ${slug}`,
                data: formattedPrograms
            });

        } catch (error) {
            console.error(`🔥 [GUBERNUR - GET PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDetailProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const detailProgram = await prisma.program.findUnique({
                where: { slug: slug },
                include: {
                    dinas: {
                        select: { namaDinas: true }
                    },
                    dokumen: true,
                    pengadaan: {
                        include: {
                            pengadaan: {
                                select: { namaPengadaan: true }
                            },
                            progresTahapan: {
                                include: {
                                    tahapan: true,
                                    dokumen: true
                                },
                                orderBy: { tahapan: { noUrut: 'asc' } }
                            }
                        }
                    }
                }
            });

            if (!detailProgram) {
                return res.status(404).json({ msg: "Program tidak ditemukan." });
            }

            const calculatedTotalAnggaran = detailProgram.pengadaan.reduce((sum, p) => sum + Number(p.anggaran), 0);

            const DAY_MS = 24 * 60 * 60 * 1000;

            const getMidnightMs = (dateInput) => {
                if (!dateInput) return null;
                const d = new Date(dateInput);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            };

            const addDaysMs = (ms, days) => {
                const d = new Date(ms);
                d.setDate(d.getDate() + days);
                return d.getTime();
            };

            const formattedPengadaanList = detailProgram.pengadaan.map(transaksi => {

                const tahapanList = transaksi.progresTahapan.map(p => ({
                    idTahapan: p.tahapan.id,
                    noUrut: p.tahapan.noUrut,
                    namaTahapan: p.tahapan.namaTahapan,
                    standarWaktuHari: p.tahapan.standarWaktuHari,
                    isWaktuEditable: p.tahapan.isWaktuEditable,
                    bobot: p.tahapan.bobot,
                    progres: {
                        idProgres: p.id,
                        status: p.status,
                        planningTanggalMulai: p.planningTanggalMulai,
                        planningTanggalSelesai: p.planningTanggalSelesai,
                        aktualTanggalMulai: p.aktualTanggalMulai,
                        aktualTanggalSelesai: p.aktualTanggalSelesai,
                        keterangan: p.keterangan,
                        dokumenBukti: p.dokumen || [],
                        updatedAt: p.updatedAt
                    }
                }));

                let prevEndDateMs = null;

                const tahapanWithForecast = tahapanList.map((t) => {
                    const planStartMs = getMidnightMs(t.progres.planningTanggalMulai);
                    const planEndMs = getMidnightMs(t.progres.planningTanggalSelesai);
                    const aktualStartMs = getMidnightMs(t.progres.aktualTanggalMulai);
                    const aktualEndMs = getMidnightMs(t.progres.aktualTanggalSelesai);

                    if (!planStartMs || !planEndMs) {
                        return {
                            ...t,
                            forecast: { forecastTanggalMulai: null, forecastTanggalSelesai: null }
                        };
                    }

                    const planDurDays = Math.round((planEndMs - planStartMs) / DAY_MS);

                    let forecastStartMs = null;
                    let forecastEndMs = null;

                    if (aktualStartMs && aktualEndMs) {
                        forecastStartMs = aktualStartMs;
                        forecastEndMs = aktualEndMs;
                    }
                    else if (aktualStartMs && !aktualEndMs) {
                        forecastStartMs = aktualStartMs;
                        forecastEndMs = addDaysMs(forecastStartMs, planDurDays);
                    }
                    else {
                        if (prevEndDateMs !== null) {
                            forecastStartMs = addDaysMs(prevEndDateMs, 1);
                        } else {
                            forecastStartMs = planStartMs;
                        }
                        forecastEndMs = addDaysMs(forecastStartMs, planDurDays);
                    }

                    prevEndDateMs = forecastEndMs;

                    return {
                        ...t,
                        forecast: {
                            forecastTanggalMulai: new Date(forecastStartMs).toISOString(),
                            forecastTanggalSelesai: new Date(forecastEndMs).toISOString()
                        }
                    };
                });

                let programPlanEndMs = null;
                let programForecastEndMs = null;

                if (tahapanWithForecast.length > 0) {
                    const lastTahapan = tahapanWithForecast[tahapanWithForecast.length - 1];
                    programForecastEndMs = lastTahapan.forecast.forecastTanggalSelesai;

                    tahapanWithForecast.forEach(t => {
                        if (t.progres.planningTanggalSelesai) {
                            const ms = getMidnightMs(t.progres.planningTanggalSelesai);
                            if (programPlanEndMs === null || ms > programPlanEndMs) {
                                programPlanEndMs = ms;
                            }
                        }
                    });
                }

                const forecastPengadaan = {
                    planTanggalSelesaiKeseluruhan: programPlanEndMs ? new Date(programPlanEndMs).toISOString() : null,
                    forecastTanggalSelesaiKeseluruhan: programForecastEndMs || null
                };

                return {
                    id: transaksi.id,
                    namaTransaksi: transaksi.namaTransaksi,
                    jenisPengadaan: transaksi.pengadaan.namaPengadaan,
                    title: transaksi.title,
                    anggaran: transaksi.anggaran,
                    createdAt: transaksi.createdAt,
                    forecastKeseluruhan: forecastPengadaan,
                    tahapanList: tahapanWithForecast
                };
            });

            const formattedDetail = {
                id: detailProgram.id,
                namaProgram: detailProgram.namaProgram,
                slug: detailProgram.slug,
                tanggalMulai: detailProgram.tanggalMulai,
                anggaran: calculatedTotalAnggaran,
                isPrioritas: detailProgram.isPrioritas,
                createdAt: detailProgram.createdAt,
                dinas: detailProgram.dinas,
                dokumenProgram: detailProgram.dokumen,
                pengadaanList: formattedPengadaanList
            };

            res.status(200).json({
                msg: "Berhasil mengambil detail informasi program (Gubernur Mode)",
                data: formattedDetail
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
                where: { slug: slug },
                select: { id: true }
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