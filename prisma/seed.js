import pkg from '@prisma/client';
import bcrypt from 'bcrypt';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const dataPatenPengadaan = [
    {
        namaPengadaan: "Pengadaan Langsung",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 3 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 2 },
            { no: 3, nama: "Penyusunan Dokumen Pengadaan", waktu: "14", bobot: 4 },
            { no: 4, nama: "Reviu Barjas", waktu: "7", bobot: 3 },
            { no: 5, nama: "Reviu Tim Monev", waktu: "5", bobot: 3 },
            { no: 6, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 7, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 8, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 9, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "E-Purchasing (Non Market Sounding)",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 1 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 1 },
            { no: 3, nama: "Penyusunan Dokumen Persiapan Pemilihan", waktu: "14", bobot: 3 },
            { no: 4, nama: "Reviu Inspektorat", waktu: "7", bobot: 1 },
            { no: 5, nama: "Reviu Barjas", waktu: "7", bobot: 2 },
            { no: 6, nama: "Penyusunan Kertas Kerja", waktu: "7", bobot: 3 },
            { no: 7, nama: "Reviu Tim Monev", waktu: "5", bobot: 1 },
            { no: 8, nama: "Klik", waktu: "14", bobot: 2 },
            { no: 9, nama: "Penerbitan surat pesanan", waktu: "4", bobot: 1 },
            { no: 10, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 11, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 12, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 13, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "E-Purchasing (Market Sounding)",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 1 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 1 },
            { no: 3, nama: "Penyusunan Dokumen Persiapan Pemilihan", waktu: "14", bobot: 3 },
            { no: 4, nama: "Reviu Inspektorat", waktu: "7", bobot: 1 },
            { no: 5, nama: "Reviu Barjas", waktu: "7", bobot: 2 },
            { no: 6, nama: "Sosialisasi (Market Sounding)", waktu: "7", bobot: 1 },
            { no: 7, nama: "Penyusunan Kertas Kerja", waktu: "7", bobot: 2 },
            { no: 8, nama: "Reviu Tim Monev", waktu: "5", bobot: 1 },
            { no: 9, nama: "Klik", waktu: "14", bobot: 2 },
            { no: 10, nama: "Penerbitan surat pesanan", waktu: "4", bobot: 1 },
            { no: 11, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 12, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 13, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 14, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "Seleksi",
        tahapan: [
            { no: 1, nama: "Bappeda", waktu: "7", bobot: 1 },
            { no: 2, nama: "SPD", waktu: "7", bobot: 1 },
            { no: 3, nama: "Penyusunan Dokumen Persiapan Pemilihan", waktu: "14", bobot: 3 },
            { no: 4, nama: "Rev Inspektorat", waktu: "7", bobot: 1 },
            { no: 5, nama: "Reviu Barjas", waktu: "7", bobot: 2 },
            { no: 6, nama: "Pokja", waktu: "7", bobot: 2 },
            { no: 7, nama: "Seleksi", waktu: "45", bobot: 5 },
            { no: 8, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 9, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 10, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 11, nama: "Serah Terima Hasil Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "Tender",
        tahapan: [
            { no: 1, nama: "Bappeda", waktu: "7", bobot: 1 },
            { no: 2, nama: "SPD", waktu: "7", bobot: 1 },
            { no: 3, nama: "Penyusunan Dokumen Persiapan Pemilihan", waktu: "14", bobot: 3 },
            { no: 4, nama: "Rev Inspektorat", waktu: "7", bobot: 1 },
            { no: 5, nama: "Reviu Barjas", waktu: "7", bobot: 2 },
            { no: 6, nama: "Pokja", waktu: "7", bobot: 2 },
            { no: 7, nama: "Proses Tender (termasuk penetapan pemenang dan masa sanggah)", waktu: "30", bobot: 5 },
            { no: 8, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 9, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 10, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 11, nama: "Serah Terima Hasil Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "Tender (Melalui Proses Evaluasi Kewajaran Harga/EKH)",
        tahapan: [
            { no: 1, nama: "Bappeda", waktu: "7", bobot: 1 },
            { no: 2, nama: "SPD", waktu: "7", bobot: 1 },
            { no: 3, nama: "Penyusunan Dokumen Persiapan Pemilihan", waktu: "14", bobot: 3 },
            { no: 4, nama: "Rev Inspektorat", waktu: "7", bobot: 1 },
            { no: 5, nama: "Reviu Barjas", waktu: "7", bobot: 2 },
            { no: 6, nama: "Pokja", waktu: "7", bobot: 2 },
            { no: 7, nama: "Proses Tender (termasuk penetapan pemenang dan masa sanggah)", waktu: "45", bobot: 5 },
            { no: 8, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 9, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 10, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 11, nama: "Serah Terima Hasil Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "Repeat Order",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 1 },
            { no: 2, nama: "Reviu Tim Monev", waktu: "5", bobot: 2 },
            { no: 3, nama: "Penerbitan SPD", waktu: "7", bobot: 1 },
            { no: 4, nama: "Penyusunan Dokumen Persiapan Pemilihan", waktu: "14", bobot: 4 },
            { no: 5, nama: "Reviu Barjas", waktu: "7", bobot: 3 },
            { no: 6, nama: "Pemilihan oleh Tim Pokja", waktu: "7", bobot: 4 },
            { no: 7, nama: "Penandatanganan Kontrak", waktu: "1", bobot: 5 },
            { no: 8, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 9, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 5 },
            { no: 10, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 5 }
        ]
    },
    {
        namaPengadaan: "Swakelola Tipe 1",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 2 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 2 },
            { no: 3, nama: "Penyusunan KAK", waktu: "14", bobot: 16 },
            { no: 4, nama: "Nota Pesanan", waktu: "1", bobot: 10 },
            { no: 5, nama: "Pelaksanaan", waktu: "editable", bobot: 68 },
            { no: 6, nama: "Pelaporan", waktu: "1", bobot: 2 }
        ]
    },
    {
        namaPengadaan: "Swakelola Tipe 2",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 3 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 2 },
            { no: 3, nama: "Penyusunan Dokumen Swakelola", waktu: "14", bobot: 10 },
            { no: 4, nama: "Penandatanganan Perjanjian Kerjasama", waktu: "1", bobot: 5 },
            { no: 5, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 6, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 4 },
            { no: 7, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 4 },
            { no: 8, nama: "Pelaporan", waktu: "1", bobot: 2 }
        ]
    },
    {
        namaPengadaan: "Swakelola Tipe 3",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 3 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 2 },
            { no: 3, nama: "Penyusunan Dokumen Swakelola", waktu: "14", bobot: 10 },
            { no: 4, nama: "Penandatanganan Perjanjian Kerjasama", waktu: "1", bobot: 5 },
            { no: 5, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 6, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 4 },
            { no: 7, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 4 },
            { no: 8, nama: "Pelaporan", waktu: "1", bobot: 2 }
        ]
    },
    {
        namaPengadaan: "Swakelola Tipe 4",
        tahapan: [
            { no: 1, nama: "Reviu Bappeda", waktu: "7", bobot: 3 },
            { no: 2, nama: "Penerbitan SPD", waktu: "7", bobot: 2 },
            { no: 3, nama: "Penyusunan Dokumen Swakelola", waktu: "14", bobot: 10 },
            { no: 4, nama: "Penandatanganan Perjanjian Kerjasama", waktu: "1", bobot: 5 },
            { no: 5, nama: "Pelaksanaan Kontrak", waktu: "editable", bobot: 70 },
            { no: 6, nama: "Pemeriksaan Hasil Pekerjaan", waktu: "7", bobot: 4 },
            { no: 7, nama: "Serah Terima Pekerjaan", waktu: "1", bobot: 4 },
            { no: 8, nama: "Pelaporan", waktu: "1", bobot: 2 }
        ]
    }
];

