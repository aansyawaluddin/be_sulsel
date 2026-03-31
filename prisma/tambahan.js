import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const dataPengadaanBaru = [
    {
        nama: "Beasiswa",
        tahapan: [
            { nama: "Reviu Bappeda", waktu: "7", bobot: 5 },
            { nama: "Penerbitan SPD", waktu: "7", bobot: 5 },
            { nama: "Penyusunan KAK", waktu: "14", bobot: 10 },
            { nama: "Penyusunan SK Penerima", waktu: "7", bobot: 10 },
            { nama: "Pelaksanaan", waktu: "editable", bobot: 65 },
            { nama: "Pelaporan", waktu: "1", bobot: 5 }
        ]
    },
    {
        nama: "BANSOS",
        tahapan: [
            { nama: "Reviu Bappeda", waktu: "7", bobot: 5 },
            { nama: "Penerbitan SPD", waktu: "7", bobot: 5 },
            { nama: "Penyusunan KAK", waktu: "14", bobot: 10 },
            { nama: "Penyusunan SK Penerima", waktu: "7", bobot: 10 },
            { nama: "Pelaksanaan", waktu: "editable", bobot: 65 },
            { nama: "Pelaporan", waktu: "1", bobot: 5 }
        ]
    },
    {
        nama: "Hibah",
        tahapan: [
            { nama: "Reviu Bappeda", waktu: "7", bobot: 10 },
            { nama: "Penerbitan SPD", waktu: "7", bobot: 10 },
            { nama: "Penyusunan KAK", waktu: "7", bobot: 10 },
            { nama: "Pelaksanaan", waktu: "editable", bobot: 60 },
            { nama: "Pelaporan", waktu: "1", bobot: 10 }
        ]
    }
];

async function main() {
    console.log('🔍 Memulai pengecekan dan penambahan Master Pengadaan baru...\n');

    for (const item of dataPengadaanBaru) {
        // Cek apakah pengadaan sudah ada
        const existingPengadaan = await prisma.pengadaan.findUnique({
            where: { namaPengadaan: item.nama }
        });

        if (existingPengadaan) {
            console.log(`⚠️ Data "${item.nama}" SUDAH ADA di database. Melewati proses ini agar tidak duplikat.`);
            continue; // Lanjut ke item berikutnya
        }

        console.log(`🚀 Menambahkan data Master Pengadaan: ${item.nama}...`);

        // Buat Master Pengadaannya
        const p = await prisma.pengadaan.create({
            data: { namaPengadaan: item.nama }
        });

        // Mapping tahapan sesuai format database
        const listTahapan = item.tahapan.map((t, index) => ({
            pengadaanId: p.id,
            noUrut: index + 1,
            namaTahapan: t.nama,
            standarWaktuHari: t.waktu.toLowerCase() === 'editable' ? null : parseInt(t.waktu),
            isWaktuEditable: t.waktu.toLowerCase() === 'editable',
            bobot: t.bobot
        }));

        // Simpan semua tahapan sekaligus
        await prisma.tahapan.createMany({ data: listTahapan });

        console.log(`✅ Berhasil! "${item.nama}" beserta tahapannya telah ditambahkan.\n`);
    }

    console.log('🎉 Semua proses selesai!');
}

main()
    .catch((e) => {
        console.error('🔥 Error saat menambahkan data:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });