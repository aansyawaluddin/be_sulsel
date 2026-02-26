import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const tahapanMiniKompetisi = [
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
];

async function main() {
    console.log('🔍 Mengecek apakah "Mini Kompetisi" sudah ada di database...');

    const existingPengadaan = await prisma.pengadaan.findUnique({
        where: { namaPengadaan: "Mini Kompetisi" }
    });

    if (existingPengadaan) {
        console.log('⚠️ Data "Mini Kompetisi" SUDAH ADA di database. Membatalkan proses agar tidak duplikat.');
        return;
    }

    console.log('🚀 Menambahkan data Master Pengadaan: Mini Kompetisi...');

    const p = await prisma.pengadaan.create({
        data: { namaPengadaan: "Mini Kompetisi" }
    });

    const listTahapan = tahapanMiniKompetisi.map((t, index) => ({
        pengadaanId: p.id,
        noUrut: index + 1,
        namaTahapan: t.nama,
        standarWaktuHari: t.waktu.toLowerCase() === 'editable' ? null : parseInt(t.waktu),
        isWaktuEditable: t.waktu.toLowerCase() === 'editable',
        bobot: t.bobot
    }));

    await prisma.tahapan.createMany({ data: listTahapan });

    console.log('✅ Berhasil! "Mini Kompetisi" dan tahapannya telah ditambahkan ke database tanpa merusak data lama.');
}

main()
    .catch((e) => {
        console.error('🔥 Error saat menambahkan data:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });