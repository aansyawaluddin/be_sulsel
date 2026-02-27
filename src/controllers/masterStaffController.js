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
                const slugUnik = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram,
                        slug: slugUnik,
                        // anggaran dihapus dari sini
                        dinasId: parseInt(dinasId),
                        isPrioritas: true
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
                        let tanggalMulaiSekarang = estimasiTanggalMulai ? new Date(estimasiTanggalMulai) : null;
                        let tanggalSelesaiSekarang = null;

                        if (tahapan.standarWaktuHari !== null && estimasiTanggalMulai !== null) {
                            tanggalSelesaiSekarang = new Date(tanggalMulaiSekarang);
                            tanggalSelesaiSekarang.setDate(tanggalSelesaiSekarang.getDate() + tahapan.standarWaktuHari);
                            estimasiTanggalMulai = new Date(tanggalSelesaiSekarang);
                        } else {
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
}