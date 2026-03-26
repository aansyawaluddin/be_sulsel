import pkg from '@prisma/client';
import bcrypt from 'bcrypt';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const createSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
};

const generateUsername = (nama) => {
    const match = nama.match(/\(([^)]+)\)/);
    if (match) return `staff_${match[1].toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const words = nama.split(' ');
    if (words.length > 1) {
        return `staff_${words[1].toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    }

    return `staff_${words[0].toLowerCase()}`;
};

const daftarInstansiBaru = [
    // DINAS SULSEL
    "Dinas Sosial",
    "Dinas Tenaga Kerja dan Transmigrasi",
    "Dinas Pemberdayaan Perempuan dan Perlindungan Anak",
    "Dinas Pengendalian Penduduk dan Keluarga Berencana",
    "Dinas Pemuda dan Olahraga",
    "Dinas Kesehatan",
    "Dinas Tanaman Pangan, Hortikultura dan Perkebunan",
    "Dinas Peternakan dan Kesehatan Hewan",
    "Dinas Kelautan dan Perikanan",
    "Dinas Kehutanan",
    "Dinas Lingkungan Hidup",
    "Dinas Perumahan, Kawasan Permukiman dan Pertanahan",
    "Dinas Perindustrian",
    "Dinas Perdagangan",
    "Dinas Koperasi, Usaha Kecil dan Menengah",
    "Dinas Penanaman Modal dan PTSP",
    "Dinas Pariwisata",
    "Dinas Kependudukan dan Pencatatan Sipil",
    "Dinas Perpustakaan dan Kearsipan",

    // BADAN SULSEL
    "Badan Perencanaan Pembangunan Daerah",
    "Badan Pengelolaan Keuangan dan Aset Daerah",
    "Badan Pendapatan Daerah ",
    "Badan Kepegawaian Daerah",
    "Badan Pengembangan Sumber Daya Manusia",
    "Badan Penanggulangan Bencana Daerah",
    "Badan Promosi Pariwisata Daerah",
    "Badan Kesatuan Bangsa dan Politik",
    "Badan Penelitian dan Pengembangan Daerah"
];

async function main() {
    console.log('🏢 Memulai penambahan data Dinas & Badan beserta User Staff...');

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash('123', salt);

    let dinasDitambahkan = 0;
    let userDitambahkan = 0;

    for (const nama of daftarInstansiBaru) {
        const slug = createSlug(nama);

        let dinas = await prisma.dinas.findFirst({
            where: { slug: slug }
        });

        if (!dinas) {
            dinas = await prisma.dinas.create({
                data: {
                    namaDinas: nama,
                    slug: slug
                }
            });
            console.log(`✔️ Berhasil menambahkan Dinas/Badan: ${nama}`);
            dinasDitambahkan++;
        } else {
            console.log(`⏩ Dilewati (Dinas/Badan sudah ada): ${nama}`);
        }

        const username = generateUsername(nama);
        const existingUser = await prisma.user.findFirst({
            where: { username: username }
        });

        if (!existingUser) {
            const namaPendek = nama.replace(/^(Dinas |Badan )/i, '');

            await prisma.user.create({
                data: {
                    username: username,
                    password: hashPassword,
                    name: `Staff Admin ${namaPendek}`,
                    role: 'staff',
                    dinasId: dinas.id
                }
            });
            console.log(`   👤 Berhasil menambahkan User: ${username}`);
            userDitambahkan++;
        } else {
            console.log(`   ⏩ Dilewati (User sudah ada): ${username}`);
        }
    }

    console.log('\n✅ Proses selesai!');
    console.log(`📊 Ringkasan: ${dinasDitambahkan} Dinas/Badan baru, ${userDitambahkan} User baru.`);
}

main()
    .catch((e) => {
        console.error('🔥 Error saat menambahkan data:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });