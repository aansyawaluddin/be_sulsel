import fs from 'fs';
import path from 'path';
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
            const { namaProgram, anggaran, pengadaanList } = req.body;
            const dinasId = req.user.dinasId;

            if (!dinasId) {
                return res.status(403).json({ msg: "Akun Staff Anda belum terikat dengan Dinas manapun" });
            }
            if (!namaProgram || !anggaran || !pengadaanList || pengadaanList.length === 0) {
                return res.status(400).json({ msg: "Semua field wajib diisi beserta detail pengadaannya" });
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

                for (const item of pengadaanList) {
                    const masterPengadaan = await tx.pengadaan.findUnique({
                        where: { id: parseInt(item.pengadaanId) }
                    });

                    if (!masterPengadaan) throw new Error(`Pengadaan ID ${item.pengadaanId} tidak ditemukan`);

                    const transaksi = await tx.transaksiPengadaan.create({
                        data: {
                            namaTransaksi: `${masterPengadaan.namaPengadaan} - ${programBaru.namaProgram}`,
                            title: item.title || "Tanpa Judul Spesifik",
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
                            planningTanggalMulai: tanggalMulaiSekarang,
                            planningTanggalSelesai: tanggalSelesaiSekarang
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
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = { dinas: { slug: slug } };

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
                msg: "Berhasil mengambil daftar program",
                data: formattedPrograms
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
                return res.status(404).json({
                    msg: "Program tidak ditemukan atau Anda tidak memiliki hak akses untuk melihat program ini."
                });
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
            });

            if (!progresEksis) {
                return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            }

            const dataUpdate = {};

            if (planningTanggalMulai) {
                const dateMulai = new Date(planningTanggalMulai);
                if (!isNaN(dateMulai.getTime())) dataUpdate.planningTanggalMulai = dateMulai;
            }

            if (planningTanggalSelesai) {
                const dateSelesai = new Date(planningTanggalSelesai);
                if (!isNaN(dateSelesai.getTime())) dataUpdate.planningTanggalSelesai = dateSelesai;
            }

            const progresDiupdate = await prisma.progresTahapan.update({
                where: { id: parseInt(progresId) },
                data: dataUpdate
            });

            res.status(200).json({
                msg: `Berhasil mengatur ulang jadwal planning tahapan`,
                data: progresDiupdate
            });

        } catch (error) {
            console.error(`🔥 [UPDATE PLANNING ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateAktualTahapan: async (req, res) => {
        try {
            const { progresId } = req.params;

            const {
                aktualTanggalMulai,
                aktualTanggalSelesai,
                keterangan
            } = req.body;

            const progresEksis = await prisma.progresTahapan.findUnique({
                where: { id: parseInt(progresId) },
                include: {
                    tahapan: true,
                    transaksi: {
                        include: {
                            program: true
                        }
                    }
                }
            });

            if (!progresEksis) {
                return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            }

            const result = await prisma.$transaction(async (tx) => {

                const dataUpdate = {};

                if (keterangan !== undefined) dataUpdate.keterangan = keterangan;

                if (aktualTanggalMulai) {
                    const dateMulai = new Date(aktualTanggalMulai);
                    if (!isNaN(dateMulai.getTime())) dataUpdate.aktualTanggalMulai = dateMulai;
                }

                if (aktualTanggalSelesai) {
                    const dateSelesai = new Date(aktualTanggalSelesai);
                    if (!isNaN(dateSelesai.getTime())) {
                        dataUpdate.aktualTanggalSelesai = dateSelesai;
                        dataUpdate.status = 'selesai';

                        if (progresEksis.tahapan.isWaktuEditable) {

                            const tahapanSelanjutnya = await tx.progresTahapan.findMany({
                                where: {
                                    transaksiId: progresEksis.transaksiId,
                                    tahapan: {
                                        noUrut: { gt: progresEksis.tahapan.noUrut }
                                    }
                                },
                                include: { tahapan: true },
                                orderBy: { tahapan: { noUrut: 'asc' } }
                            });

                            if (tahapanSelanjutnya.length > 0) {
                                let nextEstimasiMulai = new Date(dateSelesai);
                                nextEstimasiMulai.setDate(nextEstimasiMulai.getDate() + 1);
                                nextEstimasiMulai.setHours(0, 0, 0, 0);

                                for (const nextProgres of tahapanSelanjutnya) {
                                    let pMulai = nextEstimasiMulai ? new Date(nextEstimasiMulai) : null;
                                    let pSelesai = null;

                                    if (nextProgres.tahapan.standarWaktuHari !== null && nextEstimasiMulai !== null) {
                                        pSelesai = new Date(pMulai);
                                        pSelesai.setDate(pSelesai.getDate() + nextProgres.tahapan.standarWaktuHari);
                                        nextEstimasiMulai = new Date(pSelesai);
                                    } else {
                                        pSelesai = null;
                                        nextEstimasiMulai = null;
                                    }

                                    await tx.progresTahapan.update({
                                        where: { id: nextProgres.id },
                                        data: {
                                            planningTanggalMulai: pMulai,
                                            planningTanggalSelesai: pSelesai
                                        }
                                    });
                                }
                            }
                        }
                    }
                }

                await tx.progresTahapan.update({
                    where: { id: parseInt(progresId) },
                    data: dataUpdate
                });

                if (req.files && req.files.length > 0) {
                    const programSlug = progresEksis.transaksi.program.slug;

                    const targetDir = path.join('public', 'uploads', programSlug);

                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }

                    const dataDokumen = req.files.map(file => {
                        const oldPath = file.path;
                        const newPath = path.join(targetDir, file.filename);

                        fs.renameSync(oldPath, newPath);

                        return {
                            progresTahapanId: parseInt(progresId),
                            namaFile: file.originalname,
                            fileUrl: `/uploads/${programSlug}/${file.filename}`
                        };
                    });

                    await tx.dokumenProgresTahapan.createMany({
                        data: dataDokumen
                    });
                }

                const progresTerbaru = await tx.progresTahapan.findUnique({
                    where: { id: parseInt(progresId) },
                    include: { dokumen: true }
                });

                return progresTerbaru;
            });

            res.status(200).json({
                msg: `Berhasil menyimpan data aktual. Jadwal tahapan selanjutnya telah disesuaikan otomatis.`,
                data: result
            });

        } catch (error) {
            console.error(`🔥 [UPDATE AKTUAL ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    uploadDokumenProgram: async (req, res) => {
        try {
            const { slug } = req.params;
            const dinasId = req.user.dinasId;
            const role = req.user.role;

            const filter = { slug: slug };
            if (role === 'staff') {
                filter.dinasId = dinasId;
            }

            const program = await prisma.program.findFirst({
                where: filter
            });

            if (!program) {
                return res.status(404).json({ msg: "Program tidak ditemukan atau Anda tidak memiliki akses." });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ msg: "Tidak ada dokumen yang diunggah." });
            }

            const targetDir = path.join('public', 'uploads', program.slug);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const dataDokumen = req.files.map(file => {
                const oldPath = file.path;
                const newPath = path.join(targetDir, file.filename);

                fs.renameSync(oldPath, newPath);

                return {
                    programId: program.id,
                    namaFile: file.originalname,
                    fileUrl: `/uploads/${program.slug}/${file.filename}`
                };
            });

            await prisma.dokumenProgram.createMany({
                data: dataDokumen
            });

            const dokumenTerbaru = await prisma.dokumenProgram.findMany({
                where: { programId: program.id },
                orderBy: { createdAt: 'desc' }
            });

            res.status(201).json({
                msg: "Berhasil mengunggah dokumen program",
                data: dokumenTerbaru
            });

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

            const filter = { slug: slug };
            if (role === 'staff') {
                filter.dinasId = dinasId;
            }

            const program = await prisma.program.findFirst({
                where: filter,
                select: { id: true }
            });

            if (!program) {
                return res.status(404).json({ msg: "Program tidak ditemukan atau Anda tidak memiliki akses." });
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
            console.error(`🔥 [GET DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    }
};