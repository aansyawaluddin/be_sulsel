import prisma from '../utils/prisma.js';

export const staffController = {

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

                const programBaru = await tx.program.create({
                    data: {
                        namaProgram,
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
                            status: 'PENDING',
                            tanggalMulai: tanggalMulaiSekarang,
                            tanggalSelesai: tanggalSelesaiSekarang
                        });
                    }

                    if (dataProgres.length > 0) {
                        await tx.progresTahapan.createMany({ data: dataProgres });
                    }
                }

                return await tx.program.findUnique({
                    where: { id: programBaru.id },
                    include: {
                        pengadaan: {
                            include: {
                                pengadaan: true,
                                progresTahapan: {
                                    include: { tahapan: true },
                                    orderBy: { tahapan: { noUrut: 'asc' } }
                                }
                            }
                        }
                    }
                });
            });

            res.status(201).json({
                msg: "Program dan penjadwalan Tahapan berhasil dibuat secara otomatis!",
                data: result
            });

        } catch (error) {
            console.error(`🔥 [CREATE PROGRAM ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    },

    updateProgresTahapan: async (req, res) => {
        try {
            const { progresId } = req.params;
            const { status, waktuAktualHari, tanggalMulai, tanggalSelesai, dokumenBuktiUrl } = req.body;


            const progresEksis = await prisma.progresTahapan.findUnique({
                where: { id: parseInt(progresId) },
                include: { tahapan: true }
            });

            if (!progresEksis) {
                return res.status(404).json({ msg: "Data Progres Tahapan tidak ditemukan" });
            }

            const dataUpdate = {};

            if (status) dataUpdate.status = status;
            if (tanggalMulai) dataUpdate.tanggalMulai = new Date(tanggalMulai);
            if (tanggalSelesai) dataUpdate.tanggalSelesai = new Date(tanggalSelesai);
            if (dokumenBuktiUrl) dataUpdate.dokumenBuktiUrl = dokumenBuktiUrl;


            if (waktuAktualHari !== undefined) {
                if (progresEksis.tahapan.isWaktuEditable) {
                    dataUpdate.waktuAktualHari = parseInt(waktuAktualHari);
                } else {
                    console.log(`⚠️ Waktu aktual diabaikan karena tahapan '${progresEksis.tahapan.namaTahapan}' tidak editable.`);
                }
            }

            const progresDiupdate = await prisma.progresTahapan.update({
                where: { id: parseInt(progresId) },
                data: dataUpdate
            });

            res.status(200).json({
                msg: `Berhasil mengupdate status tahapan menjadi ${progresDiupdate.status}`,
                data: progresDiupdate
            });

        } catch (error) {
            console.error(`🔥 [UPDATE PROGRES ERROR]:`, error);
            res.status(500).json({ msg: error.message || "Terjadi kesalahan internal server" });
        }
    }
};