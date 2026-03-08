import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';

export const staffController = {

    getDinas: async (req, res) => {
        try {
            const { role, dinasId, username } = req.user;

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
                user: {
                    username: username,
                    role: role
                },
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
            const { namaProgram, pengadaanList } = req.body;
            const dinasId = req.user.dinasId;

            if (!dinasId) {
                return res.status(403).json({ msg: "Akun Staff Anda belum terikat dengan Dinas manapun" });
            }
            if (!namaProgram || !pengadaanList || pengadaanList.length === 0) {
                return res.status(400).json({ msg: "Semua field wajib diisi beserta detail pengadaannya" });
            }

            const result = await prisma.$transaction(async (tx) => {

                const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                const slugUnik = `${baseSlug}`;

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram,
                        slug: slugUnik,
                        dinasId: dinasId
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

                    let estimasiTanggalMulai = new Date();
                    estimasiTanggalMulai.setDate(estimasiTanggalMulai.getDate() + 1);
                    estimasiTanggalMulai.setHours(0, 0, 0, 0);

                    const dataProgres = [];

                    for (const tahapan of masterTahapanList) {
                        let tanggalMulaiSekarang = new Date(estimasiTanggalMulai);
                        let tanggalSelesaiSekarang = new Date(tanggalMulaiSekarang);

                        let durasiHari = tahapan.standarWaktuHari;
                        if (tahapan.isWaktuEditable && durasiHari === null) {
                            durasiHari = 14;
                        } else if (durasiHari === null) {
                            durasiHari = 1;
                        }

                        tanggalSelesaiSekarang.setDate(tanggalSelesaiSekarang.getDate() + durasiHari);

                        dataProgres.push({
                            transaksiId: transaksi.id,
                            tahapanId: tahapan.id,
                            status: 'on_progress',
                            planningTanggalMulai: tanggalMulaiSekarang,
                            planningTanggalSelesai: tanggalSelesaiSekarang
                        });

                        estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
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

            const filter = {};

            if (slug) {
                const targetDinas = await prisma.dinas.findUnique({
                    where: { slug: slug }
                });

                if (!targetDinas) {
                    return res.status(404).json({ msg: "Instansi/Dinas tidak ditemukan." });
                }

                if (role === 'staff' && targetDinas.id !== dinasId) {
                    return res.status(403).json({
                        msg: "Akses Terlarang: Anda tidak diizinkan melihat data milik instansi lain."
                    });
                }

                filter.dinas = { slug: slug };
            }

            if (role === 'staff') {
                filter.dinasId = dinasId;
            }

            const programList = await prisma.program.findMany({
                where: filter,
                select: {
                    id: true,
                    namaProgram: true,
                    slug: true,
                    isPrioritas: true,
                    status: true,
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
                    isPrioritas: program.isPrioritas,
                    status: program.status,
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

    updateProgram: async (req, res) => {
        try {
            const { id } = req.params;
            const { namaProgram } = req.body;
            const dinasId = req.user.dinasId;

            if (!namaProgram) return res.status(400).json({ msg: "Nama Program baru wajib diisi." });

            const programEksis = await prisma.program.findUnique({
                where: { id: parseInt(id) }
            });

            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });

            if (programEksis.dinasId !== dinasId) {
                return res.status(403).json({ msg: "Akses Terlarang: Anda tidak dapat mengubah program milik instansi lain." });
            }

            if (programEksis.status !== 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program yang sudah divalidasi tidak dapat diubah namanya." });
            }

            const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const slugUnik = `${baseSlug}`;

            const programDiupdate = await prisma.program.update({
                where: { id: parseInt(id) },
                data: {
                    namaProgram: namaProgram,
                    slug: slugUnik 
                }
            });

            res.status(200).json({
                msg: "Berhasil mengubah nama program beserta link URL-nya.",
                data: programDiupdate
            });

        } catch (error) {
            console.error(`🔥 [STAFF - UPDATE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    deleteProgram: async (req, res) => {
        try {
            const { id } = req.params;
            const dinasId = req.user.dinasId;

            const programEksis = await prisma.program.findUnique({
                where: { id: parseInt(id) }
            });

            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });

            if (programEksis.dinasId !== dinasId) {
                return res.status(403).json({ msg: "Akses Terlarang: Anda tidak dapat menghapus program milik instansi lain." });
            }

            if (programEksis.status === 'terima') {
                return res.status(403).json({
                    msg: "Akses Ditolak: Program yang sudah disetujui tidak dapat dihapus."
                });
            }

            await prisma.program.delete({ where: { id: parseInt(id) } });

            const targetDir = path.join('public', 'uploads', programEksis.slug);
            if (fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }

            res.status(200).json({
                msg: `Program '${programEksis.namaProgram}' berhasil dihapus.`
            });

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

            if (role === 'staff' && detailProgram.status === 'menunggu') {
                return res.status(403).json({
                    msg: "Akses Ditolak: Program ini sedang menunggu validasi dari Master Staff dan belum bisa diakses."
                });
            }

            const calculatedTotalAnggaran = detailProgram.pengadaan.reduce((sum, p) => sum + Number(p.anggaran), 0);

            const formattedDetail = {
                id: detailProgram.id,
                namaProgram: detailProgram.namaProgram,
                slug: detailProgram.slug,
                anggaran: calculatedTotalAnggaran,
                status: detailProgram.status,
                isPrioritas: detailProgram.isPrioritas,
                createdAt: detailProgram.createdAt,
                dinas: detailProgram.dinas,
                dokumenProgram: detailProgram.dokumen,
                pengadaanList: detailProgram.pengadaan.map(transaksi => ({
                    id: transaksi.id,
                    namaTransaksi: transaksi.namaTransaksi,
                    jenisPengadaan: transaksi.pengadaan.namaPengadaan,
                    title: transaksi.title,
                    anggaran: transaksi.anggaran,
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
                include: {
                    tahapan: true,
                    transaksi: {
                        include: { program: true }
                    }
                }
            });

            if (!progresEksis) {
                return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            }

            if (req.user.role === 'staff' && progresEksis.transaksi.program.dinasId !== req.user.dinasId) {
                return res.status(403).json({ msg: "Akses Ditolak: Anda tidak memiliki akses ke program instansi lain." });
            }

            if (progresEksis.transaksi.program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
            }

            const result = await prisma.$transaction(async (tx) => {
                const dataUpdate = {};

                if (planningTanggalMulai) {
                    const dateMulai = new Date(planningTanggalMulai);
                    if (!isNaN(dateMulai.getTime())) dataUpdate.planningTanggalMulai = dateMulai;
                }

                if (planningTanggalSelesai) {
                    const dateSelesai = new Date(planningTanggalSelesai);
                    if (!isNaN(dateSelesai.getTime())) dataUpdate.planningTanggalSelesai = dateSelesai;
                }

                const progresDiupdate = await tx.progresTahapan.update({
                    where: { id: parseInt(progresId) },
                    data: dataUpdate
                });

                if (dataUpdate.planningTanggalSelesai) {

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
                                data: {
                                    planningTanggalMulai: pMulai,
                                    planningTanggalSelesai: pSelesai
                                }
                            });

                            currentEndDate = new Date(pSelesai);
                        }
                    }
                }

                return progresDiupdate;
            });

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
                    const dateMulai = new Date(aktualTanggalMulai);
                    if (!isNaN(dateMulai.getTime())) dataUpdate.aktualTanggalMulai = dateMulai;
                }

                if (aktualTanggalSelesai) {
                    const dateSelesai = new Date(aktualTanggalSelesai);
                    if (!isNaN(dateSelesai.getTime())) {
                        dataUpdate.aktualTanggalSelesai = dateSelesai;
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
                msg: `Berhasil menyimpan data aktual.`,
                data: result
            });

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
                include: {
                    transaksi: {
                        include: { program: true }
                    }
                }
            });

            if (!progresEksis) {
                return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            }

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

            if (role === 'staff' && program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
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
                select: { id: true, status: true }
            });

            if (!program) {
                return res.status(404).json({ msg: "Program tidak ditemukan atau Anda tidak memiliki akses." });
            }

            if (role === 'staff' && program.status === 'menunggu') {
                return res.status(403).json({ msg: "Akses Ditolak: Program belum divalidasi oleh Master Staff." });
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