import prisma from '../utils/prisma.js';

export const gubernurController = {

    getDinas: async (req, res) => {
        try {
            const { role, username } = req.user;

            const dinasList = await prisma.dinas.findMany({
                include: {
                    programs: {
                        include: {
                            pengadaan: { select: { id: true } }
                        }
                    }
                },
                orderBy: {
                    namaDinas: 'asc'
                }
            });

            const formattedDinas = dinasList.map(dinas => {
                const totalPrograms = dinas.programs.length;
                let prioritasAktif = 0;

                dinas.programs.forEach(program => {
                    if (program.isPrioritas === true && program.pengadaan.length > 0) {
                        prioritasAktif++;
                    }
                });

                return {
                    id: dinas.id,
                    namaDinas: dinas.namaDinas,
                    slug: dinas.slug,
                    totalProgram: totalPrograms,
                    programPrioritas: prioritasAktif
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
                    anggaran: true,
                    createdAt: true,
                    pengadaan: {
                        select: {
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
                return {
                    id: program.id,
                    namaProgram: program.namaProgram,
                    slug: program.slug,
                    anggaran: program.anggaran,
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

            const formattedDetail = {
                id: detailProgram.id,
                namaProgram: detailProgram.namaProgram,
                slug: detailProgram.slug,
                anggaran: detailProgram.anggaran,
                isPrioritas: detailProgram.isPrioritas,
                createdAt: detailProgram.createdAt,
                dinas: detailProgram.dinas,
                dokumenProgram: detailProgram.dokumen,
                pengadaanList: detailProgram.pengadaan.map(transaksi => ({
                    id: transaksi.id,
                    namaTransaksi: transaksi.namaTransaksi,
                    jenisPengadaan: transaksi.pengadaan.namaPengadaan,
                    title: transaksi.title,
                    createdAt: transaksi.createdAt,
                    tahapanList: transaksi.progresTahapan.map(p => ({
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
                    }))
                }))
            };

            res.status(200).json({
                msg: "Berhasil mengambil detail informasi program",
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