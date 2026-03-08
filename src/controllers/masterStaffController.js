import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import bcrypt from 'bcrypt';

export const masterStaffController = {

    createDinas: async (req, res) => {
        try {
            const { namaDinas } = req.body;
            if (!namaDinas) return res.status(400).json({ msg: "Nama Dinas wajib diisi" });

            const baseSlug = namaDinas.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const slugUnik = `${baseSlug}`;

            const dinasBaru = await prisma.dinas.create({
                data: { namaDinas, slug: slugUnik }
            });

            res.status(201).json({ msg: "Berhasil membuat Dinas baru", data: dinasBaru });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    getDinas: async (req, res) => {
        try {
            const { role, username } = req.user;

            const dinasList = await prisma.dinas.findMany({
                include: {
                    programs: {
                        include: { pengadaan: { select: { id: true } } }
                    }
                },
                orderBy: { namaDinas: 'asc' }
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
                user: { username, role },
                data: formattedDinas
            });
        } catch (error) {
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

            res.status(200).json({ msg: "Dinas berhasil diupdate", data: dinasDiupdate });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    deleteDinas: async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.dinas.delete({ where: { id: parseInt(id) } });
            res.status(200).json({ msg: "Dinas berhasil dihapus" });
        } catch (error) {
            res.status(500).json({ msg: "Gagal menghapus dinas. Pastikan tidak ada data yang terikat." });
        }
    },

    getDinasDropdown: async (req, res) => {
        try {
            const dinasList = await prisma.dinas.findMany({
                select: {
                    id: true,
                    namaDinas: true
                },
                orderBy: {
                    namaDinas: 'asc'
                }
            });

            res.status(200).json({
                msg: "Berhasil mengambil daftar Dinas untuk dropdown",
                data: dinasList
            });
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
                data: {
                    username,
                    password: hashPassword,
                    name,
                    role: 'staff',
                    dinasId: parseInt(dinasId)
                }
            });

            res.status(201).json({ msg: "Berhasil membuat akun Staff", data: { username: staffBaru.username, name: staffBaru.name } });
        } catch (error) {
            res.status(500).json({ msg: error.message });
        }
    },

    getStaffList: async (req, res) => {
        try {
            const staffList = await prisma.user.findMany({
                where: { role: 'staff' },
                select: { id: true, username: true, name: true, dinas: { select: { namaDinas: true } }, createdAt: true }
            });
            res.status(200).json({ msg: "Berhasil mengambil data staff", data: staffList });
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
                    id: true,
                    username: true,
                    name: true,
                    dinasId: true,
                    dinas: { select: { namaDinas: true } },
                    role: true,
                    createdAt: true
                }
            });

            if (!detailStaff || detailStaff.role !== 'staff') {
                return res.status(404).json({ msg: "Data Staff tidak ditemukan." });
            }

            res.status(200).json({
                msg: "Berhasil mengambil detail data staff",
                data: detailStaff
            });

        } catch (error) {
            console.error(`🔥 [MASTER - GET DETAIL STAFF ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateStaff: async (req, res) => {
        try {
            const { id } = req.params;
            const { username, password, name, dinasId } = req.body;

            const existingUser = await prisma.user.findUnique({
                where: { id: parseInt(id) }
            });


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
                    id: true,
                    username: true,
                    name: true,
                    role: true,
                    dinas: { select: { namaDinas: true } },
                    updatedAt: true
                }
            });

            res.status(200).json({
                msg: "Data akun Staff berhasil diperbarui",
                data: staffDiupdate
            });

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
            res.status(200).json({ msg: "Akun Staff berhasil dihapus" });
        } catch (error) {
            res.status(500).json({ msg: error.message });
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
            console.error(`🔥 [MASTER - GET PENGADAAN ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    createProgramPrioritas: async (req, res) => {
        try {
            const { namaProgram, pengadaanList, dinasId } = req.body;

            if (!dinasId || !namaProgram || !pengadaanList || pengadaanList.length === 0) {
                return res.status(400).json({ msg: "Semua field termasuk dinasId wajib diisi beserta detail pengadaannya" });
            }

            const result = await prisma.$transaction(async (tx) => {
                const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                const slugUnik = `${baseSlug}`;

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram,
                        slug: slugUnik,
                        dinasId: parseInt(dinasId),
                        isPrioritas: true,
                        status: 'terima'
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
                    slug: programBaru.slug,
                    isPrioritas: programBaru.isPrioritas
                };
            });

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

            const programEksis = await prisma.program.findUnique({
                where: { id: parseInt(id) }
            });

            if (!programEksis) return res.status(404).json({ msg: "Program tidak ditemukan." });

            const dataUpdate = { namaProgram: namaProgram };

            if (programEksis.status === 'menunggu') {
                const baseSlug = namaProgram.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                dataUpdate.slug = `${baseSlug}`;
            }

            const programDiupdate = await prisma.program.update({
                where: { id: parseInt(id) },
                data: dataUpdate
            });

            res.status(200).json({
                msg: "Berhasil mengubah nama program (Master Mode).",
                data: programDiupdate
            });

        } catch (error) {
            console.error(`🔥 [MASTER - UPDATE PROGRAM ERROR]:`, error);
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
                    isPrioritas: true,
                    status: true,
                    createdAt: true,
                    pengadaan: {
                        select: {
                            anggaran: true,
                            pengadaan: { select: { namaPengadaan: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const formattedPrograms = programList.map(program => {
                const calculatedAnggaran = program.pengadaan.reduce((sum, p) => sum + Number(p.anggaran), 0);

                return {
                    id: program.id,
                    namaProgram: program.namaProgram,
                    slug: program.slug,
                    anggaran: calculatedAnggaran,
                    status: program.status,
                    isPrioritas: program.isPrioritas,
                    createdAt: program.createdAt,
                    pengadaanList: program.pengadaan.map(p => p.pengadaan.namaPengadaan)
                }
            });

            res.status(200).json({
                msg: `Berhasil mengambil daftar program untuk dinas: ${slug}`,
                data: formattedPrograms
            });

        } catch (error) {
            console.error(`🔥 [MASTER - GET PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getDetailProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const detailProgram = await prisma.program.findUnique({
                where: { slug: slug },
                include: {
                    dinas: { select: { namaDinas: true } },
                    dokumen: true,
                    pengadaan: {
                        include: {
                            pengadaan: { select: { namaPengadaan: true } },
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

            const formattedDetail = {
                id: detailProgram.id,
                namaProgram: detailProgram.namaProgram,
                slug: detailProgram.slug,
                anggaran: calculatedTotalAnggaran,
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
            console.error(`🔥 [MASTER - GET DETAIL PROGRAM ERROR]:`, error);
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
                msg: `Berhasil mengatur ulang jadwal planning. Jadwal tahapan selanjutnya telah disesuaikan otomatis (Master Mode)`,
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
                        }
                        else if (typeof progresEksis.keterangan === 'string') {
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
                msg: `Berhasil menyimpan data aktual (Master Mode).`,
                data: result
            });

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

            if (!progresEksis) {
                return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            }

            if (progresEksis.status === 'selesai') {
                return res.status(400).json({ msg: "Tahapan ini sudah dikunci sebelumnya." });
            }

            const progresDikunci = await prisma.progresTahapan.update({
                where: { id: parseInt(progresId) },
                data: { status: 'selesai' }
            });

            res.status(200).json({
                msg: "Tahapan berhasil diselesaikan dan dikunci (Master Mode). Data pada tahapan ini tidak dapat diubah lagi.",
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

            const program = await prisma.program.findFirst({
                where: { slug: slug }
            });

            if (!program) {
                return res.status(404).json({ msg: "Program tidak ditemukan." });
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
                msg: "Berhasil mengunggah dokumen program (Master Mode)",
                data: dokumenTerbaru
            });

        } catch (error) {
            console.error(`🔥 [MASTER - UPLOAD DOKUMEN PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    getInbox: async (req, res) => {
        try {
            const inboxList = await prisma.program.findMany({
                include: {
                    dinas: {
                        select: { namaDinas: true }
                    },
                    pengadaan: {
                        select: {
                            anggaran: true,
                            pengadaan: { select: { namaPengadaan: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const formattedInbox = inboxList.map(program => {
                const calculatedAnggaran = program.pengadaan.reduce((sum, p) => sum + Number(p.anggaran), 0);

                return {
                    id: program.id,
                    namaProgram: program.namaProgram,
                    dinasPemohon: program.dinas.namaDinas,
                    slug: program.slug,
                    status: program.status,
                    totalAnggaran: calculatedAnggaran,
                    tanggalPengajuan: program.createdAt,
                    pengadaanList: program.pengadaan.map(p => p.pengadaan.namaPengadaan)
                }
            });

            res.status(200).json({
                msg: "Berhasil mengambil seluruh riwayat program (Semua Status)",
                totalData: formattedInbox.length,
                data: formattedInbox
            });

        } catch (error) {
            console.error(`🔥 [MASTER - GET INBOX ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    terimaProgram: async (req, res) => {
        try {
            const { slug } = req.params;

            const programTarget = await prisma.program.findUnique({
                where: { slug: slug }
            });

            if (!programTarget) {
                return res.status(404).json({ msg: "Program tidak ditemukan." });
            }

            if (programTarget.status !== 'menunggu') {
                return res.status(400).json({ msg: `Program ini sudah pernah divalidasi dengan status: ${programTarget.status}` });
            }

            const programDiterima = await prisma.program.update({
                where: { slug: slug },
                data: { status: 'terima' },
                select: {
                    id: true,
                    namaProgram: true,
                    slug: true,
                    status: true,
                    dinas: { select: { namaDinas: true } }
                }
            });

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
                where: { slug: slug },
                include: { dinas: true }
            });

            if (!programTarget) {
                return res.status(404).json({ msg: "Program tidak ditemukan." });
            }

            if (programTarget.status !== 'menunggu') {
                return res.status(400).json({ msg: `Program ini sudah pernah divalidasi dengan status: ${programTarget.status}` });
            }

            await prisma.program.delete({
                where: { slug: slug }
            });

            const targetDir = path.join('public', 'uploads', programTarget.slug);
            if (fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }

            res.status(200).json({
                msg: `Program '${programTarget.namaProgram}' dari instansi ${programTarget.dinas?.namaDinas || 'Tidak Diketahui'} telah DITOLAK dan datanya otomatis DIHAPUS dari sistem.`,
                data: {
                    namaProgram: programTarget.namaProgram,
                    status: 'ditolak_dan_dihapus'
                }
            });

        } catch (error) {
            console.error(`🔥 [MASTER - TOLAK PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    }
}