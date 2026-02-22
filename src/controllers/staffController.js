import prisma from '../utils/prisma.js';

export const staffController = {

    getDinas: async (req, res) => {
        try {
            const role = req.user.role;
            const dinasId = req.user.dinasId;

            const filterDinas = {};
            if (role === 'staff') {
                filterDinas.id = dinasId;
            }

            const dinasList = await prisma.dinas.findMany({
                where: filterDinas,
                include: {
                    programs: {
                        include: {
                            pengadaan: {
                                include: {
                                    progresTahapan: {
                                        select: { status: true }
                                    }
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
                let completedPrograms = 0;

                dinas.programs.forEach(program => {
                    if (program.pengadaan.length === 0) return;

                    let isProgramCompleted = true;
                    let hasAnyTahapan = false;

                    for (const transaksi of program.pengadaan) {
                        if (transaksi.progresTahapan.length > 0) {
                            hasAnyTahapan = true;
                        }

                        for (const progres of transaksi.progresTahapan) {
                            if (progres.status !== 'COMPLETED') {
                                isProgramCompleted = false;
                                break;
                            }
                        }
                        if (!isProgramCompleted) break; 
                    }

                    if (isProgramCompleted && hasAnyTahapan) {
                        completedPrograms++;
                    }
                });

                return {
                    id: dinas.id,
                    namaDinas: dinas.namaDinas,
                    totalProgram: totalPrograms,
                    programSelesai: completedPrograms
                };
            });

            res.status(200).json({
                msg: "Berhasil mengambil data instansi/dinas",
                data: formattedDinas
            });

        } catch (error) {
            console.error(`🔥 [GET DINAS ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getPengadaan: async (req, res) => {
        try {
            const pengadaanList = await prisma.pengadaan.findMany({
                select: {
                    id: true,
                    namaPengadaan: true
                },
                orderBy: {
                    id: 'asc'
                }
            });

            res.status(200).json({
                msg: "Berhasil mengambil data master pengadaan",
                data: pengadaanList
            });
        } catch (error) {
            console.error(`🔥 [GET PENGADAAN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    createProgram: async (req, res) => {
        try {
            const { namaProgram, anggaran, pengadaanIds } = req.body;
            const dinasId = req.user.dinasId;

            if (!dinasId) {
                return res.status(403).json({ msg: "Akun Staff Anda belum terikat dengan Dinas manapun" });
            }
            if (!namaProgram || !anggaran || !pengadaanIds || pengadaanIds.length === 0) {
                return res.status(400).json({ msg: "Semua field wajib diisi" });
            }

            const result = await prisma.$transaction(async (tx) => {

                const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                const slugUnik = `${baseSlug}`;

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram,
                        slug: slugUnik,
                        anggaran: BigInt(anggaran),
                        dinasId: dinasId
                    }
                });

                for (const masterId of pengadaanIds) {
                    const masterPengadaan = await tx.pengadaan.findUnique({
                        where: { id: parseInt(masterId) }
                    });

                    if (!masterPengadaan) throw new Error(`Master ID ${masterId} tidak ditemukan`);

                    const transaksi = await tx.transaksiPengadaan.create({
                        data: {
                            namaTransaksi: `Pengadaan ${masterPengadaan.namaPengadaan} - ${programBaru.namaProgram}`,
                            programId: programBaru.id,
                            pengadaanId: masterPengadaan.id
                        }
                    });

                    const masterTahapanList = await tx.tahapan.findMany({
                        where: { pengadaanId: masterPengadaan.id },
                        orderBy: { noUrut: 'asc' }
                    });

                    let estimasiTanggalMulai = new Date();
                    estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    estimasiTanggalMulai.setHours(0, 0, 0, 0);

                    const dataProgres = [];

                    for (const tahapan of masterTahapanList) {
                        let tanggalMulaiSekarang = estimasiTanggalMulai ? new Date(estimasiTanggalMulai) : null;
                        let tanggalSelesaiSekarang = null;

                        if (tahapan.standarWaktuHari !== null && estimasiTanggalMulai !== null) {
                            tanggalSelesaiSekarang = new Date(tanggalMulaiSekarang);
                            tanggalSelesaiSekarang.setDate(tanggalSelesaiSekarang.getDate() + tahapan.standarWaktuHari);

                            estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
                        }
                        else {
                            tanggalSelesaiSekarang = null;
                            estimasiTanggalMulai = null;
                        }

                        dataProgres.push({
                            transaksiId: transaksi.id,
                            tahapanId: tahapan.id,
                            status: 'on_progress',
                            tanggalMulai: tanggalMulaiSekarang,
                            tanggalSelesai: tanggalSelesaiSekarang
                        });
                    }

                    if (dataProgres.length > 0) {
                        await tx.progresTahapan.createMany({ data: dataProgres });
                    }
                }

                return {
                    id: programBaru.id,
                    namaProgram: programBaru.namaProgram,
                    slug: programBaru.slug
                };
            });

            res.status(201).json({
                msg: "Program dan seluruh jadwal pengadaan berhasil dibuat!",
                data: result
            });

        } catch (error) {
            console.error(`🔥 [CREATE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getProgram: async (req, res) => {
        try {
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = {};
            if (role === 'staff') {
                filter.dinasId = dinasId;
            }

            const programList = await prisma.program.findMany({
                where: filter,
                select: {
                    id: true,
                    namaProgram: true,
                    slug: true,
                    anggaran: true,
                    createdAt: true,
                    dinas: {
                        select: { namaDinas: true }
                    },
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            res.status(200).json({
                msg: "Berhasil mengambil daftar program",
                data: programList
            });

        } catch (error) {
            console.error(`🔥 [GET PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDetailProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = { slug: slug };
            if (role === 'staff') {
                filter.dinasId = dinasId;
            }

            const detailProgram = await prisma.program.findFirst({
                where: filter,
                include: {
                    dinas: {
                        select: { namaDinas: true }
                    },
                    pengadaan: {
                        include: {
                            pengadaan: {
                                select: { namaPengadaan: true }
                            },
                            progresTahapan: {
                                include: { tahapan: true },
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

            res.status(200).json({
                msg: "Berhasil mengambil detail informasi program",
                data: detailProgram
            });

        } catch (error) {
            console.error(`🔥 [GET DETAIL PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },
};