async function main() {
    console.log('🧹 Membersihkan database (Reset ID ke 1)...');

    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0;`;
    await prisma.$executeRaw`TRUNCATE TABLE progres_tahapan;`;
    await prisma.$executeRaw`TRUNCATE TABLE transaksi_pengadaan;`;
    await prisma.$executeRaw`TRUNCATE TABLE master_tahapan;`;
    await prisma.$executeRaw`TRUNCATE TABLE master_pengadaan;`;
    await prisma.$executeRaw`TRUNCATE TABLE users;`;
    await prisma.$executeRaw`TRUNCATE TABLE access_tokens;`;
    await prisma.$executeRaw`TRUNCATE TABLE programs;`;
    await prisma.$executeRaw`TRUNCATE TABLE dinas;`;
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1;`;

    console.log('🚀 Memulai seeding data baru...');

    for (const master of dataPatenPengadaan) {
        const p = await prisma.pengadaan.create({
            data: { namaPengadaan: master.namaPengadaan }
        });
        console.log(`✅ Master: ${p.namaPengadaan} (ID: ${p.id})`);

        const listTahapan = master.tahapan.map((t, index) => ({
            pengadaanId: p.id,
            noUrut: index + 1, 
            namaTahapan: t.nama,
            standarWaktuHari: t.waktu.toLowerCase() === 'editable' ? null : parseInt(t.waktu),
            isWaktuEditable: t.waktu.toLowerCase() === 'editable',
            bobot: t.bobot
        }));

        await prisma.tahapan.createMany({ data: listTahapan });
    }

    const d = await prisma.dinas.create({
        data: { namaDinas: "Dinas Komunikasi dan Informatika" }
    });

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash('123', salt);

    await prisma.user.createMany({
        data: [
            {
                username: 'gubernur_sulsel',
                password: hashPassword,
                name: 'Bapak Gubernur',
                role: 'gubernur'
            },
            {
                username: 'staff_diskominfo',
                password: hashPassword,
                name: 'Staff Admin Diskominfo',
                role: 'staff',
                dinasId: d.id
            }
        ]
    });

    console.log('👤 Akun Created: gubernur_sulsel & staff_diskominfo (Password: 123)');
    console.log('🎉 Selesai! ID sekarang mulai dari 1 dan data sudah rapi.');
}

main()
    .catch((e) => {
        console.error('🔥 Error saat seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });